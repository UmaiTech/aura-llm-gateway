//! Ollama local model provider implementation
//!
//! Communicates with a locally running [Ollama](https://ollama.ai) server via its
//! OpenAI-compatible `/v1/chat/completions` endpoint.
//!
//! ## Key characteristics
//!
//! - **No API key required** — authentication is not used for local servers.
//! - **Any pulled model is supported** — `supports_model()` returns `true` for any
//!   non-empty model name, because Ollama runs whatever models have been pulled locally.
//!   `models()` returns a list of commonly-used models for display/discovery purposes only.
//! - **Tool calling** — available on Ollama ≥ 0.3 for models that support it.
//!   Support varies by underlying model; this adapter implements the wire format but
//!   cannot guarantee tool-call functionality for every model.
//! - **Health check** — queries `GET /api/tags` rather than the chat endpoint to verify
//!   the server is running without consuming inference resources.
//! - **Pricing** — $0.00 for all models (local inference on user hardware).
//!
//! ## Default endpoint
//!
//! `http://localhost:11434` — configurable via `OLLAMA_BASE_URL` environment variable
//! or the `ollama_base_url` field in the configuration YAML.

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

/// Default Ollama server URL
const OLLAMA_DEFAULT_BASE: &str = "http://localhost:11434";

/// Commonly available Ollama models (for display and model-map registration).
///
/// `supports_model()` is overridden to accept *any* non-empty name, because Ollama
/// runs whatever models the user has pulled locally. This list is only used for
/// populating the static `model_map` and the `/v1/models` endpoint.
const SUPPORTED_MODELS: &[&str] = &[
    "llama3.3",
    "llama3.2",
    "llama3.1",
    "qwen2.5",
    "mistral",
    "mixtral",
    "phi3",
    "gemma2",
    "codellama",
    "deepseek-r1",
];

/// Ollama local model provider
pub struct OllamaProvider {
    client: Client,
    base_url: String,
}

impl OllamaProvider {
    /// Create a new Ollama provider.
    ///
    /// Pass `None` to use the default server at `http://localhost:11434`, or supply a
    /// custom URL for a remote or non-standard Ollama deployment.
    pub fn new(base_url: Option<impl Into<String>>) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url
                .map(Into::into)
                .unwrap_or_else(|| OLLAMA_DEFAULT_BASE.to_string()),
        }
    }

    /// Transform Open Responses request to Ollama (OpenAI-compatible) format
    fn transform_request(&self, request: &CreateResponseRequest) -> OllamaRequest {
        let mut messages = Vec::new();

        // Add system message from instructions if present
        if let Some(instructions) = &request.instructions {
            messages.push(OllamaMessage {
                role: "system".to_string(),
                content: Some(OllamaContent::Text(instructions.clone())),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        for item in &request.input {
            match item {
                InputItem::Message { role, content } => {
                    if *role == Role::System {
                        // System messages handled via instructions above; skip duplicates
                        continue;
                    }

                    let ollama_content = match content {
                        InputContent::Text(text) => OllamaContent::Text(text.clone()),
                        InputContent::Parts(parts) => {
                            // Ollama supports images in a flat `images` field on the message,
                            // but the OpenAI-compat endpoint accepts content-part arrays too.
                            // We use content-part arrays for consistency.
                            let ollama_parts: Vec<OllamaContentPart> = parts
                                .iter()
                                .map(|p| match p {
                                    ContentPart::Text { text } => {
                                        OllamaContentPart::Text { text: text.clone() }
                                    }
                                    ContentPart::Image {
                                        url,
                                        data,
                                        media_type,
                                    } => {
                                        if let Some(url) = url {
                                            OllamaContentPart::ImageUrl {
                                                image_url: OllamaImageUrl { url: url.clone() },
                                            }
                                        } else if let Some(data) = data {
                                            let media =
                                                media_type.as_deref().unwrap_or("image/png");
                                            OllamaContentPart::ImageUrl {
                                                image_url: OllamaImageUrl {
                                                    url: format!("data:{};base64,{}", media, data),
                                                },
                                            }
                                        } else {
                                            OllamaContentPart::Text {
                                                text: "[Invalid image]".to_string(),
                                            }
                                        }
                                    }
                                    ContentPart::Audio { data, media_type } => {
                                        // Ollama does not support audio — convert to placeholder
                                        OllamaContentPart::Text {
                                            text: format!(
                                                "[Audio: {} bytes, type: {}]",
                                                data.len(),
                                                media_type.as_deref().unwrap_or("audio/mp3")
                                            ),
                                        }
                                    }
                                })
                                .collect();
                            OllamaContent::Parts(ollama_parts)
                        }
                    };

                    messages.push(OllamaMessage {
                        role: match role {
                            Role::User => "user".to_string(),
                            Role::Assistant => "assistant".to_string(),
                            Role::System => "system".to_string(),
                            Role::Tool => "tool".to_string(),
                        },
                        content: Some(ollama_content),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
                InputItem::FunctionCall {
                    call_id,
                    name,
                    arguments,
                } => {
                    messages.push(OllamaMessage {
                        role: "assistant".to_string(),
                        content: None,
                        tool_calls: Some(vec![OllamaToolCallRequest {
                            id: call_id.clone(),
                            r#type: "function".to_string(),
                            function: OllamaFunctionCall {
                                name: name.clone(),
                                arguments: arguments.clone(),
                            },
                        }]),
                        tool_call_id: None,
                    });
                }
                InputItem::FunctionCallOutput { call_id, output } => {
                    messages.push(OllamaMessage {
                        role: "tool".to_string(),
                        content: Some(OllamaContent::Text(output.clone())),
                        tool_calls: None,
                        tool_call_id: Some(call_id.clone()),
                    });
                }
            }
        }

        // Transform tools (Ollama ≥ 0.3 OpenAI-compatible format)
        let tools = request.tools.as_ref().map(|tools| {
            tools
                .iter()
                .map(|tool| match tool {
                    Tool::Function { function } => OllamaTool {
                        r#type: "function".to_string(),
                        function: OllamaFunction {
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
                ToolChoiceAuto::Auto => OllamaToolChoice::String("auto".to_string()),
                ToolChoiceAuto::Required => OllamaToolChoice::String("required".to_string()),
                ToolChoiceAuto::None => OllamaToolChoice::String("none".to_string()),
            },
            ToolChoice::Function { function, .. } => OllamaToolChoice::Object {
                r#type: "function".to_string(),
                function: OllamaToolChoiceFunction {
                    name: function.name.clone(),
                },
            },
        });

        OllamaRequest {
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

    /// Transform Ollama response to Open Responses format
    fn transform_response(&self, response: OllamaResponse, model: &str) -> Response {
        let choice = response.choices.first();

        let mut output = Vec::new();
        let mut item_index = 0;

        if let Some(choice) = choice {
            if let Some(content) = &choice.message.content {
                output.push(Item::Message(MessageItem::assistant(
                    format!("msg_{}", item_index),
                    content,
                )));
                item_index += 1;
            }

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

        let (status, incomplete_reason, error) = match choice.map(|c| c.finish_reason.as_str()) {
            Some("stop") => (aura_types::ResponseStatus::Completed, None, None),
            Some("length") => (
                aura_types::ResponseStatus::Incomplete,
                Some(IncompleteReason::MaxTokens),
                None,
            ),
            Some("tool_calls") => (aura_types::ResponseStatus::Completed, None, None),
            Some(reason) => {
                warn!(reason = %reason, "Unknown finish reason from Ollama");
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

        // Ollama doesn't return a persistent ID; generate a UUID
        let response_id = format!("resp_oll_{}", uuid::Uuid::new_v4());

        let mut builder = Response::builder(response_id, model)
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

    /// Parse Ollama error responses (OpenAI-compatible error format)
    fn parse_error_response(&self, status: u16, body: &str) -> ProviderError {
        #[derive(Deserialize)]
        struct OllamaErrorWrapper {
            error: Option<OllamaErrorInner>,
        }

        #[derive(Deserialize)]
        struct OllamaErrorInner {
            message: String,
        }

        if let Ok(wrapper) = serde_json::from_str::<OllamaErrorWrapper>(body) {
            let message = wrapper
                .error
                .map(|e| e.message)
                .unwrap_or_else(|| format!("HTTP {}", status));

            match status {
                400 => ProviderError::invalid_request(message),
                404 => {
                    if message.to_lowercase().contains("model") {
                        ProviderError::model_not_found(&message)
                    } else {
                        ProviderError::from_provider(status, message)
                    }
                }
                500 => ProviderError::service_unavailable(message),
                502..=504 => ProviderError::service_unavailable(message),
                _ => ProviderError::from_provider(status, message),
            }
        } else {
            ProviderError::from_provider(status, body.to_string())
        }
    }
}

#[async_trait]
impl Provider for OllamaProvider {
    fn name(&self) -> &str {
        "ollama"
    }

    fn models(&self) -> &[&str] {
        SUPPORTED_MODELS
    }

    /// Accept any non-empty model name — Ollama runs whatever has been pulled locally.
    fn supports_model(&self, model: &str) -> bool {
        !model.is_empty()
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete(&self, request: CreateResponseRequest) -> Result<Response, ProviderError> {
        let model = request.model.clone();
        let ollama_request = self.transform_request(&request);

        debug!(model = %model, "Sending request to Ollama");

        let response = self
            .client
            .post(format!("{}/v1/chat/completions", self.base_url))
            .header("Content-Type", "application/json")
            .json(&ollama_request)
            .send()
            .await?;

        let status = response.status().as_u16();

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Ollama API error");
            return Err(self.parse_error_response(status, &body));
        }

        let ollama_response: OllamaResponse = response.json().await?;
        debug!("Received response from Ollama");

        Ok(self.transform_response(ollama_response, &model))
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete_stream(
        &self,
        request: CreateResponseRequest,
    ) -> Result<EventStream, ProviderError> {
        let model = request.model.clone();
        let mut ollama_request = self.transform_request(&request);
        ollama_request.stream = Some(true);

        debug!(model = %model, "Starting streaming request to Ollama");

        let response = self
            .client
            .post(format!("{}/v1/chat/completions", self.base_url))
            .header("Content-Type", "application/json")
            .json(&ollama_request)
            .send()
            .await?;

        let status = response.status().as_u16();

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Ollama API error");
            return Err(self.parse_error_response(status, &body));
        }

        let stream = response.bytes_stream();
        let transformer = OllamaStreamTransformer::new(model);

        Ok(Box::pin(transformer.transform(stream)))
    }

    /// Health check via `GET /api/tags` — verifies the Ollama server is running
    async fn health_check(&self) -> Result<(), ProviderError> {
        let response = self
            .client
            .get(format!("{}/api/tags", self.base_url))
            .send()
            .await
            .map_err(|e| ProviderError::network(format!("Ollama health check failed: {}", e)))?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(ProviderError::service_unavailable(format!(
                "Ollama returned HTTP {} for /api/tags",
                response.status()
            )))
        }
    }
}

/// Transforms Ollama SSE stream (OpenAI-compatible) to Open Responses events
struct OllamaStreamTransformer {
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

impl OllamaStreamTransformer {
    fn new(model: String) -> Self {
        Self {
            model,
            response_id: format!("resp_oll_{}", uuid::Uuid::new_v4()),
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

                    if let Some(line_end) = transformer.buffer.find('\n') {
                        let line = transformer.buffer[..line_end].trim().to_string();
                        transformer.buffer = transformer.buffer[line_end + 1..].to_string();

                        if line.is_empty() {
                            continue;
                        }

                        if line == "data: [DONE]" {
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
                            match serde_json::from_str::<OllamaStreamChunk>(data) {
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
                                        "Failed to parse Ollama stream chunk"
                                    );
                                }
                            }
                        }

                        continue;
                    }

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

// Ollama API wire types (OpenAI-compatible subset)

#[derive(Debug, Serialize)]
struct OllamaRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OllamaTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<OllamaToolChoice>,
}

#[derive(Debug, Serialize)]
struct OllamaMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<OllamaContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OllamaToolCallRequest>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum OllamaContent {
    Text(String),
    Parts(Vec<OllamaContentPart>),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum OllamaContentPart {
    Text { text: String },
    ImageUrl { image_url: OllamaImageUrl },
}

#[derive(Debug, Serialize)]
struct OllamaImageUrl {
    url: String,
}

#[derive(Debug, Serialize)]
struct OllamaTool {
    r#type: String,
    function: OllamaFunction,
}

#[derive(Debug, Serialize)]
struct OllamaFunction {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parameters: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum OllamaToolChoice {
    String(String),
    Object {
        r#type: String,
        function: OllamaToolChoiceFunction,
    },
}

#[derive(Debug, Serialize)]
struct OllamaToolChoiceFunction {
    name: String,
}

#[derive(Debug, Serialize)]
struct OllamaToolCallRequest {
    id: String,
    r#type: String,
    function: OllamaFunctionCall,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaFunctionCall {
    name: String,
    arguments: String,
}

// Response types

#[derive(Debug, Deserialize)]
struct OllamaResponse {
    #[allow(dead_code)]
    model: Option<String>,
    choices: Vec<OllamaChoice>,
    usage: Option<OllamaUsage>,
}

#[derive(Debug, Deserialize)]
struct OllamaChoice {
    message: OllamaResponseMessage,
    finish_reason: String,
}

#[derive(Debug, Deserialize)]
struct OllamaResponseMessage {
    content: Option<String>,
    tool_calls: Option<Vec<OllamaToolCallResponse>>,
}

#[derive(Debug, Deserialize)]
struct OllamaToolCallResponse {
    id: String,
    function: OllamaFunctionCall,
}

#[derive(Debug, Deserialize)]
struct OllamaUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    #[allow(dead_code)]
    total_tokens: u32,
}

// Streaming types

#[derive(Debug, Deserialize)]
struct OllamaStreamChunk {
    choices: Vec<OllamaStreamChoice>,
}

#[derive(Debug, Deserialize)]
struct OllamaStreamChoice {
    delta: OllamaStreamDelta,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaStreamDelta {
    content: Option<String>,
    tool_calls: Option<Vec<OllamaStreamToolCall>>,
}

#[derive(Debug, Deserialize)]
struct OllamaStreamToolCall {
    index: usize,
    id: Option<String>,
    function: Option<OllamaStreamFunction>,
}

#[derive(Debug, Deserialize)]
struct OllamaStreamFunction {
    name: Option<String>,
    arguments: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::FunctionDefinition;

    #[test]
    fn test_transform_simple_request() {
        let provider = OllamaProvider::new(None::<String>);
        let request = CreateResponseRequest::text("llama3.2", "Hello!");

        let ollama_request = provider.transform_request(&request);

        assert_eq!(ollama_request.model, "llama3.2");
        assert_eq!(ollama_request.messages.len(), 1);
        assert_eq!(ollama_request.messages[0].role, "user");
    }

    #[test]
    fn test_transform_request_with_instructions() {
        let provider = OllamaProvider::new(None::<String>);
        let request =
            CreateResponseRequest::text("llama3.2", "Hello!").with_instructions("You are helpful");

        let ollama_request = provider.transform_request(&request);

        assert_eq!(ollama_request.messages.len(), 2);
        assert_eq!(ollama_request.messages[0].role, "system");
        assert_eq!(ollama_request.messages[1].role, "user");
    }

    #[test]
    fn test_transform_request_with_tools() {
        let provider = OllamaProvider::new(None::<String>);
        let request = CreateResponseRequest::text("llama3.2", "Get weather").with_tools(vec![
            Tool::function(
                FunctionDefinition::new("get_weather").with_description("Get current weather"),
            ),
        ]);

        let ollama_request = provider.transform_request(&request);

        assert!(ollama_request.tools.is_some());
        let tools = ollama_request.tools.unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].function.name, "get_weather");
    }

    #[test]
    fn test_supports_model_permissive() {
        let provider = OllamaProvider::new(None::<String>);
        // Any non-empty model name should be supported
        assert!(provider.supports_model("llama3.2"));
        assert!(provider.supports_model("my-custom-fine-tune:latest"));
        assert!(provider.supports_model("gpt-4")); // Even "wrong" names accepted (user's local pull)
                                                   // Empty string should not be supported
        assert!(!provider.supports_model(""));
    }

    #[test]
    fn test_provider_name() {
        let provider = OllamaProvider::new(None::<String>);
        assert_eq!(provider.name(), "ollama");
    }

    #[test]
    fn test_default_base_url() {
        let provider = OllamaProvider::new(None::<String>);
        assert_eq!(provider.base_url, "http://localhost:11434");
    }

    #[test]
    fn test_custom_base_url() {
        let provider = OllamaProvider::new(Some("http://remote-ollama:11434"));
        assert_eq!(provider.base_url, "http://remote-ollama:11434");
    }

    #[test]
    fn test_transform_response_completed() {
        let provider = OllamaProvider::new(None::<String>);
        let raw = OllamaResponse {
            model: Some("llama3.2".to_string()),
            choices: vec![OllamaChoice {
                message: OllamaResponseMessage {
                    content: Some("Hello!".to_string()),
                    tool_calls: None,
                },
                finish_reason: "stop".to_string(),
            }],
            usage: Some(OllamaUsage {
                prompt_tokens: 8,
                completion_tokens: 4,
                total_tokens: 12,
            }),
        };

        let response = provider.transform_response(raw, "llama3.2");

        assert_eq!(response.status, aura_types::ResponseStatus::Completed);
        assert_eq!(response.output.len(), 1);
        assert!(response.id.starts_with("resp_oll_"));
    }

    #[test]
    fn test_transform_response_length() {
        let provider = OllamaProvider::new(None::<String>);
        let raw = OllamaResponse {
            model: Some("llama3.2".to_string()),
            choices: vec![OllamaChoice {
                message: OllamaResponseMessage {
                    content: Some("Truncated...".to_string()),
                    tool_calls: None,
                },
                finish_reason: "length".to_string(),
            }],
            usage: None,
        };

        let response = provider.transform_response(raw, "llama3.2");

        assert_eq!(response.status, aura_types::ResponseStatus::Incomplete);
        assert!(matches!(
            response.incomplete_reason,
            Some(IncompleteReason::MaxTokens)
        ));
    }
}
