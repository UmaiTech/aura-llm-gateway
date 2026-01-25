//! Prometheus metrics endpoint
//!
//! Exposes metrics in Prometheus format at `/metrics` for monitoring and alerting.

use axum::{http::StatusCode, response::IntoResponse, routing::get, Router};
use metrics_exporter_prometheus::PrometheusHandle;
use std::sync::OnceLock;

use crate::AppState;

/// Global storage for the Prometheus handle
static PROMETHEUS_HANDLE: OnceLock<PrometheusHandle> = OnceLock::new();

/// Store the Prometheus handle for later retrieval
pub fn set_prometheus_handle(handle: PrometheusHandle) {
    let _ = PROMETHEUS_HANDLE.set(handle);
}

/// Get the Prometheus handle if available
pub fn get_prometheus_handle() -> Option<&'static PrometheusHandle> {
    PROMETHEUS_HANDLE.get()
}

/// Creates the metrics router
///
/// Note: The `/metrics` endpoint bypasses authentication to allow
/// Prometheus scraping without API keys.
pub fn router() -> Router<AppState> {
    Router::new().route("/metrics", get(metrics_handler))
}

/// Metrics handler - exports Prometheus metrics
///
/// This endpoint returns metrics in Prometheus text format.
/// It's designed to be scraped by Prometheus at regular intervals.
///
/// # Metrics Exposed
///
/// - `aura_requests_total` - Total requests by provider, model, and status
/// - `aura_request_duration_seconds` - Request latency histogram
/// - `aura_input_tokens_total` - Total input tokens processed
/// - `aura_output_tokens_total` - Total output tokens generated
/// - `aura_cached_tokens_total` - Total cached tokens used
/// - `aura_cost_usd_total` - Total cost in micro-USD
/// - `aura_cache_hits_total` - Cache hit count
/// - `aura_cache_misses_total` - Cache miss count
/// - `aura_rate_limit_exceeded_total` - Rate limit exceeded count
#[tracing::instrument(skip_all)]
async fn metrics_handler() -> impl IntoResponse {
    // Get the metrics recorder handle from the global storage
    let handle = match get_prometheus_handle() {
        Some(h) => h,
        None => {
            tracing::warn!("Prometheus metrics not initialized");
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                "Metrics not available".to_string(),
            );
        }
    };

    // Render metrics in Prometheus format
    let output = handle.render();

    (StatusCode::OK, output)
}

#[cfg(test)]
mod tests {
    // Note: Full integration tests require the Prometheus recorder to be installed
    // Unit tests for the endpoint structure can be added here
}
