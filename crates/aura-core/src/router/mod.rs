//! Smart routing for LLM providers
//!
//! This module provides intelligent routing capabilities including:
//! - Load balancing across multiple API keys
//! - Automatic failover when providers are unhealthy
//! - Fallback chains to try alternate providers
//! - Health tracking with circuit breaker pattern
//!
//! # Architecture
//!
//! ```text
//! Request → SmartRouter → RoutingDecision
//!                ↓
//!    ┌──────────┴──────────┐
//!    │   EndpointPool      │ (per provider)
//!    │  ┌────────────────┐ │
//!    │  │ Endpoint 1     │ │
//!    │  │ Endpoint 2     │ │ ← Load balanced
//!    │  │ Endpoint 3     │ │
//!    │  └────────────────┘ │
//!    └─────────────────────┘
//!              ↓
//!    ┌─────────────────────┐
//!    │   HealthTracker     │ ← Circuit breaker
//!    └─────────────────────┘
//!              ↓
//!    ┌─────────────────────┐
//!    │   FallbackChain     │ ← Try next provider
//!    └─────────────────────┘
//! ```

mod config;
mod endpoint;
mod fallback;
mod health;
mod pool;
mod strategy;

pub use config::{EndpointConfig, FallbackConfig, RoutingConfig, RoutingWeights};
pub use endpoint::{ProviderEndpoint, ProviderEndpointBuilder};
pub use fallback::{FallbackChain, FallbackChainBuilder, ModelMapping};
pub use health::{EndpointHealth, HealthConfig, HealthState, HealthTracker};
pub use pool::{EndpointPool, EndpointPoolBuilder};
pub use strategy::{
    ModelProfile, ModelTrait, MultiObjectiveSelector, OptimizationGoal, Region, RoutingStrategy,
    StrategySelector,
};

use crate::provider::{Provider, ProviderError};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{debug, info, warn};

/// Result of a routing decision
#[derive(Debug, Clone)]
pub struct RoutingDecision {
    /// The provider name (e.g., "openai", "anthropic")
    pub provider_name: String,
    /// The endpoint ID within the provider pool
    pub endpoint_id: String,
    /// Whether this was a fallback decision
    pub is_fallback: bool,
    /// The fallback depth (0 = primary, 1 = first fallback, etc.)
    pub fallback_depth: usize,
}

impl RoutingDecision {
    /// Create a new primary routing decision
    pub fn primary(provider_name: impl Into<String>, endpoint_id: impl Into<String>) -> Self {
        Self {
            provider_name: provider_name.into(),
            endpoint_id: endpoint_id.into(),
            is_fallback: false,
            fallback_depth: 0,
        }
    }

    /// Create a fallback routing decision
    pub fn fallback(
        provider_name: impl Into<String>,
        endpoint_id: impl Into<String>,
        depth: usize,
    ) -> Self {
        Self {
            provider_name: provider_name.into(),
            endpoint_id: endpoint_id.into(),
            is_fallback: true,
            fallback_depth: depth,
        }
    }
}

/// Smart router for LLM providers
///
/// Combines load balancing, health tracking, and failover to route
/// requests intelligently across multiple provider endpoints.
pub struct SmartRouter {
    /// Endpoint pools per provider (provider_name -> pool)
    pools: HashMap<String, EndpointPool>,
    /// Model to provider mapping (model_name -> provider_name)
    model_map: HashMap<String, String>,
    /// Health tracker for all endpoints
    health_tracker: HealthTracker,
    /// Fallback chains for providers (primary_provider -> fallback_chain)
    fallback_chains: HashMap<String, FallbackChain>,
    /// Router configuration (reserved for future routing integration)
    #[allow(dead_code)]
    config: RoutingConfig,
}

impl SmartRouter {
    /// Create a new SmartRouter with the given configuration
    pub fn new(config: RoutingConfig) -> Self {
        Self {
            pools: HashMap::new(),
            model_map: HashMap::new(),
            health_tracker: HealthTracker::new(config.health.clone()),
            fallback_chains: HashMap::new(),
            config,
        }
    }

    /// Register a provider endpoint pool
    pub fn register_pool(&mut self, provider_name: impl Into<String>, pool: EndpointPool) {
        let name = provider_name.into();
        // Register all models from the pool
        for model in pool.models() {
            self.model_map.insert(model.to_string(), name.clone());
        }
        // Register endpoints with health tracker
        for endpoint in pool.endpoints() {
            self.health_tracker.register_endpoint(&endpoint.id);
        }
        self.pools.insert(name, pool);
    }

    /// Add a fallback chain for a provider
    pub fn add_fallback_chain(
        &mut self,
        primary_provider: impl Into<String>,
        chain: FallbackChain,
    ) {
        self.fallback_chains.insert(primary_provider.into(), chain);
    }

    /// Get the provider name for a model
    pub fn get_provider_for_model(&self, model: &str) -> Option<&str> {
        // First check exact match
        if let Some(provider) = self.model_map.get(model) {
            return Some(provider.as_str());
        }
        // Then check if any pool supports the model
        for (name, pool) in &self.pools {
            if pool.supports_model(model) {
                return Some(name.as_str());
            }
        }
        None
    }

    /// Route a request to an appropriate endpoint
    ///
    /// Returns a routing decision with the selected provider and endpoint.
    /// Considers health status and applies load balancing.
    pub fn route(&self, model: &str) -> Result<RoutingDecision, ProviderError> {
        // Find the primary provider for this model
        let primary_provider = self
            .get_provider_for_model(model)
            .ok_or_else(|| ProviderError::model_not_found(model))?;

        // Try to get a healthy endpoint from the primary provider
        if let Some(decision) = self.try_route_to_provider(primary_provider, 0) {
            return Ok(decision);
        }

        // Primary provider has no healthy endpoints, try fallback chain
        if let Some(chain) = self.fallback_chains.get(primary_provider) {
            for (depth, fallback_provider) in chain.providers().iter().enumerate() {
                // Check if fallback provider supports this model
                if let Some(pool) = self.pools.get(fallback_provider) {
                    if pool.supports_model(model) {
                        if let Some(decision) =
                            self.try_route_to_provider(fallback_provider, depth + 1)
                        {
                            warn!(
                                primary = %primary_provider,
                                fallback = %fallback_provider,
                                depth = depth + 1,
                                "Using fallback provider"
                            );
                            return Ok(decision);
                        }
                    }
                }
            }
        }

        // No healthy endpoints available anywhere
        Err(ProviderError::service_unavailable(format!(
            "No healthy endpoints available for model '{}' (provider: {})",
            model, primary_provider
        )))
    }

    /// Try to route to a specific provider
    fn try_route_to_provider(
        &self,
        provider: &str,
        fallback_depth: usize,
    ) -> Option<RoutingDecision> {
        let pool = self.pools.get(provider)?;

        // Get healthy endpoints
        let healthy_endpoints: Vec<_> = pool
            .endpoints()
            .iter()
            .filter(|e| self.health_tracker.is_healthy(&e.id))
            .collect();

        if healthy_endpoints.is_empty() {
            debug!(provider = %provider, "No healthy endpoints available");
            return None;
        }

        // Apply load balancing strategy
        let endpoint = pool.select_endpoint(&healthy_endpoints, &self.health_tracker)?;

        let decision = if fallback_depth == 0 {
            RoutingDecision::primary(provider, &endpoint.id)
        } else {
            RoutingDecision::fallback(provider, &endpoint.id, fallback_depth)
        };

        debug!(
            provider = %provider,
            endpoint = %endpoint.id,
            is_fallback = %decision.is_fallback,
            "Routing decision made"
        );

        Some(decision)
    }

    /// Get the provider instance for a routing decision
    pub fn get_provider(&self, decision: &RoutingDecision) -> Option<Arc<dyn Provider>> {
        self.pools
            .get(&decision.provider_name)?
            .get_provider(&decision.endpoint_id)
    }

    /// Report a successful request to an endpoint
    pub fn report_success(&self, endpoint_id: &str) {
        self.health_tracker.record_success(endpoint_id);
    }

    /// Report a failed request to an endpoint
    pub fn report_failure(&self, endpoint_id: &str, error: &ProviderError) {
        self.health_tracker.record_failure(endpoint_id, error);
    }

    /// Get health status for all endpoints
    pub fn health_status(&self) -> HashMap<String, EndpointHealth> {
        self.health_tracker.all_health()
    }

    /// Get the endpoint pool for a provider
    pub fn get_pool(&self, provider: &str) -> Option<&EndpointPool> {
        self.pools.get(provider)
    }

    /// Check if router has any registered providers
    pub fn is_empty(&self) -> bool {
        self.pools.is_empty()
    }

    /// Get all registered provider names
    pub fn providers(&self) -> Vec<&str> {
        self.pools.keys().map(|s| s.as_str()).collect()
    }
}

/// Builder for SmartRouter
pub struct SmartRouterBuilder {
    config: RoutingConfig,
    pools: Vec<(String, EndpointPool)>,
    fallback_chains: Vec<(String, FallbackChain)>,
}

impl SmartRouterBuilder {
    /// Create a new builder with default configuration
    pub fn new() -> Self {
        Self {
            config: RoutingConfig::default(),
            pools: Vec::new(),
            fallback_chains: Vec::new(),
        }
    }

    /// Set the routing configuration
    pub fn config(mut self, config: RoutingConfig) -> Self {
        self.config = config;
        self
    }

    /// Add a provider endpoint pool
    pub fn pool(mut self, name: impl Into<String>, pool: EndpointPool) -> Self {
        self.pools.push((name.into(), pool));
        self
    }

    /// Add a fallback chain
    pub fn fallback_chain(mut self, primary: impl Into<String>, chain: FallbackChain) -> Self {
        self.fallback_chains.push((primary.into(), chain));
        self
    }

    /// Build the SmartRouter
    pub fn build(self) -> SmartRouter {
        let mut router = SmartRouter::new(self.config);

        for (name, pool) in self.pools {
            info!(provider = %name, endpoints = pool.endpoints().len(), "Registering provider pool");
            router.register_pool(name, pool);
        }

        for (primary, chain) in self.fallback_chains {
            info!(
                primary = %primary,
                fallbacks = ?chain.providers(),
                "Registering fallback chain"
            );
            router.add_fallback_chain(primary, chain);
        }

        router
    }
}

impl Default for SmartRouterBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_routing_decision_primary() {
        let decision = RoutingDecision::primary("openai", "endpoint-1");
        assert_eq!(decision.provider_name, "openai");
        assert_eq!(decision.endpoint_id, "endpoint-1");
        assert!(!decision.is_fallback);
        assert_eq!(decision.fallback_depth, 0);
    }

    #[test]
    fn test_routing_decision_fallback() {
        let decision = RoutingDecision::fallback("anthropic", "endpoint-2", 1);
        assert_eq!(decision.provider_name, "anthropic");
        assert_eq!(decision.endpoint_id, "endpoint-2");
        assert!(decision.is_fallback);
        assert_eq!(decision.fallback_depth, 1);
    }
}
