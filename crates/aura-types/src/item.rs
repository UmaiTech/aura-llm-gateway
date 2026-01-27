//! Item types for the Open Responses API
//!
//! Items are the atomic units of conversation in the Open Responses API.
//! Each item represents a distinct piece of content in a conversation.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Role of the participant in a conversation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    /// User input
    #[default]
    User,
    /// Assistant response
    Assistant,
    /// System instructions
    System,
    /// Tool/function result
    Tool,
}

/// Status of an item in the response
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ItemStatus {
    /// Item is currently being processed
    #[default]
    InProgress,
    /// Item has been completed successfully
    Completed,
    /// Item processing failed
    Failed,
    /// Item was not fully completed (e.g., truncated)
    Incomplete,
}

/// Content type within a message
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentPart {
    /// Text content
    Text {
        /// The text content
        text: String,
    },
    /// Image content (base64 encoded or URL)
    Image {
        /// Image data as base64 or URL
        #[serde(skip_serializing_if = "Option::is_none")]
        url: Option<String>,
        /// Base64 encoded image data
        #[serde(skip_serializing_if = "Option::is_none")]
        data: Option<String>,
        /// MIME type of the image
        #[serde(skip_serializing_if = "Option::is_none")]
        media_type: Option<String>,
    },
    /// Audio content
    Audio {
        /// Audio data as base64
        data: String,
        /// MIME type of the audio
        #[serde(skip_serializing_if = "Option::is_none")]
        media_type: Option<String>,
    },
}

impl ContentPart {
    /// Create a new text content part
    pub fn text(text: impl Into<String>) -> Self {
        Self::Text { text: text.into() }
    }

    /// Create a new image content part from URL
    pub fn image_url(url: impl Into<String>) -> Self {
        Self::Image {
            url: Some(url.into()),
            data: None,
            media_type: None,
        }
    }

    /// Create a new image content part from base64 data
    pub fn image_data(data: impl Into<String>, media_type: impl Into<String>) -> Self {
        Self::Image {
            url: None,
            data: Some(data.into()),
            media_type: Some(media_type.into()),
        }
    }
}

/// Message item - represents a conversation message
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct MessageItem {
    /// Unique identifier for the item
    pub id: String,
    /// Role of the message sender
    pub role: Role,
    /// Content of the message
    pub content: Vec<ContentPart>,
    /// Status of the item
    #[serde(default)]
    pub status: ItemStatus,
}

impl MessageItem {
    /// Create a new message item with text content
    pub fn new(id: impl Into<String>, role: Role, text: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            role,
            content: vec![ContentPart::text(text)],
            status: ItemStatus::Completed,
        }
    }

    /// Create a user message
    pub fn user(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self::new(id, Role::User, text)
    }

    /// Create an assistant message
    pub fn assistant(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self::new(id, Role::Assistant, text)
    }

    /// Create a system message
    pub fn system(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self::new(id, Role::System, text)
    }

    /// Get the text content of the message (concatenated if multiple parts)
    pub fn text(&self) -> String {
        self.content
            .iter()
            .filter_map(|part| match part {
                ContentPart::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("")
    }
}

/// Function call item - represents a request to call a function
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct FunctionCallItem {
    /// Unique identifier for the item
    pub id: String,
    /// Unique identifier for this function call
    pub call_id: String,
    /// Name of the function to call
    pub name: String,
    /// Arguments to pass to the function (JSON string)
    pub arguments: String,
    /// Status of the item
    #[serde(default)]
    pub status: ItemStatus,
}

impl FunctionCallItem {
    /// Create a new function call item
    pub fn new(
        id: impl Into<String>,
        call_id: impl Into<String>,
        name: impl Into<String>,
        arguments: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            call_id: call_id.into(),
            name: name.into(),
            arguments: arguments.into(),
            status: ItemStatus::Completed,
        }
    }
}

/// Function call output item - represents the result of a function call
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct FunctionCallOutputItem {
    /// Unique identifier for the item
    pub id: String,
    /// The call_id this output corresponds to
    pub call_id: String,
    /// Output of the function call (JSON string or plain text)
    pub output: String,
    /// Status of the item
    #[serde(default)]
    pub status: ItemStatus,
}

impl FunctionCallOutputItem {
    /// Create a new function call output item
    pub fn new(
        id: impl Into<String>,
        call_id: impl Into<String>,
        output: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            call_id: call_id.into(),
            output: output.into(),
            status: ItemStatus::Completed,
        }
    }
}

/// Reasoning item - represents the model's reasoning process
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct ReasoningItem {
    /// Unique identifier for the item
    pub id: String,
    /// The reasoning content
    pub content: Vec<ReasoningContent>,
    /// Summary of the reasoning (may be provided instead of full content)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// Status of the item
    #[serde(default)]
    pub status: ItemStatus,
}

/// Content within a reasoning item
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ReasoningContent {
    /// Text reasoning content
    Text {
        /// The reasoning text
        text: String,
    },
    /// Encrypted/redacted reasoning content (for providers that don't expose raw reasoning)
    Redacted {
        /// Placeholder or encrypted data
        data: String,
    },
}

impl ReasoningItem {
    /// Create a new reasoning item with text content
    pub fn new(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            content: vec![ReasoningContent::Text { text: text.into() }],
            summary: None,
            status: ItemStatus::Completed,
        }
    }

    /// Create a reasoning item with a summary only
    pub fn with_summary(id: impl Into<String>, summary: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            content: vec![],
            summary: Some(summary.into()),
            status: ItemStatus::Completed,
        }
    }
}

/// An item in the Open Responses API conversation
///
/// Items are the atomic units of a conversation and can be:
/// - Messages (user, assistant, or system content)
/// - Function calls (requests to execute tools)
/// - Function call outputs (results from tool execution)
/// - Reasoning (model's chain-of-thought or reasoning process)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Item {
    /// A conversation message
    Message(MessageItem),
    /// A function call request
    FunctionCall(FunctionCallItem),
    /// Output from a function call
    FunctionCallOutput(FunctionCallOutputItem),
    /// Model reasoning
    Reasoning(ReasoningItem),
}

impl Item {
    /// Get the item ID
    pub fn id(&self) -> &str {
        match self {
            Item::Message(m) => &m.id,
            Item::FunctionCall(f) => &f.id,
            Item::FunctionCallOutput(f) => &f.id,
            Item::Reasoning(r) => &r.id,
        }
    }

    /// Get the item status
    pub fn status(&self) -> ItemStatus {
        match self {
            Item::Message(m) => m.status,
            Item::FunctionCall(f) => f.status,
            Item::FunctionCallOutput(f) => f.status,
            Item::Reasoning(r) => r.status,
        }
    }

    /// Check if this is a message item
    pub fn is_message(&self) -> bool {
        matches!(self, Item::Message(_))
    }

    /// Check if this is a function call item
    pub fn is_function_call(&self) -> bool {
        matches!(self, Item::FunctionCall(_))
    }

    /// Check if this is a function call output item
    pub fn is_function_call_output(&self) -> bool {
        matches!(self, Item::FunctionCallOutput(_))
    }

    /// Check if this is a reasoning item
    pub fn is_reasoning(&self) -> bool {
        matches!(self, Item::Reasoning(_))
    }

    /// Try to get as a message item
    pub fn as_message(&self) -> Option<&MessageItem> {
        match self {
            Item::Message(m) => Some(m),
            _ => None,
        }
    }

    /// Try to get as a function call item
    pub fn as_function_call(&self) -> Option<&FunctionCallItem> {
        match self {
            Item::FunctionCall(f) => Some(f),
            _ => None,
        }
    }

    /// Try to get as a function call output item
    pub fn as_function_call_output(&self) -> Option<&FunctionCallOutputItem> {
        match self {
            Item::FunctionCallOutput(f) => Some(f),
            _ => None,
        }
    }

    /// Try to get as a reasoning item
    pub fn as_reasoning(&self) -> Option<&ReasoningItem> {
        match self {
            Item::Reasoning(r) => Some(r),
            _ => None,
        }
    }
}

/// Input item for creating a response
///
/// This is a simplified version of Item used for request input,
/// allowing for easier construction of conversation context.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum InputItem {
    /// A conversation message
    Message {
        /// Role of the message sender
        role: Role,
        /// Content of the message (can be string or content parts)
        content: InputContent,
    },
    /// Output from a function call
    FunctionCallOutput {
        /// The call_id this output corresponds to
        call_id: String,
        /// Output of the function call
        output: String,
    },
}

/// Content for an input message
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum InputContent {
    /// Simple text content
    Text(String),
    /// Multiple content parts
    Parts(Vec<ContentPart>),
}

impl InputContent {
    /// Create text content
    pub fn text(text: impl Into<String>) -> Self {
        Self::Text(text.into())
    }

    /// Create content with multiple parts
    pub fn parts(parts: Vec<ContentPart>) -> Self {
        Self::Parts(parts)
    }
}

impl From<String> for InputContent {
    fn from(text: String) -> Self {
        Self::Text(text)
    }
}

impl From<&str> for InputContent {
    fn from(text: &str) -> Self {
        Self::Text(text.to_string())
    }
}

impl InputItem {
    /// Create a user message
    pub fn user(content: impl Into<InputContent>) -> Self {
        Self::Message {
            role: Role::User,
            content: content.into(),
        }
    }

    /// Create an assistant message
    pub fn assistant(content: impl Into<InputContent>) -> Self {
        Self::Message {
            role: Role::Assistant,
            content: content.into(),
        }
    }

    /// Create a system message
    pub fn system(content: impl Into<InputContent>) -> Self {
        Self::Message {
            role: Role::System,
            content: content.into(),
        }
    }

    /// Create a function call output
    pub fn function_output(call_id: impl Into<String>, output: impl Into<String>) -> Self {
        Self::FunctionCallOutput {
            call_id: call_id.into(),
            output: output.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_role_serialization() {
        assert_eq!(serde_json::to_string(&Role::User).unwrap(), "\"user\"");
        assert_eq!(
            serde_json::to_string(&Role::Assistant).unwrap(),
            "\"assistant\""
        );
        assert_eq!(serde_json::to_string(&Role::System).unwrap(), "\"system\"");
        assert_eq!(serde_json::to_string(&Role::Tool).unwrap(), "\"tool\"");
    }

    #[test]
    fn test_role_deserialization() {
        assert_eq!(
            serde_json::from_str::<Role>("\"user\"").unwrap(),
            Role::User
        );
        assert_eq!(
            serde_json::from_str::<Role>("\"assistant\"").unwrap(),
            Role::Assistant
        );
    }

    #[test]
    fn test_item_status_serialization() {
        assert_eq!(
            serde_json::to_string(&ItemStatus::InProgress).unwrap(),
            "\"in_progress\""
        );
        assert_eq!(
            serde_json::to_string(&ItemStatus::Completed).unwrap(),
            "\"completed\""
        );
        assert_eq!(
            serde_json::to_string(&ItemStatus::Failed).unwrap(),
            "\"failed\""
        );
        assert_eq!(
            serde_json::to_string(&ItemStatus::Incomplete).unwrap(),
            "\"incomplete\""
        );
    }

    #[test]
    fn test_content_part_text_serialization() {
        let content = ContentPart::text("Hello, world!");
        let json = serde_json::to_string(&content).unwrap();
        assert!(json.contains("\"type\":\"text\""));
        assert!(json.contains("\"text\":\"Hello, world!\""));
    }

    #[test]
    fn test_content_part_image_url_serialization() {
        let content = ContentPart::image_url("https://example.com/image.png");
        let json = serde_json::to_string(&content).unwrap();
        assert!(json.contains("\"type\":\"image\""));
        assert!(json.contains("\"url\":\"https://example.com/image.png\""));
    }

    #[test]
    fn test_message_item_serialization() {
        let message = MessageItem::user("msg_123", "Hello!");
        let json = serde_json::to_string(&message).unwrap();
        assert!(json.contains("\"id\":\"msg_123\""));
        assert!(json.contains("\"role\":\"user\""));
        assert!(json.contains("\"status\":\"completed\""));
    }

    #[test]
    fn test_message_item_text_extraction() {
        let message = MessageItem {
            id: "msg_123".to_string(),
            role: Role::User,
            content: vec![ContentPart::text("Hello, "), ContentPart::text("world!")],
            status: ItemStatus::Completed,
        };
        assert_eq!(message.text(), "Hello, world!");
    }

    #[test]
    fn test_function_call_item_serialization() {
        let call = FunctionCallItem::new(
            "item_123",
            "call_456",
            "get_weather",
            r#"{"location": "San Francisco"}"#,
        );
        let json = serde_json::to_string(&call).unwrap();
        assert!(json.contains("\"id\":\"item_123\""));
        assert!(json.contains("\"call_id\":\"call_456\""));
        assert!(json.contains("\"name\":\"get_weather\""));
    }

    #[test]
    fn test_function_call_output_item_serialization() {
        let output = FunctionCallOutputItem::new("item_789", "call_456", "72°F, sunny");
        let json = serde_json::to_string(&output).unwrap();
        assert!(json.contains("\"id\":\"item_789\""));
        assert!(json.contains("\"call_id\":\"call_456\""));
        assert!(json.contains("\"output\":\"72°F, sunny\""));
    }

    #[test]
    fn test_reasoning_item_serialization() {
        let reasoning = ReasoningItem::new("reason_123", "Let me think about this...");
        let json = serde_json::to_string(&reasoning).unwrap();
        assert!(json.contains("\"id\":\"reason_123\""));
        assert!(json.contains("\"text\":\"Let me think about this...\""));
    }

    #[test]
    fn test_item_enum_message_serialization() {
        let item = Item::Message(MessageItem::user("msg_123", "Hello!"));
        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("\"type\":\"message\""));
        assert!(json.contains("\"role\":\"user\""));
    }

    #[test]
    fn test_item_enum_function_call_serialization() {
        let item = Item::FunctionCall(FunctionCallItem::new(
            "item_123",
            "call_456",
            "get_weather",
            "{}",
        ));
        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("\"type\":\"function_call\""));
        assert!(json.contains("\"name\":\"get_weather\""));
    }

    #[test]
    fn test_item_enum_function_call_output_serialization() {
        let item = Item::FunctionCallOutput(FunctionCallOutputItem::new(
            "item_789", "call_456", "result",
        ));
        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("\"type\":\"function_call_output\""));
        assert!(json.contains("\"output\":\"result\""));
    }

    #[test]
    fn test_item_enum_reasoning_serialization() {
        let item = Item::Reasoning(ReasoningItem::new("reason_123", "Thinking..."));
        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("\"type\":\"reasoning\""));
    }

    #[test]
    fn test_item_id_accessor() {
        let message = Item::Message(MessageItem::user("msg_123", "Hello!"));
        assert_eq!(message.id(), "msg_123");

        let call = Item::FunctionCall(FunctionCallItem::new("item_456", "call_1", "test", "{}"));
        assert_eq!(call.id(), "item_456");
    }

    #[test]
    fn test_item_type_checks() {
        let message = Item::Message(MessageItem::user("msg_123", "Hello!"));
        assert!(message.is_message());
        assert!(!message.is_function_call());
        assert!(!message.is_function_call_output());
        assert!(!message.is_reasoning());
    }

    #[test]
    fn test_input_item_user_message() {
        let input = InputItem::user("Hello!");
        let json = serde_json::to_string(&input).unwrap();
        assert!(json.contains("\"type\":\"message\""));
        assert!(json.contains("\"role\":\"user\""));
        assert!(json.contains("\"content\":\"Hello!\""));
    }

    #[test]
    fn test_input_item_function_output() {
        let input = InputItem::function_output("call_123", "result data");
        let json = serde_json::to_string(&input).unwrap();
        assert!(json.contains("\"type\":\"function_call_output\""));
        assert!(json.contains("\"call_id\":\"call_123\""));
    }

    #[test]
    fn test_item_deserialization() {
        let json = r#"{"type":"message","id":"msg_123","role":"user","content":[{"type":"text","text":"Hello!"}],"status":"completed"}"#;
        let item: Item = serde_json::from_str(json).unwrap();
        assert!(item.is_message());
        assert_eq!(item.id(), "msg_123");
    }

    #[test]
    fn test_input_content_from_string() {
        let content: InputContent = "Hello".into();
        assert!(matches!(content, InputContent::Text(s) if s == "Hello"));
    }
}
