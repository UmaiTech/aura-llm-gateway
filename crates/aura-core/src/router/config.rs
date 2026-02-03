//! Routing configuration
//!
//! Configuration types for smart routing, including strategy selection,
//! health check parameters, and fallback settings.

use super::health::HealthConfig;
use super::strategy::{ModelTrait, OptimizationGoal, Region, RoutingStrategy, ToolCategory};
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

    // --- Agentic Strategy Configurations ---
    /// Session configuration for sticky_session strategy
    pub session: SessionConfig,
    /// Tool routing configuration for tool_aware strategy
    pub tool_routing: ToolRoutingConfig,
    /// Context routing configuration for context_adaptive strategy
    pub context_routing: ContextRoutingConfig,
    /// Reasoning configuration for reasoning_depth strategy
    pub reasoning: ReasoningConfig,
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
            // Agentic configurations
            session: SessionConfig::default(),
            tool_routing: ToolRoutingConfig::default(),
            context_routing: ContextRoutingConfig::default(),
            reasoning: ReasoningConfig::default(),
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

    /// Set session configuration
    pub fn with_session(mut self, session: SessionConfig) -> Self {
        self.session = session;
        self
    }

    /// Set tool routing configuration
    pub fn with_tool_routing(mut self, tool_routing: ToolRoutingConfig) -> Self {
        self.tool_routing = tool_routing;
        self
    }

    /// Set context routing configuration
    pub fn with_context_routing(mut self, context_routing: ContextRoutingConfig) -> Self {
        self.context_routing = context_routing;
        self
    }

    /// Set reasoning configuration
    pub fn with_reasoning(mut self, reasoning: ReasoningConfig) -> Self {
        self.reasoning = reasoning;
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

// =============================================================================
// Agentic Routing Configurations
// =============================================================================

/// Configuration for sticky session routing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SessionConfig {
    /// Whether sticky sessions are enabled
    pub enabled: bool,
    /// Use previous_response_id for session tracking
    pub tracking: SessionTracking,
    /// Optional custom header for session ID
    pub header: Option<String>,
    /// Fallback strategy if preferred endpoint unavailable
    pub fallback_strategy: RoutingStrategy,
    /// Session timeout (route anywhere after this)
    #[serde(with = "humantime_serde")]
    pub timeout: Duration,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            tracking: SessionTracking::ResponseId,
            header: None,
            fallback_strategy: RoutingStrategy::LeastLatency,
            timeout: Duration::from_secs(30 * 60), // 30 minutes
        }
    }
}

/// How to track sessions for sticky routing
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SessionTracking {
    /// Use previous_response_id from request
    #[default]
    ResponseId,
    /// Use custom header (X-Session-ID)
    Header,
    /// Use both (prefer header, fallback to response_id)
    Both,
}

/// Configuration for tool-aware routing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ToolRoutingConfig {
    /// Whether tool-aware routing is enabled
    pub enabled: bool,
    /// Per-category routing preferences
    pub categories: HashMap<ToolCategory, ToolCategoryConfig>,
    /// Default models to use when no category matches
    pub default_models: Vec<String>,
    /// Default required traits for tool use
    pub default_traits: Vec<ModelTrait>,
}

impl Default for ToolRoutingConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            categories: Self::default_categories(),
            default_models: vec!["gpt-4o".to_string(), "claude-sonnet-4".to_string()],
            default_traits: vec![ModelTrait::ToolUse],
        }
    }
}

impl ToolRoutingConfig {
    fn default_categories() -> HashMap<ToolCategory, ToolCategoryConfig> {
        let mut categories = HashMap::new();

        // Code execution prefers Claude and GPT-4
        categories.insert(
            ToolCategory::CodeExecution,
            ToolCategoryConfig {
                preferred_models: vec!["claude-sonnet-4".to_string(), "gpt-4o".to_string()],
                required_traits: vec![ModelTrait::Code, ModelTrait::ToolUse],
            },
        );

        // Web search prefers fast models
        categories.insert(
            ToolCategory::WebSearch,
            ToolCategoryConfig {
                preferred_models: vec!["gemini-2.0-flash".to_string(), "gpt-4o-mini".to_string()],
                required_traits: vec![ModelTrait::Fast, ModelTrait::ToolUse],
            },
        );

        // Data analysis prefers analytical models
        categories.insert(
            ToolCategory::DataAnalysis,
            ToolCategoryConfig {
                preferred_models: vec!["claude-opus-4".to_string(), "gpt-4o".to_string()],
                required_traits: vec![ModelTrait::Analysis, ModelTrait::Code],
            },
        );

        // Image processing requires vision
        categories.insert(
            ToolCategory::ImageProcessing,
            ToolCategoryConfig {
                preferred_models: vec!["gpt-4o".to_string(), "gemini-2.0-pro".to_string()],
                required_traits: vec![ModelTrait::Vision],
            },
        );

        categories
    }
}

/// Configuration for a specific tool category
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCategoryConfig {
    /// Preferred models for this tool category
    pub preferred_models: Vec<String>,
    /// Required traits for this category
    pub required_traits: Vec<ModelTrait>,
}

/// Configuration for context-adaptive routing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ContextRoutingConfig {
    /// Whether context-adaptive routing is enabled
    pub enabled: bool,
    /// Token threshold for small context (use fast models)
    pub small_threshold: u32,
    /// Token threshold for medium context (use standard models)
    pub medium_threshold: u32,
    /// Token threshold for large context (use long-context models)
    pub large_threshold: u32,
    /// Models for small context
    pub small_models: Vec<String>,
    /// Models for medium context
    pub medium_models: Vec<String>,
    /// Models for large context
    pub large_models: Vec<String>,
    /// Models for very large context
    pub xlarge_models: Vec<String>,
}

impl Default for ContextRoutingConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            small_threshold: 4000,
            medium_threshold: 32000,
            large_threshold: 128000,
            small_models: vec![
                "gpt-4o-mini".to_string(),
                "gemini-2.0-flash".to_string(),
                "claude-3-5-haiku".to_string(),
            ],
            medium_models: vec![
                "gpt-4o".to_string(),
                "claude-sonnet-4".to_string(),
                "gemini-2.0-pro".to_string(),
            ],
            large_models: vec!["claude-sonnet-4".to_string(), "gpt-4o".to_string()],
            xlarge_models: vec!["claude-sonnet-4".to_string(), "gemini-2.0-pro".to_string()],
        }
    }
}

/// Configuration for reasoning-depth routing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ReasoningConfig {
    /// Whether reasoning-depth routing is enabled
    pub enabled: bool,
    /// Patterns that trigger deep reasoning routing
    pub triggers: Vec<String>,
    /// Models for deep reasoning tasks
    pub deep_reasoning_models: Vec<String>,
    /// Models for standard tasks
    pub standard_models: Vec<String>,
}

impl Default for ReasoningConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            triggers: vec![
                "step by step".to_string(),
                "think carefully".to_string(),
                "explain your reasoning".to_string(),
                "analyze this".to_string(),
                "compare and contrast".to_string(),
                "prove that".to_string(),
                "derive".to_string(),
                "calculate".to_string(),
            ],
            deep_reasoning_models: vec!["o1".to_string(), "claude-opus-4".to_string()],
            standard_models: vec![
                "gpt-4o".to_string(),
                "claude-sonnet-4".to_string(),
                "gemini-2.0-pro".to_string(),
            ],
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
