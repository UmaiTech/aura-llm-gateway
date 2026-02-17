//! Health check endpoints
//!
//! Provides three health endpoints:
//! - `/health` - Basic health check (always 200 if process is running)
//! - `/health/live` - Liveness probe for K8s (process is alive)
//! - `/health/ready` - Readiness probe for K8s (checks DB + Redis connectivity)

use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::get, Json, Router};
use chrono::Utc;
use serde_json::json;

use crate::AppState;

/// Creates the health check router
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health_check))
        .route("/health/live", get(liveness))
        .route("/health/ready", get(readiness))
}

/// Basic health check handler
///
/// Returns 200 OK with a JSON response indicating the service is running.
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

/// Liveness probe for Kubernetes
///
/// Returns 200 OK if the process is alive. Does not check dependencies.
#[utoipa::path(
    get,
    path = "/health/live",
    tag = "health",
    responses(
        (status = 200, description = "Service is alive")
    )
)]
pub async fn liveness() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({"status": "alive"})))
}

/// Readiness probe for Kubernetes
///
/// Checks connectivity to database and Redis. Returns 503 if any
/// configured dependency is unreachable.
#[utoipa::path(
    get,
    path = "/health/ready",
    tag = "health",
    responses(
        (status = 200, description = "Service is ready to accept traffic"),
        (status = 503, description = "Service is not ready")
    )
)]
pub async fn readiness(State(state): State<AppState>) -> impl IntoResponse {
    let mut checks = serde_json::Map::new();
    let mut all_ok = true;

    // Check database connectivity
    if let Some(pool) = state.db_pool() {
        match sqlx::query("SELECT 1").execute(pool).await {
            Ok(_) => {
                checks.insert("database".to_string(), json!("ok"));
            }
            Err(e) => {
                tracing::warn!(error = %e, "Database readiness check failed");
                checks.insert(
                    "database".to_string(),
                    json!({"status": "error", "message": e.to_string()}),
                );
                all_ok = false;
            }
        }
    } else {
        checks.insert("database".to_string(), json!("not_configured"));
    }

    // Check Redis connectivity
    if let Some(redis) = state.redis_pool() {
        match redis.ping().await {
            Ok(()) => {
                checks.insert("redis".to_string(), json!("ok"));
            }
            Err(e) => {
                tracing::warn!(error = %e, "Redis readiness check failed");
                checks.insert(
                    "redis".to_string(),
                    json!({"status": "error", "message": e.to_string()}),
                );
                all_ok = false;
            }
        }
    } else {
        checks.insert("redis".to_string(), json!("not_configured"));
    }

    // Check that at least one provider is registered
    let provider_count = state.provider_names().len();
    if provider_count > 0 {
        checks.insert("providers".to_string(), json!({"count": provider_count}));
    } else {
        checks.insert(
            "providers".to_string(),
            json!({"status": "warning", "message": "no providers configured"}),
        );
        // Not a hard failure — gateway can still serve admin/health routes
    }

    let status = if all_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status,
        Json(json!({
            "status": if all_ok { "ready" } else { "not_ready" },
            "checks": checks,
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
        let config = aura_core::Config::default();
        let state = AppState::new(config, None, None);
        let app = router().with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_liveness() {
        let config = aura_core::Config::default();
        let state = AppState::new(config, None, None);
        let app = router().with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health/live")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_readiness_no_deps() {
        let config = aura_core::Config::default();
        let state = AppState::new(config, None, None);
        let app = router().with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health/ready")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // With no DB/Redis configured, should still return 200
        assert_eq!(response.status(), StatusCode::OK);
    }
}
