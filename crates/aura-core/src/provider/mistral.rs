//! Mistral AI provider implementation
//!
//! Transforms between Open Responses API format and Mistral's Chat Completions API.
//! Mistral's API is OpenAI-compatible, so this adapter closely mirrors the OpenAI
//! adapter with Mistral-specific model names and endpoint.
//!
//! ## Supported models
//!
//! - `mistral-large-latest` / `mistral-large-2411`
//! - `mistral-medium-latest`
//! - `mistral-small-latest`
//! - `codestral-latest`
//! - `pixtral-large-latest`
//! - `ministral-8b-latest`
//! - `ministral-3b-latest`
//!
//! ## Authentication
//!
//! Uses `Authorization: Bearer <api_key>` header.
//!
//! ## Tool calling
//!
//! Mistral supports OpenAI-compatible tool calling.
//! The `safe_prompt` and `random_seed` fields are Mistral-specific extensions;
//! they are intentionally not forwarded by this adapter.

use async_trait::async_trait;
use aura_types::{
    ContentPart, CreateResponseRequest, FunctionCallItem, IncompleteReason, InputContent,
    InputItem, Item, MessageItem, Response, ResponseError, Role, StreamEvent, Tool, ToolChoice,
    ToolChoiceAuto, Usage,
};
use futures_util::{Stream, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, instrument, warn};

use super::{EventStream, Provider, ProviderError};

/// Mistral AI API base URL
const MISTRAL_API_BASE: &str = "https://api.mistral.ai/v1";

/// Supported Mistral models
const SUPPORTED_MODELS: &[&str] = &[
    "mistral-large-latest",
    "mistral-large-2411",
    "mistral-medium-latest",
    "mistral-small-latest",
    "codestral-latest",
    "pixtral-large-latest",
    "ministral-8b-latest",
    "ministral-3b-latest",
];

/// Mistral AI provider implementation
pub struct MistralProvider {
    client: Client,
    api_key: String,
    base_url: String,
}

impl MistralProvider {
    /// Create a new Mistral provider with the given API key
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: MISTRAL_API_BASE.to_string(),
        }
    }

    /// Create a new Mistral provider with a custom base URL
    pub fn with_base_url(api_key: impl Into<String>, base_url: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: base_url.into(),
        }
    }

    /// Transform Open Responses request to Mistral format
    fn transform_request(&self, request: &CreateResponseRequest) -> MistralRequest {
        let mut messages = Vec::new();

        // Add system message from instructions if present
        if let Some(instructions) = &request.instructions {
            messages.push(MistralMessage {
                role: "system".to_string(),
                content: Some(MistralContent::Text(instructions.clone())),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        // Transform input items to Mistral messages
        for item in &request.input {
            match item {
                InputItem::Message { role, content } => {
                    // Skip system messages — already handled via instructions field
                    if *role == Role::System {
                        continue;
                    }
                    let mistral_content = match content {
                        InputContent::Text(text) => MistralContent::Text(text.clone()),
                        InputContent::Parts(parts) => {
                            let mistral_parts: Vec<MistralContentPart> = parts
                                .iter()
                                .map(|p| match p {
                                    ContentPart::Text { text } => {
                                        MistralContentPart::Text { text: text.clone() }
                                    }
                                    ContentPart::Image {
                                        url,
                                        data,
                                        media_type,
                                    } => {
                                        if let Some(url) = url {
                                            MistralContentPart::ImageUrl {
                                                image_url: MistralImageUrl { url: url.clone() },
                                            }
                                        } else if let Some(data) = data {
                                            let media =
                                                media_type.as_deref().unwrap_or("image/png");
                                            MistralContentPart::ImageUrl {
                                                image_url: MistralImageUrl {
                                                    url: format!("data:{};base64,{}", media, data),
                                                },
                                            }
                                        } else {
                                            MistralContentPart::Text {
                                                text: "[Invalid image]".to_string(),
                                            }
                                        }
                                    }
                                    ContentPart::Audio { data, media_type } => {
                                        // Mistral does not support audio input
                                        MistralContentPart::Text {
                                            text: format!(
                                                "[Audio: {} bytes, type: {}]",
                                                data.len(),
                                                media_type.as_deref().unwrap_or("audio/mp3")
                                            ),
                                        }
                                    }
                                })
                                .collect();
                            MistralContent::Parts(mistral_parts)
                        }
                    };

                    messages.push(MistralMessage {
                        role: match role {
                            Role::User => "user".to_string(),
                            Role::Assistant => "assistant".to_string(),
                            Role::System => "system".to_string(),
                            Role::Tool => "tool".to_string(),
                        },
                        content: Some(mistral_content),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
                InputItem::FunctionCallOutput { call_id, output } => {
                    messages.push(MistralMessage {
                        role: "tool".to_string(),
                        content: Some(MistralContent::Text(output.clone())),
                        tool_calls: None,
                        tool_call_id: Some(call_id.clone()),
                    });
                }
            }
        }

        // Transform tools
        let tools = request.tools.as_ref().map(|tools| {
            tools
                .iter()
                .map(|tool| match tool {
                    Tool::Function { function } => MistralTool {
                        r#type: "function".to_string(),
                        function: MistralFunction {
                            name: function.name.clone(),
                            description: function.description.clone(),
                            parameters: function.parameters.clone(),
                        },
                    },
                })
                .collect()
        });

        // Transform tool_choice
        let tool_choice = request.tool_choice.as_ref().map(|tc| match tc {
            ToolChoice::Auto(auto) => match auto {
                ToolChoiceAuto::Auto => MistralToolChoice::String("auto".to_string()),
                ToolChoiceAuto::Required => MistralToolChoice::String("any".to_string()),
                ToolChoiceAuto::None => MistralToolChoice::String("none".to_string()),
            },
            ToolChoice::Function { function, .. } => MistralToolChoice::Object {
                r#type: "function".to_string(),
                function: MistralToolChoiceFunction {
                    name: function.name.clone(),
                },
            },
        });

        MistralRequest {
            model: request.model.clone(),
            messages,
            max_tokens: request.max_output_tokens,
            temperature: request.temperature,
            top_p: request.top_p,
            stream: Some(request.stream),
            tools,
            tool_choice,
        }
    }

    /// Transform Mistral response to Open Responses format
    fn transform_response(&self, response: MistralResponse, model: &str) -> Response {
        let choice = response.choices.first();

        let mut output = Vec::new();
        let mut item_index = 0;

        if let Some(choice) = choice {
            // Handle text content
            if let Some(content) = &choice.message.content {
                output.push(Item::Message(MessageItem::assistant(
                    format!("msg_{}", item_index),
                    content,
                )));
                item_index += 1;
            }

            // Handle tool calls
            if let Some(tool_calls) = &choice.message.tool_calls {
                for (i, tc) in tool_calls.iter().enumerate() {
                    output.push(Item::FunctionCall(FunctionCallItem::new(
                        format!("fc_{}", item_index + i),
                        &tc.id,
                        &tc.function.name,
                        &tc.function.arguments,
                    )));
                }
            }
        }

        // Determine status
        let (status, incomplete_reason, error) = match choice.map(|c| c.finish_reason.as_str()) {
            Some("stop") => (aura_types::ResponseStatus::Completed, None, None),
            Some("length") => (
                aura_types::ResponseStatus::Incomplete,
                Some(IncompleteReason::MaxTokens),
                None,
            ),
            Some("tool_calls") => (aura_types::ResponseStatus::Completed, None, None),
            Some("model_length") => (
                aura_types::ResponseStatus::Incomplete,
                Some(IncompleteReason::MaxTokens),
                None,
            ),
            Some(reason) => {
                warn!(reason = %reason, "Unknown finish reason from Mistral");
                (aura_types::ResponseStatus::Completed, None, None)
            }
            None => (
                aura_types::ResponseStatus::Failed,
                None,
                Some(ResponseError::new("no_response", "No response from model")),
            ),
        };

        let usage = response
            .usage
            .map(|u| Usage::new(u.prompt_tokens, u.completion_tokens));

        let mut builder = Response::builder(format!("resp_mis_{}", response.id), model)
            .created_at(response.created)
            .outputs(output)
            .status(status);

        if let Some(usage) = usage {
            builder = builder.usage(usage);
        }
        if let Some(reason) = incomplete_reason {
            builder = builder.incomplete(reason);
        }
        if let Some(err) = error {
            builder = builder.failed(err);
        }

        builder.build()
    }

    /// Parse Mistral error response
    fn parse_error_response(&self, status: u16, body: &str) -> ProviderError {
        #[derive(Deserialize)]
        struct MistralError {
            message: Option<String>,
            #[serde(rename = "type")]
            error_type: Option<String>,
        }

        if let Ok(err) = serde_json::from_str::<MistralError>(body) {
            let message = err.message.unwrap_or_else(|| format!("HTTP {}", status));
            match status {
                400 => ProviderError::invalid_request(message),
                401 => ProviderError::authentication(message),
                403 => ProviderError::authentication(message),
                404 => {
                    if message.to_lowercase().contains("model") {
                        ProviderError::model_not_found(&message)
                    } else {
                        ProviderError::from_provider(status, message)
                    }
                }
                422 => ProviderError::invalid_request(message),
                429 => ProviderError::rate_limit(message),
                500 => ProviderError::from_provider(status, message),
                502..=504 => ProviderError::service_unavailable(message),
                _ => ProviderError::ProviderError {
                    status_code: status,
                    message,
                    error_type: err.error_type,
                },
            }
        } else {
            ProviderError::from_provider(status, body.to_string())
        }
    }
}

#[async_trait]
impl Provider for MistralProvider {
    fn name(&self) -> &str {
        "mistral"
    }

    fn models(&self) -> &[&str] {
        SUPPORTED_MODELS
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete(&self, request: CreateResponseRequest) -> Result<Response, ProviderError> {
        let model = request.model.clone();
        let mistral_request = self.transform_request(&request);

        debug!(model = %model, "Sending request to Mistral");

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&mistral_request)
            .send()
            .await?;

        let status = response.status().as_u16();

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Mistral API error");
            return Err(self.parse_error_response(status, &body));
        }

        let mistral_response: MistralResponse = response.json().await?;
        debug!(id = %mistral_response.id, "Received response from Mistral");

        Ok(self.transform_response(mistral_response, &model))
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete_stream(
        &self,
        request: CreateResponseRequest,
    ) -> Result<EventStream, ProviderError> {
        let model = request.model.clone();
        let mut mistral_request = self.transform_request(&request);
        mistral_request.stream = Some(true);

        debug!(model = %model, "Starting streaming request to Mistral");

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&mistral_request)
            .send()
            .await?;

        let status = response.status().as_u16();

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Mistral API error");
            return Err(self.parse_error_response(status, &body));
        }

        let stream = response.bytes_stream();
        let transformer = MistralStreamTransformer::new(model);

        Ok(Box::pin(transformer.transform(stream)))
    }
}

/// Transforms Mistral SSE stream to Open Responses events
struct MistralStreamTransformer {
    model: String,
    response_id: String,
    buffer: String,
    accumulated_text: String,
    accumulated_tool_calls: std::collections::HashMap<usize, PartialToolCall>,
    sent_created: bool,
    sent_in_progress: bool,
    output_item_added: bool,
    content_part_added: bool,
}

#[derive(Default)]
struct PartialToolCall {
    id: String,
    name: String,
    arguments: String,
}

impl MistralStreamTransformer {
    fn new(model: String) -> Self {
        Self {
            model,
            response_id: format!("resp_mis_{}", uuid::Uuid::new_v4()),
            buffer: String::new(),
            accumulated_text: String::new(),
            accumulated_tool_calls: std::collections::HashMap::new(),
            sent_created: false,
            sent_in_progress: false,
            output_item_added: false,
            content_part_added: false,
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

                        if line == "data: [DONE]" {
                            // Build final response
                            let mut output = Vec::new();

                            if !transformer.accumulated_text.is_empty() {
                                output.push(Item::Message(MessageItem::assistant(
                                    "msg_0",
                                    &transformer.accumulated_text,
                                )));
                            }
                            for (idx, tc) in &transformer.accumulated_tool_calls {
                                output.push(Item::FunctionCall(FunctionCallItem::new(
                                    format!("fc_{}", idx),
                                    &tc.id,
                                    &tc.name,
                                    &tc.arguments,
                                )));
                            }

                            let response = Response::builder(
                                transformer.response_id.clone(),
                                transformer.model.clone(),
                            )
                            .outputs(output)
                            .completed()
                            .build();

                            return Some((
                                Ok(StreamEvent::response_completed(response)),
                                (transformer, stream),
                            ));
                        }

                        if let Some(data) = line.strip_prefix("data: ") {
                            match serde_json::from_str::<MistralStreamChunk>(data) {
                                Ok(chunk) => {
                                    if let Some(choice) = chunk.choices.first() {
                                        if let Some(content) = &choice.delta.content {
                                            if !transformer.output_item_added {
                                                transformer.output_item_added = true;
                                                let item = Item::Message(MessageItem::assistant(
                                                    "msg_0", "",
                                                ));
                                                return Some((
                                                    Ok(StreamEvent::output_item_added(0, item)),
                                                    (transformer, stream),
                                                ));
                                            }

                                            if !transformer.content_part_added {
                                                transformer.content_part_added = true;
                                                return Some((
                                                    Ok(StreamEvent::content_part_added(
                                                        0, 0, "text",
                                                    )),
                                                    (transformer, stream),
                                                ));
                                            }

                                            transformer.accumulated_text.push_str(content);
                                            return Some((
                                                Ok(StreamEvent::output_text_delta(
                                                    0,
                                                    0,
                                                    content.clone(),
                                                )),
                                                (transformer, stream),
                                            ));
                                        }

                                        if let Some(tool_calls) = &choice.delta.tool_calls {
                                            for tc in tool_calls {
                                                let entry = transformer
                                                    .accumulated_tool_calls
                                                    .entry(tc.index)
                                                    .or_default();

                                                if let Some(id) = &tc.id {
                                                    entry.id = id.clone();
                                                }
                                                if let Some(func) = &tc.function {
                                                    if let Some(name) = &func.name {
                                                        entry.name = name.clone();
                                                    }
                                                    if let Some(args) = &func.arguments {
                                                        entry.arguments.push_str(args);
                                                        return Some((
                                                            Ok(StreamEvent::function_call_arguments_delta(
                                                                tc.index,
                                                                args.clone(),
                                                            )),
                                                            (transformer, stream),
                                                        ));
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    warn!(
                                        error = %e,
                                        data = %data,
                                        "Failed to parse Mistral stream chunk"
                                    );
                                }
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
}

// Mistral API wire types

#[derive(Debug, Serialize)]
struct MistralRequest {
    model: String,
    messages: Vec<MistralMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<MistralTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<MistralToolChoice>,
}

#[derive(Debug, Serialize)]
struct MistralMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<MistralContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<MistralToolCallRequest>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum MistralContent {
    Text(String),
    Parts(Vec<MistralContentPart>),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum MistralContentPart {
    Text { text: String },
    ImageUrl { image_url: MistralImageUrl },
}

#[derive(Debug, Serialize)]
struct MistralImageUrl {
    url: String,
}

#[derive(Debug, Serialize)]
struct MistralTool {
    r#type: String,
    function: MistralFunction,
}

#[derive(Debug, Serialize)]
struct MistralFunction {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parameters: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum MistralToolChoice {
    String(String),
    Object {
        r#type: String,
        function: MistralToolChoiceFunction,
    },
}

#[derive(Debug, Serialize)]
struct MistralToolChoiceFunction {
    name: String,
}

#[derive(Debug, Serialize)]
struct MistralToolCallRequest {
    id: String,
    r#type: String,
    function: MistralFunctionCall,
}

#[derive(Debug, Serialize, Deserialize)]
struct MistralFunctionCall {
    name: String,
    arguments: String,
}

// Response types

#[derive(Debug, Deserialize)]
struct MistralResponse {
    id: String,
    created: i64,
    #[allow(dead_code)]
    model: String,
    choices: Vec<MistralChoice>,
    usage: Option<MistralUsage>,
}

#[derive(Debug, Deserialize)]
struct MistralChoice {
    message: MistralResponseMessage,
    finish_reason: String,
}

#[derive(Debug, Deserialize)]
struct MistralResponseMessage {
    content: Option<String>,
    tool_calls: Option<Vec<MistralToolCallResponse>>,
}

#[derive(Debug, Deserialize)]
struct MistralToolCallResponse {
    id: String,
    function: MistralFunctionCall,
}

#[derive(Debug, Deserialize)]
struct MistralUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    #[allow(dead_code)]
    total_tokens: u32,
}

// Streaming types

#[derive(Debug, Deserialize)]
struct MistralStreamChunk {
    #[allow(dead_code)]
    id: String,
    choices: Vec<MistralStreamChoice>,
}

#[derive(Debug, Deserialize)]
struct MistralStreamChoice {
    delta: MistralStreamDelta,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MistralStreamDelta {
    content: Option<String>,
    tool_calls: Option<Vec<MistralStreamToolCall>>,
}

#[derive(Debug, Deserialize)]
struct MistralStreamToolCall {
    index: usize,
    id: Option<String>,
    function: Option<MistralStreamFunction>,
}

#[derive(Debug, Deserialize)]
struct MistralStreamFunction {
    name: Option<String>,
    arguments: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::FunctionDefinition;

    #[test]
    fn test_transform_simple_request() {
        let provider = MistralProvider::new("test-key");
        let request = CreateResponseRequest::text("mistral-large-latest", "Hello!");

        let mistral_request = provider.transform_request(&request);

        assert_eq!(mistral_request.model, "mistral-large-latest");
        assert_eq!(mistral_request.messages.len(), 1);
        assert_eq!(mistral_request.messages[0].role, "user");
    }

    #[test]
    fn test_transform_request_with_instructions() {
        let provider = MistralProvider::new("test-key");
        let request = CreateResponseRequest::text("mistral-large-latest", "Hello!")
            .with_instructions("Be helpful");

        let mistral_request = provider.transform_request(&request);

        // instructions become system message at index 0
        assert_eq!(mistral_request.messages.len(), 2);
        assert_eq!(mistral_request.messages[0].role, "system");
        assert_eq!(mistral_request.messages[1].role, "user");
    }

    #[test]
    fn test_transform_request_with_tools() {
        let provider = MistralProvider::new("test-key");
        let request = CreateResponseRequest::text("mistral-large-latest", "Get weather")
            .with_tools(vec![Tool::function(
                FunctionDefinition::new("get_weather").with_description("Get current weather"),
            )]);

        let mistral_request = provider.transform_request(&request);

        assert!(mistral_request.tools.is_some());
        let tools = mistral_request.tools.unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].function.name, "get_weather");
    }

    #[test]
    fn test_transform_tool_call_output() {
        let provider = MistralProvider::new("test-key");
        let mut request = CreateResponseRequest::text("mistral-large-latest", "Hi");
        request.input.push(InputItem::FunctionCallOutput {
            call_id: "call_123".to_string(),
            output: r#"{"temp": 72}"#.to_string(),
        });

        let mistral_request = provider.transform_request(&request);

        let last = mistral_request
            .messages
            .last()
            .expect("messages should not be empty");
        assert_eq!(last.role, "tool");
        assert_eq!(last.tool_call_id.as_deref(), Some("call_123"));
    }

    #[test]
    fn test_supports_model() {
        let provider = MistralProvider::new("test-key");
        assert!(provider.supports_model("mistral-large-latest"));
        assert!(provider.supports_model("codestral-latest"));
        assert!(provider.supports_model("ministral-8b-latest"));
        assert!(!provider.supports_model("gpt-4"));
        assert!(!provider.supports_model("claude-3"));
    }

    #[test]
    fn test_provider_name() {
        let provider = MistralProvider::new("test-key");
        assert_eq!(provider.name(), "mistral");
    }

    #[test]
    fn test_error_code_mapping() {
        let provider = MistralProvider::new("test-key");

        let err = provider.parse_error_response(
            401,
            r#"{"message":"Invalid API key","type":"authentication_error"}"#,
        );
        assert!(matches!(err, ProviderError::Authentication { .. }));

        let err = provider.parse_error_response(
            429,
            r#"{"message":"Rate limit exceeded","type":"rate_limit_error"}"#,
        );
        assert!(matches!(err, ProviderError::RateLimit { .. }));

        let err = provider.parse_error_response(503, r#"{"message":"Service unavailable"}"#);
        assert!(matches!(err, ProviderError::ServiceUnavailable { .. }));
    }

    #[test]
    fn test_transform_response_completed() {
        let provider = MistralProvider::new("test-key");
        let raw = MistralResponse {
            id: "abc123".to_string(),
            created: 1700000000,
            model: "mistral-large-latest".to_string(),
            choices: vec![MistralChoice {
                message: MistralResponseMessage {
                    content: Some("Hello there!".to_string()),
                    tool_calls: None,
                },
                finish_reason: "stop".to_string(),
            }],
            usage: Some(MistralUsage {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            }),
        };

        let response = provider.transform_response(raw, "mistral-large-latest");

        assert_eq!(response.status, aura_types::ResponseStatus::Completed);
        assert_eq!(response.output.len(), 1);
        assert!(response.id.starts_with("resp_mis_"));
    }

    #[test]
    fn test_transform_response_max_tokens() {
        let provider = MistralProvider::new("test-key");
        let raw = MistralResponse {
            id: "abc456".to_string(),
            created: 1700000001,
            model: "mistral-large-latest".to_string(),
            choices: vec![MistralChoice {
                message: MistralResponseMessage {
                    content: Some("Truncated...".to_string()),
                    tool_calls: None,
                },
                finish_reason: "length".to_string(),
            }],
            usage: None,
        };

        let response = provider.transform_response(raw, "mistral-large-latest");

        assert_eq!(response.status, aura_types::ResponseStatus::Incomplete);
        assert!(matches!(
            response.incomplete_reason,
            Some(IncompleteReason::MaxTokens)
        ));
    }
}
