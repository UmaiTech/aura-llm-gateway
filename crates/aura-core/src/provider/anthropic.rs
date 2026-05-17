//! Anthropic Claude provider implementation
//!
//! Transforms between Open Responses API format and Anthropic's Messages API.

use async_trait::async_trait;
use aura_types::{
    ContentPart, CreateResponseRequest, FunctionCallItem, IncompleteReason, InputContent,
    InputItem, Item, MessageItem, ReasoningItem, Response, ResponseError, Role, StreamEvent, Tool,
    ToolChoice, ToolChoiceAuto, Usage,
};
use futures_util::{Stream, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, instrument, warn};

use super::{EventStream, Provider, ProviderError};

/// Anthropic API base URL
const ANTHROPIC_API_BASE: &str = "https://api.anthropic.com/v1";

/// Current Anthropic API version
const ANTHROPIC_VERSION: &str = "2023-06-01";

/// Supported Claude models
const SUPPORTED_MODELS: &[&str] = &[
    // Claude 4.5 (dated versions)
    "claude-opus-4-5-20250514",
    "claude-sonnet-4-5-20250514",
    // Claude 4.5 (aliases)
    "claude-opus-4-5",
    "claude-sonnet-4-5",
    // Claude 3.7
    "claude-3-7-sonnet-20250219",
    // Claude 3.5 (dated versions)
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    // Claude 3.5 (aliases)
    "claude-sonnet-3-5",
    "claude-haiku-3-5",
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest",
    // Claude 3 (dated versions)
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
    // Claude 3 (aliases)
    "claude-opus-3",
    "claude-sonnet-3",
    "claude-haiku-3",
    "claude-3-opus-latest",
];

/// Anthropic Claude provider implementation
pub struct AnthropicProvider {
    client: Client,
    api_key: String,
    base_url: String,
}

impl AnthropicProvider {
    /// Create a new Anthropic provider with the given API key
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: ANTHROPIC_API_BASE.to_string(),
        }
    }

    /// Create a new Anthropic provider with a custom base URL
    pub fn with_base_url(api_key: impl Into<String>, base_url: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: base_url.into(),
        }
    }

    /// Transform Open Responses request to Anthropic format
    fn transform_request(&self, request: &CreateResponseRequest) -> AnthropicRequest {
        let mut messages = Vec::new();

        // Transform input items to Anthropic messages
        for item in &request.input {
            match item {
                InputItem::Message { role, content } => {
                    let anthropic_content = match content {
                        InputContent::Text(text) => {
                            vec![AnthropicContentBlock::Text { text: text.clone() }]
                        }
                        InputContent::Parts(parts) => parts
                            .iter()
                            .map(|p| self.transform_content_part(p))
                            .collect(),
                    };

                    let anthropic_role = match role {
                        Role::User => "user",
                        Role::Assistant => "assistant",
                        Role::System => "user", // System handled separately
                        Role::Tool => "user",   // Tool results go in user messages
                    };

                    // Handle system messages: skip them as they go in the system field
                    if *role == Role::System {
                        continue;
                    }

                    messages.push(AnthropicMessage {
                        role: anthropic_role.to_string(),
                        content: anthropic_content,
                    });
                }
                InputItem::FunctionCallOutput { call_id, output } => {
                    // Tool results must be in a user message with tool_result type
                    messages.push(AnthropicMessage {
                        role: "user".to_string(),
                        content: vec![AnthropicContentBlock::ToolResult {
                            tool_use_id: call_id.clone(),
                            content: output.clone(),
                            is_error: None,
                        }],
                    });
                }
            }
        }

        // Build system prompt from instructions or system messages in input
        let system = self.extract_system_prompt(request);

        // Transform tools
        let tools = request.tools.as_ref().map(|tools| {
            tools
                .iter()
                .map(|tool| match tool {
                    Tool::Function { function } => AnthropicTool {
                        name: function.name.clone(),
                        description: function.description.clone(),
                        input_schema: function.parameters.clone().unwrap_or(serde_json::json!({
                            "type": "object",
                            "properties": {}
                        })),
                    },
                })
                .collect()
        });

        // Transform tool_choice
        let tool_choice = request.tool_choice.as_ref().map(|tc| match tc {
            ToolChoice::Auto(auto) => match auto {
                ToolChoiceAuto::Auto => AnthropicToolChoice::Auto,
                ToolChoiceAuto::Required => AnthropicToolChoice::Any,
                ToolChoiceAuto::None => AnthropicToolChoice::Auto, // Anthropic doesn't have "none"
            },
            ToolChoice::Function { function, .. } => AnthropicToolChoice::Tool {
                name: function.name.clone(),
            },
        });

        AnthropicRequest {
            model: request.model.clone(),
            messages,
            system,
            max_tokens: request.max_output_tokens.unwrap_or(4096),
            temperature: request.temperature,
            top_p: request.top_p,
            stream: Some(request.stream),
            tools,
            tool_choice,
            metadata: request.user.as_ref().map(|user_id| AnthropicMetadata {
                user_id: user_id.clone(),
            }),
        }
    }

    /// Extract system prompt from instructions and system messages
    fn extract_system_prompt(&self, request: &CreateResponseRequest) -> Option<String> {
        let mut system_parts = Vec::new();

        // Add instructions first
        if let Some(instructions) = &request.instructions {
            system_parts.push(instructions.clone());
        }

        // Add any system messages from input
        for item in &request.input {
            if let InputItem::Message {
                role: Role::System,
                content,
            } = item
            {
                match content {
                    InputContent::Text(text) => system_parts.push(text.clone()),
                    InputContent::Parts(parts) => {
                        for part in parts {
                            if let ContentPart::Text { text } = part {
                                system_parts.push(text.clone());
                            }
                        }
                    }
                }
            }
        }

        if system_parts.is_empty() {
            None
        } else {
            Some(system_parts.join("\n\n"))
        }
    }

    /// Transform content part to Anthropic format
    fn transform_content_part(&self, part: &ContentPart) -> AnthropicContentBlock {
        match part {
            ContentPart::Text { text } => AnthropicContentBlock::Text { text: text.clone() },
            ContentPart::Image {
                url,
                data,
                media_type,
            } => {
                if let Some(data) = data {
                    AnthropicContentBlock::Image {
                        source: AnthropicImageSource {
                            source_type: "base64".to_string(),
                            media_type: media_type
                                .clone()
                                .unwrap_or_else(|| "image/png".to_string()),
                            data: data.clone(),
                        },
                    }
                } else if let Some(url) = url {
                    // Anthropic supports URL-based images via the url source type
                    AnthropicContentBlock::Image {
                        source: AnthropicImageSource {
                            source_type: "url".to_string(),
                            media_type: media_type
                                .clone()
                                .unwrap_or_else(|| "image/png".to_string()),
                            data: url.clone(),
                        },
                    }
                } else {
                    AnthropicContentBlock::Text {
                        text: "[Invalid image]".to_string(),
                    }
                }
            }
            ContentPart::Audio { data, media_type } => {
                // Anthropic doesn't support audio - convert to placeholder
                AnthropicContentBlock::Text {
                    text: format!(
                        "[Audio: {} bytes, type: {}]",
                        data.len(),
                        media_type.as_deref().unwrap_or("audio/mp3")
                    ),
                }
            }
        }
    }

    /// Transform Anthropic response to Open Responses format
    fn transform_response(&self, response: AnthropicResponse, model: &str) -> Response {
        let mut output = Vec::new();
        let mut item_index = 0;

        for content in &response.content {
            match content {
                AnthropicContentBlock::Text { text } => {
                    output.push(Item::Message(MessageItem::assistant(
                        format!("msg_{}", item_index),
                        text,
                    )));
                    item_index += 1;
                }
                AnthropicContentBlock::ToolUse { id, name, input } => {
                    output.push(Item::FunctionCall(FunctionCallItem::new(
                        format!("fc_{}", item_index),
                        id,
                        name,
                        serde_json::to_string(input).unwrap_or_default(),
                    )));
                    item_index += 1;
                }
                AnthropicContentBlock::Thinking { thinking } => {
                    output.push(Item::Reasoning(ReasoningItem::new(
                        format!("reasoning_{}", item_index),
                        thinking,
                    )));
                    item_index += 1;
                }
                _ => {}
            }
        }

        // Determine status
        let (status, incomplete_reason, error) = match response.stop_reason.as_deref() {
            Some("end_turn") => (aura_types::ResponseStatus::Completed, None, None),
            Some("stop_sequence") => (aura_types::ResponseStatus::Completed, None, None),
            Some("max_tokens") => (
                aura_types::ResponseStatus::Incomplete,
                Some(IncompleteReason::MaxTokens),
                None,
            ),
            Some("tool_use") => (aura_types::ResponseStatus::Completed, None, None),
            Some(reason) => {
                warn!(reason = %reason, "Unknown stop reason from Anthropic");
                (aura_types::ResponseStatus::Completed, None, None)
            }
            None => (
                aura_types::ResponseStatus::Failed,
                None,
                Some(ResponseError::new("no_response", "No response from model")),
            ),
        };

        // Build usage
        let usage = Usage::new(response.usage.input_tokens, response.usage.output_tokens);

        let mut builder = Response::builder(format!("resp_ant_{}", response.id), model)
            .outputs(output)
            .usage(usage)
            .status(status);

        if let Some(reason) = incomplete_reason {
            builder = builder.incomplete(reason);
        }
        if let Some(err) = error {
            builder = builder.failed(err);
        }

        builder.build()
    }

    /// Parse Anthropic error response
    fn parse_error_response(&self, status: u16, body: &str) -> ProviderError {
        #[derive(Deserialize)]
        struct AnthropicError {
            error: AnthropicErrorInner,
        }

        #[derive(Deserialize)]
        struct AnthropicErrorInner {
            message: String,
            #[serde(rename = "type")]
            error_type: Option<String>,
        }

        if let Ok(err) = serde_json::from_str::<AnthropicError>(body) {
            let message = err.error.message;

            match status {
                400 => ProviderError::invalid_request(message),
                401 => ProviderError::authentication(message),
                403 => ProviderError::authentication(message),
                404 => ProviderError::model_not_found(&message),
                429 => ProviderError::rate_limit(message),
                500 => ProviderError::from_provider(status, message),
                529 => ProviderError::service_unavailable(message), // Overloaded
                502..=504 => ProviderError::service_unavailable(message),
                _ => ProviderError::ProviderError {
                    status_code: status,
                    message,
                    error_type: err.error.error_type,
                },
            }
        } else {
            ProviderError::from_provider(status, body.to_string())
        }
    }
}

#[async_trait]
impl Provider for AnthropicProvider {
    fn name(&self) -> &str {
        "anthropic"
    }

    fn models(&self) -> &[&str] {
        SUPPORTED_MODELS
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete(&self, request: CreateResponseRequest) -> Result<Response, ProviderError> {
        let model = request.model.clone();
        let anthropic_request = self.transform_request(&request);

        debug!(model = %model, "Sending request to Anthropic");

        let response = self
            .client
            .post(format!("{}/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("Content-Type", "application/json")
            .json(&anthropic_request)
            .send()
            .await?;

        let status = response.status().as_u16();

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Anthropic API error");
            return Err(self.parse_error_response(status, &body));
        }

        let anthropic_response: AnthropicResponse = response.json().await?;
        debug!(id = %anthropic_response.id, "Received response from Anthropic");

        Ok(self.transform_response(anthropic_response, &model))
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete_stream(
        &self,
        request: CreateResponseRequest,
    ) -> Result<EventStream, ProviderError> {
        let model = request.model.clone();
        let mut anthropic_request = self.transform_request(&request);
        anthropic_request.stream = Some(true);

        debug!(model = %model, "Starting streaming request to Anthropic");

        let response = self
            .client
            .post(format!("{}/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("Content-Type", "application/json")
            .json(&anthropic_request)
            .send()
            .await?;

        let status = response.status().as_u16();

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Anthropic API error");
            return Err(self.parse_error_response(status, &body));
        }

        let stream = response.bytes_stream();
        let transformer = AnthropicStreamTransformer::new(model);

        Ok(Box::pin(transformer.transform(stream)))
    }
}

/// Transforms Anthropic SSE stream to Open Responses events
struct AnthropicStreamTransformer {
    model: String,
    response_id: String,
    buffer: String,
    accumulated_text: String,
    accumulated_tool_calls: std::collections::HashMap<usize, PartialToolCall>,
    accumulated_thinking: String,
    current_content_index: usize,
    sent_created: bool,
    sent_in_progress: bool,
    output_item_added: bool,
    content_part_added: bool,
    input_tokens: u32,
    output_tokens: u32,
}

#[derive(Default)]
struct PartialToolCall {
    id: String,
    name: String,
    arguments: String,
}

impl AnthropicStreamTransformer {
    fn new(model: String) -> Self {
        Self {
            model,
            response_id: format!("resp_ant_{}", uuid::Uuid::new_v4()),
            buffer: String::new(),
            accumulated_text: String::new(),
            accumulated_tool_calls: std::collections::HashMap::new(),
            accumulated_thinking: String::new(),
            current_content_index: 0,
            sent_created: false,
            sent_in_progress: false,
            output_item_added: false,
            content_part_added: false,
            input_tokens: 0,
            output_tokens: 0,
        }
    }

    fn transform<S>(self, stream: S) -> impl Stream<Item = Result<StreamEvent, ProviderError>>
    where
        S: Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Send + 'static,
    {
        futures_util::stream::unfold(
            (self, stream.boxed()),
            |(mut transformer, mut stream)| async move {
                loop {
                    // Emit initial events
                    if !transformer.sent_created {
                        transformer.sent_created = true;
                        let response = Response::in_progress(
                            transformer.response_id.clone(),
                            transformer.model.clone(),
                        );
                        return Some((
                            Ok(StreamEvent::response_created(response)),
                            (transformer, stream),
                        ));
                    }

                    if !transformer.sent_in_progress {
                        transformer.sent_in_progress = true;
                        let response = Response::in_progress(
                            transformer.response_id.clone(),
                            transformer.model.clone(),
                        );
                        return Some((
                            Ok(StreamEvent::response_in_progress(response)),
                            (transformer, stream),
                        ));
                    }

                    // Process buffered lines
                    if let Some(line_end) = transformer.buffer.find('\n') {
                        let line = transformer.buffer[..line_end].trim().to_string();
                        transformer.buffer = transformer.buffer[line_end + 1..].to_string();

                        if line.is_empty() {
                            continue;
                        }

                        if let Some(data) = line.strip_prefix("data: ") {
                            if let Some(event) = transformer.process_sse_data(data) {
                                return Some((event, (transformer, stream)));
                            }
                        }

                        continue;
                    }

                    // Need more data
                    match stream.next().await {
                        Some(Ok(bytes)) => {
                            if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                                transformer.buffer.push_str(&text);
                            }
                        }
                        Some(Err(e)) => {
                            return Some((
                                Err(ProviderError::stream_error(e.to_string())),
                                (transformer, stream),
                            ));
                        }
                        None => {
                            return None;
                        }
                    }
                }
            },
        )
    }

    fn process_sse_data(&mut self, data: &str) -> Option<Result<StreamEvent, ProviderError>> {
        let event: AnthropicStreamEvent = match serde_json::from_str(data) {
            Ok(e) => e,
            Err(e) => {
                warn!(error = %e, data = %data, "Failed to parse Anthropic stream event");
                return None;
            }
        };

        match event {
            AnthropicStreamEvent::MessageStart { message } => {
                self.input_tokens = message.usage.input_tokens;
                None
            }
            AnthropicStreamEvent::ContentBlockStart {
                index,
                content_block,
            } => {
                self.current_content_index = index;
                match content_block {
                    AnthropicContentBlock::Text { .. } if !self.output_item_added => {
                        self.output_item_added = true;
                        let item = Item::Message(MessageItem::assistant("msg_0", ""));
                        return Some(Ok(StreamEvent::output_item_added(0, item)));
                    }
                    AnthropicContentBlock::Text { .. } => {}
                    AnthropicContentBlock::ToolUse { id, name, .. } => {
                        let entry = self.accumulated_tool_calls.entry(index).or_default();
                        entry.id = id;
                        entry.name = name;
                    }
                    AnthropicContentBlock::Thinking { .. } => {
                        // Thinking block started
                    }
                    _ => {}
                }
                None
            }
            AnthropicStreamEvent::ContentBlockDelta { index, delta } => {
                match delta {
                    AnthropicDelta::TextDelta { text } => {
                        if !self.content_part_added {
                            self.content_part_added = true;
                            return Some(Ok(StreamEvent::content_part_added(0, 0, "text")));
                        }
                        self.accumulated_text.push_str(&text);
                        return Some(Ok(StreamEvent::output_text_delta(0, 0, text)));
                    }
                    AnthropicDelta::InputJsonDelta { partial_json } => {
                        if let Some(tc) = self.accumulated_tool_calls.get_mut(&index) {
                            tc.arguments.push_str(&partial_json);
                            return Some(Ok(StreamEvent::function_call_arguments_delta(
                                index,
                                partial_json,
                            )));
                        }
                    }
                    AnthropicDelta::ThinkingDelta { thinking } => {
                        self.accumulated_thinking.push_str(&thinking);
                        return Some(Ok(StreamEvent::reasoning_delta(0, thinking)));
                    }
                }
                None
            }
            AnthropicStreamEvent::ContentBlockStop { .. } => None,
            AnthropicStreamEvent::MessageDelta { delta, usage } => {
                if let Some(output_tokens) = usage.as_ref().and_then(|u| u.output_tokens) {
                    self.output_tokens = output_tokens;
                }

                if delta.stop_reason.as_deref() == Some("end_turn")
                    || delta.stop_reason.as_deref() == Some("tool_use")
                    || delta.stop_reason.as_deref() == Some("stop_sequence")
                {
                    // Build final response
                    let mut output = Vec::new();
                    if !self.accumulated_text.is_empty() {
                        output.push(Item::Message(MessageItem::assistant(
                            "msg_0",
                            &self.accumulated_text,
                        )));
                    }
                    for (idx, tc) in &self.accumulated_tool_calls {
                        output.push(Item::FunctionCall(FunctionCallItem::new(
                            format!("fc_{}", idx),
                            &tc.id,
                            &tc.name,
                            &tc.arguments,
                        )));
                    }
                    if !self.accumulated_thinking.is_empty() {
                        output.push(Item::Reasoning(ReasoningItem::new(
                            "reasoning_0",
                            &self.accumulated_thinking,
                        )));
                    }

                    let usage = Usage::new(self.input_tokens, self.output_tokens);
                    let response = Response::builder(self.response_id.clone(), self.model.clone())
                        .outputs(output)
                        .usage(usage)
                        .completed()
                        .build();

                    return Some(Ok(StreamEvent::response_completed(response)));
                }
                None
            }
            AnthropicStreamEvent::MessageStop => None,
            AnthropicStreamEvent::Error { error } => {
                Some(Err(ProviderError::from_provider(500, error.message)))
            }
            AnthropicStreamEvent::Ping => None,
        }
    }
}

// Anthropic API types

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<AnthropicToolChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<AnthropicMetadata>,
}

#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: String,
    content: Vec<AnthropicContentBlock>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicContentBlock {
    Text {
        text: String,
    },
    Image {
        source: AnthropicImageSource,
    },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_error: Option<bool>,
    },
    Thinking {
        thinking: String,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AnthropicImageSource {
    #[serde(rename = "type")]
    source_type: String,
    media_type: String,
    data: String,
}

#[derive(Debug, Serialize)]
struct AnthropicTool {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    input_schema: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicToolChoice {
    Auto,
    Any,
    Tool { name: String },
}

#[derive(Debug, Serialize)]
struct AnthropicMetadata {
    user_id: String,
}

// Response types

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    id: String,
    content: Vec<AnthropicContentBlock>,
    stop_reason: Option<String>,
    usage: AnthropicUsage,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

// Streaming types

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicStreamEvent {
    MessageStart {
        message: AnthropicMessageStart,
    },
    ContentBlockStart {
        index: usize,
        content_block: AnthropicContentBlock,
    },
    ContentBlockDelta {
        index: usize,
        delta: AnthropicDelta,
    },
    ContentBlockStop {
        #[allow(dead_code)]
        index: usize,
    },
    MessageDelta {
        delta: AnthropicMessageDelta,
        usage: Option<AnthropicDeltaUsage>,
    },
    MessageStop,
    Error {
        error: AnthropicStreamError,
    },
    Ping,
}

#[derive(Debug, Deserialize)]
struct AnthropicMessageStart {
    usage: AnthropicUsage,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(clippy::enum_variant_names)]
enum AnthropicDelta {
    TextDelta { text: String },
    InputJsonDelta { partial_json: String },
    ThinkingDelta { thinking: String },
}

#[derive(Debug, Deserialize)]
struct AnthropicMessageDelta {
    stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicDeltaUsage {
    output_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct AnthropicStreamError {
    message: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::FunctionDefinition;

    #[test]
    fn test_transform_simple_request() {
        let provider = AnthropicProvider::new("test-key");
        let request = CreateResponseRequest::text("claude-3-5-sonnet-20241022", "Hello!");

        let anthropic_request = provider.transform_request(&request);

        assert_eq!(anthropic_request.model, "claude-3-5-sonnet-20241022");
        assert_eq!(anthropic_request.messages.len(), 1);
        assert_eq!(anthropic_request.messages[0].role, "user");
    }

    #[test]
    fn test_transform_request_with_instructions() {
        let provider = AnthropicProvider::new("test-key");
        let request = CreateResponseRequest::text("claude-3-5-sonnet-20241022", "Hello!")
            .with_instructions("Be helpful");

        let anthropic_request = provider.transform_request(&request);

        assert_eq!(anthropic_request.system, Some("Be helpful".to_string()));
        assert_eq!(anthropic_request.messages.len(), 1);
    }

    #[test]
    fn test_transform_request_with_tools() {
        let provider = AnthropicProvider::new("test-key");
        let request = CreateResponseRequest::text("claude-3-5-sonnet-20241022", "Get the weather")
            .with_tools(vec![Tool::function(
                FunctionDefinition::new("get_weather").with_description("Get current weather"),
            )]);

        let anthropic_request = provider.transform_request(&request);

        assert!(anthropic_request.tools.is_some());
        let tools = anthropic_request.tools.unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "get_weather");
    }

    #[test]
    fn test_supports_model() {
        let provider = AnthropicProvider::new("test-key");
        assert!(provider.supports_model("claude-3-5-sonnet-20241022"));
        assert!(provider.supports_model("claude-3-opus-20240229"));
        assert!(!provider.supports_model("gpt-4"));
    }

    #[test]
    fn test_provider_name() {
        let provider = AnthropicProvider::new("test-key");
        assert_eq!(provider.name(), "anthropic");
    }

    #[test]
    fn test_error_code_mapping() {
        let provider = AnthropicProvider::new("test-key");

        let err = provider.parse_error_response(
            401,
            r#"{"error":{"message":"Invalid API key","type":"authentication_error"}}"#,
        );
        assert!(matches!(err, ProviderError::Authentication { .. }));

        let err = provider.parse_error_response(
            429,
            r#"{"error":{"message":"Rate limit exceeded","type":"rate_limit_error"}}"#,
        );
        assert!(matches!(err, ProviderError::RateLimit { .. }));

        let err = provider.parse_error_response(
            529,
            r#"{"error":{"message":"Overloaded","type":"overloaded_error"}}"#,
        );
        assert!(matches!(err, ProviderError::ServiceUnavailable { .. }));
    }
}
