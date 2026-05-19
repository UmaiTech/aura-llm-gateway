//! Rate limiting middleware
//!
//! Provides per-API key rate limiting using the token bucket algorithm
//! with Redis for distributed state.

use axum::{
    extract::{Request, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use tracing::{debug, warn};

use crate::routes::AuthContext;
use crate::AppState;

/// Rate limit exceeded error response
#[derive(Debug, Serialize)]
struct RateLimitError {
    error: RateLimitErrorInner,
}

#[derive(Debug, Serialize)]
struct RateLimitErrorInner {
    code: String,
    message: String,
    retry_after_seconds: u64,
}

impl RateLimitError {
    fn new(retry_after_seconds: u64) -> Self {
        Self {
            error: RateLimitErrorInner {
                code: "rate_limit_exceeded".to_string(),
                message: format!(
                    "Rate limit exceeded. Please retry after {} seconds.",
                    retry_after_seconds
                ),
                retry_after_seconds,
            },
        }
    }
}

/// Rate limiting middleware
///
/// Checks rate limits for authenticated requests using the token bucket
/// algorithm stored in Redis. Adds rate limit headers to all responses.
///
/// # Headers Added
///
/// - `X-RateLimit-Limit`: Maximum requests per minute
/// - `X-RateLimit-Remaining`: Remaining requests in current window
/// - `X-RateLimit-Reset`: Unix timestamp when the limit resets
///
/// # Behavior
///
/// - Unauthenticated requests bypass rate limiting (handled by auth middleware)
/// - If rate limit is exceeded, returns 429 Too Many Requests
/// - If Redis is not configured, rate limiting is skipped with a warning
pub async fn rate_limit_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    // Check if we have a rate limiter
    let rate_limiter = match state.rate_limiter() {
        Some(rl) => rl,
        None => {
            // No rate limiter configured, skip
            return next.run(request).await;
        }
    };

    // Get auth context from request extensions
    let auth_context = request.extensions().get::<AuthContext>().cloned();

    // If no auth context, skip rate limiting (will be handled by auth middleware)
    let auth = match auth_context {
        Some(ctx) => ctx,
        None => {
            // Diagnostic log: we expected the auth middleware to have
            // inserted an AuthContext here. If we see this for paths
            // OTHER than /health, /metrics, /openapi, /swagger, /admin,
            // there's a layer-ordering bug — rate limiting is silently
            // bypassed for authenticated requests, which is why
            // hammering the playground doesn't trip 429.
            let path = request.uri().path();
            warn!(
                path = %path,
                method = %request.method(),
                "Rate limit middleware: no AuthContext on request — limit skipped"
            );
            return next.run(request).await;
        }
    };

    // Get rate limit from API key (default to 60 RPM if not set)
    let rate_limit_rpm = auth.api_key.rate_limit_rpm.unwrap_or(60) as u32;

    // Check rate limit using API key ID as the key
    let key = auth.api_key.id.to_string();
    let result = match rate_limiter.check(&key, rate_limit_rpm).await {
        Ok(result) => result,
        Err(e) => {
            warn!(error = %e, api_key_id = %key, "Rate limit check failed");
            // On Redis error, allow the request but log the error
            return next.run(request).await;
        }
    };

    if !result.allowed {
        debug!(
            api_key_id = %key,
            limit = %result.limit,
            reset_after = %result.reset_after_secs,
            "Rate limit exceeded"
        );

        // Record metric
        aura_core::metrics::record_rate_limit_exceeded(&key);

        // Build rate limit headers
        let mut headers = HeaderMap::new();
        for (name, value) in result.headers() {
            if let Ok(v) = HeaderValue::from_str(&value) {
                headers.insert(name, v);
            }
        }
        if let Ok(v) = HeaderValue::from_str(&result.reset_after_secs.to_string()) {
            headers.insert("Retry-After", v);
        }

        let error_response = RateLimitError::new(result.reset_after_secs);

        return (StatusCode::TOO_MANY_REQUESTS, headers, Json(error_response)).into_response();
    }

    // Daily message limit check. Independent of the per-minute counter
    // above — the RPM cap is anti-burst, this one shapes organic chat
    // usage (each /v1/responses call counts as one message). Skipped
    // if the key has no daily cap set (NULL column = pro / internal).
    //
    // Fail-open on Redis errors so we don't black out the gateway if
    // the limiter has a hiccup.
    let daily_result = if let Some(daily_limit) = auth.api_key.daily_message_limit {
        match rate_limiter
            .check_daily_messages(&key, daily_limit as u32)
            .await
        {
            Ok(r) => Some(r),
            Err(e) => {
                warn!(
                    error = %e,
                    api_key_id = %key,
                    "Daily message check failed"
                );
                None
            }
        }
    } else {
        None
    };

    if let Some(ref d) = daily_result {
        if !d.allowed {
            debug!(
                api_key_id = %key,
                limit = %d.limit,
                used = %d.used,
                reset_after = %d.reset_after_secs,
                "Daily message limit reached"
            );

            aura_core::metrics::record_rate_limit_exceeded(&key);

            let mut headers = HeaderMap::new();
            for (name, value) in d.headers() {
                if let Ok(v) = HeaderValue::from_str(&value) {
                    headers.insert(name, v);
                }
            }
            if let Ok(v) = HeaderValue::from_str(&d.reset_after_secs.to_string()) {
                headers.insert("Retry-After", v);
            }

            // Distinct code so the chat can render a "daily limit"
            // message ("come back tomorrow") instead of the per-minute
            // "try again in 47s" copy.
            let error = serde_json::json!({
                "error": {
                    "code": "daily_message_limit_exceeded",
                    "message": format!(
                        "You've used your {} free messages for today. The limit resets in about {}h.",
                        d.limit,
                        d.reset_after_secs.div_ceil(3600).max(1)
                    ),
                    "retry_after_seconds": d.reset_after_secs,
                }
            });

            return (StatusCode::TOO_MANY_REQUESTS, headers, Json(error)).into_response();
        }
    }

    // Run the actual handler
    let mut response = next.run(request).await;

    // Add rate limit headers to successful responses
    let headers = response.headers_mut();
    for (name, value) in result.headers() {
        if let Ok(v) = HeaderValue::from_str(&value) {
            headers.insert(name, v);
        }
    }
    // Surface the daily counter too so the chat can show
    // "X messages left today" if it wants.
    if let Some(d) = daily_result {
        for (name, value) in d.headers() {
            if let Ok(v) = HeaderValue::from_str(&value) {
                headers.insert(name, v);
            }
        }
    }

    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limit_error_serialization() {
        let error = RateLimitError::new(30);
        let json = serde_json::to_string(&error).unwrap();

        assert!(json.contains("\"code\":\"rate_limit_exceeded\""));
        assert!(json.contains("\"retry_after_seconds\":30"));
    }
}
