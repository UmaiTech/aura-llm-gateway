//! LLM Provider implementations
//!
//! This module contains the `Provider` trait and implementations for various
//! LLM providers (OpenAI, Anthropic, Google, etc.).

mod anthropic;
mod bedrock;
mod error;
mod gemini;
mod huggingface;
mod mistral;
mod ollama;
mod openai;

pub use anthropic::AnthropicProvider;
pub use bedrock::BedrockProvider;
pub use error::ProviderError;
pub use gemini::GeminiProvider;
pub use huggingface::HuggingFaceProvider;
pub use mistral::MistralProvider;
pub use ollama::OllamaProvider;
pub use openai::OpenAIProvider;

use async_trait::async_trait;
use aura_types::{CreateResponseRequest, Response, StreamEvent};
use futures_util::Stream;
use std::pin::Pin;

/// A stream of server-sent events from an LLM provider
pub type EventStream = Pin<Box<dyn Stream<Item = Result<StreamEvent, ProviderError>> + Send>>;

/// Trait for LLM providers
///
/// Each provider implementation handles the translation between the Open Responses API
/// format and the provider's native API format.
#[async_trait]
pub trait Provider: Send + Sync {
    /// Get the name of this provider (e.g., "openai", "anthropic", "google")
    fn name(&self) -> &str;

    /// Get the list of supported models for this provider
    fn models(&self) -> &[&str];

    /// Check if this provider supports a given model
    fn supports_model(&self, model: &str) -> bool {
        self.models()
            .iter()
            .any(|m| *m == model || model.starts_with(m))
    }

    /// Complete a request (non-streaming)
    ///
    /// Transforms the Open Responses request to the provider's format,
    /// makes the API call, and transforms the response back.
    async fn complete(&self, request: CreateResponseRequest) -> Result<Response, ProviderError>;

    /// Complete a request with streaming
    ///
    /// Returns a stream of events that can be consumed to build the response
    /// incrementally.
    async fn complete_stream(
        &self,
        request: CreateResponseRequest,
    ) -> Result<EventStream, ProviderError>;

    /// Check if the provider is healthy/available
    async fn health_check(&self) -> Result<(), ProviderError> {
        // Default implementation - just return OK
        // Providers can override this to do actual health checks
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockProvider;

    #[async_trait]
    impl Provider for MockProvider {
        fn name(&self) -> &str {
            "mock"
        }

        fn models(&self) -> &[&str] {
            &["mock-model", "mock-model-2"]
        }

        async fn complete(
            &self,
            _request: CreateResponseRequest,
        ) -> Result<Response, ProviderError> {
            Ok(Response::builder("resp_123", "mock-model")
                .completed()
                .build())
        }

        async fn complete_stream(
            &self,
            _request: CreateResponseRequest,
        ) -> Result<EventStream, ProviderError> {
            Err(ProviderError::internal("Streaming not supported"))
        }
    }

    #[test]
    fn test_supports_model() {
        let provider = MockProvider;
        assert!(provider.supports_model("mock-model"));
        assert!(provider.supports_model("mock-model-2"));
        assert!(!provider.supports_model("other-model"));
    }

    #[test]
    fn test_provider_name() {
        let provider = MockProvider;
        assert_eq!(provider.name(), "mock");
    }

    #[tokio::test]
    async fn test_health_check_default() {
        let provider = MockProvider;
        assert!(provider.health_check().await.is_ok());
    }
}
