//! Fallback chain for provider failover
//!
//! A `FallbackChain` defines an ordered list of providers to try when
//! the primary provider fails or is unavailable.

use serde::{Deserialize, Serialize};

/// Fallback chain for provider failover
///
/// When the primary provider fails, requests are routed to fallback
/// providers in order until one succeeds.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FallbackChain {
    /// Ordered list of fallback provider names
    providers: Vec<String>,
    /// Maximum number of fallbacks to attempt
    max_attempts: usize,
    /// Whether to allow fallback on rate limit errors
    fallback_on_rate_limit: bool,
    /// Whether to allow fallback on timeout errors
    fallback_on_timeout: bool,
    /// Model mappings (primary_model -> fallback_model)
    model_mappings: Vec<ModelMapping>,
}

/// Mapping from a primary model to its fallback
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelMapping {
    /// Primary model name
    pub primary: String,
    /// Fallback model name
    pub fallback: String,
    /// Provider for the fallback model
    pub fallback_provider: String,
}

impl FallbackChain {
    /// Create a new empty fallback chain
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
            max_attempts: 3,
            fallback_on_rate_limit: true,
            fallback_on_timeout: true,
            model_mappings: Vec::new(),
        }
    }

    /// Create a chain from a list of providers
    pub fn from_providers(providers: impl IntoIterator<Item = impl Into<String>>) -> Self {
        Self {
            providers: providers.into_iter().map(|p| p.into()).collect(),
            max_attempts: 3,
            fallback_on_rate_limit: true,
            fallback_on_timeout: true,
            model_mappings: Vec::new(),
        }
    }

    /// Add a provider to the fallback chain
    pub fn add_provider(&mut self, provider: impl Into<String>) {
        self.providers.push(provider.into());
    }

    /// Add a provider (builder pattern)
    pub fn provider(mut self, provider: impl Into<String>) -> Self {
        self.add_provider(provider);
        self
    }

    /// Set maximum fallback attempts
    pub fn max_attempts(mut self, max: usize) -> Self {
        self.max_attempts = max;
        self
    }

    /// Set whether to fallback on rate limit errors
    pub fn fallback_on_rate_limit(mut self, enabled: bool) -> Self {
        self.fallback_on_rate_limit = enabled;
        self
    }

    /// Set whether to fallback on timeout errors
    pub fn fallback_on_timeout(mut self, enabled: bool) -> Self {
        self.fallback_on_timeout = enabled;
        self
    }

    /// Add a model mapping
    pub fn model_mapping(
        mut self,
        primary: impl Into<String>,
        fallback: impl Into<String>,
        fallback_provider: impl Into<String>,
    ) -> Self {
        self.model_mappings.push(ModelMapping {
            primary: primary.into(),
            fallback: fallback.into(),
            fallback_provider: fallback_provider.into(),
        });
        self
    }

    /// Get the list of fallback providers
    pub fn providers(&self) -> &[String] {
        &self.providers
    }

    /// Get max attempts
    pub fn get_max_attempts(&self) -> usize {
        self.max_attempts
    }

    /// Check if should fallback on rate limit
    pub fn should_fallback_on_rate_limit(&self) -> bool {
        self.fallback_on_rate_limit
    }

    /// Check if should fallback on timeout
    pub fn should_fallback_on_timeout(&self) -> bool {
        self.fallback_on_timeout
    }

    /// Get fallback model for a primary model
    pub fn get_fallback_model(&self, primary_model: &str) -> Option<(&str, &str)> {
        self.model_mappings
            .iter()
            .find(|m| m.primary == primary_model)
            .map(|m| (m.fallback.as_str(), m.fallback_provider.as_str()))
    }

    /// Check if chain is empty
    pub fn is_empty(&self) -> bool {
        self.providers.is_empty()
    }

    /// Get number of fallback providers
    pub fn len(&self) -> usize {
        self.providers.len()
    }

    /// Get provider at a specific fallback depth
    pub fn get_at_depth(&self, depth: usize) -> Option<&str> {
        if depth == 0 || depth > self.providers.len() || depth > self.max_attempts {
            None
        } else {
            self.providers.get(depth - 1).map(|s| s.as_str())
        }
    }
}

impl Default for FallbackChain {
    fn default() -> Self {
        Self::new()
    }
}

/// Builder for fallback chains with common configurations
pub struct FallbackChainBuilder {
    chain: FallbackChain,
}

impl FallbackChainBuilder {
    /// Create a new builder
    pub fn new() -> Self {
        Self {
            chain: FallbackChain::new(),
        }
    }

    /// Add a provider
    pub fn provider(mut self, provider: impl Into<String>) -> Self {
        self.chain.add_provider(provider);
        self
    }

    /// Add multiple providers
    pub fn providers(mut self, providers: impl IntoIterator<Item = impl Into<String>>) -> Self {
        for p in providers {
            self.chain.add_provider(p);
        }
        self
    }

    /// Set max attempts
    pub fn max_attempts(mut self, max: usize) -> Self {
        self.chain.max_attempts = max;
        self
    }

    /// Enable/disable rate limit fallback
    pub fn on_rate_limit(mut self, enabled: bool) -> Self {
        self.chain.fallback_on_rate_limit = enabled;
        self
    }

    /// Enable/disable timeout fallback
    pub fn on_timeout(mut self, enabled: bool) -> Self {
        self.chain.fallback_on_timeout = enabled;
        self
    }

    /// Add a model mapping
    pub fn map_model(
        mut self,
        primary: impl Into<String>,
        fallback: impl Into<String>,
        fallback_provider: impl Into<String>,
    ) -> Self {
        self.chain.model_mappings.push(ModelMapping {
            primary: primary.into(),
            fallback: fallback.into(),
            fallback_provider: fallback_provider.into(),
        });
        self
    }

    /// Build the chain
    pub fn build(self) -> FallbackChain {
        self.chain
    }
}

impl Default for FallbackChainBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Pre-configured fallback chains for common scenarios
impl FallbackChain {
    /// OpenAI primary with Anthropic and Google fallbacks
    pub fn openai_primary() -> Self {
        FallbackChainBuilder::new()
            .provider("anthropic")
            .provider("google")
            .map_model("gpt-4o", "claude-sonnet-4-20250514", "anthropic")
            .map_model("gpt-4o-mini", "claude-3-5-haiku-20241022", "anthropic")
            .map_model("gpt-4-turbo", "gemini-2.0-pro", "google")
            .build()
    }

    /// Anthropic primary with OpenAI and Google fallbacks
    pub fn anthropic_primary() -> Self {
        FallbackChainBuilder::new()
            .provider("openai")
            .provider("google")
            .map_model("claude-sonnet-4-20250514", "gpt-4o", "openai")
            .map_model("claude-3-5-haiku-20241022", "gpt-4o-mini", "openai")
            .map_model("claude-opus-4-20250514", "gpt-4-turbo", "openai")
            .build()
    }

    /// Google primary with OpenAI and Anthropic fallbacks
    pub fn google_primary() -> Self {
        FallbackChainBuilder::new()
            .provider("openai")
            .provider("anthropic")
            .map_model("gemini-2.0-pro", "gpt-4o", "openai")
            .map_model("gemini-2.0-flash", "gpt-4o-mini", "openai")
            .build()
    }

    /// Cost-optimized chain: try cheapest first
    pub fn cost_optimized() -> Self {
        FallbackChainBuilder::new()
            .provider("google") // Gemini Flash is cheapest
            .provider("openai") // GPT-4o-mini next
            .provider("anthropic") // Haiku next
            .build()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fallback_chain_creation() {
        let chain = FallbackChain::new();
        assert!(chain.is_empty());
        assert_eq!(chain.get_max_attempts(), 3);
    }

    #[test]
    fn test_fallback_chain_from_providers() {
        let chain = FallbackChain::from_providers(["anthropic", "google"]);
        assert_eq!(chain.len(), 2);
        assert_eq!(chain.providers(), &["anthropic", "google"]);
    }

    #[test]
    fn test_fallback_chain_builder() {
        let chain = FallbackChainBuilder::new()
            .provider("anthropic")
            .provider("google")
            .max_attempts(2)
            .on_rate_limit(false)
            .build();

        assert_eq!(chain.len(), 2);
        assert_eq!(chain.get_max_attempts(), 2);
        assert!(!chain.should_fallback_on_rate_limit());
        assert!(chain.should_fallback_on_timeout());
    }

    #[test]
    fn test_fallback_chain_model_mapping() {
        let chain = FallbackChainBuilder::new()
            .provider("anthropic")
            .map_model("gpt-4o", "claude-sonnet-4-20250514", "anthropic")
            .build();

        let (fallback_model, fallback_provider) = chain.get_fallback_model("gpt-4o").unwrap();
        assert_eq!(fallback_model, "claude-sonnet-4-20250514");
        assert_eq!(fallback_provider, "anthropic");

        assert!(chain.get_fallback_model("unknown-model").is_none());
    }

    #[test]
    fn test_fallback_chain_depth() {
        let chain = FallbackChainBuilder::new()
            .provider("anthropic")
            .provider("google")
            .provider("openai")
            .max_attempts(2)
            .build();

        assert_eq!(chain.get_at_depth(0), None); // 0 is primary, not fallback
        assert_eq!(chain.get_at_depth(1), Some("anthropic"));
        assert_eq!(chain.get_at_depth(2), Some("google"));
        assert_eq!(chain.get_at_depth(3), None); // Exceeds max_attempts
    }

    #[test]
    fn test_preconfigured_chains() {
        let openai = FallbackChain::openai_primary();
        assert!(!openai.is_empty());
        assert!(openai.get_fallback_model("gpt-4o").is_some());

        let anthropic = FallbackChain::anthropic_primary();
        assert!(!anthropic.is_empty());

        let google = FallbackChain::google_primary();
        assert!(!google.is_empty());
    }
}
