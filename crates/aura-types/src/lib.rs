//! Shared type definitions for the Aura LLM Gateway
//!
//! This crate contains all shared types used across the gateway,
//! including Open Responses API types, provider types, and common utilities.
//!
//! # Open Responses API Types
//!
//! The Open Responses API is a specification for agentic LLM workflows.
//! This crate provides Rust types that match the specification.
//!
//! ## Core Concepts
//!
//! - **Items**: Atomic units of conversation (message, function_call, function_call_output, reasoning)
//! - **Response**: Container for items with status lifecycle
//! - **Status**: `in_progress` -> `completed` | `failed` | `incomplete`
//! - **Streaming**: Semantic events (not raw token deltas)
//!
//! ## Example
//!
//! ```rust
//! use aura_types::{
//!     item::{InputItem, Item, MessageItem, Role},
//!     response::{CreateResponseRequest, Response, ResponseStatus},
//!     stream::StreamEvent,
//! };
//!
//! // Create a simple request
//! let request = CreateResponseRequest::text("gpt-4", "Hello, world!");
//!
//! // Create an input item
//! let input = InputItem::user("Hello!");
//!
//! // Create a response
//! let response = Response::builder("resp_123", "gpt-4")
//!     .output(Item::Message(MessageItem::assistant("msg_1", "Hi there!")))
//!     .completed()
//!     .build();
//!
//! assert_eq!(response.status, ResponseStatus::Completed);
//! assert_eq!(response.text(), "Hi there!");
//! ```

pub mod consistency;
pub mod item;
pub mod response;
pub mod stream;
pub mod validation;

// Re-export commonly used types at the crate root for convenience
pub use item::{
    ContentPart, FunctionCallItem, FunctionCallOutputItem, InputContent, InputItem, Item,
    ItemStatus, MessageItem, ReasoningContent, ReasoningItem, Role,
};

pub use response::{
    CreateResponseRequest, FunctionDefinition, IncompleteReason, Response, ResponseBuilder,
    ResponseError, ResponseStatus, Tool, ToolChoice, ToolChoiceAuto, ToolChoiceFunction, Usage,
};

pub use stream::{RateLimitInfo, SseMessage, StreamError, StreamEvent};

pub use validation::{
    HeuristicAnalyzer, LogprobsData, SelectionCriteria, TokenLogprob, TopLogprob, ValidationConfig,
    ValidationMetadata, ValidationStrategy,
};

pub use consistency::{
    ConsistencyConfig, ConsistencyExample, ConsistencyMetadata, ConsistencyStrategy,
    DefaultCalibrations, DefaultConstitution, EnsembleVotes, Formality, ModelCalibration,
    ModelQuirk, PromptAugmenter, StyleProfile, Tone, Verbosity,
};

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

    #[test]
    fn test_basic_request_response_flow() {
        // Create a request
        let request = CreateResponseRequest::text("gpt-4", "What is 2+2?")
            .with_temperature(0.7)
            .with_max_tokens(100);

        assert_eq!(request.model, "gpt-4");
        assert!(!request.stream);

        // Create a response
        let response = Response::builder("resp_123", "gpt-4")
            .output(Item::Message(MessageItem::assistant("msg_1", "4")))
            .usage(Usage::new(10, 1))
            .completed()
            .build();

        assert!(response.is_success());
        assert_eq!(response.text(), "4");
        assert!(response.usage.is_some());
    }

    #[test]
    fn test_function_calling_flow() {
        // User asks about weather
        let request =
            CreateResponseRequest::text("gpt-4", "What's the weather in SF?").with_tools(vec![
                Tool::function(
                    FunctionDefinition::new("get_weather")
                        .with_description("Get current weather")
                        .with_parameters(serde_json::json!({
                            "type": "object",
                            "properties": {
                                "location": {"type": "string"}
                            },
                            "required": ["location"]
                        })),
                ),
            ]);

        assert!(request.tools.is_some());

        // Model responds with a function call
        let response = Response::builder("resp_123", "gpt-4")
            .output(Item::FunctionCall(FunctionCallItem::new(
                "item_1",
                "call_1",
                "get_weather",
                r#"{"location": "San Francisco"}"#,
            )))
            .completed()
            .build();

        assert!(response.has_function_calls());
        assert_eq!(response.function_calls().len(), 1);
    }

    #[test]
    fn test_streaming_events() {
        let response = Response::in_progress("resp_123", "gpt-4");

        // Simulate streaming sequence
        let events = [
            StreamEvent::response_created(response.clone()),
            StreamEvent::response_in_progress(response.clone()),
            StreamEvent::output_item_added(0, Item::Message(MessageItem::assistant("msg_1", ""))),
            StreamEvent::content_part_added(0, 0, "text"),
            StreamEvent::output_text_delta(0, 0, "Hello"),
            StreamEvent::output_text_delta(0, 0, ", world!"),
            StreamEvent::output_text_done(0, 0, "Hello, world!"),
        ];

        // First two events are not terminal
        assert!(!events[0].is_terminal());
        assert!(!events[1].is_terminal());

        // Check event types
        assert_eq!(events[0].event_type(), "response.created");
        assert_eq!(events[4].event_type(), "response.output_text.delta");
    }

    #[test]
    fn test_conversation_threading() {
        // First request
        let _request1 = CreateResponseRequest::text("gpt-4", "My name is Alice");

        let response1 = Response::builder("resp_1", "gpt-4")
            .output(Item::Message(MessageItem::assistant(
                "msg_1",
                "Nice to meet you, Alice!",
            )))
            .completed()
            .build();

        // Continue conversation with previous_response_id
        let request2 = CreateResponseRequest::text("gpt-4", "What's my name?")
            .with_previous_response(response1.id.clone());

        assert_eq!(request2.previous_response_id, Some("resp_1".to_string()));
    }

    #[test]
    fn test_error_handling() {
        // Create a failed response
        let response = Response::builder("resp_123", "gpt-4")
            .failed(ResponseError::new("rate_limit", "Rate limit exceeded"))
            .build();

        assert!(response.status.is_failure());
        assert!(response.error.is_some());
        assert_eq!(response.error.as_ref().unwrap().code, "rate_limit");

        // Stream error
        let error = StreamError::rate_limit("Too many requests");
        let event = StreamEvent::error(error);
        assert!(event.is_error());
    }

    #[test]
    fn test_item_types() {
        // Message
        let msg = Item::Message(MessageItem::user("msg_1", "Hello"));
        assert!(msg.is_message());
        assert_eq!(msg.id(), "msg_1");

        // Function call
        let call = Item::FunctionCall(FunctionCallItem::new("item_2", "call_1", "test", "{}"));
        assert!(call.is_function_call());

        // Function output
        let output =
            Item::FunctionCallOutput(FunctionCallOutputItem::new("item_3", "call_1", "result"));
        assert!(output.is_function_call_output());

        // Reasoning
        let reasoning = Item::Reasoning(ReasoningItem::new("item_4", "Thinking..."));
        assert!(reasoning.is_reasoning());
    }

    #[test]
    fn test_json_roundtrip() {
        let original = CreateResponseRequest::text("gpt-4", "Hello")
            .with_stream()
            .with_temperature(0.5);

        let json = serde_json::to_string(&original).unwrap();
        let parsed: CreateResponseRequest = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.model, original.model);
        assert_eq!(parsed.stream, original.stream);
        assert_eq!(parsed.temperature, original.temperature);
    }
}
