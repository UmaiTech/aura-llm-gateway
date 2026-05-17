//! HuggingFace Text Generation Inference (TGI) provider implementation
//!
//! Communicates with a [Text Generation Inference](https://github.com/huggingface/text-generation-inference)
//! endpoint via its OpenAI-compatible `/v1/chat/completions` API.
//!
//! ## Scope
//!
//! This adapter supports **TGI-compatible Inference Endpoints** only.
//! HuggingFace's classic Serverless Inference API (`api-inference.huggingface.co/models/{model}`)
//! uses a different request/response schema and is tracked in a follow-up issue.
//!
//! ## Constructor
//!
//! `new(api_key, endpoint_url)` — TGI endpoints are per-deployment; there is no
//! single default URL. The `endpoint_url` should be the base URL of the TGI endpoint,
//! e.g. `https://abc123.us-east-1.aws.endpoints.huggingface.cloud`.
//!
//! ## Model support
//!
//! Each TGI endpoint serves a single model. Rather than maintain a static list,
//! `supports_model()` returns `true` for any non-empty model name, reflecting
//! the deployment-specific nature of TGI endpoints.
//!
//! ## Tool calling
//!
//! TGI supports function calling for models that have been fine-tuned for it
//! (e.g. Mistral-Instruct, Llama-Instruct). This adapter implements the wire
//! format; the underlying model determines whether calls actually work.
//!
//! ## Pricing
//!
//! HuggingFace Inference Endpoints are billed per **compute-hour** of the
//! underlying instance, not per token. The per-token placeholder in `cost.rs`
//! ($0.50 in / $1.50 out per 1M tokens) is an approximation for a medium-tier
//! instance; actual costs depend on instance type and usage. See:
//! <https://huggingface.co/pricing#endpoints>

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

/// HuggingFace TGI provider
pub struct HuggingFaceProvider {
    client: Client,
    api_key: String,
    endpoint_url: String,
}

impl HuggingFaceProvider {
    /// Create a new HuggingFace TGI provider.
    ///
    /// # Arguments
    ///
    /// * `api_key` — HuggingFace user access token (`hf_...`)
    /// * `endpoint_url` — Base URL of the TGI endpoint, e.g.
    ///   `https://abc123.us-east-1.aws.endpoints.huggingface.cloud`
    pub fn new(api_key: impl Into<String>, endpoint_url: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            endpoint_url: endpoint_url.into(),
        }
    }

    /// Transform Open Responses request to TGI (OpenAI-compatible) format
    fn transform_request(&self, request: &CreateResponseRequest) -> HfRequest {
        let mut messages = Vec::new();

        // Add system message from instructions if present
        if let Some(instructions) = &request.instructions {
            messages.push(HfMessage {
                role: "system".to_string(),
                content: Some(HfContent::Text(instructions.clone())),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        for item in &request.input {
            match item {
                InputItem::Message { role, content } => {
                    if *role == Role::System {
                        // Already handled via instructions; skip to avoid duplication
                        continue;
                    }

                    let hf_content = match content {
                        InputContent::Text(text) => HfContent::Text(text.clone()),
                        InputContent::Parts(parts) => {
                            let hf_parts: Vec<HfContentPart> = parts
                                .iter()
                                .map(|p| match p {
                                    ContentPart::Text { text } => {
                                        HfContentPart::Text { text: text.clone() }
                                    }
                                    ContentPart::Image {
                                        url,
                                        data,
                                        media_type,
                                    } => {
                                        if let Some(url) = url {
                                            HfContentPart::ImageUrl {
                                                image_url: HfImageUrl { url: url.clone() },
                                            }
                                        } else if let Some(data) = data {
                                            let media =
                                                media_type.as_deref().unwrap_or("image/png");
                                            HfContentPart::ImageUrl {
                                                image_url: HfImageUrl {
                                                    url: format!("data:{};base64,{}", media, data),
                                                },
                                            }
                                        } else {
                                            HfContentPart::Text {
                                                text: "[Invalid image]".to_string(),
                                            }
                                        }
                                    }
                                    ContentPart::Audio { data, media_type } => {
                                        HfContentPart::Text {
                                            text: format!(
                                                "[Audio: {} bytes, type: {}]",
                                                data.len(),
                                                media_type.as_deref().unwrap_or("audio/mp3")
                                            ),
                                        }
                                    }
                                })
                                .collect();
                            HfContent::Parts(hf_parts)
                        }
                    };

                    messages.push(HfMessage {
                        role: match role {
                            Role::User => "user".to_string(),
                            Role::Assistant => "assistant".to_string(),
                            Role::System => "system".to_string(),
                            Role::Tool => "tool".to_string(),
                        },
                        content: Some(hf_content),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
                InputItem::FunctionCallOutput { call_id, output } => {
                    messages.push(HfMessage {
                        role: "tool".to_string(),
                        content: Some(HfContent::Text(output.clone())),
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
                    Tool::Function { function } => HfTool {
                        r#type: "function".to_string(),
                        function: HfFunction {
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
                ToolChoiceAuto::Auto => HfToolChoice::String("auto".to_string()),
                ToolChoiceAuto::Required => HfToolChoice::String("required".to_string()),
                ToolChoiceAuto::None => HfToolChoice::String("none".to_string()),
            },
            ToolChoice::Function { function, .. } => HfToolChoice::Object {
                r#type: "function".to_string(),
                function: HfToolChoiceFunction {
                    name: function.name.clone(),
                },
            },
        });

        HfRequest {
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

    /// Transform TGI response to Open Responses format
    fn transform_response(&self, response: HfResponse, model: &str) -> Response {
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
            Some("stop") | Some("eos_token") => (aura_types::ResponseStatus::Completed, None, None),
            Some("length") => (
                aura_types::ResponseStatus::Incomplete,
                Some(IncompleteReason::MaxTokens),
                None,
            ),
            Some("tool_calls") => (aura_types::ResponseStatus::Completed, None, None),
            Some(reason) => {
                warn!(reason = %reason, "Unknown finish reason from HuggingFace TGI");
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

        // TGI does not return a persistent response ID; generate a UUID
        let response_id = format!("resp_hf_{}", uuid::Uuid::new_v4());

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

    /// Parse TGI error responses
    fn parse_error_response(&self, status: u16, body: &str) -> ProviderError {
        #[derive(Deserialize)]
        struct HfError {
            error: Option<String>,
            message: Option<String>,
        }

        if let Ok(err) = serde_json::from_str::<HfError>(body) {
            let message = err
                .error
                .or(err.message)
                .unwrap_or_else(|| format!("HTTP {}", status));

            match status {
                400 => ProviderError::invalid_request(message),
                401 => ProviderError::authentication(message),
                403 => ProviderError::authentication(message),
                404 => ProviderError::model_not_found(&message),
                422 => ProviderError::invalid_request(message),
                429 => ProviderError::rate_limit(message),
                500 | 503 => ProviderError::service_unavailable(message),
                502 | 504 => ProviderError::service_unavailable(message),
                _ => ProviderError::from_provider(status, message),
            }
        } else {
            ProviderError::from_provider(status, body.to_string())
        }
    }

    /// Compute the chat completions URL for this endpoint
    fn chat_url(&self) -> String {
        // Trim any trailing slash to avoid double-slashes
        let base = self.endpoint_url.trim_end_matches('/');
        format!("{}/v1/chat/completions", base)
    }
}

#[async_trait]
impl Provider for HuggingFaceProvider {
    fn name(&self) -> &str {
        "huggingface"
    }

    /// Returns an empty slice — TGI endpoints serve a single model that the user
    /// knows at deployment time. All non-empty model names are accepted.
    fn models(&self) -> &[&str] {
        &[]
    }

    /// Accept any non-empty model name — the model is deployment-specific.
    fn supports_model(&self, model: &str) -> bool {
        !model.is_empty()
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete(&self, request: CreateResponseRequest) -> Result<Response, ProviderError> {
        let model = request.model.clone();
        let hf_request = self.transform_request(&request);

        debug!(model = %model, endpoint = %self.endpoint_url, "Sending request to HuggingFace TGI");

        let response = self
            .client
            .post(self.chat_url())
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&hf_request)
            .send()
            .await?;

        let status = response.status().as_u16();

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "HuggingFace TGI API error");
            return Err(self.parse_error_response(status, &body));
        }

        let hf_response: HfResponse = response.json().await?;
        debug!("Received response from HuggingFace TGI");

        Ok(self.transform_response(hf_response, &model))
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete_stream(
        &self,
        request: CreateResponseRequest,
    ) -> Result<EventStream, ProviderError> {
        let model = request.model.clone();
        let mut hf_request = self.transform_request(&request);
        hf_request.stream = Some(true);

        debug!(model = %model, endpoint = %self.endpoint_url, "Starting streaming request to HuggingFace TGI");

        let response = self
            .client
            .post(self.chat_url())
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&hf_request)
            .send()
            .await?;

        let status = response.status().as_u16();

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "HuggingFace TGI API error");
            return Err(self.parse_error_response(status, &body));
        }

        let stream = response.bytes_stream();
        let transformer = HfStreamTransformer::new(model);

        Ok(Box::pin(transformer.transform(stream)))
    }
}

/// Transforms TGI SSE stream (OpenAI-compatible) to Open Responses events
struct HfStreamTransformer {
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

impl HfStreamTransformer {
    fn new(model: String) -> Self {
        Self {
            model,
            response_id: format!("resp_hf_{}", uuid::Uuid::new_v4()),
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
                            match serde_json::from_str::<HfStreamChunk>(data) {
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
                                        "Failed to parse HuggingFace TGI stream chunk"
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

// HuggingFace TGI wire types (OpenAI-compatible)

#[derive(Debug, Serialize)]
struct HfRequest {
    model: String,
    messages: Vec<HfMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<HfTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<HfToolChoice>,
}

#[derive(Debug, Serialize)]
struct HfMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<HfContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<HfToolCallRequest>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum HfContent {
    Text(String),
    Parts(Vec<HfContentPart>),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum HfContentPart {
    Text { text: String },
    ImageUrl { image_url: HfImageUrl },
}

#[derive(Debug, Serialize)]
struct HfImageUrl {
    url: String,
}

#[derive(Debug, Serialize)]
struct HfTool {
    r#type: String,
    function: HfFunction,
}

#[derive(Debug, Serialize)]
struct HfFunction {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parameters: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum HfToolChoice {
    String(String),
    Object {
        r#type: String,
        function: HfToolChoiceFunction,
    },
}

#[derive(Debug, Serialize)]
struct HfToolChoiceFunction {
    name: String,
}

#[derive(Debug, Serialize)]
struct HfToolCallRequest {
    id: String,
    r#type: String,
    function: HfFunctionCall,
}

#[derive(Debug, Serialize, Deserialize)]
struct HfFunctionCall {
    name: String,
    arguments: String,
}

// Response types

#[derive(Debug, Deserialize)]
struct HfResponse {
    choices: Vec<HfChoice>,
    usage: Option<HfUsage>,
}

#[derive(Debug, Deserialize)]
struct HfChoice {
    message: HfResponseMessage,
    finish_reason: String,
}

#[derive(Debug, Deserialize)]
struct HfResponseMessage {
    content: Option<String>,
    tool_calls: Option<Vec<HfToolCallResponse>>,
}

#[derive(Debug, Deserialize)]
struct HfToolCallResponse {
    id: String,
    function: HfFunctionCall,
}

#[derive(Debug, Deserialize)]
struct HfUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    #[allow(dead_code)]
    total_tokens: u32,
}

// Streaming types

#[derive(Debug, Deserialize)]
struct HfStreamChunk {
    choices: Vec<HfStreamChoice>,
}

#[derive(Debug, Deserialize)]
struct HfStreamChoice {
    delta: HfStreamDelta,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HfStreamDelta {
    content: Option<String>,
    tool_calls: Option<Vec<HfStreamToolCall>>,
}

#[derive(Debug, Deserialize)]
struct HfStreamToolCall {
    index: usize,
    id: Option<String>,
    function: Option<HfStreamFunction>,
}

#[derive(Debug, Deserialize)]
struct HfStreamFunction {
    name: Option<String>,
    arguments: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::FunctionDefinition;

    fn make_provider() -> HuggingFaceProvider {
        HuggingFaceProvider::new("hf_test_token", "https://test.endpoints.huggingface.cloud")
    }

    #[test]
    fn test_chat_url() {
        let provider = make_provider();
        assert_eq!(
            provider.chat_url(),
            "https://test.endpoints.huggingface.cloud/v1/chat/completions"
        );
    }

    #[test]
    fn test_chat_url_trailing_slash() {
        let provider =
            HuggingFaceProvider::new("hf_test", "https://test.endpoints.huggingface.cloud/");
        assert_eq!(
            provider.chat_url(),
            "https://test.endpoints.huggingface.cloud/v1/chat/completions"
        );
    }

    #[test]
    fn test_transform_simple_request() {
        let provider = make_provider();
        let request = CreateResponseRequest::text("meta-llama/Meta-Llama-3-70B-Instruct", "Hello!");

        let hf_request = provider.transform_request(&request);

        assert_eq!(hf_request.model, "meta-llama/Meta-Llama-3-70B-Instruct");
        assert_eq!(hf_request.messages.len(), 1);
        assert_eq!(hf_request.messages[0].role, "user");
    }

    #[test]
    fn test_transform_request_with_instructions() {
        let provider = make_provider();
        let request = CreateResponseRequest::text("mistral-7b", "Hello!")
            .with_instructions("You are a coding assistant");

        let hf_request = provider.transform_request(&request);

        assert_eq!(hf_request.messages.len(), 2);
        assert_eq!(hf_request.messages[0].role, "system");
        assert_eq!(hf_request.messages[1].role, "user");
    }

    #[test]
    fn test_transform_request_with_tools() {
        let provider = make_provider();
        let request =
            CreateResponseRequest::text("mistral-7b", "Search something").with_tools(vec![
                Tool::function(
                    FunctionDefinition::new("web_search").with_description("Search the web"),
                ),
            ]);

        let hf_request = provider.transform_request(&request);

        assert!(hf_request.tools.is_some());
        let tools = hf_request.tools.unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].function.name, "web_search");
    }

    #[test]
    fn test_supports_model_permissive() {
        let provider = make_provider();
        assert!(provider.supports_model("meta-llama/Meta-Llama-3-70B-Instruct"));
        assert!(provider.supports_model("mistral-7b-instruct"));
        assert!(provider.supports_model("any-arbitrary-model-name"));
        assert!(!provider.supports_model(""));
    }

    #[test]
    fn test_provider_name() {
        let provider = make_provider();
        assert_eq!(provider.name(), "huggingface");
    }

    #[test]
    fn test_models_empty() {
        let provider = make_provider();
        assert!(provider.models().is_empty());
    }

    #[test]
    fn test_transform_response_completed() {
        let provider = make_provider();
        let raw = HfResponse {
            choices: vec![HfChoice {
                message: HfResponseMessage {
                    content: Some("Hello from TGI!".to_string()),
                    tool_calls: None,
                },
                finish_reason: "stop".to_string(),
            }],
            usage: Some(HfUsage {
                prompt_tokens: 15,
                completion_tokens: 7,
                total_tokens: 22,
            }),
        };

        let response = provider.transform_response(raw, "mistral-7b");

        assert_eq!(response.status, aura_types::ResponseStatus::Completed);
        assert_eq!(response.output.len(), 1);
        assert!(response.id.starts_with("resp_hf_"));
    }

    #[test]
    fn test_transform_response_eos_token() {
        // TGI may return "eos_token" as the finish reason
        let provider = make_provider();
        let raw = HfResponse {
            choices: vec![HfChoice {
                message: HfResponseMessage {
                    content: Some("Done.".to_string()),
                    tool_calls: None,
                },
                finish_reason: "eos_token".to_string(),
            }],
            usage: None,
        };

        let response = provider.transform_response(raw, "mistral-7b");

        assert_eq!(response.status, aura_types::ResponseStatus::Completed);
    }

    #[test]
    fn test_error_mapping() {
        let provider = make_provider();

        let err = provider.parse_error_response(401, r#"{"error":"Unauthorized"}"#);
        assert!(matches!(err, ProviderError::Authentication { .. }));

        let err = provider.parse_error_response(429, r#"{"error":"Too Many Requests"}"#);
        assert!(matches!(err, ProviderError::RateLimit { .. }));

        let err = provider.parse_error_response(503, r#"{"error":"Service Unavailable"}"#);
        assert!(matches!(err, ProviderError::ServiceUnavailable { .. }));
    }
}
