//! Provider endpoint representation
//!
//! A `ProviderEndpoint` represents a single API key/endpoint for a provider.
//! Multiple endpoints can be grouped into a pool for load balancing.

use crate::provider::Provider;
use std::sync::Arc;

/// A single provider endpoint (API key configuration)
#[derive(Clone)]
pub struct ProviderEndpoint {
    /// Unique identifier for this endpoint
    pub id: String,
    /// Human-readable name/label for this endpoint
    pub name: String,
    /// The provider instance for this endpoint
    pub provider: Arc<dyn Provider>,
    /// Weight for weighted load balancing (higher = more traffic)
    pub weight: u32,
    /// Priority for failover (lower = higher priority)
    pub priority: u32,
    /// Whether this endpoint is enabled
    pub enabled: bool,
    /// Optional tags for filtering/grouping
    pub tags: Vec<String>,
}

impl ProviderEndpoint {
    /// Create a new provider endpoint
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        provider: Arc<dyn Provider>,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            provider,
            weight: 1,
            priority: 0,
            enabled: true,
            tags: Vec::new(),
        }
    }

    /// Set the weight for load balancing
    pub fn with_weight(mut self, weight: u32) -> Self {
        self.weight = weight;
        self
    }

    /// Set the priority for failover
    pub fn with_priority(mut self, priority: u32) -> Self {
        self.priority = priority;
        self
    }

    /// Set enabled status
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Add tags
    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.tags = tags;
        self
    }

    /// Get the provider name
    pub fn provider_name(&self) -> &str {
        self.provider.name()
    }

    /// Check if this endpoint supports a model
    pub fn supports_model(&self, model: &str) -> bool {
        self.provider.supports_model(model)
    }

    /// Get the list of supported models
    pub fn models(&self) -> &[&str] {
        self.provider.models()
    }
}

impl std::fmt::Debug for ProviderEndpoint {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProviderEndpoint")
            .field("id", &self.id)
            .field("name", &self.name)
            .field("provider", &self.provider.name())
            .field("weight", &self.weight)
            .field("priority", &self.priority)
            .field("enabled", &self.enabled)
            .field("tags", &self.tags)
            .finish()
    }
}

/// Builder for ProviderEndpoint
pub struct ProviderEndpointBuilder {
    id: String,
    name: String,
    provider: Arc<dyn Provider>,
    weight: u32,
    priority: u32,
    enabled: bool,
    tags: Vec<String>,
}

impl ProviderEndpointBuilder {
    /// Create a new builder
    pub fn new(id: impl Into<String>, provider: Arc<dyn Provider>) -> Self {
        let id = id.into();
        Self {
            name: id.clone(),
            id,
            provider,
            weight: 1,
            priority: 0,
            enabled: true,
            tags: Vec::new(),
        }
    }

    /// Set the display name
    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = name.into();
        self
    }

    /// Set the weight for load balancing
    pub fn weight(mut self, weight: u32) -> Self {
        self.weight = weight;
        self
    }

    /// Set the priority for failover
    pub fn priority(mut self, priority: u32) -> Self {
        self.priority = priority;
        self
    }

    /// Set enabled status
    pub fn enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Add a tag
    pub fn tag(mut self, tag: impl Into<String>) -> Self {
        self.tags.push(tag.into());
        self
    }

    /// Add multiple tags
    pub fn tags(mut self, tags: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.tags.extend(tags.into_iter().map(|t| t.into()));
        self
    }

    /// Build the endpoint
    pub fn build(self) -> ProviderEndpoint {
        ProviderEndpoint {
            id: self.id,
            name: self.name,
            provider: self.provider,
            weight: self.weight,
            priority: self.priority,
            enabled: self.enabled,
            tags: self.tags,
        }
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
    }

    #[async_trait]
    impl Provider for MockProvider {
        fn name(&self) -> &str {
            &self.name
        }

        fn models(&self) -> &[&str] {
            &["gpt-4", "gpt-3.5-turbo"]
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

    #[test]
    fn test_endpoint_creation() {
        let provider = Arc::new(MockProvider {
            name: "openai".to_string(),
        });
        let endpoint = ProviderEndpoint::new("ep-1", "Primary OpenAI", provider);

        assert_eq!(endpoint.id, "ep-1");
        assert_eq!(endpoint.name, "Primary OpenAI");
        assert_eq!(endpoint.provider_name(), "openai");
        assert_eq!(endpoint.weight, 1);
        assert_eq!(endpoint.priority, 0);
        assert!(endpoint.enabled);
    }

    #[test]
    fn test_endpoint_builder() {
        let provider = Arc::new(MockProvider {
            name: "openai".to_string(),
        });
        let endpoint = ProviderEndpointBuilder::new("ep-1", provider)
            .name("Primary OpenAI")
            .weight(2)
            .priority(1)
            .enabled(true)
            .tag("production")
            .tag("us-east")
            .build();

        assert_eq!(endpoint.id, "ep-1");
        assert_eq!(endpoint.name, "Primary OpenAI");
        assert_eq!(endpoint.weight, 2);
        assert_eq!(endpoint.priority, 1);
        assert!(endpoint.enabled);
        assert_eq!(endpoint.tags, vec!["production", "us-east"]);
    }

    #[test]
    fn test_supports_model() {
        let provider = Arc::new(MockProvider {
            name: "openai".to_string(),
        });
        let endpoint = ProviderEndpoint::new("ep-1", "OpenAI", provider);

        assert!(endpoint.supports_model("gpt-4"));
        assert!(endpoint.supports_model("gpt-3.5-turbo"));
        assert!(!endpoint.supports_model("claude-3"));
    }
}
