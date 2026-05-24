//! Best-of-N / self-consistency fanout
//!
//! Fires N concurrent provider.complete() calls with temperature
//! tuned for diversity, collects the candidates, picks a winner by
//! a configurable selector, and aggregates usage/cost across all
//! attempts.
//!
//! ## Streaming
//!
//! Fanout always runs non-streaming. Callers that requested
//! `stream: true` should detect that they're entering fanout
//! (validation.strategy is BestOfN or SelfConsistency) and degrade
//! their response shape — the gateway emits a single warning into
//! `ValidationMetadata.warning` so the chat UI can show it.
//!
//! ## Failure semantics
//!
//! Individual candidate failures are tolerated as long as at least
//! one candidate succeeds. If all N fail, the fanout returns the
//! first error verbatim.

use std::sync::Arc;

use aura_types::{
    CreateResponseRequest, Response, ResponseStatus, Usage, ValidationMetadata, ValidationStrategy,
};
use futures_util::future::join_all;
use thiserror::Error;
use tracing::{debug, warn};

use crate::provider::{Provider, ProviderError};

/// Default temperature for fanout candidates when the caller didn't
/// specify one. High enough to diversify but not so high that we lose
/// task fidelity. Borrowed from OpenAI's best-of-n recipe.
const DEFAULT_FANOUT_TEMPERATURE: f32 = 0.7;

/// Maximum N we'll honor. 8 is the upper bound for OpenAI's
/// `n` parameter and matches Gemini's `candidateCount`. Anything
/// higher is more likely to be a footgun than a feature.
const MAX_N: u8 = 8;

/// How to pick the winning candidate.
#[derive(Debug, Clone, Copy)]
pub enum FanoutSelector {
    /// Pick the candidate with the highest mean token logprob
    /// (i.e. the model was most confident). Falls back to output
    /// length when no candidates have a confidence score (provider
    /// doesn't expose logprobs — Anthropic, most Together models).
    HighestLogprob,
    /// Pick the candidate that the most other candidates agree
    /// with after normalizing whitespace and case. Tiebreak by
    /// highest logprob. Falls back to HighestLogprob behavior on
    /// free-form text where no two candidates match.
    MostFrequent,
}

#[derive(Debug, Error)]
pub enum FanoutError {
    /// All N candidates failed.
    #[error("all {n} candidates failed; first error: {source}")]
    AllCandidatesFailed { n: u8, source: ProviderError },

    /// n was 0 or unreasonably large.
    #[error("invalid candidate count: {0}")]
    InvalidN(u8),
}

/// Run a best-of-N / self-consistency fanout.
///
/// Behavior:
/// 1. Clamp `n` to [1, MAX_N]. n=1 short-circuits to a single direct call.
/// 2. Force `stream = false` on the request (cloned per candidate).
/// 3. Default `temperature` to `DEFAULT_FANOUT_TEMPERATURE` if unset.
/// 4. Fire N concurrent calls.
/// 5. Pick the winner via the selector.
/// 6. Populate `ValidationMetadata.candidates_generated`,
///    `selected_index`, `selection_reason`, and `warning` (for the
///    streaming-degradation notice if `original_stream` was true).
/// 7. Aggregate `usage` from all candidates so cost accounting is honest.
pub async fn run_fanout(
    provider: Arc<dyn Provider>,
    mut request: CreateResponseRequest,
    n: u8,
    selector: FanoutSelector,
) -> Result<Response, FanoutError> {
    if n == 0 || n > MAX_N {
        return Err(FanoutError::InvalidN(n));
    }
    if n == 1 {
        // Degenerate fanout: just call once and tag the metadata so
        // downstream code can still observe that fanout was requested.
        let original_stream = request.stream;
        request.stream = false;
        let mut response = provider
            .complete(request)
            .await
            .map_err(|source| FanoutError::AllCandidatesFailed { n: 1, source })?;
        let single_usage = vec![response.usage.clone().unwrap_or_default()];
        attach_fanout_metadata(
            &mut response,
            selector,
            1,
            0,
            None,
            original_stream,
            single_usage,
        );
        return Ok(response);
    }

    let original_stream = request.stream;
    request.stream = false;
    if request.temperature.is_none() {
        request.temperature = Some(DEFAULT_FANOUT_TEMPERATURE);
    }

    debug!(
        n = %n,
        temperature = ?request.temperature,
        original_stream = %original_stream,
        "fanout: firing N candidate requests"
    );

    // Spawn N concurrent requests. Each gets its own clone of the
    // request because providers may mutate metadata fields during
    // transformation.
    let futures = (0..n).map(|_| {
        let provider = provider.clone();
        let request = request.clone();
        async move { provider.complete(request).await }
    });
    let results = join_all(futures).await;

    // Partition successes from failures.
    let mut successes: Vec<Response> = Vec::with_capacity(n as usize);
    let mut first_error: Option<ProviderError> = None;
    for (i, result) in results.into_iter().enumerate() {
        match result {
            Ok(resp) => {
                if resp.status == ResponseStatus::Completed {
                    successes.push(resp);
                } else {
                    debug!(
                        candidate = %i,
                        status = ?resp.status,
                        "fanout: candidate returned non-Completed status; skipping for selection"
                    );
                }
            }
            Err(e) => {
                warn!(candidate = %i, error = %e, "fanout: candidate failed");
                if first_error.is_none() {
                    first_error = Some(e);
                }
            }
        }
    }

    if successes.is_empty() {
        return Err(FanoutError::AllCandidatesFailed {
            n,
            source: first_error.unwrap_or_else(|| {
                ProviderError::internal("all candidates returned non-Completed status")
            }),
        });
    }

    // All usage rows for aggregate accounting.
    let all_usage: Vec<Usage> = successes
        .iter()
        .map(|r| r.usage.clone().unwrap_or_default())
        .collect();

    // Select the winner.
    let (selected_index, selection_reason) = select_winner(&successes, selector);
    let mut winner = successes
        .into_iter()
        .nth(selected_index)
        .expect("selected_index always in range");

    attach_fanout_metadata(
        &mut winner,
        selector,
        n,
        selected_index as u8,
        Some(selection_reason),
        original_stream,
        all_usage,
    );

    Ok(winner)
}

/// Pick the winning candidate index. Returns `(index, reason)`.
///
/// MostFrequent groups by normalized text; if no group has size > 1,
/// it falls back to HighestLogprob behavior. HighestLogprob picks
/// the candidate with the highest measured confidence; if no
/// candidates have a confidence score, falls back to picking the
/// longest output.
fn select_winner(candidates: &[Response], selector: FanoutSelector) -> (usize, String) {
    debug_assert!(!candidates.is_empty(), "selector called with no candidates");

    match selector {
        FanoutSelector::HighestLogprob => select_by_logprob(candidates),
        FanoutSelector::MostFrequent => {
            // Group by normalized output text.
            let texts: Vec<String> = candidates
                .iter()
                .map(|c| normalize_text(&c.text()))
                .collect();
            let mut counts: std::collections::HashMap<&str, Vec<usize>> =
                std::collections::HashMap::new();
            for (i, t) in texts.iter().enumerate() {
                counts.entry(t.as_str()).or_default().push(i);
            }
            let (largest_group, indices) = counts
                .iter()
                .max_by_key(|(_, idxs)| idxs.len())
                .map(|(t, idxs)| (*t, idxs.clone()))
                .expect("at least one group exists");

            if indices.len() > 1 {
                // Genuine agreement among >1 candidates. Pick the
                // one with the highest confidence within the group
                // for stability; first index if no logprobs.
                let group_candidates: Vec<&Response> =
                    indices.iter().map(|&i| &candidates[i]).collect();
                let (group_winner_offset, _) =
                    select_by_logprob(&group_candidates_owned(&group_candidates));
                let global_index = indices[group_winner_offset];
                (
                    global_index,
                    format!(
                        "most_frequent: {} of {} candidates produced equivalent output",
                        indices.len(),
                        candidates.len()
                    ),
                )
            } else {
                // No agreement — fall back to logprob behavior over
                // the full set. Tag the reason so callers know the
                // fallback fired.
                let (idx, _) = select_by_logprob(candidates);
                (
                    idx,
                    format!(
                        "most_frequent: no agreement (largest_group={}); fell back to highest_logprob",
                        largest_group
                    ),
                )
            }
        }
    }
}

/// Helper: clone responses out of a slice of references so we can
/// feed them into select_by_logprob, which takes &[Response]. The
/// alternative is duplicating the selector logic for &[&Response].
fn group_candidates_owned(refs: &[&Response]) -> Vec<Response> {
    refs.iter().map(|r| (*r).clone()).collect()
}

/// Pick the highest-confidence candidate; length fallback when none
/// have a measured confidence (provider doesn't expose logprobs).
fn select_by_logprob(candidates: &[Response]) -> (usize, String) {
    // Try confidence scores first.
    let with_confidence: Vec<(usize, f32)> = candidates
        .iter()
        .enumerate()
        .filter_map(|(i, c)| {
            c.validation
                .as_ref()
                .and_then(|v| v.confidence)
                .map(|c| (i, c))
        })
        .collect();

    if !with_confidence.is_empty() {
        let (idx, score) = with_confidence
            .into_iter()
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .expect("non-empty checked above");
        return (idx, format!("highest_logprob: confidence={:.4}", score));
    }

    // No confidence scores — fall back to length heuristic. Cap the
    // contribution of very long outputs so we don't reward
    // pathological repetition.
    const LENGTH_CAP: usize = 4000;
    let (idx, _len) = candidates
        .iter()
        .enumerate()
        .map(|(i, c)| (i, c.text().len().min(LENGTH_CAP)))
        .max_by_key(|(_, l)| *l)
        .expect("non-empty");
    (
        idx,
        "highest_logprob: no logprobs available; selected by output length (cap 4000)".to_string(),
    )
}

/// Normalize text for self-consistency grouping. Lowercase + collapse
/// whitespace + strip surrounding punctuation. Crude but works for
/// the numeric / classification / short-answer tasks where
/// self_consistency is most useful.
fn normalize_text(s: &str) -> String {
    let lowered = s.to_lowercase();
    let trimmed = lowered.trim();
    // Collapse internal whitespace runs.
    let mut out = String::with_capacity(trimmed.len());
    let mut prev_space = false;
    for c in trimmed.chars() {
        if c.is_whitespace() {
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        } else if c.is_ascii_punctuation() && matches!(c, '.' | ',' | ';' | '!' | '?') {
            // Strip trailing sentence punctuation so "42" and "42."
            // group together. Leave operators like / + intact.
            continue;
        } else {
            out.push(c);
            prev_space = false;
        }
    }
    out
}

/// Stamp the winning response with fanout metadata + aggregated usage.
fn attach_fanout_metadata(
    response: &mut Response,
    selector: FanoutSelector,
    n: u8,
    selected_index: u8,
    selection_reason: Option<String>,
    original_stream_requested: bool,
    all_usage: Vec<Usage>,
) {
    let strategy = match selector {
        FanoutSelector::HighestLogprob => ValidationStrategy::BestOfN,
        FanoutSelector::MostFrequent => ValidationStrategy::SelfConsistency,
    };

    // Aggregate usage from all candidates so cost accounting reflects
    // the real spend.
    let mut total_input = 0u32;
    let mut total_output = 0u32;
    let mut total_cost: f64 = 0.0;
    let mut any_cost = false;
    for u in &all_usage {
        total_input = total_input.saturating_add(u.input_tokens);
        total_output = total_output.saturating_add(u.output_tokens);
        if let Some(c) = u.cost_usd {
            total_cost += c;
            any_cost = true;
        }
    }

    response.usage = Some(Usage {
        input_tokens: total_input,
        output_tokens: total_output,
        total_tokens: total_input.saturating_add(total_output),
        reasoning_tokens: None,
        cached_tokens: None,
        cost_usd: if any_cost { Some(total_cost) } else { None },
    });

    // Build or extend ValidationMetadata.
    let existing_confidence = response.validation.as_ref().and_then(|v| v.confidence);
    let existing_logprobs = response
        .validation
        .as_ref()
        .and_then(|v| v.logprobs.clone());
    let mut meta = ValidationMetadata {
        strategy,
        confidence: existing_confidence,
        perplexity: None,
        candidates_generated: Some(n),
        selected_index: Some(selected_index),
        selection_reason,
        passed: true,
        warning: if original_stream_requested {
            Some(
                "best_of_n / self_consistency cannot stream; \
                 served as a single non-streaming response"
                    .to_string(),
            )
        } else {
            None
        },
        logprobs: existing_logprobs,
    };
    // For n=1 there's no selection happening — clear the reason
    // unless the caller passed one.
    if n == 1 {
        meta.selection_reason = meta.selection_reason.or(Some("n=1: no fanout".to_string()));
    }
    response.validation = Some(meta);
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::{Item, MessageItem};
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// Test provider that returns a configurable text + optional
    /// confidence score per call. Each call increments a counter so
    /// we can vary the response by call index.
    struct ScriptedProvider {
        responses: Vec<(String, Option<f32>)>,
        call_count: AtomicUsize,
    }

    #[async_trait::async_trait]
    impl Provider for ScriptedProvider {
        fn name(&self) -> &str {
            "scripted"
        }
        fn models(&self) -> &[&str] {
            &["scripted-model"]
        }
        async fn complete(
            &self,
            _request: CreateResponseRequest,
        ) -> Result<Response, ProviderError> {
            let idx = self.call_count.fetch_add(1, Ordering::SeqCst);
            let (text, confidence) = self
                .responses
                .get(idx)
                .cloned()
                .unwrap_or_else(|| ("default".to_string(), None));

            let mut response = Response::in_progress("resp_x", "scripted-model");
            response.status = ResponseStatus::Completed;
            response.output = vec![Item::Message(MessageItem::assistant("msg_0", text.clone()))];
            response.usage = Some(Usage::new(10, text.len() as u32 / 4));
            if let Some(c) = confidence {
                response.validation = Some(ValidationMetadata {
                    strategy: ValidationStrategy::Logprobs,
                    confidence: Some(c),
                    perplexity: None,
                    candidates_generated: None,
                    selected_index: None,
                    selection_reason: None,
                    passed: true,
                    warning: None,
                    logprobs: None,
                });
            }
            Ok(response)
        }
        async fn complete_stream(
            &self,
            _request: CreateResponseRequest,
        ) -> Result<crate::provider::EventStream, ProviderError> {
            Err(ProviderError::internal("not used"))
        }
    }

    fn make_request() -> CreateResponseRequest {
        CreateResponseRequest::text("scripted-model", "Hello!")
    }

    #[tokio::test]
    async fn best_of_n_picks_highest_logprob() {
        let provider = Arc::new(ScriptedProvider {
            responses: vec![
                ("low confidence answer".to_string(), Some(0.3)),
                ("middle confidence answer".to_string(), Some(0.6)),
                ("HIGH confidence answer".to_string(), Some(0.9)),
            ],
            call_count: AtomicUsize::new(0),
        });
        let response = run_fanout(provider, make_request(), 3, FanoutSelector::HighestLogprob)
            .await
            .unwrap();

        assert!(
            response.text().contains("HIGH"),
            "should pick highest-confidence candidate"
        );
        let meta = response.validation.expect("metadata present");
        assert_eq!(meta.strategy, ValidationStrategy::BestOfN);
        assert_eq!(meta.candidates_generated, Some(3));
        assert_eq!(meta.selected_index, Some(2));
    }

    #[tokio::test]
    async fn best_of_n_aggregates_usage() {
        let provider = Arc::new(ScriptedProvider {
            responses: vec![
                ("a".repeat(40), Some(0.5)),
                ("b".repeat(40), Some(0.7)),
                ("c".repeat(40), Some(0.6)),
            ],
            call_count: AtomicUsize::new(0),
        });
        let response = run_fanout(provider, make_request(), 3, FanoutSelector::HighestLogprob)
            .await
            .unwrap();

        let usage = response.usage.expect("usage present");
        // 3 candidates × 10 input tokens each = 30
        assert_eq!(usage.input_tokens, 30);
        // 3 candidates × 10 output tokens (40 chars / 4) = 30
        assert_eq!(usage.output_tokens, 30);
    }

    #[tokio::test]
    async fn self_consistency_picks_majority() {
        let provider = Arc::new(ScriptedProvider {
            responses: vec![
                ("42".to_string(), Some(0.5)),
                ("forty-two".to_string(), Some(0.8)),
                ("42".to_string(), Some(0.4)),
                ("42.".to_string(), Some(0.4)),
            ],
            call_count: AtomicUsize::new(0),
        });
        let response = run_fanout(provider, make_request(), 4, FanoutSelector::MostFrequent)
            .await
            .unwrap();

        // "42", "42", "42." should all normalize to "42" — 3 of 4.
        assert_eq!(response.text(), "42");
        let meta = response.validation.expect("metadata present");
        assert_eq!(meta.strategy, ValidationStrategy::SelfConsistency);
        let reason = meta.selection_reason.expect("reason set");
        assert!(reason.contains("most_frequent"), "reason was: {reason}");
        assert!(reason.contains("3 of 4"), "reason was: {reason}");
    }

    #[tokio::test]
    async fn self_consistency_falls_back_when_no_agreement() {
        let provider = Arc::new(ScriptedProvider {
            responses: vec![
                ("answer A".to_string(), Some(0.4)),
                ("answer B".to_string(), Some(0.9)),
                ("answer C".to_string(), Some(0.6)),
            ],
            call_count: AtomicUsize::new(0),
        });
        let response = run_fanout(provider, make_request(), 3, FanoutSelector::MostFrequent)
            .await
            .unwrap();

        // No two candidates match → fall back to highest_logprob (B at 0.9)
        assert!(response.text().contains('B'));
        let reason = response
            .validation
            .and_then(|v| v.selection_reason)
            .expect("reason set");
        assert!(reason.contains("no agreement"), "reason was: {reason}");
    }

    #[tokio::test]
    async fn streaming_warning_attached_when_original_stream_true() {
        let provider = Arc::new(ScriptedProvider {
            responses: vec![("only".to_string(), Some(0.5))],
            call_count: AtomicUsize::new(0),
        });
        let mut request = make_request();
        request.stream = true;
        let response = run_fanout(provider, request, 1, FanoutSelector::HighestLogprob)
            .await
            .unwrap();

        let warning = response
            .validation
            .and_then(|v| v.warning)
            .expect("warning set");
        assert!(warning.contains("cannot stream"), "warning was: {warning}");
    }

    #[tokio::test]
    async fn invalid_n_returns_error() {
        let provider = Arc::new(ScriptedProvider {
            responses: vec![],
            call_count: AtomicUsize::new(0),
        });
        let err = run_fanout(provider, make_request(), 0, FanoutSelector::HighestLogprob)
            .await
            .unwrap_err();
        assert!(matches!(err, FanoutError::InvalidN(0)));
    }

    #[test]
    fn normalize_text_groups_minor_variations() {
        assert_eq!(normalize_text("42"), normalize_text("42."));
        assert_eq!(normalize_text("Forty-Two"), normalize_text("forty-two"));
        assert_eq!(normalize_text("  hello  world  "), "hello world");
    }
}
