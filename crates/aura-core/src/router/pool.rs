//! Endpoint pool for managing multiple endpoints per provider
//!
//! An `EndpointPool` groups multiple endpoints (API keys) for a single provider,
//! enabling load balancing and failover within a provider.

use super::endpoint::ProviderEndpoint;
use super::health::HealthTracker;
use super::strategy::{RoutingStrategy, StrategySelector};
use crate::provider::Provider;
use std::sync::Arc;

/// Pool of endpoints for a single provider
pub struct EndpointPool {
    /// Provider name (e.g., "openai")
    provider_name: String,
    /// List of endpoints in this pool
    endpoints: Vec<ProviderEndpoint>,
    /// Strategy selector for load balancing
    selector: StrategySelector,
    /// Supported models (union of all endpoint models)
    models: Vec<String>,
}

impl EndpointPool {
    /// Create a new endpoint pool
    pub fn new(provider_name: impl Into<String>) -> Self {
        Self {
            provider_name: provider_name.into(),
            endpoints: Vec::new(),
            selector: StrategySelector::default(),
            models: Vec::new(),
        }
    }

    /// Create a pool with a specific routing strategy
    pub fn with_strategy(mut self, strategy: RoutingStrategy) -> Self {
        self.selector = StrategySelector::new(strategy);
        self
    }

    /// Set the strategy selector
    pub fn with_selector(mut self, selector: StrategySelector) -> Self {
        self.selector = selector;
        self
    }

    /// Add an endpoint to the pool
    pub fn add_endpoint(&mut self, endpoint: ProviderEndpoint) {
        // Add models from this endpoint
        for model in endpoint.models() {
            if !self.models.contains(&model.to_string()) {
                self.models.push(model.to_string());
            }
        }
        self.endpoints.push(endpoint);
    }

    /// Add an endpoint (builder pattern)
    pub fn endpoint(mut self, endpoint: ProviderEndpoint) -> Self {
        self.add_endpoint(endpoint);
        self
    }

    /// Get the provider name
    pub fn provider_name(&self) -> &str {
        &self.provider_name
    }

    /// Get all endpoints in the pool
    pub fn endpoints(&self) -> &[ProviderEndpoint] {
        &self.endpoints
    }

    /// Get supported models
    pub fn models(&self) -> &[String] {
        &self.models
    }

    /// Check if pool supports a model
    pub fn supports_model(&self, model: &str) -> bool {
        self.endpoints.iter().any(|e| e.supports_model(model))
    }

    /// Select an endpoint using the configured strategy
    pub fn select_endpoint<'a>(
        &self,
        available: &[&'a ProviderEndpoint],
        health_tracker: &HealthTracker,
    ) -> Option<&'a ProviderEndpoint> {
        self.selector.select(available, health_tracker)
    }

    /// Get a provider instance by endpoint ID
    pub fn get_provider(&self, endpoint_id: &str) -> Option<Arc<dyn Provider>> {
        self.endpoints
            .iter()
            .find(|e| e.id == endpoint_id)
            .map(|e| e.provider.clone())
    }

    /// Get an endpoint by ID
    pub fn get_endpoint(&self, endpoint_id: &str) -> Option<&ProviderEndpoint> {
        self.endpoints.iter().find(|e| e.id == endpoint_id)
    }

    /// Get the number of endpoints
    pub fn len(&self) -> usize {
        self.endpoints.len()
    }

    /// Check if pool is empty
    pub fn is_empty(&self) -> bool {
        self.endpoints.is_empty()
    }

    /// Get the routing strategy
    pub fn strategy(&self) -> RoutingStrategy {
        self.selector.strategy()
    }

    /// Get enabled endpoints
    pub fn enabled_endpoints(&self) -> Vec<&ProviderEndpoint> {
        self.endpoints.iter().filter(|e| e.enabled).collect()
    }

    /// Get endpoint IDs
    pub fn endpoint_ids(&self) -> Vec<&str> {
        self.endpoints.iter().map(|e| e.id.as_str()).collect()
    }
}

impl std::fmt::Debug for EndpointPool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EndpointPool")
            .field("provider_name", &self.provider_name)
            .field("endpoints", &self.endpoints.len())
            .field("strategy", &self.selector.strategy())
            .field("models", &self.models)
            .finish()
    }
}

/// Builder for creating endpoint pools
pub struct EndpointPoolBuilder {
    pool: EndpointPool,
}

impl EndpointPoolBuilder {
    /// Create a new builder
    pub fn new(provider_name: impl Into<String>) -> Self {
        Self {
            pool: EndpointPool::new(provider_name),
        }
    }

    /// Set the routing strategy
    pub fn strategy(mut self, strategy: RoutingStrategy) -> Self {
        self.pool = self.pool.with_strategy(strategy);
        self
    }

    /// Set the strategy selector
    pub fn selector(mut self, selector: StrategySelector) -> Self {
        self.pool = self.pool.with_selector(selector);
        self
    }

    /// Add an endpoint
    pub fn endpoint(mut self, endpoint: ProviderEndpoint) -> Self {
        self.pool.add_endpoint(endpoint);
        self
    }

    /// Add multiple endpoints
    pub fn endpoints(mut self, endpoints: impl IntoIterator<Item = ProviderEndpoint>) -> Self {
        for endpoint in endpoints {
            self.pool.add_endpoint(endpoint);
        }
        self
    }

    /// Build the pool
    pub fn build(self) -> EndpointPool {
        self.pool
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::ProviderError;
    use async_trait::async_trait;
    use aura_types::{CreateResponseRequest, Response};

    struct MockProvider {
        name: String,
        models: Vec<&'static str>,
    }

    #[async_trait]
    impl Provider for MockProvider {
        fn name(&self) -> &str {
            &self.name
        }

        fn models(&self) -> &[&str] {
            &self.models
        }

        async fn complete(
            &self,
            _request: CreateResponseRequest,
        ) -> Result<Response, ProviderError> {
            Ok(Response::builder("resp_123", "gpt-4").completed().build())
        }

        async fn complete_stream(
            &self,
            _request: CreateResponseRequest,
        ) -> Result<crate::provider::EventStream, ProviderError> {
            Err(ProviderError::internal("Not implemented"))
        }
    }

    fn create_mock_endpoint(id: &str, models: Vec<&'static str>) -> ProviderEndpoint {
        ProviderEndpoint::new(
            id,
            id,
            Arc::new(MockProvider {
                name: "openai".to_string(),
                models,
            }),
        )
    }

    #[test]
    fn test_pool_creation() {
        let pool = EndpointPool::new("openai");
        assert_eq!(pool.provider_name(), "openai");
        assert!(pool.is_empty());
    }

    #[test]
    fn test_pool_with_endpoints() {
        let pool = EndpointPoolBuilder::new("openai")
            .strategy(RoutingStrategy::RoundRobin)
            .endpoint(create_mock_endpoint("ep-1", vec!["gpt-4", "gpt-3.5-turbo"]))
            .endpoint(create_mock_endpoint("ep-2", vec!["gpt-4"]))
            .build();

        assert_eq!(pool.len(), 2);
        assert!(!pool.is_empty());
        assert!(pool.supports_model("gpt-4"));
        assert!(pool.supports_model("gpt-3.5-turbo"));
        assert!(!pool.supports_model("claude-3"));
    }

    #[test]
    fn test_pool_get_provider() {
        let pool = EndpointPoolBuilder::new("openai")
            .endpoint(create_mock_endpoint("ep-1", vec!["gpt-4"]))
            .build();

        assert!(pool.get_provider("ep-1").is_some());
        assert!(pool.get_provider("ep-999").is_none());
    }

    #[test]
    fn test_pool_endpoint_selection() {
        let pool = EndpointPoolBuilder::new("openai")
            .strategy(RoutingStrategy::RoundRobin)
            .endpoint(create_mock_endpoint("ep-1", vec!["gpt-4"]))
            .endpoint(create_mock_endpoint("ep-2", vec!["gpt-4"]))
            .build();

        let health_tracker = HealthTracker::with_defaults();
        let endpoints: Vec<&ProviderEndpoint> = pool.endpoints().iter().collect();

        let selected1 = pool.select_endpoint(&endpoints, &health_tracker);
        let selected2 = pool.select_endpoint(&endpoints, &health_tracker);

        assert!(selected1.is_some());
        assert!(selected2.is_some());
        assert_ne!(selected1.unwrap().id, selected2.unwrap().id);
    }
}
