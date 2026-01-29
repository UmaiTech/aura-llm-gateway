//! Health check endpoints

use axum::{http::StatusCode, response::IntoResponse, routing::get, Json, Router};
use chrono::Utc;
use serde_json::json;

use crate::AppState;

/// Creates the health check router
pub fn router() -> Router<AppState> {
    Router::new().route("/health", get(health_check))
}

/// Health check handler
///
/// Returns 200 OK with a JSON response indicating the service is healthy.
#[utoipa::path(
    get,
    path = "/health",
    tag = "health",
    responses(
        (status = 200, description = "Service is healthy")
    )
)]
#[tracing::instrument]
pub async fn health_check() -> impl IntoResponse {
    tracing::debug!("Health check requested");

    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "service": "aura-llm-gateway",
            "version": env!("CARGO_PKG_VERSION"),
            "timestamp": Utc::now().to_rfc3339(),
        })),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_health_check() {
        // Create a test AppState without database
        let config = aura_core::Config::default();
        let state = AppState::new(config, None);

        // Create the router with state
        let app = router().with_state(state);

        // Make a request
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // Assert the response
        assert_eq!(response.status(), StatusCode::OK);
    }
}
