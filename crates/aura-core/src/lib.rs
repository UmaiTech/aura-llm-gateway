//! Core business logic for the Aura LLM Gateway
//!
//! This crate contains the core logic for the gateway,
//! including provider implementations, routing, caching, and load balancing.

pub mod cache;
pub mod compression;
pub mod config;
pub mod cost;
pub mod crypto;
pub mod http;
pub mod metrics;
pub mod provider;
pub mod rate_limit;
pub mod redis;
pub mod router;
pub mod state;

pub use cache::{CacheError, CacheHit, CacheStats, ResponseCache};
pub use compression::{
    compress, AispEncoder, AispError, CompressedOutput, CompressionError, Compressor,
    JsonCompressor, JsonError, SmartCompressor, SmartCompressorBuilder, ToonEncoder, ToonError,
    YamlConverter, YamlError,
};
pub use config::{
    AdminConfig, Config, ConfigBuilder, ConfigError, DatabaseConfig, LoggingConfig, ProviderConfig,
    RedisConfig, ServerConfig,
};
pub use cost::{CostCalculator, ModelPricing, UsageWithCost};
pub use http::{HttpClient, HttpClientConfig, HttpError};
pub use provider::{
    AnthropicProvider, BedrockProvider, EventStream, GeminiProvider, HuggingFaceProvider,
    MistralProvider, OllamaProvider, OpenAIProvider, Provider, ProviderError,
};
pub use rate_limit::{RateLimitError, RateLimitResult, RateLimiter};
pub use redis::{RedisError, RedisPool};
pub use router::{
    EndpointConfig, EndpointHealth, EndpointPool, EndpointPoolBuilder, FallbackChain,
    FallbackChainBuilder, FallbackConfig, HealthConfig, HealthState, HealthTracker, ModelMapping,
    ModelProfile, ModelTrait, MultiObjectiveSelector, OptimizationGoal, ProviderEndpoint,
    ProviderEndpointBuilder, Region, RoutingConfig, RoutingDecision, RoutingStrategy,
    RoutingWeights, SmartRouter, SmartRouterBuilder, StrategySelector,
};
pub use state::{AppState, AppStateBuilder};

/// Returns the crate version
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        let ver = version();
        assert!(!ver.is_empty());
        // Verify version follows semver format (e.g., "0.1.1")
        assert!(
            ver.split('.').count() >= 2,
            "version should be in semver format"
        );
    }
}
