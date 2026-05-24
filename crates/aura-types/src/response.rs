//! Response types for the Open Responses API
//!
//! The Response is the primary container for conversation output in the
//! Open Responses API. It contains items (messages, function calls, etc.)
//! and tracks the overall status of the response.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::compression::CompressionConfig;
use crate::consistency::{ConsistencyConfig, ConsistencyMetadata};
use crate::item::{InputItem, Item};
use crate::validation::{ValidationConfig, ValidationMetadata};

/// Status of a response in the Open Responses API
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ResponseStatus {
    /// Response is currently being generated
    #[default]
    InProgress,
    /// Response completed successfully
    Completed,
    /// Response failed with an error
    Failed,
    /// Response was not fully completed (e.g., max tokens reached)
    Incomplete,
    /// Response was cancelled by the user
    Cancelled,
}

impl ResponseStatus {
    /// Check if the response is in a terminal state
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            ResponseStatus::Completed
                | ResponseStatus::Failed
                | ResponseStatus::Incomplete
                | ResponseStatus::Cancelled
        )
    }

    /// Check if the response completed successfully
    pub fn is_success(&self) -> bool {
        matches!(self, ResponseStatus::Completed)
    }

    /// Check if the response failed
    pub fn is_failure(&self) -> bool {
        matches!(self, ResponseStatus::Failed)
    }
}

/// Reason why a response was marked incomplete
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum IncompleteReason {
    /// Maximum output tokens reached
    MaxTokens,
    /// Content was filtered by safety systems
    ContentFilter,
    /// Request was cancelled
    Cancelled,
    /// Response confidence fell below the configured threshold
    /// (validation strategy = confidence_threshold)
    LowConfidence,
    /// Unknown or unspecified reason
    Unknown,
}

/// Error information when a response fails
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct ResponseError {
    /// Error code
    pub code: String,
    /// Human-readable error message
    pub message: String,
    /// Additional error details
    #[serde(skip_serializing_if = "Option::is_none")]
    pub param: Option<String>,
}

impl ResponseError {
    /// Create a new response error
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            param: None,
        }
    }

    /// Create a new response error with a parameter
    pub fn with_param(
        code: impl Into<String>,
        message: impl Into<String>,
        param: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            param: Some(param.into()),
        }
    }
}

/// Token usage information for a response
///
/// This struct includes standard token counts plus optional Aura-specific
/// enrichments like calculated cost.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, ToSchema)]
pub struct Usage {
    /// Number of tokens in the input/prompt
    pub input_tokens: u32,
    /// Number of tokens in the output/completion
    pub output_tokens: u32,
    /// Total tokens used
    pub total_tokens: u32,
    /// Number of tokens used for reasoning (if applicable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_tokens: Option<u32>,
    /// Number of cached tokens (if applicable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_tokens: Option<u32>,
    /// Calculated cost in USD (Aura enrichment)
    /// This is added by the gateway based on model pricing
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
}

impl Usage {
    /// Create a new usage object
    pub fn new(input_tokens: u32, output_tokens: u32) -> Self {
        Self {
            input_tokens,
            output_tokens,
            total_tokens: input_tokens + output_tokens,
            reasoning_tokens: None,
            cached_tokens: None,
            cost_usd: None,
        }
    }

    /// Create usage with reasoning tokens
    pub fn with_reasoning(mut self, reasoning_tokens: u32) -> Self {
        self.reasoning_tokens = Some(reasoning_tokens);
        self
    }

    /// Create usage with cached tokens
    pub fn with_cached(mut self, cached_tokens: u32) -> Self {
        self.cached_tokens = Some(cached_tokens);
        self
    }

    /// Set the calculated cost in USD
    pub fn with_cost(mut self, cost_usd: f64) -> Self {
        self.cost_usd = Some(cost_usd);
        self
    }

    /// Set the cost directly (mutable)
    pub fn set_cost(&mut self, cost_usd: f64) {
        self.cost_usd = Some(cost_usd);
    }
}

/// A Response in the Open Responses API
///
/// The Response is the primary output container for LLM completions.
/// It contains a list of output items (messages, function calls, reasoning)
/// and tracks metadata like status, usage, and timing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Response {
    /// Unique identifier for the response
    pub id: String,

    /// Object type (always "response")
    #[serde(default = "default_object_type")]
    pub object: String,

    /// Unix timestamp when the response was created
    pub created_at: i64,

    /// The model that generated the response
    pub model: String,

    /// Current status of the response
    pub status: ResponseStatus,

    /// Output items generated by the model
    pub output: Vec<Item>,

    /// Token usage statistics
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,

    /// Error information if status is Failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ResponseError>,

    /// Reason if status is Incomplete
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incomplete_reason: Option<IncompleteReason>,

    /// ID of the previous response in a conversation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_response_id: Option<String>,

    /// Provider-specific metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,

    /// Validation results (Aura extension)
    /// Contains confidence scores and validation status
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation: Option<ValidationMetadata>,

    /// Consistency metadata (Aura extension)
    /// Contains information about consistency strategies applied
    #[serde(skip_serializing_if = "Option::is_none")]
    pub consistency: Option<ConsistencyMetadata>,
}

fn default_object_type() -> String {
    "response".to_string()
}

impl Response {
    /// Create a new response builder
    pub fn builder(id: impl Into<String>, model: impl Into<String>) -> ResponseBuilder {
        ResponseBuilder::new(id, model)
    }

    /// Create a new in-progress response
    pub fn in_progress(id: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            object: "response".to_string(),
            created_at: chrono::Utc::now().timestamp(),
            model: model.into(),
            status: ResponseStatus::InProgress,
            output: Vec::new(),
            usage: None,
            error: None,
            incomplete_reason: None,
            previous_response_id: None,
            metadata: None,
            validation: None,
            consistency: None,
        }
    }

    /// Get the text content from output messages
    pub fn text(&self) -> String {
        self.output
            .iter()
            .filter_map(|item| item.as_message())
            .map(|msg| msg.text())
            .collect::<Vec<_>>()
            .join("")
    }

    /// Check if the response is complete
    pub fn is_complete(&self) -> bool {
        self.status.is_terminal()
    }

    /// Check if the response was successful
    pub fn is_success(&self) -> bool {
        self.status.is_success()
    }

    /// Get function calls from the output
    pub fn function_calls(&self) -> Vec<&crate::item::FunctionCallItem> {
        self.output
            .iter()
            .filter_map(|item| item.as_function_call())
            .collect()
    }

    /// Check if the response contains function calls
    pub fn has_function_calls(&self) -> bool {
        self.output.iter().any(|item| item.is_function_call())
    }
}

/// Builder for creating Response objects
#[derive(Debug)]
pub struct ResponseBuilder {
    id: String,
    model: String,
    status: ResponseStatus,
    output: Vec<Item>,
    usage: Option<Usage>,
    error: Option<ResponseError>,
    incomplete_reason: Option<IncompleteReason>,
    previous_response_id: Option<String>,
    metadata: Option<serde_json::Value>,
    created_at: Option<i64>,
    validation: Option<ValidationMetadata>,
    consistency: Option<ConsistencyMetadata>,
}

impl ResponseBuilder {
    /// Create a new response builder
    pub fn new(id: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            model: model.into(),
            status: ResponseStatus::InProgress,
            output: Vec::new(),
            usage: None,
            error: None,
            incomplete_reason: None,
            previous_response_id: None,
            metadata: None,
            created_at: None,
            validation: None,
            consistency: None,
        }
    }

    /// Set the response status
    pub fn status(mut self, status: ResponseStatus) -> Self {
        self.status = status;
        self
    }

    /// Set the response as completed
    pub fn completed(mut self) -> Self {
        self.status = ResponseStatus::Completed;
        self
    }

    /// Set the response as failed with an error
    pub fn failed(mut self, error: ResponseError) -> Self {
        self.status = ResponseStatus::Failed;
        self.error = Some(error);
        self
    }

    /// Set the response as incomplete
    pub fn incomplete(mut self, reason: IncompleteReason) -> Self {
        self.status = ResponseStatus::Incomplete;
        self.incomplete_reason = Some(reason);
        self
    }

    /// Add an output item
    pub fn output(mut self, item: Item) -> Self {
        self.output.push(item);
        self
    }

    /// Set all output items
    pub fn outputs(mut self, items: Vec<Item>) -> Self {
        self.output = items;
        self
    }

    /// Set the usage statistics
    pub fn usage(mut self, usage: Usage) -> Self {
        self.usage = Some(usage);
        self
    }

    /// Set the previous response ID
    pub fn previous_response_id(mut self, id: impl Into<String>) -> Self {
        self.previous_response_id = Some(id.into());
        self
    }

    /// Set metadata
    pub fn metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = Some(metadata);
        self
    }

    /// Set the created_at timestamp
    pub fn created_at(mut self, timestamp: i64) -> Self {
        self.created_at = Some(timestamp);
        self
    }

    /// Set validation metadata
    pub fn validation(mut self, validation: ValidationMetadata) -> Self {
        self.validation = Some(validation);
        self
    }

    /// Set consistency metadata
    pub fn consistency(mut self, consistency: ConsistencyMetadata) -> Self {
        self.consistency = Some(consistency);
        self
    }

    /// Build the response
    pub fn build(self) -> Response {
        Response {
            id: self.id,
            object: "response".to_string(),
            created_at: self
                .created_at
                .unwrap_or_else(|| chrono::Utc::now().timestamp()),
            model: self.model,
            status: self.status,
            output: self.output,
            usage: self.usage,
            error: self.error,
            incomplete_reason: self.incomplete_reason,
            previous_response_id: self.previous_response_id,
            metadata: self.metadata,
            validation: self.validation,
            consistency: self.consistency,
        }
    }
}

/// Request to create a new response
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct CreateResponseRequest {
    /// The model to use for completion
    pub model: String,

    /// Input items for the conversation
    pub input: Vec<InputItem>,

    /// Instructions for the model (system prompt)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,

    /// Maximum tokens to generate
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u32>,

    /// Temperature for sampling (0.0 to 2.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,

    /// Top-p sampling parameter
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,

    /// Whether to stream the response
    #[serde(default)]
    pub stream: bool,

    /// ID of a previous response to continue from
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_response_id: Option<String>,

    /// Tools available for the model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,

    /// How the model should use tools
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<ToolChoice>,

    /// User identifier for abuse tracking
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,

    /// Additional metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,

    /// Validation configuration (Aura extension)
    /// Enables response quality scoring and validation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation: Option<ValidationConfig>,

    /// Consistency configuration (Aura extension)
    /// Enables cross-model response consistency
    #[serde(skip_serializing_if = "Option::is_none")]
    pub consistency: Option<ConsistencyConfig>,

    /// Compression configuration (Aura extension)
    /// Enables prompt compression to reduce token usage
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compression: Option<CompressionConfig>,
}

impl CreateResponseRequest {
    /// Create a new request with the minimum required fields
    pub fn new(model: impl Into<String>, input: Vec<InputItem>) -> Self {
        Self {
            model: model.into(),
            input,
            instructions: None,
            max_output_tokens: None,
            temperature: None,
            top_p: None,
            stream: false,
            previous_response_id: None,
            tools: None,
            tool_choice: None,
            user: None,
            metadata: None,
            validation: None,
            consistency: None,
            compression: None,
        }
    }

    /// Create a simple text request
    pub fn text(model: impl Into<String>, text: impl Into<String>) -> Self {
        Self::new(model, vec![InputItem::user(text.into())])
    }

    /// Enable streaming
    pub fn with_stream(mut self) -> Self {
        self.stream = true;
        self
    }

    /// Set instructions (system prompt)
    pub fn with_instructions(mut self, instructions: impl Into<String>) -> Self {
        self.instructions = Some(instructions.into());
        self
    }

    /// Set max output tokens
    pub fn with_max_tokens(mut self, max_tokens: u32) -> Self {
        self.max_output_tokens = Some(max_tokens);
        self
    }

    /// Set temperature
    pub fn with_temperature(mut self, temperature: f32) -> Self {
        self.temperature = Some(temperature);
        self
    }

    /// Set tools
    pub fn with_tools(mut self, tools: Vec<Tool>) -> Self {
        self.tools = Some(tools);
        self
    }

    /// Set previous response ID for conversation continuation
    pub fn with_previous_response(mut self, id: impl Into<String>) -> Self {
        self.previous_response_id = Some(id.into());
        self
    }

    /// Set validation configuration
    pub fn with_validation(mut self, validation: ValidationConfig) -> Self {
        self.validation = Some(validation);
        self
    }

    /// Set consistency configuration
    pub fn with_consistency(mut self, consistency: ConsistencyConfig) -> Self {
        self.consistency = Some(consistency);
        self
    }

    /// Set compression configuration
    pub fn with_compression(mut self, compression: CompressionConfig) -> Self {
        self.compression = Some(compression);
        self
    }
}

/// A tool definition for function calling
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Tool {
    /// A function tool
    Function {
        /// Function definition
        function: FunctionDefinition,
    },
}

impl Tool {
    /// Create a new function tool
    pub fn function(function: FunctionDefinition) -> Self {
        Self::Function { function }
    }
}

/// Definition of a function for tool use
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct FunctionDefinition {
    /// Name of the function
    pub name: String,
    /// Description of what the function does
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// JSON Schema for the function parameters
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
    /// Whether to use strict mode for parameter validation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strict: Option<bool>,
}

impl FunctionDefinition {
    /// Create a new function definition
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: None,
            parameters: None,
            strict: None,
        }
    }

    /// Set the description
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Set the parameters schema
    pub fn with_parameters(mut self, parameters: serde_json::Value) -> Self {
        self.parameters = Some(parameters);
        self
    }

    /// Enable strict mode
    pub fn with_strict(mut self, strict: bool) -> Self {
        self.strict = Some(strict);
        self
    }
}

/// How the model should choose which tool to use
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum ToolChoice {
    /// Automatic tool selection
    Auto(ToolChoiceAuto),
    /// Force a specific function
    Function {
        /// Type is always "function"
        r#type: String,
        /// Function to call
        function: ToolChoiceFunction,
    },
}

/// Automatic tool choice mode
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ToolChoiceAuto {
    /// Model decides whether to call tools
    Auto,
    /// Model must call at least one tool
    Required,
    /// Model should not call tools
    None,
}

/// Specific function to call
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct ToolChoiceFunction {
    /// Name of the function to call
    pub name: String,
}

impl ToolChoice {
    /// Create auto tool choice
    pub fn auto() -> Self {
        Self::Auto(ToolChoiceAuto::Auto)
    }

    /// Create required tool choice
    pub fn required() -> Self {
        Self::Auto(ToolChoiceAuto::Required)
    }

    /// Create none tool choice (no tools)
    pub fn none() -> Self {
        Self::Auto(ToolChoiceAuto::None)
    }

    /// Force a specific function
    pub fn function(name: impl Into<String>) -> Self {
        Self::Function {
            r#type: "function".to_string(),
            function: ToolChoiceFunction { name: name.into() },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::item::MessageItem;

    #[test]
    fn test_response_status_serialization() {
        assert_eq!(
            serde_json::to_string(&ResponseStatus::InProgress).unwrap(),
            "\"in_progress\""
        );
        assert_eq!(
            serde_json::to_string(&ResponseStatus::Completed).unwrap(),
            "\"completed\""
        );
        assert_eq!(
            serde_json::to_string(&ResponseStatus::Failed).unwrap(),
            "\"failed\""
        );
        assert_eq!(
            serde_json::to_string(&ResponseStatus::Incomplete).unwrap(),
            "\"incomplete\""
        );
    }

    #[test]
    fn test_response_status_is_terminal() {
        assert!(!ResponseStatus::InProgress.is_terminal());
        assert!(ResponseStatus::Completed.is_terminal());
        assert!(ResponseStatus::Failed.is_terminal());
        assert!(ResponseStatus::Incomplete.is_terminal());
        assert!(ResponseStatus::Cancelled.is_terminal());
    }

    #[test]
    fn test_usage_creation() {
        let usage = Usage::new(100, 50);
        assert_eq!(usage.input_tokens, 100);
        assert_eq!(usage.output_tokens, 50);
        assert_eq!(usage.total_tokens, 150);
    }

    #[test]
    fn test_usage_with_extras() {
        let usage = Usage::new(100, 50).with_reasoning(20).with_cached(30);
        assert_eq!(usage.reasoning_tokens, Some(20));
        assert_eq!(usage.cached_tokens, Some(30));
    }

    #[test]
    fn test_response_builder() {
        let response = Response::builder("resp_123", "gpt-4")
            .completed()
            .usage(Usage::new(100, 50))
            .build();

        assert_eq!(response.id, "resp_123");
        assert_eq!(response.model, "gpt-4");
        assert_eq!(response.status, ResponseStatus::Completed);
        assert!(response.usage.is_some());
    }

    #[test]
    fn test_response_builder_with_error() {
        let response = Response::builder("resp_123", "gpt-4")
            .failed(ResponseError::new("rate_limit", "Too many requests"))
            .build();

        assert_eq!(response.status, ResponseStatus::Failed);
        assert!(response.error.is_some());
        assert_eq!(response.error.unwrap().code, "rate_limit");
    }

    #[test]
    fn test_response_in_progress() {
        let response = Response::in_progress("resp_123", "gpt-4");
        assert_eq!(response.status, ResponseStatus::InProgress);
        assert!(!response.is_complete());
    }

    #[test]
    fn test_response_text_extraction() {
        let response = Response::builder("resp_123", "gpt-4")
            .output(Item::Message(MessageItem::assistant("msg_1", "Hello, ")))
            .output(Item::Message(MessageItem::assistant("msg_2", "world!")))
            .completed()
            .build();

        assert_eq!(response.text(), "Hello, world!");
    }

    #[test]
    fn test_response_serialization() {
        let response = Response::builder("resp_123", "gpt-4")
            .completed()
            .created_at(1700000000)
            .build();

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"id\":\"resp_123\""));
        assert!(json.contains("\"model\":\"gpt-4\""));
        assert!(json.contains("\"status\":\"completed\""));
        assert!(json.contains("\"object\":\"response\""));
    }

    #[test]
    fn test_create_response_request() {
        let request = CreateResponseRequest::text("gpt-4", "Hello!")
            .with_stream()
            .with_temperature(0.7)
            .with_max_tokens(1000);

        assert_eq!(request.model, "gpt-4");
        assert!(request.stream);
        assert_eq!(request.temperature, Some(0.7));
        assert_eq!(request.max_output_tokens, Some(1000));
    }

    #[test]
    fn test_create_response_request_serialization() {
        let request = CreateResponseRequest::text("gpt-4", "Hello!");
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"model\":\"gpt-4\""));
        assert!(json.contains("\"type\":\"message\""));
    }

    #[test]
    fn test_tool_definition() {
        let func = FunctionDefinition::new("get_weather")
            .with_description("Get the weather for a location")
            .with_strict(true);

        let tool = Tool::function(func);
        let json = serde_json::to_string(&tool).unwrap();
        assert!(json.contains("\"type\":\"function\""));
        assert!(json.contains("\"name\":\"get_weather\""));
    }

    #[test]
    fn test_tool_choice_serialization() {
        let auto = ToolChoice::auto();
        let json = serde_json::to_string(&auto).unwrap();
        assert_eq!(json, "\"auto\"");

        let required = ToolChoice::required();
        let json = serde_json::to_string(&required).unwrap();
        assert_eq!(json, "\"required\"");

        let func = ToolChoice::function("get_weather");
        let json = serde_json::to_string(&func).unwrap();
        assert!(json.contains("\"type\":\"function\""));
        assert!(json.contains("\"name\":\"get_weather\""));
    }

    #[test]
    fn test_incomplete_reason_serialization() {
        assert_eq!(
            serde_json::to_string(&IncompleteReason::MaxTokens).unwrap(),
            "\"max_tokens\""
        );
        assert_eq!(
            serde_json::to_string(&IncompleteReason::ContentFilter).unwrap(),
            "\"content_filter\""
        );
    }

    #[test]
    fn test_response_error() {
        let error = ResponseError::with_param("invalid_request", "Invalid model", "model");
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("\"code\":\"invalid_request\""));
        assert!(json.contains("\"param\":\"model\""));
    }
}
