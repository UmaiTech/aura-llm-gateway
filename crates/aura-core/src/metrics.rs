//! Prometheus metrics definitions for Aura LLM Gateway
//!
//! Provides metrics for monitoring request throughput, latency, token usage,
//! cache hit rates, and rate limiting.

use metrics::{counter, gauge, histogram};

/// Metric names used throughout the gateway
pub mod names {
    /// Total number of requests received
    pub const REQUESTS_TOTAL: &str = "aura_requests_total";
    /// Request duration in seconds
    pub const REQUEST_DURATION_SECONDS: &str = "aura_request_duration_seconds";
    /// Total input tokens processed
    pub const INPUT_TOKENS_TOTAL: &str = "aura_input_tokens_total";
    /// Total output tokens generated
    pub const OUTPUT_TOKENS_TOTAL: &str = "aura_output_tokens_total";
    /// Total cached tokens used
    pub const CACHED_TOKENS_TOTAL: &str = "aura_cached_tokens_total";
    /// Total reasoning tokens used
    pub const REASONING_TOKENS_TOTAL: &str = "aura_reasoning_tokens_total";
    /// Total cost in USD
    pub const COST_USD_TOTAL: &str = "aura_cost_usd_total";
    /// Number of active requests
    pub const ACTIVE_REQUESTS: &str = "aura_active_requests";
    /// Cache hit count
    pub const CACHE_HITS_TOTAL: &str = "aura_cache_hits_total";
    /// Cache miss count
    pub const CACHE_MISSES_TOTAL: &str = "aura_cache_misses_total";
    /// Cache set count
    pub const CACHE_SETS_TOTAL: &str = "aura_cache_sets_total";
    /// Cache invalidation count
    pub const CACHE_INVALIDATIONS_TOTAL: &str = "aura_cache_invalidations_total";
    /// Rate limit exceeded count
    pub const RATE_LIMIT_EXCEEDED_TOTAL: &str = "aura_rate_limit_exceeded_total";
    /// Provider errors count
    pub const PROVIDER_ERRORS_TOTAL: &str = "aura_provider_errors_total";
    /// Streaming response chunks sent
    pub const STREAM_CHUNKS_TOTAL: &str = "aura_stream_chunks_total";
    /// Tool calls made
    pub const TOOL_CALLS_TOTAL: &str = "aura_tool_calls_total";
}

/// Labels commonly used with metrics
pub mod labels {
    pub const PROVIDER: &str = "provider";
    pub const MODEL: &str = "model";
    pub const STATUS: &str = "status";
    pub const ERROR_TYPE: &str = "error_type";
    pub const CACHE_STATUS: &str = "cache_status";
    pub const STREAM: &str = "stream";
    pub const TOOL: &str = "tool";
}

/// Record a request received
pub fn record_request(provider: &str, model: &str, stream: bool) {
    counter!(
        names::REQUESTS_TOTAL,
        labels::PROVIDER => provider.to_string(),
        labels::MODEL => model.to_string(),
        labels::STREAM => stream.to_string()
    )
    .increment(1);
}

/// Record request completion with timing
pub fn record_request_completed(
    provider: &str,
    model: &str,
    stream: bool,
    status: &str,
    duration_secs: f64,
) {
    let provider = provider.to_string();
    let model = model.to_string();
    let stream_str = stream.to_string();
    let status = status.to_string();

    histogram!(
        names::REQUEST_DURATION_SECONDS,
        labels::PROVIDER => provider.clone(),
        labels::MODEL => model.clone(),
        labels::STREAM => stream_str.clone(),
        labels::STATUS => status.clone()
    )
    .record(duration_secs);
}

/// Record token usage
pub fn record_tokens(
    provider: &str,
    model: &str,
    input_tokens: u32,
    output_tokens: u32,
    cached_tokens: Option<u32>,
    reasoning_tokens: Option<u32>,
) {
    let provider = provider.to_string();
    let model = model.to_string();

    counter!(
        names::INPUT_TOKENS_TOTAL,
        labels::PROVIDER => provider.clone(),
        labels::MODEL => model.clone()
    )
    .increment(input_tokens as u64);

    counter!(
        names::OUTPUT_TOKENS_TOTAL,
        labels::PROVIDER => provider.clone(),
        labels::MODEL => model.clone()
    )
    .increment(output_tokens as u64);

    if let Some(cached) = cached_tokens {
        counter!(
            names::CACHED_TOKENS_TOTAL,
            labels::PROVIDER => provider.clone(),
            labels::MODEL => model.clone()
        )
        .increment(cached as u64);
    }

    if let Some(reasoning) = reasoning_tokens {
        counter!(
            names::REASONING_TOKENS_TOTAL,
            labels::PROVIDER => provider.clone(),
            labels::MODEL => model.clone()
        )
        .increment(reasoning as u64);
    }
}

/// Record cost
pub fn record_cost(provider: &str, model: &str, cost_usd: f64) {
    // Use counter with absolute increment (multiply by 1_000_000 for precision)
    let cost_micro = (cost_usd * 1_000_000.0) as u64;
    counter!(
        names::COST_USD_TOTAL,
        labels::PROVIDER => provider.to_string(),
        labels::MODEL => model.to_string()
    )
    .increment(cost_micro);
}

/// Increment active request count
pub fn increment_active_requests(provider: &str) {
    gauge!(
        names::ACTIVE_REQUESTS,
        labels::PROVIDER => provider.to_string()
    )
    .increment(1.0);
}

/// Decrement active request count
pub fn decrement_active_requests(provider: &str) {
    gauge!(
        names::ACTIVE_REQUESTS,
        labels::PROVIDER => provider.to_string()
    )
    .decrement(1.0);
}

/// Record rate limit exceeded
pub fn record_rate_limit_exceeded(api_key_id: &str) {
    counter!(
        names::RATE_LIMIT_EXCEEDED_TOTAL,
        "api_key_id" => api_key_id.to_string()
    )
    .increment(1);
}

/// Record provider error
pub fn record_provider_error(provider: &str, error_type: &str) {
    counter!(
        names::PROVIDER_ERRORS_TOTAL,
        labels::PROVIDER => provider.to_string(),
        labels::ERROR_TYPE => error_type.to_string()
    )
    .increment(1);
}

/// Record streaming chunk sent
pub fn record_stream_chunk(provider: &str, model: &str) {
    counter!(
        names::STREAM_CHUNKS_TOTAL,
        labels::PROVIDER => provider.to_string(),
        labels::MODEL => model.to_string()
    )
    .increment(1);
}

/// Record tool call
pub fn record_tool_call(tool_name: &str, provider: &str, model: &str) {
    counter!(
        names::TOOL_CALLS_TOTAL,
        labels::TOOL => tool_name.to_string(),
        labels::PROVIDER => provider.to_string(),
        labels::MODEL => model.to_string()
    )
    .increment(1);
}

/// Describe all metrics (for documentation purposes)
pub fn describe_metrics() {
    metrics::describe_counter!(
        names::REQUESTS_TOTAL,
        "Total number of requests received by the gateway"
    );
    metrics::describe_histogram!(
        names::REQUEST_DURATION_SECONDS,
        metrics::Unit::Seconds,
        "Request duration in seconds"
    );
    metrics::describe_counter!(
        names::INPUT_TOKENS_TOTAL,
        "Total number of input tokens processed"
    );
    metrics::describe_counter!(
        names::OUTPUT_TOKENS_TOTAL,
        "Total number of output tokens generated"
    );
    metrics::describe_counter!(
        names::CACHED_TOKENS_TOTAL,
        "Total number of cached input tokens used"
    );
    metrics::describe_counter!(
        names::REASONING_TOKENS_TOTAL,
        "Total number of reasoning tokens used"
    );
    metrics::describe_counter!(
        names::COST_USD_TOTAL,
        "Total cost in micro-USD (divide by 1,000,000 for USD)"
    );
    metrics::describe_gauge!(
        names::ACTIVE_REQUESTS,
        "Number of currently active requests"
    );
    metrics::describe_counter!(names::CACHE_HITS_TOTAL, "Total number of cache hits");
    metrics::describe_counter!(names::CACHE_MISSES_TOTAL, "Total number of cache misses");
    metrics::describe_counter!(names::CACHE_SETS_TOTAL, "Total number of cache entries set");
    metrics::describe_counter!(
        names::CACHE_INVALIDATIONS_TOTAL,
        "Total number of cache invalidations"
    );
    metrics::describe_counter!(
        names::RATE_LIMIT_EXCEEDED_TOTAL,
        "Total number of rate limit exceeded errors"
    );
    metrics::describe_counter!(
        names::PROVIDER_ERRORS_TOTAL,
        "Total number of provider errors"
    );
    metrics::describe_counter!(
        names::STREAM_CHUNKS_TOTAL,
        "Total number of streaming chunks sent"
    );
    metrics::describe_counter!(names::TOOL_CALLS_TOTAL, "Total number of tool calls made");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metric_names_are_valid() {
        // Prometheus metric names must match [a-zA-Z_:][a-zA-Z0-9_:]*
        let re = regex::Regex::new(r"^[a-zA-Z_:][a-zA-Z0-9_:]*$").unwrap();

        assert!(re.is_match(names::REQUESTS_TOTAL));
        assert!(re.is_match(names::REQUEST_DURATION_SECONDS));
        assert!(re.is_match(names::INPUT_TOKENS_TOTAL));
        assert!(re.is_match(names::OUTPUT_TOKENS_TOTAL));
        assert!(re.is_match(names::CACHED_TOKENS_TOTAL));
        assert!(re.is_match(names::COST_USD_TOTAL));
        assert!(re.is_match(names::ACTIVE_REQUESTS));
        assert!(re.is_match(names::CACHE_HITS_TOTAL));
        assert!(re.is_match(names::RATE_LIMIT_EXCEEDED_TOTAL));
    }
}
