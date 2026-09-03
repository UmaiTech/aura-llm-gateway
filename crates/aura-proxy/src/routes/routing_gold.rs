//! Gold-label collection for the auto router.
//!
//! For a sampled fraction of requests (`routing.auto.gold_sample_rate`),
//! the same prompt is answered in the background by the cheapest eligible
//! model of the lowest tier (A) and of the highest tier (B), and a judge
//! model grades the pair. `verdict = a | tie` means the cheap tier would
//! have sufficed, which is the label the learned classifier trains on.
//! This is the RouteLLM-style augmentation, run on live traffic instead
//! of a benchmark set.
//!
//! The live response is never delayed: sampling happens after the
//! decision and everything runs in a spawned task.

use aura_core::router::auto::{judge_prompt, parse_judge_output, Eligibility};
use aura_core::{AutoDecision, Provider};
use aura_db::{NewRoutingGoldPair, RoutingGoldPairRepo};
use aura_types::{ContentPart, CreateResponseRequest, InputContent, InputItem, Role, Tier};
use rand::Rng;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};

use crate::routes::auto_routing::GatewayEligibility;
use crate::AppState;

/// Hard timeout for each background completion and the judge call.
const CALL_TIMEOUT: Duration = Duration::from_secs(90);

/// Last user message text of a request, if any.
fn last_user_text(request: &CreateResponseRequest) -> Option<String> {
    request.input.iter().rev().find_map(|item| match item {
        InputItem::Message { role, content } if *role == Role::User => Some(match content {
            InputContent::Text(t) => t.clone(),
            InputContent::Parts(parts) => parts
                .iter()
                .filter_map(|p| match p {
                    ContentPart::Text { text } => Some(text.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(" "),
        }),
        _ => None,
    })
}

/// Whether a request is a candidate for gold-label collection: plain text
/// turns only (no tools, images or tool-loop continuations), and only when
/// the router has two distinct tiers to compare.
pub fn is_gold_eligible(request: &CreateResponseRequest, decision: &AutoDecision) -> bool {
    if decision.features.tool_count > 0
        || decision.features.has_images
        || decision.features.has_audio
        || decision.features.is_tool_loop_turn
    {
        return false;
    }
    if request.previous_response_id.is_some() {
        // Continuations need the stored context to be meaningful; keep
        // gold pairs to self-contained turns.
        return false;
    }
    last_user_text(request)
        .map(|t| !t.trim().is_empty())
        .unwrap_or(false)
}

/// Decide whether to sample this request. Pure Bernoulli draw.
pub fn should_sample(rate: f64) -> bool {
    if rate <= 0.0 {
        return false;
    }
    if rate >= 1.0 {
        return true;
    }
    rand::thread_rng().gen::<f64>() < rate
}

fn prompt_hash(text: &str) -> String {
    hex::encode(Sha256::digest(text.as_bytes()))
}

struct Candidate {
    tier: Tier,
    model: String,
    text: Option<String>,
    cost: Option<f64>,
    latency_ms: Option<i32>,
    error: Option<String>,
}

async fn answer_with(
    state: &AppState,
    provider: Arc<dyn Provider>,
    model: &str,
    request: &CreateResponseRequest,
    max_chars: usize,
    tier: Tier,
) -> Candidate {
    let mut req = request.clone();
    req.model = model.to_string();
    req.stream = false;
    req.routing = None;
    req.validation = None;
    req.consistency = None;
    req.compression = None;
    let started = Instant::now();
    match tokio::time::timeout(CALL_TIMEOUT, provider.complete(req)).await {
        Ok(Ok(resp)) => {
            let usage = resp.usage.as_ref();
            let cost = usage.and_then(|u| {
                u.cost_usd.or_else(|| {
                    state.cost_calculator().calculate_cost(
                        model,
                        u.input_tokens,
                        u.output_tokens,
                        u.cached_tokens,
                        u.reasoning_tokens,
                    )
                })
            });
            Candidate {
                tier,
                model: model.to_string(),
                text: Some(resp.text().chars().take(max_chars).collect()),
                cost,
                latency_ms: Some(started.elapsed().as_millis() as i32),
                error: None,
            }
        }
        Ok(Err(e)) => Candidate {
            tier,
            model: model.to_string(),
            text: None,
            cost: None,
            latency_ms: Some(started.elapsed().as_millis() as i32),
            error: Some(e.to_string()),
        },
        Err(_) => Candidate {
            tier,
            model: model.to_string(),
            text: None,
            cost: None,
            latency_ms: Some(CALL_TIMEOUT.as_millis() as i32),
            error: Some("timeout".into()),
        },
    }
}

/// Cheapest eligible model of the lowest and highest tiers that have one.
fn pick_pair(
    state: &AppState,
    request: &CreateResponseRequest,
) -> Option<(Tier, String, Tier, String)> {
    let router = state.auto_router()?;
    let oracle = GatewayEligibility::for_request(state, request);
    let tiers = router.catalog().tiers();
    let cheapest_in = |tier: Tier| -> Option<String> {
        tiers
            .get(tier)
            .iter()
            .filter(|m| oracle.is_eligible(m))
            .min_by(|a, b| {
                let ca = oracle.blended_cost_per_million(a).unwrap_or(f64::MAX);
                let cb = oracle.blended_cost_per_million(b).unwrap_or(f64::MAX);
                ca.partial_cmp(&cb).unwrap_or(std::cmp::Ordering::Equal)
            })
            .cloned()
    };
    let (low_tier, low) = Tier::ALL
        .iter()
        .find_map(|t| cheapest_in(*t).map(|m| (*t, m)))?;
    let (high_tier, high) = Tier::ALL
        .iter()
        .rev()
        .find_map(|t| cheapest_in(*t).map(|m| (*t, m)))?;
    if low_tier == high_tier || low == high {
        return None;
    }
    Some((low_tier, low, high_tier, high))
}

/// Answer the prompt with both tiers, grade, and store the pair.
pub async fn collect_gold_pair(
    state: AppState,
    request: CreateResponseRequest,
    decision: AutoDecision,
    request_id: String,
    organization_id: Option<uuid::Uuid>,
) {
    let Some(pool) = state.db_pool() else {
        return;
    };
    let Some(cfg) = state.auto_router().map(|r| r.config().clone()) else {
        return;
    };
    let Some(user_text) = last_user_text(&request) else {
        return;
    };
    let Some((tier_a, model_a, tier_b, model_b)) = pick_pair(&state, &request) else {
        debug!("gold pair: fewer than two tiers with eligible models; skipping");
        return;
    };
    let (Some(provider_a), Some(provider_b)) =
        (state.get_provider(&model_a), state.get_provider(&model_b))
    else {
        return;
    };
    let max_chars = cfg.gold_max_text_chars;

    let (a, b) = tokio::join!(
        answer_with(&state, provider_a, &model_a, &request, max_chars, tier_a),
        answer_with(&state, provider_b, &model_b, &request, max_chars, tier_b),
    );

    let mut verdict = None;
    let mut confidence = None;
    let mut rationale = None;
    let mut error = None;
    match (&a.text, &b.text) {
        (Some(text_a), Some(text_b)) => {
            let judge_model = cfg.gold_judge_model.clone();
            match state.get_provider(&judge_model) {
                Some(judge) => {
                    let mut jreq = CreateResponseRequest::text(
                        judge_model.clone(),
                        judge_prompt(&user_text, text_a, text_b, max_chars),
                    );
                    jreq.temperature = Some(0.0);
                    jreq.max_output_tokens = Some(120);
                    match tokio::time::timeout(CALL_TIMEOUT, judge.complete(jreq)).await {
                        Ok(Ok(resp)) => match parse_judge_output(&resp.text()) {
                            Some(j) => {
                                verdict = Some(j.verdict.as_str().to_string());
                                confidence = Some(j.confidence);
                                rationale = j.rationale;
                            }
                            None => {
                                error = Some(format!(
                                    "unparseable judge reply: {}",
                                    resp.text().chars().take(200).collect::<String>()
                                ))
                            }
                        },
                        Ok(Err(e)) => error = Some(format!("judge failed: {}", e)),
                        Err(_) => error = Some("judge timeout".into()),
                    }
                }
                None => error = Some(format!("judge model {} not servable", judge_model)),
            }
        }
        _ => {
            error = Some(format!(
                "candidate failed: a={} b={}",
                a.error.as_deref().unwrap_or("ok"),
                b.error.as_deref().unwrap_or("ok")
            ));
        }
    }

    let new = NewRoutingGoldPair {
        response_id: request_id.clone(),
        organization_id,
        decided_tier: decision.tier.as_str().to_string(),
        heuristic_score: decision.raw_score,
        features: serde_json::to_value(&decision.features).unwrap_or(serde_json::json!({})),
        prompt_hash: prompt_hash(&user_text),
        user_text: Some(user_text.chars().take(max_chars).collect()),
        tier_a: a.tier.as_str().to_string(),
        model_a: a.model.clone(),
        text_a: a.text.clone(),
        cost_a: a.cost,
        latency_a_ms: a.latency_ms,
        tier_b: b.tier.as_str().to_string(),
        model_b: b.model.clone(),
        text_b: b.text.clone(),
        cost_b: b.cost,
        latency_b_ms: b.latency_ms,
        judge_model: cfg.gold_judge_model.clone(),
        verdict: verdict.clone(),
        judge_confidence: confidence,
        judge_rationale: rationale,
        error: error.clone(),
    };
    match RoutingGoldPairRepo::insert(pool, new).await {
        Ok(id) => info!(
            gold_pair = %id,
            request_id = %request_id,
            verdict = ?verdict,
            model_a = %a.model,
            model_b = %b.model,
            error = ?error,
            "gold pair recorded"
        ),
        Err(e) => warn!(error = %e, "gold pair: insert failed"),
    }
}

/// Sample this request for gold-label collection if configured. Returns
/// immediately; the work runs in a spawned task.
pub fn maybe_collect(
    state: &AppState,
    request: &CreateResponseRequest,
    decision: &AutoDecision,
    request_id: &str,
    organization_id: Option<uuid::Uuid>,
) {
    let Some(rate) = state.auto_router().map(|r| r.config().gold_sample_rate) else {
        return;
    };
    if state.db_pool().is_none() || !is_gold_eligible(request, decision) || !should_sample(rate) {
        return;
    }
    let state = state.clone();
    let request = request.clone();
    let decision = decision.clone();
    let request_id = request_id.to_string();
    tokio::spawn(async move {
        collect_gold_pair(state, request, decision, request_id, organization_id).await;
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_core::router::auto::{AutoRoutingConfig, TierModels};
    use aura_core::{Config, DecisionContext};

    async fn state(tiers: TierModels) -> AppState {
        let mut config = Config::default();
        config.providers.ollama_base_url = Some("http://127.0.0.1:1".into());
        config.routing.auto = AutoRoutingConfig {
            enabled: true,
            tiers,
            ..Default::default()
        };
        AppState::new(config, None, None).await
    }

    fn decide(state: &AppState, request: &CreateResponseRequest) -> AutoDecision {
        let router = state.auto_router().unwrap();
        let oracle = GatewayEligibility::for_request(state, request);
        router
            .decide(
                request,
                &DecisionContext {
                    requested_model: "auto",
                    ..Default::default()
                },
                &oracle,
            )
            .unwrap()
    }

    #[tokio::test]
    async fn eligibility_excludes_tools_images_and_continuations() {
        let st = state(TierModels {
            simple: vec!["llama3.2".into()],
            medium: vec!["llama3.1".into()],
            complex: vec!["llama3.3".into()],
            reasoning: vec![],
        })
        .await;
        let req = CreateResponseRequest::text("auto", "What is the capital of France?");
        let d = decide(&st, &req);
        assert!(is_gold_eligible(&req, &d));

        let mut cont = req.clone();
        cont.previous_response_id = Some("resp_1".into());
        assert!(!is_gold_eligible(&cont, &d));

        let mut with_tools = req.clone();
        with_tools.tools = Some(vec![aura_types::Tool::function(
            aura_types::FunctionDefinition {
                name: "f".into(),
                description: None,
                parameters: None,
                strict: None,
            },
        )]);
        let d2 = decide(&st, &with_tools);
        assert!(!is_gold_eligible(&with_tools, &d2));
    }

    #[tokio::test]
    async fn pair_is_lowest_and_highest_tier() {
        let st = state(TierModels {
            simple: vec!["llama3.2".into()],
            medium: vec!["llama3.1".into()],
            complex: vec!["llama3.3".into()],
            reasoning: vec!["deepseek-r1".into()],
        })
        .await;
        let req = CreateResponseRequest::text("auto", "hi");
        let (ta, a, tb, b) = pick_pair(&st, &req).unwrap();
        assert_eq!((ta, a.as_str()), (Tier::Simple, "llama3.2"));
        assert_eq!((tb, b.as_str()), (Tier::Reasoning, "deepseek-r1"));

        // A single populated tier yields no pair.
        let st = state(TierModels {
            simple: vec!["llama3.2".into()],
            medium: vec![],
            complex: vec![],
            reasoning: vec![],
        })
        .await;
        assert!(pick_pair(&st, &req).is_none());
    }

    #[test]
    fn sampling_rates() {
        assert!(!should_sample(0.0));
        assert!(should_sample(1.0));
        let hits = (0..2000).filter(|_| should_sample(0.1)).count();
        assert!(hits > 100 && hits < 320, "hits={}", hits);
    }
}
