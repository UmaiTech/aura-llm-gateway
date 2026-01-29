//! Response creation endpoint for the Open Responses API
//!
//! This endpoint handles both streaming and non-streaming response creation,
//! transforming requests through the appropriate provider.
//!
//! ## Caching
//!
//! Non-streaming responses with `temperature=0` are cached in Redis if available.
//! To bypass caching, set the `X-Cache-Control: no-cache` header.

use aura_core::{cache, metrics, ProviderError};
use aura_db::NewRequestLog;
use aura_types::{CreateResponseRequest, ResponseStatus, StreamEvent};
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
        "Creating response"
    );

    // Get the provider for this request
    let provider = state.get_provider(&request.model).ok_or_else(|| {
        let err = ProviderError::model_not_found(&request.model);
        ApiError::from_provider_error(&err)
    })?;

    let provider_name = provider.name().to_string();
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

        // Convert to SSE stream, enriching terminal events
        let sse_stream = stream.then(move |result| {
            let state_clone = state_for_stream.clone();
            let request_id_clone = request_id_for_stream.clone();
            let request_clone = request_for_stream.clone();
            let provider_name_clone = provider_name.clone();
            let model_id_clone = model_id.clone();
            let auth_clone = auth_for_stream.clone();
            let auth_enrich_clone = auth_for_enrich.clone();

            async move {
                match result {
                    Ok(event) => {
                        let event = match event {
                            StreamEvent::ResponseCompleted { response } => {
                                // Calculate latency
                                let latency_ms = start_for_stream.elapsed().as_millis() as u64;

                                let response = state_clone
                                    .enrich_response_with_latency(
                                        response,
                                        &request_id_clone,
                                        latency_ms,
                                        auth_enrich_clone.as_ref(),
                                        Some(&request_clone),
                                    )
                                    .await;

                                // Log completed response
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
                                    latency_ms: None,
                                    status: "completed".to_string(),
                                    error_code: None,
                                    error_message: None,
                                    metadata: response.metadata.clone(),
                                };

                                // Save response and record API key usage
                                if let Some(conv_id) = conversation_id {
                                    let state_bg = state_clone.clone();
                                    let response_bg = response.clone();
                                    let request_bg = request_clone.clone();
                                    let auth_bg = auth_clone.clone();
                                    tokio::spawn(async move {
                                        state_bg.log_request(log).await;
                                        state_bg
                                            .save_response(conv_id, &request_bg, &response_bg)
                                            .await;
                                        state_bg
                                            .save_messages_from_items(
                                                conv_id,
                                                &response_bg.id,
                                                &response_bg.output,
                                            )
                                            .await;
                                        // Record API key usage
                                        if let Some(auth) = auth_bg {
                                            state_bg
                                                .record_api_key_usage(
                                                    &auth,
                                                    &response_bg,
                                                    &request_bg,
                                                )
                                                .await;
                                        }
                                    });
                                } else {
                                    let auth_bg = auth_clone.clone();
                                    let response_bg = response.clone();
                                    let request_bg = request_clone.clone();
                                    tokio::spawn({
                                        let state = state_clone.clone();
                                        async move {
                                            state.log_request(log).await;
                                            // Record API key usage
                                            if let Some(auth) = auth_bg {
                                                state
                                                    .record_api_key_usage(
                                                        &auth,
                                                        &response_bg,
                                                        &request_bg,
                                                    )
                                                    .await;
                                            }
                                        }
                                    });
                                }

                                StreamEvent::ResponseCompleted { response }
                            }
                            StreamEvent::ResponseFailed { response } => {
                                // Log failed response
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
                                    latency_ms: None,
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
                                // Log incomplete response
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
                                    latency_ms: None,
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

        let response = provider.complete(request.clone()).await.map_err(|e| {
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
        })?;

        let latency_ms = start.elapsed().as_millis() as u64;

        // Decrement active requests
        metrics::decrement_active_requests(&provider_name);

        // Enrich with cost and latency information
        let response = state
            .enrich_response_with_latency(
                response,
                &request_id,
                latency_ms,
                auth_context.as_ref(),
                Some(&request),
            )
            .await;

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
            metadata: response.metadata.clone(),
        };

        // CRITICAL: Clone AFTER enrichment to preserve usage/cost data
        let response_for_bg = response.clone();
        let request_for_bg = request.clone();
        let auth_for_bg = auth_context.clone();

        // Spawn background tasks for persistence (non-blocking)
        let state_for_bg = state.clone();
        tokio::spawn(async move {
            // Log to request_logs
            state_for_bg.log_request(log).await;

            // Save full response and messages if conversation exists
            if let Some(conv_id) = conversation_id {
                state_for_bg
                    .save_response(conv_id, &request_for_bg, &response_for_bg)
                    .await;
                state_for_bg
                    .save_messages_from_items(conv_id, &response_for_bg.id, &response_for_bg.output)
                    .await;
            }

            // Record API key usage
            if let Some(auth) = auth_for_bg {
                state_for_bg
                    .record_api_key_usage(&auth, &response_for_bg, &request_for_bg)
                    .await;
            }
        });

        Ok(Json(response).into_response())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
