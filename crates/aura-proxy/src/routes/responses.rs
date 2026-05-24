//! Response creation endpoint for the Open Responses API
//!
//! This endpoint handles both streaming and non-streaming response creation,
//! transforming requests through the appropriate provider.
//!
//! ## Caching
//!
//! Non-streaming responses with `temperature=0` are cached in Redis if available.
//! To bypass caching, set the `X-Cache-Control: no-cache` header.

use aura_core::{cache, compression, metrics, ProviderError};
use aura_db::{DbPool, NewRequestLog, ResponseRepo};
use aura_types::{
    CompressionMetadata, ConsistencyStrategy, CreateResponseRequest, InputItem, PromptAugmenter,
    ResponseStatus, StreamEvent,
};
use axum::{
    extract::State,
    http::{header::HeaderMap, StatusCode},
    response::{IntoResponse, Response as AxumResponse, Sse},
    routing::post,
    Extension, Json, Router,
};
use futures_util::StreamExt;
use serde::Serialize;
use std::convert::Infallible;
use std::time::{Duration, Instant};
use tracing::{debug, error, info, instrument, warn};
use uuid::Uuid;

use crate::routes::AuthContext;
use crate::AppState;

/// Header to bypass response caching
const CACHE_CONTROL_HEADER: &str = "x-cache-control";

/// Header to specify routing strategy
const ROUTING_STRATEGY_HEADER: &str = "x-routing-strategy";

/// Creates the responses router
pub fn router() -> Router<AppState> {
    Router::new().route("/v1/responses", post(create_response))
}

/// Error response format for the API
#[derive(Debug, Serialize)]
pub struct ApiError {
    error: ApiErrorInner,
}

#[derive(Debug, Serialize)]
struct ApiErrorInner {
    code: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    param: Option<String>,
}

impl ApiError {
    fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            error: ApiErrorInner {
                code: code.into(),
                message: message.into(),
                param: None,
            },
        }
    }

    fn with_param(
        code: impl Into<String>,
        message: impl Into<String>,
        param: impl Into<String>,
    ) -> Self {
        Self {
            error: ApiErrorInner {
                code: code.into(),
                message: message.into(),
                param: Some(param.into()),
            },
        }
    }

    /// Convert a ProviderError to an API error response
    fn from_provider_error(err: &ProviderError) -> (StatusCode, Json<Self>) {
        let status =
            StatusCode::from_u16(err.status_code()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        let code = err.error_code().to_string();
        let message = err.to_string();

        let api_error = match err {
            ProviderError::InvalidRequest { param: Some(p), .. } => {
                Self::with_param(code, message, p)
            }
            _ => Self::new(code, message),
        };

        (status, Json(api_error))
    }
}

/// Check if cache bypass is requested via headers
fn should_bypass_cache(headers: &HeaderMap) -> bool {
    headers
        .get(CACHE_CONTROL_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("no-cache") || v.eq_ignore_ascii_case("no-store"))
        .unwrap_or(false)
}

/// Extract routing strategy from headers
fn extract_routing_strategy(headers: &HeaderMap) -> Option<String> {
    headers
        .get(ROUTING_STRATEGY_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_string())
}

/// Should the gateway synthesize prior assistant tool_calls from
/// `previous_response_id` when the current request's input has
/// `FunctionCallOutput` items?
///
/// Default: enabled (env var unset or `1`/`true`). Set
/// `AURA_REPLAY_TOOL_CONTEXT=false` to disable for safe rollback if
/// the replay path causes regressions on any provider.
fn tool_context_replay_enabled() -> bool {
    match std::env::var("AURA_REPLAY_TOOL_CONTEXT") {
        Ok(v) => {
            let v = v.trim().to_ascii_lowercase();
            !(v == "0" || v == "false" || v == "no" || v == "off")
        }
        Err(_) => true,
    }
}

/// Reconstruct synthesized `InputItem::FunctionCall` items from a
/// prior response's `output_items`. Returns empty Vec on any of:
///   - replay disabled via env var
///   - previous_response_id unset
///   - current input contains no FunctionCallOutput (no tool flow)
///   - DB lookup fails or returns no row
///   - output_items has no `function_call` entries
///
/// This is a best-effort enhancement: errors are logged but never
/// propagated, because the request can still proceed (just without
/// the synthesized context). The upstream provider will be the one
/// to reject if the context is genuinely required and missing —
/// matching the pre-replay behavior.
///
/// See issue #156 for the full architectural rationale.
async fn replay_prior_tool_calls(pool: &DbPool, request: &CreateResponseRequest) -> Vec<InputItem> {
    if !tool_context_replay_enabled() {
        return Vec::new();
    }

    let Some(prev_id) = request.previous_response_id.as_deref() else {
        return Vec::new();
    };

    // Only replay when the caller is actually in the middle of a
    // tool roundtrip — i.e. they sent at least one
    // FunctionCallOutput. For plain chat continuation
    // (Message-only input + previous_response_id), the providers
    // don't need a synthesized assistant turn; the conversation
    // text is sufficient.
    let has_tool_output = request
        .input
        .iter()
        .any(|i| matches!(i, InputItem::FunctionCallOutput { .. }));
    if !has_tool_output {
        return Vec::new();
    }

    let output_items = match ResponseRepo::find_output_items_by_id(pool, prev_id).await {
        Ok(Some(v)) => v,
        Ok(None) => {
            debug!(
                previous_response_id = %prev_id,
                "Tool-context replay: prior response not found in DB"
            );
            return Vec::new();
        }
        Err(err) => {
            warn!(
                previous_response_id = %prev_id,
                error = %err,
                "Tool-context replay: DB lookup failed; continuing without"
            );
            return Vec::new();
        }
    };

    // output_items is stored as a JSON array. Each entry is an
    // `Item` — we only care about ones with `type == "function_call"`.
    let Some(items) = output_items.as_array() else {
        return Vec::new();
    };

    let mut synthesized = Vec::new();
    for item in items {
        let Some(item_type) = item.get("type").and_then(|t| t.as_str()) else {
            continue;
        };
        if item_type != "function_call" {
            continue;
        }
        // Item shape (see crates/aura-types/src/item.rs::FunctionCallItem):
        //   { "type": "function_call", "id": "...", "call_id": "...",
        //     "name": "...", "arguments": "<json-string>", "status": "..." }
        let call_id = item
            .get("call_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let name = item
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let arguments = item
            .get("arguments")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "{}".to_string());

        match (call_id, name) {
            (Some(call_id), Some(name)) => {
                synthesized.push(InputItem::FunctionCall {
                    call_id,
                    name,
                    arguments,
                });
            }
            _ => {
                debug!(
                    item = ?item,
                    "Tool-context replay: function_call item missing call_id or name; skipping"
                );
            }
        }
    }

    if !synthesized.is_empty() {
        debug!(
            previous_response_id = %prev_id,
            synthesized_count = synthesized.len(),
            "Tool-context replay: injected prior tool_calls"
        );
    }
    synthesized
}

/// Apply the confidence-threshold validation gate.
///
/// When the caller picked `validation.strategy = confidence_threshold`
/// and supplied a `min_confidence`, this checks the response's measured
/// confidence (populated by the provider from logprobs) and demotes the
/// response status to `Incomplete` with reason `LowConfidence` when the
/// measurement falls short. The content is still returned — the client
/// decides whether to retry, downgrade, or surface the warning to the
/// end user.
///
/// No-op when:
/// - validation strategy isn't ConfidenceThreshold
/// - min_confidence is None
/// - response carries no validation metadata (provider didn't compute it)
/// - confidence is missing (provider doesn't support logprobs)
/// - response already isn't Completed (don't second-guess Failed)
fn apply_confidence_threshold_gate(
    request: &aura_types::CreateResponseRequest,
    response: &mut aura_types::Response,
) {
    use aura_types::{IncompleteReason, ResponseStatus, ValidationStrategy};

    let Some(validation_cfg) = request.validation.as_ref() else {
        return;
    };
    if validation_cfg.strategy != ValidationStrategy::ConfidenceThreshold {
        return;
    }
    let Some(min_confidence) = validation_cfg.min_confidence else {
        return;
    };
    if response.status != ResponseStatus::Completed {
        return;
    }
    let Some(measured) = response.validation.as_ref().and_then(|v| v.confidence) else {
        debug!(
            "confidence_threshold gate: no confidence on response \
             (provider didn't supply logprobs); not gating"
        );
        return;
    };

    if measured < min_confidence {
        debug!(
            measured = %measured,
            threshold = %min_confidence,
            "confidence_threshold gate: demoting response to incomplete"
        );
        response.status = ResponseStatus::Incomplete;
        response.incomplete_reason = Some(IncompleteReason::LowConfidence);
    }
}

/// Result of preprocessing a request
struct PreprocessResult {
    request: CreateResponseRequest,
    compression_metadata: Option<CompressionMetadata>,
    /// Original input content before compression (for logging)
    original_input: Option<String>,
    /// Compressed input content (for logging)
    compressed_input: Option<String>,
}

/// Preprocess request with compression and consistency augmentation
fn preprocess_request(mut request: CreateResponseRequest) -> PreprocessResult {
    let mut compression_metadata: Option<CompressionMetadata> = None;
    let mut original_input_log: Option<String> = None;
    let mut compressed_input_log: Option<String> = None;

    // Apply compression to input items if configured
    if let Some(ref config) = request.compression {
        if config.enabled {
            let start = std::time::Instant::now();
            let mut compressed_input = Vec::new();
            let mut total_original_tokens: u32 = 0;
            let mut total_compressed_tokens: u32 = 0;
            let mut strategies_used: Vec<aura_types::CompressionStrategy> = Vec::new();
            let mut all_original_content = Vec::new();
            let mut all_compressed_content = Vec::new();

            for item in &request.input {
                match item {
                    InputItem::Message { role, content } => {
                        // Extract text content for compression
                        let text = match content {
                            aura_types::InputContent::Text(s) => s.clone(),
                            aura_types::InputContent::Parts(parts) => {
                                // Concatenate text parts for compression
                                parts
                                    .iter()
                                    .filter_map(|p| {
                                        if let aura_types::ContentPart::Text { text } = p {
                                            Some(text.as_str())
                                        } else {
                                            None
                                        }
                                    })
                                    .collect::<Vec<_>>()
                                    .join("\n")
                            }
                        };

                        // Compress the content
                        match compression::compress(&text, config) {
                            Ok(output) => {
                                // Store for logging
                                all_original_content.push(text.clone());
                                all_compressed_content.push(output.content.clone());

                                // Accumulate token counts
                                if let Some(orig) = output.metadata.original_tokens {
                                    total_original_tokens += orig;
                                }
                                if let Some(comp) = output.metadata.compressed_tokens {
                                    total_compressed_tokens += comp;
                                }

                                // Collect strategies used
                                for strategy in &output.metadata.strategies {
                                    if !strategies_used.contains(strategy) {
                                        strategies_used.push(*strategy);
                                    }
                                }

                                // Log original vs compressed (truncated for readability)
                                let ratio = output.metadata.ratio.unwrap_or(1.0);
                                if ratio < 1.0 {
                                    let original_preview: String = text.chars().take(200).collect();
                                    let compressed_preview: String =
                                        output.content.chars().take(200).collect();
                                    debug!(
                                        original_tokens = ?output.metadata.original_tokens,
                                        compressed_tokens = ?output.metadata.compressed_tokens,
                                        ratio = ?ratio,
                                        strategies = ?output.metadata.strategies,
                                        original_preview = %original_preview,
                                        compressed_preview = %compressed_preview,
                                        "Compressed message content"
                                    );
                                }
                                compressed_input.push(InputItem::Message {
                                    role: *role,
                                    content: aura_types::InputContent::Text(output.content),
                                });
                            }
                            Err(e) => {
                                warn!(error = %e, "Compression failed, using original content");
                                compressed_input.push(item.clone());
                            }
                        }
                    }
                    other => compressed_input.push(other.clone()),
                }
            }
            request.input = compressed_input;

            // Build compression metadata
            let latency_ms = start.elapsed().as_millis() as u32;
            let ratio = if total_original_tokens > 0 {
                Some(total_compressed_tokens as f32 / total_original_tokens as f32)
            } else {
                None
            };

            compression_metadata = Some(CompressionMetadata {
                original_tokens: if total_original_tokens > 0 {
                    Some(total_original_tokens)
                } else {
                    None
                },
                compressed_tokens: if total_compressed_tokens > 0 {
                    Some(total_compressed_tokens)
                } else {
                    None
                },
                ratio,
                strategies: strategies_used,
                latency_ms: Some(latency_ms),
                aisp_symbols: None,
                bytes_saved: None,
            });

            // Store original and compressed content for logging
            original_input_log = Some(all_original_content.join("\n---\n"));
            compressed_input_log = Some(all_compressed_content.join("\n---\n"));

            info!(
                original_tokens = ?total_original_tokens,
                compressed_tokens = ?total_compressed_tokens,
                ratio = ?ratio,
                latency_ms = %latency_ms,
                "Compression applied to request"
            );
        }
    }

    // Apply consistency augmentation to instructions if configured
    if let Some(ref config) = request.consistency {
        match config.strategy {
            ConsistencyStrategy::None => {}
            ConsistencyStrategy::Constitutional => {
                if let Some(ref principles) = config.principles {
                    let augmented = PromptAugmenter::with_constitution(
                        request.instructions.as_deref(),
                        principles,
                    );
                    request.instructions = Some(augmented);
                    debug!(
                        principles_count = principles.len(),
                        "Applied constitutional consistency"
                    );
                }
            }
            ConsistencyStrategy::StyleProfile => {
                if let Some(ref style) = config.style_profile {
                    let augmented =
                        PromptAugmenter::with_style(request.instructions.as_deref(), style);
                    request.instructions = Some(augmented);
                    debug!("Applied style profile consistency");
                }
            }
            ConsistencyStrategy::ReferenceAnchoring => {
                if let Some(ref reference) = config.reference_response {
                    let augmented =
                        PromptAugmenter::with_reference(request.instructions.as_deref(), reference);
                    request.instructions = Some(augmented);
                    debug!("Applied reference anchoring consistency");
                }
            }
            ConsistencyStrategy::FewShotPriming => {
                if let Some(ref examples) = config.examples {
                    let augmented =
                        PromptAugmenter::with_examples(request.instructions.as_deref(), examples);
                    request.instructions = Some(augmented);
                    debug!(
                        examples_count = examples.len(),
                        "Applied few-shot priming consistency"
                    );
                }
            }
            ConsistencyStrategy::ModelCalibration => {
                // Get default calibration for the model
                let calibration = aura_types::DefaultCalibrations::for_model(&request.model);
                let augmented = PromptAugmenter::with_calibration(
                    request.instructions.as_deref(),
                    &calibration,
                );
                request.instructions = Some(augmented);
                debug!(model = %request.model, "Applied model calibration consistency");
            }
            _ => {
                // Other strategies not yet implemented
                debug!(strategy = ?config.strategy, "Consistency strategy not yet implemented");
            }
        }
    }

    PreprocessResult {
        request,
        compression_metadata,
        original_input: original_input_log,
        compressed_input: compressed_input_log,
    }
}

/// Create a response (streaming or non-streaming)
///
/// This is the main endpoint for generating LLM responses. Set `stream: true` for
/// Server-Sent Events streaming, or `stream: false` for a single JSON response.
#[utoipa::path(
    post,
    path = "/v1/responses",
    tag = "responses",
    request_body = CreateResponseRequest,
    responses(
        (status = 200, description = "Response created successfully", body = aura_types::Response),
        (status = 400, description = "Invalid request"),
        (status = 401, description = "Missing or invalid authentication"),
        (status = 403, description = "Insufficient permissions"),
        (status = 404, description = "Model not found"),
        (status = 429, description = "Rate limit exceeded"),
        (status = 500, description = "Internal server error")
    ),
    security(
        ("bearer_auth" = [])
    )
)]
#[instrument(skip(state, headers, request, auth), fields(model = %request.model, stream = %request.stream))]
pub async fn create_response(
    State(state): State<AppState>,
    headers: HeaderMap,
    auth: Option<Extension<AuthContext>>,
    Json(request): Json<CreateResponseRequest>,
) -> Result<AxumResponse, (StatusCode, Json<ApiError>)> {
    // Generate unique request ID for tracing
    let request_id = format!("aura_{}", Uuid::new_v4());

    // Extract auth context (may not be present in dev mode)
    let auth_context = auth.map(|Extension(ctx)| ctx);

    // Extract routing strategy from header
    let routing_strategy = extract_routing_strategy(&headers);

    // Enforce scope requirement for authenticated requests
    if let Some(ref auth) = auth_context {
        if !auth.has_scope("responses:create") && !auth.has_scope("*") {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ApiError::new(
                    "insufficient_scope",
                    "API key does not have required scope: responses:create",
                )),
            ));
        }
    }

    info!(
        request_id = %request_id,
        model = %request.model,
        stream = %request.stream,
        api_key_id = ?auth_context.as_ref().map(|c| c.api_key.id),
        has_validation = request.validation.is_some(),
        has_consistency = request.consistency.is_some(),
        has_compression = request.compression.is_some(),
        has_previous_response = request.previous_response_id.is_some(),
        "Creating response"
    );

    // Tool-context replay: when previous_response_id is set and the
    // current input has FunctionCallOutput items, reconstruct prior
    // tool_calls from the stored response and prepend them. This is
    // what lets OpenAI/Anthropic/Google see the expected assistant→
    // tool pairing on the second roundtrip. Issue #156.
    //
    // Best-effort: errors are logged inside the helper, never raised.
    // Gated on AURA_REPLAY_TOOL_CONTEXT (defaults on).
    let mut request = request;
    if let Some(pool) = state.db_pool() {
        let synthesized = replay_prior_tool_calls(pool, &request).await;
        if !synthesized.is_empty() {
            let mut new_input = synthesized;
            new_input.append(&mut request.input);
            request.input = new_input;
        }
    }

    // Preprocess request with compression and consistency
    let preprocess_result = preprocess_request(request);
    let request = preprocess_result.request;
    let compression_metadata = preprocess_result.compression_metadata;
    let original_input = preprocess_result.original_input;
    let compressed_input = preprocess_result.compressed_input;

    // Build compression log metadata if compression was applied
    let compression_log_metadata: Option<serde_json::Value> = compression_metadata.as_ref().map(|cm| {
        let mut obj = serde_json::json!({
            "original_tokens": cm.original_tokens,
            "compressed_tokens": cm.compressed_tokens,
            "ratio": cm.ratio,
            "strategies": cm.strategies.iter().map(|s| format!("{:?}", s).to_lowercase()).collect::<Vec<_>>(),
            "latency_ms": cm.latency_ms,
        });
        // Add truncated content previews (first 500 chars to avoid huge logs)
        if let Some(ref orig) = original_input {
            let preview: String = orig.chars().take(500).collect();
            obj["original_preview"] = serde_json::json!(preview);
            obj["original_length"] = serde_json::json!(orig.len());
        }
        if let Some(ref comp) = compressed_input {
            let preview: String = comp.chars().take(500).collect();
            obj["compressed_preview"] = serde_json::json!(preview);
            obj["compressed_length"] = serde_json::json!(comp.len());
        }
        obj
    });

    // Get the provider for this request
    let provider = state.get_provider(&request.model).ok_or_else(|| {
        let err = ProviderError::model_not_found(&request.model);
        ApiError::from_provider_error(&err)
    })?;

    let provider_name = provider.name().to_string();

    // best_of_n / self_consistency must run non-streaming because the
    // fanout selects a winner only after all N candidates complete.
    // We force-degrade here so the rest of the dispatch routes through
    // the non-streaming path; the fanout call below stamps a warning
    // into ValidationMetadata.warning so the client can surface it.
    let mut request = request;
    let needs_fanout = matches!(
        request.validation.as_ref().map(|v| v.strategy),
        Some(aura_types::ValidationStrategy::BestOfN)
            | Some(aura_types::ValidationStrategy::SelfConsistency)
    );
    if needs_fanout && request.stream {
        debug!(
            strategy = ?request.validation.as_ref().map(|v| v.strategy),
            "Fanout requested with stream=true; degrading to non-streaming"
        );
        request.stream = false;
    }
    let is_streaming = request.stream;

    // Record request metric
    metrics::record_request(&provider_name, &request.model, is_streaming);

    if request.stream {
        // Track start time for latency calculation
        let start = std::time::Instant::now();

        // Get or create conversation BEFORE streaming starts
        let conversation_result = state.get_or_create_conversation(&request).await;
        let conversation_id = match conversation_result {
            Ok((conv_id, is_new)) => {
                if is_new {
                    info!(conversation_id = %conv_id, "Created new conversation");
                }
                Some(conv_id)
            }
            Err(e) => {
                warn!(error = %e, "Failed to get/create conversation - continuing without persistence");
                None
            }
        };

        // Streaming response
        let stream = provider
            .complete_stream(request.clone())
            .await
            .map_err(|e| {
                error!(request_id = %request_id, error = %e, "Streaming request failed");
                ApiError::from_provider_error(&e)
            })?;

        // Clone state and request_id for the stream closure
        let state_for_stream = state.clone();
        let request_id_for_stream = request_id.clone();
        let request_for_stream = request.clone();
        let provider_name = provider.name().to_string();
        let model_id = request.model.clone();
        let auth_for_stream = auth_context.clone();
        let auth_for_enrich = auth_context.clone();
        let start_for_stream = start;
        let compression_metadata_for_stream = compression_metadata.clone();
        let compression_log_for_stream = compression_log_metadata.clone();
        let routing_strategy_for_stream = routing_strategy.clone();

        // Convert to SSE stream, enriching terminal events
        let sse_stream = stream.then(move |result| {
            let state_clone = state_for_stream.clone();
            let request_id_clone = request_id_for_stream.clone();
            let request_clone = request_for_stream.clone();
            let provider_name_clone = provider_name.clone();
            let model_id_clone = model_id.clone();
            let auth_clone = auth_for_stream.clone();
            let auth_enrich_clone = auth_for_enrich.clone();
            let compression_meta_clone = compression_metadata_for_stream.clone();
            let compression_log_clone = compression_log_for_stream.clone();
            let routing_strategy_clone = routing_strategy_for_stream.clone();

            async move {
                match result {
                    Ok(event) => {
                        let event = match event {
                            StreamEvent::ResponseCompleted { response } => {
                                // Calculate latency
                                let latency_ms = start_for_stream.elapsed().as_millis() as u64;

                                let mut response = state_clone
                                    .enrich_response_with_latency(
                                        response,
                                        &request_id_clone,
                                        latency_ms,
                                        auth_enrich_clone.as_ref(),
                                        Some(&request_clone),
                                        compression_meta_clone.as_ref(),
                                        routing_strategy_clone.as_deref(),
                                    )
                                    .await;

                                // Apply confidence_threshold gate (no-op
                                // for other strategies / missing confidence)
                                apply_confidence_threshold_gate(&request_clone, &mut response);

                                // Log completed response
                                let usage = response.usage.as_ref();

                                // Merge response metadata with compression log
                                let log_metadata = match (
                                    response.metadata.clone(),
                                    compression_log_clone.clone(),
                                ) {
                                    (Some(mut resp_meta), Some(comp_meta)) => {
                                        if let Some(obj) = resp_meta.as_object_mut() {
                                            obj.insert("compression_log".to_string(), comp_meta);
                                        }
                                        Some(resp_meta)
                                    }
                                    (Some(resp_meta), None) => Some(resp_meta),
                                    (None, Some(comp_meta)) => {
                                        Some(serde_json::json!({"compression_log": comp_meta}))
                                    }
                                    (None, None) => None,
                                };

                                let log = NewRequestLog {
                                    response_id: request_id_clone.clone(),
                                    conversation_id,
                                    provider_name: provider_name_clone.clone(),
                                    model_id: model_id_clone.clone(),
                                    user_id: request_clone.user.clone(),
                                    input_tokens: usage.map(|u| u.input_tokens as i32),
                                    output_tokens: usage.map(|u| u.output_tokens as i32),
                                    cached_tokens: usage
                                        .and_then(|u| u.cached_tokens)
                                        .map(|t| t as i32),
                                    reasoning_tokens: usage
                                        .and_then(|u| u.reasoning_tokens)
                                        .map(|t| t as i32),
                                    cost_usd: usage.and_then(|u| u.cost_usd),
                                    latency_ms: Some(latency_ms as i32),
                                    status: "completed".to_string(),
                                    error_code: None,
                                    error_message: None,
                                    metadata: log_metadata,
                                };

                                // Save response and record API key usage.
                                //
                                // save_response is awaited (not spawned) so the
                                // responses.output_items row exists in Postgres
                                // before the client receives response.completed
                                // and fires its next roundtrip. Without this,
                                // replay_prior_tool_calls races the background
                                // write and returns None — Anthropic then sees
                                // tool_result without prior tool_use and 400s
                                // ("unexpected tool_use_id"). Adds ~5-20ms to
                                // tail latency on the final event. Other work
                                // (log_request, message rows, usage) stays
                                // backgrounded — none of it gates replay.
                                if let Some(conv_id) = conversation_id {
                                    state_clone
                                        .save_response(conv_id, &request_clone, &response)
                                        .await;

                                    let state_bg = state_clone.clone();
                                    let response_bg = response.clone();
                                    let request_bg = request_clone.clone();
                                    let auth_bg = auth_clone.clone();
                                    let response_id_for_diag = response.id.clone();
                                    tokio::spawn(async move {
                                        info!(
                                            response_id = %response_id_for_diag,
                                            auth_present = auth_bg.is_some(),
                                            "persistence-spawn: entered (streaming, with conv_id)"
                                        );
                                        // Record API key usage FIRST so a panic
                                        // in log_request / save_messages_from_items
                                        // can't block usage accounting. The
                                        // billing/usage path is the most important
                                        // side effect of a completed request.
                                        if let Some(auth) = &auth_bg {
                                            state_bg
                                                .record_api_key_usage(
                                                    auth,
                                                    &response_bg,
                                                    &request_bg,
                                                )
                                                .await;
                                        }
                                        state_bg.log_request(log).await;
                                        state_bg
                                            .save_messages_from_items(
                                                conv_id,
                                                &response_bg.id,
                                                &response_bg.output,
                                            )
                                            .await;
                                    });
                                } else {
                                    let auth_bg = auth_clone.clone();
                                    let response_bg = response.clone();
                                    let request_bg = request_clone.clone();
                                    let response_id_for_diag = response.id.clone();
                                    tokio::spawn({
                                        let state = state_clone.clone();
                                        async move {
                                            info!(
                                                response_id = %response_id_for_diag,
                                                auth_present = auth_bg.is_some(),
                                                "persistence-spawn: entered (streaming, no conv_id)"
                                            );
                                            // Record API key usage FIRST.
                                            // See sibling branch comment.
                                            if let Some(auth) = &auth_bg {
                                                state
                                                    .record_api_key_usage(
                                                        auth,
                                                        &response_bg,
                                                        &request_bg,
                                                    )
                                                    .await;
                                            }
                                            state.log_request(log).await;
                                        }
                                    });
                                }

                                StreamEvent::ResponseCompleted { response }
                            }
                            StreamEvent::ResponseFailed { response } => {
                                // Log failed response. latency_ms still meaningful here —
                                // the request reached the provider before failing, so the
                                // dashboard latency cards can include failed-request tail.
                                let latency_ms = start_for_stream.elapsed().as_millis() as i32;
                                let log = NewRequestLog {
                                    response_id: request_id_clone.clone(),
                                    conversation_id,
                                    provider_name: provider_name_clone.clone(),
                                    model_id: model_id_clone.clone(),
                                    user_id: request_clone.user.clone(),
                                    input_tokens: None,
                                    output_tokens: None,
                                    cached_tokens: None,
                                    reasoning_tokens: None,
                                    cost_usd: None,
                                    latency_ms: Some(latency_ms),
                                    status: "failed".to_string(),
                                    error_code: response.error.as_ref().map(|e| e.code.clone()),
                                    error_message: response
                                        .error
                                        .as_ref()
                                        .map(|e| e.message.clone()),
                                    metadata: response.metadata.clone(),
                                };

                                if let Some(conv_id) = conversation_id {
                                    let state_bg = state_clone.clone();
                                    let response_bg = response.clone();
                                    let request_bg = request_clone.clone();
                                    tokio::spawn(async move {
                                        state_bg.log_request(log).await;
                                        state_bg
                                            .save_response(conv_id, &request_bg, &response_bg)
                                            .await;
                                    });
                                } else {
                                    tokio::spawn({
                                        let state = state_clone.clone();
                                        async move { state.log_request(log).await }
                                    });
                                }

                                StreamEvent::ResponseFailed { response }
                            }
                            StreamEvent::ResponseIncomplete { response } => {
                                // Log incomplete response with the latency we
                                // accumulated up to the incomplete event — useful
                                // for triaging (e.g., max-tokens incompletes
                                // tend to land near the timeout).
                                let latency_ms = start_for_stream.elapsed().as_millis() as i32;
                                let usage = response.usage.as_ref();
                                let log = NewRequestLog {
                                    response_id: request_id_clone.clone(),
                                    conversation_id,
                                    provider_name: provider_name_clone.clone(),
                                    model_id: model_id_clone.clone(),
                                    user_id: request_clone.user.clone(),
                                    input_tokens: usage.map(|u| u.input_tokens as i32),
                                    output_tokens: usage.map(|u| u.output_tokens as i32),
                                    cached_tokens: usage
                                        .and_then(|u| u.cached_tokens)
                                        .map(|t| t as i32),
                                    reasoning_tokens: usage
                                        .and_then(|u| u.reasoning_tokens)
                                        .map(|t| t as i32),
                                    cost_usd: usage.and_then(|u| u.cost_usd),
                                    latency_ms: Some(latency_ms),
                                    status: "incomplete".to_string(),
                                    error_code: None,
                                    error_message: None,
                                    metadata: response.metadata.clone(),
                                };

                                if let Some(conv_id) = conversation_id {
                                    let state_bg = state_clone.clone();
                                    let response_bg = response.clone();
                                    let request_bg = request_clone.clone();
                                    tokio::spawn(async move {
                                        state_bg.log_request(log).await;
                                        state_bg
                                            .save_response(conv_id, &request_bg, &response_bg)
                                            .await;
                                    });
                                } else {
                                    tokio::spawn({
                                        let state = state_clone.clone();
                                        async move { state.log_request(log).await }
                                    });
                                }

                                StreamEvent::ResponseIncomplete { response }
                            }
                            other => other,
                        };

                        let event_type = event.event_type();
                        let data = serde_json::to_string(&event).unwrap_or_else(|e| {
                            format!(r#"{{"error":"Failed to serialize event: {}"}}"#, e)
                        });
                        Ok::<_, Infallible>(
                            axum::response::sse::Event::default()
                                .event(event_type)
                                .data(data),
                        )
                    }
                    Err(e) => {
                        let error_event =
                            StreamEvent::error(aura_types::StreamError::server(e.to_string()));
                        let data = serde_json::to_string(&error_event)
                            .unwrap_or_else(|e| format!(r#"{{"error":"{}"}}"#, e));
                        Ok(axum::response::sse::Event::default()
                            .event("error")
                            .data(data))
                    }
                }
            }
        });

        let sse = Sse::new(sse_stream)
            .keep_alive(axum::response::sse::KeepAlive::new().interval(Duration::from_secs(15)));

        Ok(sse.into_response())
    } else {
        // Non-streaming response - track latency
        let start = Instant::now();
        let model_id = request.model.clone();
        let bypass_cache = should_bypass_cache(&headers);

        // Check cache first (if caching is enabled and request is cacheable)
        let cache_enabled = state.response_cache().is_some()
            && !bypass_cache
            && !cache::ResponseCache::should_skip_cache(&request);

        if cache_enabled {
            if let Some(cache) = state.response_cache() {
                match cache.get(&request).await {
                    Ok(Some(hit)) => {
                        debug!(
                            cache_key = %hit.cache_key,
                            ttl_remaining = %hit.ttl_remaining,
                            "Cache hit"
                        );

                        // Enrich with cache metadata
                        let response = cache::enrich_cached_response(hit.response, &hit.cache_key);

                        // Record metrics for cache hit
                        let latency_ms = start.elapsed().as_millis() as u64;
                        metrics::record_request_completed(
                            &provider_name,
                            &request.model,
                            false,
                            "completed",
                            latency_ms as f64 / 1000.0,
                        );

                        info!(
                            request_id = %request_id,
                            cache_key = %hit.cache_key,
                            latency_ms = %latency_ms,
                            "Response served from cache"
                        );

                        return Ok(Json(response).into_response());
                    }
                    Ok(None) => {
                        debug!("Cache miss");
                    }
                    Err(e) => {
                        warn!(error = %e, "Cache lookup failed");
                    }
                }
            }
        }

        // Increment active requests gauge
        metrics::increment_active_requests(&provider_name);

        // Get or create conversation BEFORE making the provider call
        let conversation_result = state.get_or_create_conversation(&request).await;
        let conversation_id = match conversation_result {
            Ok((conv_id, is_new)) => {
                if is_new {
                    info!(conversation_id = %conv_id, "Created new conversation");
                } else {
                    info!(conversation_id = %conv_id, "Continuing existing conversation");
                }
                Some(conv_id)
            }
            Err(e) => {
                warn!(error = %e, "Failed to get/create conversation - continuing without persistence");
                None
            }
        };

        // Route through fanout when validation requested best_of_n /
        // self_consistency. Otherwise issue a single provider call.
        let response = if needs_fanout {
            let n = request
                .validation
                .as_ref()
                .and_then(|v| v.n)
                .unwrap_or(3)
                .clamp(1, 8);
            let selector = match request.validation.as_ref().map(|v| v.strategy) {
                Some(aura_types::ValidationStrategy::SelfConsistency) => {
                    aura_core::FanoutSelector::MostFrequent
                }
                _ => aura_core::FanoutSelector::HighestLogprob,
            };
            aura_core::run_fanout(provider.clone(), request.clone(), n, selector)
                .await
                .map_err(|e| {
                    metrics::decrement_active_requests(&provider_name);
                    error!(error = %e, "Fanout failed");
                    match e {
                        aura_core::FanoutError::AllCandidatesFailed { source, .. } => {
                            metrics::record_provider_error(&provider_name, source.error_code());
                            ApiError::from_provider_error(&source)
                        }
                        aura_core::FanoutError::InvalidN(n) => (
                            StatusCode::BAD_REQUEST,
                            Json(ApiError::new(
                                "invalid_request",
                                format!("validation.n must be between 1 and 8, got {n}"),
                            )),
                        ),
                    }
                })?
        } else {
            provider.complete(request.clone()).await.map_err(|e| {
                // Decrement active requests on error
                metrics::decrement_active_requests(&provider_name);
                metrics::record_provider_error(&provider_name, e.error_code());

                error!(error = %e, "Request failed");

                // Log failed request (with conversation_id if available)
                let log = NewRequestLog {
                    response_id: request_id.clone(),
                    conversation_id,
                    provider_name: provider_name.clone(),
                    model_id: model_id.clone(),
                    user_id: request.user.clone(),
                    input_tokens: None,
                    output_tokens: None,
                    cached_tokens: None,
                    reasoning_tokens: None,
                    cost_usd: None,
                    latency_ms: Some(start.elapsed().as_millis() as i32),
                    status: "failed".to_string(),
                    error_code: Some(e.error_code().to_string()),
                    error_message: Some(e.to_string()),
                    metadata: None,
                };
                tokio::spawn({
                    let state = state.clone();
                    async move { state.log_request(log).await }
                });

                ApiError::from_provider_error(&e)
            })?
        };

        let latency_ms = start.elapsed().as_millis() as u64;

        // Decrement active requests
        metrics::decrement_active_requests(&provider_name);

        // Enrich with cost and latency information
        let mut response = state
            .enrich_response_with_latency(
                response,
                &request_id,
                latency_ms,
                auth_context.as_ref(),
                Some(&request),
                compression_metadata.as_ref(),
                routing_strategy.as_deref(),
            )
            .await;

        // Apply confidence_threshold gate (no-op for other strategies)
        apply_confidence_threshold_gate(&request, &mut response);

        // Record metrics
        let status_str = match response.status {
            ResponseStatus::Completed => "completed",
            ResponseStatus::Failed => "failed",
            ResponseStatus::Incomplete => "incomplete",
            ResponseStatus::InProgress => "in_progress",
            ResponseStatus::Cancelled => "cancelled",
        };

        metrics::record_request_completed(
            &provider_name,
            &request.model,
            false,
            status_str,
            latency_ms as f64 / 1000.0,
        );

        if let Some(ref usage) = response.usage {
            metrics::record_tokens(
                &provider_name,
                &request.model,
                usage.input_tokens,
                usage.output_tokens,
                usage.cached_tokens,
                usage.reasoning_tokens,
            );

            if let Some(cost) = usage.cost_usd {
                metrics::record_cost(&provider_name, &request.model, cost);
            }
        }

        // Record tool calls
        for item in &response.output {
            if let Some(fc) = item.as_function_call() {
                metrics::record_tool_call(&fc.name, &provider_name, &request.model);
            }
        }

        info!(
            id = %response.id,
            status = ?response.status,
            latency_ms = %latency_ms,
            conversation_id = ?conversation_id,
            "Response completed"
        );

        // Cache the response if applicable
        if cache_enabled && cache::ResponseCache::should_cache_response(&response) {
            if let Some(cache) = state.response_cache() {
                match cache.set(&request, &response, None).await {
                    Ok(cache_key) => {
                        debug!(cache_key = %cache_key, "Response cached");
                    }
                    Err(e) => {
                        warn!(error = %e, "Failed to cache response");
                    }
                }
            }
        }

        // Log successful request to database
        let usage = response.usage.as_ref();
        let cost_usd = usage.and_then(|u| u.cost_usd);

        // Merge response metadata with compression log metadata
        let log_metadata = match (response.metadata.clone(), compression_log_metadata.clone()) {
            (Some(mut resp_meta), Some(comp_meta)) => {
                if let Some(obj) = resp_meta.as_object_mut() {
                    obj.insert("compression_log".to_string(), comp_meta);
                }
                Some(resp_meta)
            }
            (Some(resp_meta), None) => Some(resp_meta),
            (None, Some(comp_meta)) => Some(serde_json::json!({"compression_log": comp_meta})),
            (None, None) => None,
        };

        let log = NewRequestLog {
            response_id: request_id,
            conversation_id,
            provider_name,
            model_id,
            user_id: request.user.clone(),
            input_tokens: usage.map(|u| u.input_tokens as i32),
            output_tokens: usage.map(|u| u.output_tokens as i32),
            cached_tokens: usage.and_then(|u| u.cached_tokens).map(|t| t as i32),
            reasoning_tokens: usage.and_then(|u| u.reasoning_tokens).map(|t| t as i32),
            cost_usd,
            latency_ms: Some(latency_ms as i32),
            status: match response.status {
                ResponseStatus::Completed => "completed",
                ResponseStatus::Failed => "failed",
                ResponseStatus::Incomplete => "incomplete",
                ResponseStatus::InProgress => "in_progress",
                ResponseStatus::Cancelled => "cancelled",
            }
            .to_string(),
            error_code: None,
            error_message: None,
            metadata: log_metadata,
        };

        // Persist the response synchronously before returning so the
        // row exists in Postgres if the client immediately submits a
        // follow-up request with previous_response_id (e.g. tool
        // roundtrips). See the streaming branch above for the full
        // rationale. Other work stays backgrounded.
        if let Some(conv_id) = conversation_id {
            state.save_response(conv_id, &request, &response).await;
        }

        // CRITICAL: Clone AFTER enrichment to preserve usage/cost data
        let response_for_bg = response.clone();
        let request_for_bg = request.clone();
        let auth_for_bg = auth_context.clone();
        let response_id_for_diag = response.id.clone();

        // Spawn background tasks for persistence (non-blocking)
        let state_for_bg = state.clone();
        tokio::spawn(async move {
            info!(
                response_id = %response_id_for_diag,
                auth_present = auth_for_bg.is_some(),
                "persistence-spawn: entered (non-streaming)"
            );
            // Record API key usage FIRST. See streaming branch comment
            // — billing/usage matters more than the soft data and must
            // not be blocked by a panic in log_request or
            // save_messages_from_items.
            if let Some(auth) = &auth_for_bg {
                state_for_bg
                    .record_api_key_usage(auth, &response_for_bg, &request_for_bg)
                    .await;
            }
            // Log to request_logs
            state_for_bg.log_request(log).await;

            // Save per-message rows for the conversation view
            if let Some(conv_id) = conversation_id {
                state_for_bg
                    .save_messages_from_items(conv_id, &response_for_bg.id, &response_for_bg.output)
                    .await;
            }
        });

        Ok(Json(response).into_response())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::{
        CreateResponseRequest, IncompleteReason, Response, ResponseStatus, ValidationConfig,
        ValidationMetadata, ValidationStrategy,
    };

    fn make_completed_response_with_confidence(confidence: Option<f32>) -> Response {
        let mut response = Response::in_progress("resp_test", "gpt-4");
        response.status = ResponseStatus::Completed;
        response.validation = Some(ValidationMetadata {
            strategy: ValidationStrategy::ConfidenceThreshold,
            confidence,
            perplexity: None,
            candidates_generated: None,
            selected_index: None,
            selection_reason: None,
            passed: true,
            warning: None,
            logprobs: None,
        });
        response
    }

    #[test]
    fn test_confidence_threshold_demotes_when_below() {
        let validation = ValidationConfig {
            strategy: ValidationStrategy::ConfidenceThreshold,
            min_confidence: Some(0.8),
            ..Default::default()
        };
        let request = CreateResponseRequest::text("gpt-4", "Hello!").with_validation(validation);
        let mut response = make_completed_response_with_confidence(Some(0.6));

        apply_confidence_threshold_gate(&request, &mut response);

        assert_eq!(response.status, ResponseStatus::Incomplete);
        assert_eq!(
            response.incomplete_reason,
            Some(IncompleteReason::LowConfidence)
        );
    }

    #[test]
    fn test_confidence_threshold_keeps_completed_when_above() {
        let validation = ValidationConfig {
            strategy: ValidationStrategy::ConfidenceThreshold,
            min_confidence: Some(0.5),
            ..Default::default()
        };
        let request = CreateResponseRequest::text("gpt-4", "Hello!").with_validation(validation);
        let mut response = make_completed_response_with_confidence(Some(0.9));

        apply_confidence_threshold_gate(&request, &mut response);

        assert_eq!(response.status, ResponseStatus::Completed);
        assert_eq!(response.incomplete_reason, None);
    }

    #[test]
    fn test_confidence_threshold_no_op_when_strategy_not_threshold() {
        let validation = ValidationConfig {
            strategy: ValidationStrategy::Logprobs,
            min_confidence: Some(0.8),
            ..Default::default()
        };
        let request = CreateResponseRequest::text("gpt-4", "Hello!").with_validation(validation);
        let mut response = make_completed_response_with_confidence(Some(0.1));

        apply_confidence_threshold_gate(&request, &mut response);

        // Strategy is Logprobs, not ConfidenceThreshold — gate must not fire.
        assert_eq!(response.status, ResponseStatus::Completed);
        assert_eq!(response.incomplete_reason, None);
    }

    #[test]
    fn test_confidence_threshold_no_op_when_confidence_missing() {
        // Provider didn't supply logprobs — we can't gate on what we
        // can't measure. Don't demote a Completed response.
        let validation = ValidationConfig {
            strategy: ValidationStrategy::ConfidenceThreshold,
            min_confidence: Some(0.8),
            ..Default::default()
        };
        let request = CreateResponseRequest::text("gpt-4", "Hello!").with_validation(validation);
        let mut response = make_completed_response_with_confidence(None);

        apply_confidence_threshold_gate(&request, &mut response);

        assert_eq!(response.status, ResponseStatus::Completed);
    }

    #[test]
    fn test_api_error_serialization() {
        let error = ApiError::new("invalid_request", "Bad input");
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("\"code\":\"invalid_request\""));
        assert!(json.contains("\"message\":\"Bad input\""));
    }

    #[test]
    fn test_api_error_with_param() {
        let error = ApiError::with_param("invalid_request", "Invalid model", "model");
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("\"param\":\"model\""));
    }

    #[test]
    fn test_provider_error_conversion() {
        let err = ProviderError::authentication("Invalid API key");
        let (status, json) = ApiError::from_provider_error(&err);
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(json.0.error.code, "authentication_error");
    }

    // -----------------------------------------------------------
    // Tool-context replay (issue #156)
    // -----------------------------------------------------------
    //
    // These tests mutate AURA_REPLAY_TOOL_CONTEXT, which is process-
    // global state. Cargo runs tests in parallel by default, so use
    // a single test function that exercises the parsing serially
    // and restores the prior env-var value. Avoids the per-test
    // dance with serial_test or std::sync::Mutex.

    #[test]
    fn test_tool_context_replay_enabled_parsing() {
        let prior = std::env::var("AURA_REPLAY_TOOL_CONTEXT").ok();

        // unset → default on
        std::env::remove_var("AURA_REPLAY_TOOL_CONTEXT");
        assert!(tool_context_replay_enabled());

        // explicit on
        for v in ["1", "true", "TRUE", "yes", "on"] {
            std::env::set_var("AURA_REPLAY_TOOL_CONTEXT", v);
            assert!(
                tool_context_replay_enabled(),
                "expected {v:?} to be parsed as enabled"
            );
        }

        // explicit off
        for v in ["0", "false", "FALSE", "no", "off"] {
            std::env::set_var("AURA_REPLAY_TOOL_CONTEXT", v);
            assert!(
                !tool_context_replay_enabled(),
                "expected {v:?} to be parsed as disabled"
            );
        }

        // Restore prior env state so other tests aren't affected.
        match prior {
            Some(v) => std::env::set_var("AURA_REPLAY_TOOL_CONTEXT", v),
            None => std::env::remove_var("AURA_REPLAY_TOOL_CONTEXT"),
        }
    }
}
