//! Response creation endpoint for the Open Responses API
//!
//! This endpoint handles both streaming and non-streaming response creation,
//! transforming requests through the appropriate provider.

use aura_core::ProviderError;
use aura_types::{CreateResponseRequest, StreamEvent};
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response as AxumResponse, Sse},
    routing::post,
    Json, Router,
};
use futures_util::StreamExt;
use serde::Serialize;
use std::convert::Infallible;
use std::time::{Duration, Instant};
use tracing::{error, info, instrument};

use crate::AppState;

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

/// Create a response (streaming or non-streaming)
#[instrument(skip(state, request), fields(model = %request.model, stream = %request.stream))]
async fn create_response(
    State(state): State<AppState>,
    Json(request): Json<CreateResponseRequest>,
) -> Result<AxumResponse, (StatusCode, Json<ApiError>)> {
    info!(model = %request.model, stream = %request.stream, "Creating response");

    // Get the provider for this request
    let provider = state.get_provider(&request.model).ok_or_else(|| {
        let err = ProviderError::model_not_found(&request.model);
        ApiError::from_provider_error(&err)
    })?;

    if request.stream {
        // Streaming response
        let stream = provider.complete_stream(request).await.map_err(|e| {
            error!(error = %e, "Streaming request failed");
            ApiError::from_provider_error(&e)
        })?;

        // Clone state for the stream closure
        let state_for_stream = state.clone();

        // Convert to SSE stream, enriching ResponseCompleted events with cost
        let sse_stream = stream.map(move |result| match result {
            Ok(event) => {
                // Enrich ResponseCompleted events with cost
                let event = if let StreamEvent::ResponseCompleted { response } = event {
                    let response = state_for_stream.enrich_response(response);
                    StreamEvent::ResponseCompleted { response }
                } else {
                    event
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
        });

        let sse = Sse::new(sse_stream)
            .keep_alive(axum::response::sse::KeepAlive::new().interval(Duration::from_secs(15)));

        Ok(sse.into_response())
    } else {
        // Non-streaming response - track latency
        let start = Instant::now();

        let response = provider.complete(request).await.map_err(|e| {
            error!(error = %e, "Request failed");
            ApiError::from_provider_error(&e)
        })?;

        let latency_ms = start.elapsed().as_millis() as u64;

        // Enrich with cost and latency information
        let response = state.enrich_response_with_latency(response, latency_ms);

        info!(
            id = %response.id,
            status = ?response.status,
            latency_ms = %latency_ms,
            "Response completed"
        );

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
