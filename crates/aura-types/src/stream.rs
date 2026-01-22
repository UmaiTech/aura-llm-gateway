//! Streaming event types for the Open Responses API
//!
//! The Open Responses API uses Server-Sent Events (SSE) for streaming responses.
//! Events are semantic, representing meaningful chunks of content rather than
//! raw token deltas.

use serde::{Deserialize, Serialize};

use crate::item::Item;
use crate::response::{Response, ResponseError};

/// A streaming event in the Open Responses API
///
/// Events follow semantic naming conventions:
/// - `response.*` - Response lifecycle events
/// - `response.output_item.*` - Item-level events
/// - `response.output_text.*` - Text streaming events
/// - `response.function_call_arguments.*` - Function argument streaming events
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    // =========================================================================
    // Response lifecycle events
    // =========================================================================
    /// Response has been created and is starting
    #[serde(rename = "response.created")]
    ResponseCreated {
        /// The response object
        response: Response,
    },

    /// Response is now in progress
    #[serde(rename = "response.in_progress")]
    ResponseInProgress {
        /// The response object
        response: Response,
    },

    /// Response completed successfully
    #[serde(rename = "response.completed")]
    ResponseCompleted {
        /// The completed response
        response: Response,
    },

    /// Response failed with an error
    #[serde(rename = "response.failed")]
    ResponseFailed {
        /// The failed response
        response: Response,
    },

    /// Response was incomplete (e.g., max tokens reached)
    #[serde(rename = "response.incomplete")]
    ResponseIncomplete {
        /// The incomplete response
        response: Response,
    },

    /// Response was cancelled
    #[serde(rename = "response.cancelled")]
    ResponseCancelled {
        /// The cancelled response
        response: Response,
    },

    // =========================================================================
    // Output item events
    // =========================================================================
    /// A new output item was added
    #[serde(rename = "response.output_item.added")]
    OutputItemAdded {
        /// Index of the item in the output array
        output_index: usize,
        /// The item that was added
        item: Item,
    },

    /// An output item's status changed
    #[serde(rename = "response.output_item.done")]
    OutputItemDone {
        /// Index of the item in the output array
        output_index: usize,
        /// The completed item
        item: Item,
    },

    // =========================================================================
    // Text content streaming events
    // =========================================================================
    /// A text content part was added to an item
    #[serde(rename = "response.content_part.added")]
    ContentPartAdded {
        /// Index of the item in the output array
        output_index: usize,
        /// Index of the content part within the item
        content_index: usize,
        /// Type of content part (e.g., "text")
        part_type: String,
    },

    /// A text delta was received
    #[serde(rename = "response.output_text.delta")]
    OutputTextDelta {
        /// Index of the item in the output array
        output_index: usize,
        /// Index of the content part within the item
        content_index: usize,
        /// The text delta
        delta: String,
    },

    /// Text content streaming is done for this part
    #[serde(rename = "response.output_text.done")]
    OutputTextDone {
        /// Index of the item in the output array
        output_index: usize,
        /// Index of the content part within the item
        content_index: usize,
        /// The complete text
        text: String,
    },

    /// A content part is complete
    #[serde(rename = "response.content_part.done")]
    ContentPartDone {
        /// Index of the item in the output array
        output_index: usize,
        /// Index of the content part within the item
        content_index: usize,
        /// Type of content part
        part_type: String,
    },

    // =========================================================================
    // Function call streaming events
    // =========================================================================
    /// A function call arguments delta was received
    #[serde(rename = "response.function_call_arguments.delta")]
    FunctionCallArgumentsDelta {
        /// Index of the item in the output array
        output_index: usize,
        /// The arguments delta (partial JSON)
        delta: String,
    },

    /// Function call arguments streaming is done
    #[serde(rename = "response.function_call_arguments.done")]
    FunctionCallArgumentsDone {
        /// Index of the item in the output array
        output_index: usize,
        /// The complete arguments
        arguments: String,
    },

    // =========================================================================
    // Reasoning events
    // =========================================================================
    /// A reasoning content delta was received
    #[serde(rename = "response.reasoning.delta")]
    ReasoningDelta {
        /// Index of the item in the output array
        output_index: usize,
        /// The reasoning delta
        delta: String,
    },

    /// Reasoning content streaming is done
    #[serde(rename = "response.reasoning.done")]
    ReasoningDone {
        /// Index of the item in the output array
        output_index: usize,
        /// The complete reasoning text
        text: String,
    },

    // =========================================================================
    // Error event
    // =========================================================================
    /// An error occurred during streaming
    #[serde(rename = "error")]
    Error {
        /// Error details
        error: StreamError,
    },

    // =========================================================================
    // Rate limit event
    // =========================================================================
    /// Rate limit information
    #[serde(rename = "rate_limit")]
    RateLimit {
        /// Rate limit details
        rate_limit: RateLimitInfo,
    },
}

impl StreamEvent {
    // =========================================================================
    // Response lifecycle event constructors
    // =========================================================================

    /// Create a response.created event
    pub fn response_created(response: Response) -> Self {
        Self::ResponseCreated { response }
    }

    /// Create a response.in_progress event
    pub fn response_in_progress(response: Response) -> Self {
        Self::ResponseInProgress { response }
    }

    /// Create a response.completed event
    pub fn response_completed(response: Response) -> Self {
        Self::ResponseCompleted { response }
    }

    /// Create a response.failed event
    pub fn response_failed(response: Response) -> Self {
        Self::ResponseFailed { response }
    }

    /// Create a response.incomplete event
    pub fn response_incomplete(response: Response) -> Self {
        Self::ResponseIncomplete { response }
    }

    // =========================================================================
    // Output item event constructors
    // =========================================================================

    /// Create an output_item.added event
    pub fn output_item_added(output_index: usize, item: Item) -> Self {
        Self::OutputItemAdded { output_index, item }
    }

    /// Create an output_item.done event
    pub fn output_item_done(output_index: usize, item: Item) -> Self {
        Self::OutputItemDone { output_index, item }
    }

    // =========================================================================
    // Text streaming event constructors
    // =========================================================================

    /// Create a content_part.added event
    pub fn content_part_added(
        output_index: usize,
        content_index: usize,
        part_type: impl Into<String>,
    ) -> Self {
        Self::ContentPartAdded {
            output_index,
            content_index,
            part_type: part_type.into(),
        }
    }

    /// Create an output_text.delta event
    pub fn output_text_delta(
        output_index: usize,
        content_index: usize,
        delta: impl Into<String>,
    ) -> Self {
        Self::OutputTextDelta {
            output_index,
            content_index,
            delta: delta.into(),
        }
    }

    /// Create an output_text.done event
    pub fn output_text_done(
        output_index: usize,
        content_index: usize,
        text: impl Into<String>,
    ) -> Self {
        Self::OutputTextDone {
            output_index,
            content_index,
            text: text.into(),
        }
    }

    // =========================================================================
    // Function call event constructors
    // =========================================================================

    /// Create a function_call_arguments.delta event
    pub fn function_call_arguments_delta(output_index: usize, delta: impl Into<String>) -> Self {
        Self::FunctionCallArgumentsDelta {
            output_index,
            delta: delta.into(),
        }
    }

    /// Create a function_call_arguments.done event
    pub fn function_call_arguments_done(output_index: usize, arguments: impl Into<String>) -> Self {
        Self::FunctionCallArgumentsDone {
            output_index,
            arguments: arguments.into(),
        }
    }

    // =========================================================================
    // Reasoning event constructors
    // =========================================================================

    /// Create a reasoning.delta event
    pub fn reasoning_delta(output_index: usize, delta: impl Into<String>) -> Self {
        Self::ReasoningDelta {
            output_index,
            delta: delta.into(),
        }
    }

    /// Create a reasoning.done event
    pub fn reasoning_done(output_index: usize, text: impl Into<String>) -> Self {
        Self::ReasoningDone {
            output_index,
            text: text.into(),
        }
    }

    // =========================================================================
    // Error event constructor
    // =========================================================================

    /// Create an error event
    pub fn error(error: StreamError) -> Self {
        Self::Error { error }
    }

    // =========================================================================
    // Utility methods
    // =========================================================================

    /// Get the event type as a string
    pub fn event_type(&self) -> &'static str {
        match self {
            Self::ResponseCreated { .. } => "response.created",
            Self::ResponseInProgress { .. } => "response.in_progress",
            Self::ResponseCompleted { .. } => "response.completed",
            Self::ResponseFailed { .. } => "response.failed",
            Self::ResponseIncomplete { .. } => "response.incomplete",
            Self::ResponseCancelled { .. } => "response.cancelled",
            Self::OutputItemAdded { .. } => "response.output_item.added",
            Self::OutputItemDone { .. } => "response.output_item.done",
            Self::ContentPartAdded { .. } => "response.content_part.added",
            Self::OutputTextDelta { .. } => "response.output_text.delta",
            Self::OutputTextDone { .. } => "response.output_text.done",
            Self::ContentPartDone { .. } => "response.content_part.done",
            Self::FunctionCallArgumentsDelta { .. } => "response.function_call_arguments.delta",
            Self::FunctionCallArgumentsDone { .. } => "response.function_call_arguments.done",
            Self::ReasoningDelta { .. } => "response.reasoning.delta",
            Self::ReasoningDone { .. } => "response.reasoning.done",
            Self::Error { .. } => "error",
            Self::RateLimit { .. } => "rate_limit",
        }
    }

    /// Check if this is a terminal event (response completed, failed, or cancelled)
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::ResponseCompleted { .. }
                | Self::ResponseFailed { .. }
                | Self::ResponseIncomplete { .. }
                | Self::ResponseCancelled { .. }
        )
    }

    /// Check if this is an error event
    pub fn is_error(&self) -> bool {
        matches!(self, Self::Error { .. } | Self::ResponseFailed { .. })
    }

    /// Convert to SSE format (event: type\ndata: json)
    pub fn to_sse(&self) -> Result<String, serde_json::Error> {
        let json = serde_json::to_string(self)?;
        Ok(format!("event: {}\ndata: {}\n\n", self.event_type(), json))
    }
}

/// Error details for streaming errors
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StreamError {
    /// Error type/category
    pub r#type: String,
    /// Error code
    pub code: String,
    /// Human-readable error message
    pub message: String,
    /// Parameter that caused the error (if applicable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub param: Option<String>,
}

impl StreamError {
    /// Create a new stream error
    pub fn new(
        error_type: impl Into<String>,
        code: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            r#type: error_type.into(),
            code: code.into(),
            message: message.into(),
            param: None,
        }
    }

    /// Create an invalid request error
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::new("invalid_request_error", "invalid_request", message)
    }

    /// Create an authentication error
    pub fn authentication(message: impl Into<String>) -> Self {
        Self::new("authentication_error", "invalid_api_key", message)
    }

    /// Create a rate limit error
    pub fn rate_limit(message: impl Into<String>) -> Self {
        Self::new("rate_limit_error", "rate_limit_exceeded", message)
    }

    /// Create a server error
    pub fn server(message: impl Into<String>) -> Self {
        Self::new("server_error", "internal_error", message)
    }

    /// Create a provider error
    pub fn provider(message: impl Into<String>) -> Self {
        Self::new("provider_error", "upstream_error", message)
    }
}

impl From<ResponseError> for StreamError {
    fn from(error: ResponseError) -> Self {
        Self {
            r#type: "api_error".to_string(),
            code: error.code,
            message: error.message,
            param: error.param,
        }
    }
}

/// Rate limit information
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RateLimitInfo {
    /// Maximum requests allowed in the window
    pub limit: u32,
    /// Remaining requests in the current window
    pub remaining: u32,
    /// Unix timestamp when the rate limit resets
    pub reset: i64,
}

impl RateLimitInfo {
    /// Create new rate limit info
    pub fn new(limit: u32, remaining: u32, reset: i64) -> Self {
        Self {
            limit,
            remaining,
            reset,
        }
    }
}

/// SSE message wrapper for parsing incoming events
#[derive(Debug, Clone, PartialEq)]
pub struct SseMessage {
    /// Event type
    pub event: Option<String>,
    /// Event data (JSON)
    pub data: String,
    /// Event ID (if provided)
    pub id: Option<String>,
    /// Retry interval (if provided)
    pub retry: Option<u64>,
}

impl SseMessage {
    /// Create a new SSE message
    pub fn new(data: impl Into<String>) -> Self {
        Self {
            event: None,
            data: data.into(),
            id: None,
            retry: None,
        }
    }

    /// Set the event type
    pub fn with_event(mut self, event: impl Into<String>) -> Self {
        self.event = Some(event.into());
        self
    }

    /// Set the event ID
    pub fn with_id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    /// Check if this is the `[DONE]` message
    pub fn is_done(&self) -> bool {
        self.data.trim() == "[DONE]"
    }

    /// Parse the data as a StreamEvent
    pub fn parse_event(&self) -> Result<StreamEvent, serde_json::Error> {
        serde_json::from_str(&self.data)
    }

    /// Format as SSE string
    pub fn to_sse(&self) -> String {
        let mut result = String::new();

        if let Some(ref event) = self.event {
            result.push_str(&format!("event: {}\n", event));
        }

        if let Some(ref id) = self.id {
            result.push_str(&format!("id: {}\n", id));
        }

        if let Some(retry) = self.retry {
            result.push_str(&format!("retry: {}\n", retry));
        }

        result.push_str(&format!("data: {}\n\n", self.data));
        result
    }

    /// Parse SSE text into a message
    pub fn parse(text: &str) -> Option<Self> {
        let mut event = None;
        let mut data = String::new();
        let mut id = None;
        let mut retry = None;

        for line in text.lines() {
            if let Some(value) = line.strip_prefix("event:") {
                event = Some(value.trim().to_string());
            } else if let Some(value) = line.strip_prefix("data:") {
                if !data.is_empty() {
                    data.push('\n');
                }
                data.push_str(value.trim());
            } else if let Some(value) = line.strip_prefix("id:") {
                id = Some(value.trim().to_string());
            } else if let Some(value) = line.strip_prefix("retry:") {
                retry = value.trim().parse().ok();
            }
        }

        if data.is_empty() {
            return None;
        }

        Some(Self {
            event,
            data,
            id,
            retry,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::item::MessageItem;

    #[test]
    fn test_stream_event_type() {
        let event = StreamEvent::output_text_delta(0, 0, "Hello");
        assert_eq!(event.event_type(), "response.output_text.delta");
    }

    #[test]
    fn test_stream_event_is_terminal() {
        let response = Response::in_progress("resp_123", "gpt-4");

        let in_progress = StreamEvent::response_in_progress(response.clone());
        assert!(!in_progress.is_terminal());

        let completed = StreamEvent::response_completed(response.clone());
        assert!(completed.is_terminal());
    }

    #[test]
    fn test_output_text_delta_serialization() {
        let event = StreamEvent::output_text_delta(0, 0, "Hello");
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"response.output_text.delta\""));
        assert!(json.contains("\"delta\":\"Hello\""));
        assert!(json.contains("\"output_index\":0"));
    }

    #[test]
    fn test_response_completed_serialization() {
        let response = Response::builder("resp_123", "gpt-4")
            .completed()
            .created_at(1700000000)
            .build();

        let event = StreamEvent::response_completed(response);
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"response.completed\""));
        assert!(json.contains("\"id\":\"resp_123\""));
    }

    #[test]
    fn test_output_item_added_serialization() {
        let item = Item::Message(MessageItem::assistant("msg_123", "Hello!"));
        let event = StreamEvent::output_item_added(0, item);
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"response.output_item.added\""));
        assert!(json.contains("\"output_index\":0"));
    }

    #[test]
    fn test_function_call_arguments_delta_serialization() {
        let event = StreamEvent::function_call_arguments_delta(0, r#"{"loc"#);
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"response.function_call_arguments.delta\""));
        assert!(json.contains("\"delta\":\"{\\\"loc\""));
    }

    #[test]
    fn test_error_event_serialization() {
        let error = StreamError::rate_limit("Too many requests");
        let event = StreamEvent::error(error);
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"error\""));
        assert!(json.contains("\"code\":\"rate_limit_exceeded\""));
    }

    #[test]
    fn test_stream_error_constructors() {
        let invalid = StreamError::invalid_request("Bad input");
        assert_eq!(invalid.r#type, "invalid_request_error");

        let auth = StreamError::authentication("Invalid key");
        assert_eq!(auth.r#type, "authentication_error");

        let rate = StreamError::rate_limit("Too fast");
        assert_eq!(rate.r#type, "rate_limit_error");

        let server = StreamError::server("Internal error");
        assert_eq!(server.r#type, "server_error");
    }

    #[test]
    fn test_stream_event_to_sse() {
        let event = StreamEvent::output_text_delta(0, 0, "Hello");
        let sse = event.to_sse().unwrap();
        assert!(sse.starts_with("event: response.output_text.delta\n"));
        assert!(sse.contains("data: "));
        assert!(sse.ends_with("\n\n"));
    }

    #[test]
    fn test_sse_message_parse() {
        let text = "event: message\ndata: {\"text\":\"hello\"}\n\n";
        let msg = SseMessage::parse(text).unwrap();
        assert_eq!(msg.event, Some("message".to_string()));
        assert_eq!(msg.data, "{\"text\":\"hello\"}");
    }

    #[test]
    fn test_sse_message_parse_multiline_data() {
        let text = "data: line1\ndata: line2\n\n";
        let msg = SseMessage::parse(text).unwrap();
        assert_eq!(msg.data, "line1\nline2");
    }

    #[test]
    fn test_sse_message_is_done() {
        let msg = SseMessage::new("[DONE]");
        assert!(msg.is_done());

        let msg2 = SseMessage::new("{\"text\":\"hello\"}");
        assert!(!msg2.is_done());
    }

    #[test]
    fn test_sse_message_to_sse() {
        let msg = SseMessage::new("{\"text\":\"hello\"}")
            .with_event("message")
            .with_id("123");
        let sse = msg.to_sse();
        assert!(sse.contains("event: message\n"));
        assert!(sse.contains("id: 123\n"));
        assert!(sse.contains("data: {\"text\":\"hello\"}\n"));
    }

    #[test]
    fn test_rate_limit_info() {
        let info = RateLimitInfo::new(100, 99, 1700000000);
        let event = StreamEvent::RateLimit { rate_limit: info };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"rate_limit\""));
        assert!(json.contains("\"limit\":100"));
    }

    #[test]
    fn test_reasoning_events() {
        let delta = StreamEvent::reasoning_delta(0, "Thinking...");
        let json = serde_json::to_string(&delta).unwrap();
        assert!(json.contains("\"type\":\"response.reasoning.delta\""));

        let done = StreamEvent::reasoning_done(0, "Full reasoning");
        let json = serde_json::to_string(&done).unwrap();
        assert!(json.contains("\"type\":\"response.reasoning.done\""));
    }

    #[test]
    fn test_stream_event_deserialization() {
        let json = r#"{"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"Hi"}"#;
        let event: StreamEvent = serde_json::from_str(json).unwrap();
        match event {
            StreamEvent::OutputTextDelta {
                output_index,
                content_index,
                delta,
            } => {
                assert_eq!(output_index, 0);
                assert_eq!(content_index, 0);
                assert_eq!(delta, "Hi");
            }
            _ => panic!("Wrong event type"),
        }
    }
}
