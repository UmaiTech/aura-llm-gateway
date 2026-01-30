//! Routing configuration
//!
//! Configuration types for smart routing, including strategy selection,
//! health check parameters, and fallback settings.

use super::health::HealthConfig;
use super::strategy::{ModelTrait, OptimizationGoal, Region, RoutingStrategy};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

/// Main routing configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct RoutingConfig {
    /// Default routing strategy
    pub strategy: RoutingStrategy,
    /// Health tracking configuration
    pub health: HealthConfig,
    /// Fallback configuration
    pub fallback: FallbackConfig,
    /// Per-provider endpoint configurations
    pub endpoints: HashMap<String, Vec<EndpointConfig>>,
    /// Default region for region-based routing
    pub default_region: Option<Region>,
    /// Optimization goal for multi-objective routing
    pub optimization_goal: OptimizationGoal,
    /// Required traits for trait-based routing
    pub required_traits: Vec<ModelTrait>,
    /// Custom weights for multi-objective routing
    pub weights: Option<RoutingWeights>,
}

impl Default for RoutingConfig {
    fn default() -> Self {
        Self {
            strategy: RoutingStrategy::RoundRobin,
            health: HealthConfig::default(),
            fallback: FallbackConfig::default(),
            endpoints: HashMap::new(),
            default_region: None,
            optimization_goal: OptimizationGoal::Balanced,
            required_traits: Vec::new(),
            weights: None,
        }
    }
}

impl RoutingConfig {
    /// Create a new config with defaults
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the routing strategy
    pub fn with_strategy(mut self, strategy: RoutingStrategy) -> Self {
        self.strategy = strategy;
        self
    }

    /// Set the health configuration
    pub fn with_health(mut self, health: HealthConfig) -> Self {
        self.health = health;
        self
    }

    /// Set the fallback configuration
    pub fn with_fallback(mut self, fallback: FallbackConfig) -> Self {
        self.fallback = fallback;
        self
    }

    /// Add endpoint configuration for a provider
    pub fn add_endpoint(&mut self, provider: &str, endpoint: EndpointConfig) {
        self.endpoints
            .entry(provider.to_string())
            .or_default()
            .push(endpoint);
    }

    /// Set the default region
    pub fn with_region(mut self, region: Region) -> Self {
        self.default_region = Some(region);
        self
    }

    /// Set the optimization goal
    pub fn with_optimization_goal(mut self, goal: OptimizationGoal) -> Self {
        self.optimization_goal = goal;
        self
    }

    /// Set required traits
    pub fn with_traits(mut self, traits: Vec<ModelTrait>) -> Self {
        self.required_traits = traits;
        self
    }

    /// Set custom weights
    pub fn with_weights(mut self, weights: RoutingWeights) -> Self {
        self.weights = Some(weights);
        self
    }
}

/// Custom weights for multi-objective routing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingWeights {
    /// Weight for cost optimization (0.0 - 1.0)
    pub cost: f64,
    /// Weight for latency optimization (0.0 - 1.0)
    pub latency: f64,
    /// Weight for quality/capability (0.0 - 1.0)
    pub quality: f64,
}

impl Default for RoutingWeights {
    fn default() -> Self {
        Self {
            cost: 0.33,
            latency: 0.33,
            quality: 0.34,
        }
    }
}

impl RoutingWeights {
    /// Create weights optimized for cost
    pub fn cost_focused() -> Self {
        Self {
            cost: 0.7,
            latency: 0.15,
            quality: 0.15,
        }
    }

    /// Create weights optimized for latency
    pub fn latency_focused() -> Self {
        Self {
            cost: 0.15,
            latency: 0.7,
            quality: 0.15,
        }
    }

    /// Create weights optimized for quality
    pub fn quality_focused() -> Self {
        Self {
            cost: 0.15,
            latency: 0.15,
            quality: 0.7,
        }
    }

    /// Normalize weights to sum to 1.0
    pub fn normalized(&self) -> Self {
        let total = self.cost + self.latency + self.quality;
        if total > 0.0 {
            Self {
                cost: self.cost / total,
                latency: self.latency / total,
                quality: self.quality / total,
            }
        } else {
            Self::default()
        }
    }
}

/// Fallback configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct FallbackConfig {
    /// Whether fallback is enabled
    pub enabled: bool,
    /// Maximum number of fallback attempts
    pub max_attempts: usize,
    /// Whether to fallback on rate limit errors
    pub on_rate_limit: bool,
    /// Whether to fallback on timeout errors
    pub on_timeout: bool,
    /// Whether to fallback on authentication errors
    pub on_auth_error: bool,
    /// Delay between fallback attempts
    #[serde(with = "humantime_serde")]
    pub retry_delay: Duration,
    /// Fallback provider chains (primary -> [fallbacks])
    pub chains: HashMap<String, Vec<String>>,
}

impl Default for FallbackConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_attempts: 3,
            on_rate_limit: true,
            on_timeout: true,
            on_auth_error: false, // Don't retry auth errors by default
            retry_delay: Duration::from_millis(100),
            chains: HashMap::new(),
        }
    }
}

impl FallbackConfig {
    /// Create a new fallback config
    pub fn new() -> Self {
        Self::default()
    }

    /// Enable or disable fallback
    pub fn enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Set max attempts
    pub fn max_attempts(mut self, max: usize) -> Self {
        self.max_attempts = max;
        self
    }

    /// Set retry delay
    pub fn retry_delay(mut self, delay: Duration) -> Self {
        self.retry_delay = delay;
        self
    }

    /// Add a fallback chain
    pub fn chain(
        mut self,
        primary: impl Into<String>,
        fallbacks: impl IntoIterator<Item = impl Into<String>>,
    ) -> Self {
        self.chains.insert(
            primary.into(),
            fallbacks.into_iter().map(|s| s.into()).collect(),
        );
        self
    }

    /// Get fallback providers for a primary
    pub fn get_fallbacks(&self, primary: &str) -> Option<&[String]> {
        self.chains.get(primary).map(|v| v.as_slice())
    }
}

/// Configuration for a single endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointConfig {
    /// Unique identifier for this endpoint
    pub id: String,
    /// Human-readable name
    pub name: Option<String>,
    /// API key (or reference to secret)
    pub api_key: Option<String>,
    /// API key secret reference (e.g., "env:OPENAI_API_KEY_2")
    pub api_key_ref: Option<String>,
    /// Custom base URL (for proxies or regional endpoints)
    pub base_url: Option<String>,
    /// Weight for weighted load balancing (1-100)
    pub weight: u32,
    /// Priority for failover (lower = higher priority)
    pub priority: u32,
    /// Whether this endpoint is enabled
    pub enabled: bool,
    /// Region for region-based routing
    pub region: Option<Region>,
    /// Tags for filtering/grouping
    pub tags: Vec<String>,
    /// Rate limit (requests per minute) for this endpoint
    pub rate_limit_rpm: Option<u32>,
    /// Maximum concurrent requests
    pub max_concurrent: Option<u32>,
}

impl Default for EndpointConfig {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: None,
            api_key: None,
            api_key_ref: None,
            base_url: None,
            weight: 1,
            priority: 0,
            enabled: true,
            region: None,
            tags: Vec::new(),
            rate_limit_rpm: None,
            max_concurrent: None,
        }
    }
}

impl EndpointConfig {
    /// Create a new endpoint config with ID
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            ..Default::default()
        }
    }

    /// Set the name
    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }

    /// Set the API key
    pub fn api_key(mut self, key: impl Into<String>) -> Self {
        self.api_key = Some(key.into());
        self
    }

    /// Set the API key reference
    pub fn api_key_ref(mut self, ref_: impl Into<String>) -> Self {
        self.api_key_ref = Some(ref_.into());
        self
    }

    /// Set the base URL
    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = Some(url.into());
        self
    }

    /// Set the weight
    pub fn weight(mut self, weight: u32) -> Self {
        self.weight = weight;
        self
    }

    /// Set the priority
    pub fn priority(mut self, priority: u32) -> Self {
        self.priority = priority;
        self
    }

    /// Set enabled status
    pub fn enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Set the region
    pub fn region(mut self, region: Region) -> Self {
        self.region = Some(region);
        self
    }

    /// Add a tag
    pub fn tag(mut self, tag: impl Into<String>) -> Self {
        self.tags.push(tag.into());
        self
    }

    /// Set rate limit
    pub fn rate_limit_rpm(mut self, rpm: u32) -> Self {
        self.rate_limit_rpm = Some(rpm);
        self
    }

    /// Set max concurrent requests
    pub fn max_concurrent(mut self, max: u32) -> Self {
        self.max_concurrent = Some(max);
        self
    }

    /// Resolve the API key (from direct value or reference)
    pub fn resolve_api_key(&self) -> Option<String> {
        // First try direct API key
        if let Some(ref key) = self.api_key {
            return Some(key.clone());
        }

        // Then try reference
        if let Some(ref ref_) = self.api_key_ref {
            if let Some(env_var) = ref_.strip_prefix("env:") {
                return std::env::var(env_var).ok();
            }
            // Could add other resolution methods here (vault, secrets manager, etc.)
        }

        None
    }
}

/// Serialization helper for Duration
mod humantime_serde {
    use serde::{self, Deserialize, Deserializer, Serializer};
    use std::time::Duration;

    pub fn serialize<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let s = humantime::format_duration(*duration).to_string();
        serializer.serialize_str(&s)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        humantime::parse_duration(&s).map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_routing_config_default() {
        let config = RoutingConfig::default();
        assert_eq!(config.strategy, RoutingStrategy::RoundRobin);
        assert_eq!(config.optimization_goal, OptimizationGoal::Balanced);
    }

    #[test]
    fn test_routing_config_builder() {
        let config = RoutingConfig::new()
            .with_strategy(RoutingStrategy::Weighted)
            .with_region(Region::UsEast)
            .with_optimization_goal(OptimizationGoal::MinCost);

        assert_eq!(config.strategy, RoutingStrategy::Weighted);
        assert_eq!(config.default_region, Some(Region::UsEast));
        assert_eq!(config.optimization_goal, OptimizationGoal::MinCost);
    }

    #[test]
    fn test_fallback_config() {
        let config = FallbackConfig::new()
            .enabled(true)
            .max_attempts(2)
            .chain("openai", ["anthropic", "google"]);

        assert!(config.enabled);
        assert_eq!(config.max_attempts, 2);
        assert_eq!(
            config.get_fallbacks("openai"),
            Some(&["anthropic".to_string(), "google".to_string()][..])
        );
    }

    #[test]
    fn test_endpoint_config() {
        let config = EndpointConfig::new("ep-1")
            .name("Primary OpenAI")
            .weight(2)
            .priority(0)
            .region(Region::UsEast)
            .tag("production");

        assert_eq!(config.id, "ep-1");
        assert_eq!(config.name, Some("Primary OpenAI".to_string()));
        assert_eq!(config.weight, 2);
        assert_eq!(config.region, Some(Region::UsEast));
        assert_eq!(config.tags, vec!["production"]);
    }

    #[test]
    fn test_endpoint_api_key_resolution() {
        // Direct key
        let config = EndpointConfig::new("ep-1").api_key("sk-test");
        assert_eq!(config.resolve_api_key(), Some("sk-test".to_string()));

        // Env var reference (will be None if not set)
        let config = EndpointConfig::new("ep-2").api_key_ref("env:NONEXISTENT_VAR");
        assert_eq!(config.resolve_api_key(), None);
    }

    #[test]
    fn test_routing_weights() {
        let weights = RoutingWeights {
            cost: 2.0,
            latency: 1.0,
            quality: 1.0,
        };
        let normalized = weights.normalized();

        assert!((normalized.cost - 0.5).abs() < 0.01);
        assert!((normalized.latency - 0.25).abs() < 0.01);
        assert!((normalized.quality - 0.25).abs() < 0.01);
    }
}
