//! Fireworks AI provider implementation.
//!
//! Fireworks exposes an OpenAI-compatible chat completions API (base
//! `https://api.fireworks.ai/inference/v1`), so this adapter mirrors the
//! Together provider: tool-call arguments may arrive as a JSON string or an
//! already-parsed JSON value, and both are normalized to the Open Responses
//! JSON-string representation. Fireworks frequently ships leading open-weight
//! models (GLM, Kimi, DeepSeek, Qwen, gpt-oss) on day zero — a second routing
//! target alongside Together. See issue #209.

use super::{EventStream, Provider, ProviderError};
use async_trait::async_trait;
use aura_types::{
    ContentPart, CreateResponseRequest, FunctionCallItem, IncompleteReason, InputContent,
    InputItem, Item, MessageItem, Response, ResponseError, Role, StreamEvent, Tool, ToolChoice,
    ToolChoiceAuto, Usage,
};
use futures_util::{Stream, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use tracing::{debug, error, instrument, warn};
use uuid;

const FIREWORKS_API_BASE: &str = "https://api.fireworks.ai/inference/v1";

// Curated chat-model subset from the Fireworks serverless catalog
// (https://fireworks.ai/models), captured 2026-06-28. Fireworks model IDs are
// namespaced as `accounts/fireworks/models/<slug>`. Keep in sync with
// CostCalculator pricing.
const SUPPORTED_MODELS: &[&str] = &[
    "accounts/fireworks/models/glm-5p2",
    "accounts/fireworks/models/kimi-k2p6",
    "accounts/fireworks/models/deepseek-v4-pro",
    "accounts/fireworks/models/qwen3p6-plus",
    "accounts/fireworks/models/gpt-oss-120b",
    "accounts/fireworks/models/gpt-oss-20b",
];

pub struct FireworksProvider {
    client: Client,
    api_key: String,
    base_url: String,
}

impl FireworksProvider {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: FIREWORKS_API_BASE.to_string(),
        }
    }

    pub fn with_base_url(api_key: impl Into<String>, base_url: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: base_url.into(),
        }
    }

    fn transform_request(&self, request: &CreateResponseRequest) -> FireworksRequest {
        let mut messages = Vec::new();

        if let Some(instructions) = &request.instructions {
            messages.push(FireworksMessage {
                role: "system".to_string(),
                content: Some(FireworksContent::Text(instructions.clone())),
                tool_call_id: None,
                tool_calls: None,
            });
        }

        // Batch consecutive FunctionCall items into one assistant message —
        // Fireworks' OpenAI-compatible endpoint requires parallel tool calls
        // in ONE assistant message's tool_calls array, not one per call.
        let mut pending_tool_calls: Vec<FireworksToolCallRequest> = Vec::new();
        let flush_pending =
            |messages: &mut Vec<FireworksMessage>, pending: &mut Vec<FireworksToolCallRequest>| {
                if !pending.is_empty() {
                    messages.push(FireworksMessage {
                        role: "assistant".to_string(),
                        content: None,
                        tool_call_id: None,
                        tool_calls: Some(std::mem::take(pending)),
                    });
                }
            };

        for item in &request.input {
            if !matches!(item, InputItem::FunctionCall { .. }) {
                flush_pending(&mut messages, &mut pending_tool_calls);
            }
            match item {
                InputItem::Message { role, content } => {
                    if *role == Role::System {
                        continue;
                    }

                    let fireworks_content = match content {
                        InputContent::Text(text) => FireworksContent::Text(text.clone()),
                        InputContent::Parts(parts) => {
                            let parts = parts
                                .iter()
                                .filter_map(|part| match part {
                                    ContentPart::Text { text } => {
                                        Some(FireworksContentPart::Text { text: text.clone() })
                                    }
                                    ContentPart::Image {
                                        url,
                                        data,
                                        media_type,
                                    } => {
                                        if let Some(url) = url {
                                            Some(FireworksContentPart::ImageUrl {
                                                image_url: FireworksImageUrl { url: url.clone() },
                                            })
                                        } else if let Some(data) = data {
                                            let media =
                                                media_type.as_deref().unwrap_or("image/png");
                                            Some(FireworksContentPart::ImageUrl {
                                                image_url: FireworksImageUrl {
                                                    url: format!("data:{};base64,{}", media, data),
                                                },
                                            })
                                        } else {
                                            Some(FireworksContentPart::Text {
                                                text: "[Invalid image]".to_string(),
                                            })
                                        }
                                    }
                                    ContentPart::Audio { media_type, .. } => {
                                        warn!(
                                            media_type = media_type.as_deref().unwrap_or("unknown"),
                                            "Dropping audio content part because Fireworks chat completions do not accept audio"
                                        );
                                        None
                                    }
                                })
                                .collect::<Vec<_>>();
                            if parts.is_empty() {
                                FireworksContent::Text(String::new())
                            } else {
                                FireworksContent::Parts(parts)
                            }
                        }
                    };

                    messages.push(FireworksMessage {
                        role: match role {
                            Role::User => "user".to_string(),
                            Role::Assistant => "assistant".to_string(),
                            Role::Tool => "tool".to_string(),
                            Role::System => {
                                unreachable!("System messages are filtered out earlier")
                            }
                        },
                        content: Some(fireworks_content),
                        tool_call_id: None,
                        tool_calls: None,
                    });
                }
                InputItem::FunctionCall {
                    call_id,
                    name,
                    arguments,
                } => {
                    pending_tool_calls.push(FireworksToolCallRequest {
                        id: call_id.clone(),
                        r#type: "function".to_string(),
                        function: FireworksFunctionCallRequest {
                            name: name.clone(),
                            arguments: arguments.clone(),
                        },
                    });
                }
                InputItem::FunctionCallOutput { call_id, output } => {
                    messages.push(FireworksMessage {
                        role: "tool".to_string(),
                        content: Some(FireworksContent::Text(output.clone())),
                        tool_call_id: Some(call_id.clone()),
                        tool_calls: None,
                    });
                }
            }
        }
        flush_pending(&mut messages, &mut pending_tool_calls);

        let tools = request.tools.as_ref().map(|tools| {
            tools
                .iter()
                .map(|tool| match tool {
                    Tool::Function { function } => FireworksTool {
                        r#type: "function".to_string(),
                        function: FireworksFunction {
                            name: function.name.clone(),
                            description: function.description.clone(),
                            parameters: function.parameters.clone(),
                        },
                    },
                })
                .collect()
        });

        let tool_choice = request.tool_choice.as_ref().map(|choice| match choice {
            ToolChoice::Auto(auto) => match auto {
                ToolChoiceAuto::Auto => FireworksToolChoice::String("auto".to_string()),
                ToolChoiceAuto::Required => FireworksToolChoice::String("required".to_string()),
                ToolChoiceAuto::None => FireworksToolChoice::String("none".to_string()),
            },
            ToolChoice::Function { function, .. } => FireworksToolChoice::Object {
                r#type: "function".to_string(),
                function: FireworksToolChoiceFunction {
                    name: function.name.clone(),
                },
            },
        });

        FireworksRequest {
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

    fn transform_response(&self, response: FireworksResponse, model: &str) -> Response {
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
                for (i, tool_call) in tool_calls.iter().enumerate() {
                    let call_id = tool_call
                        .id
                        .clone()
                        .unwrap_or_else(|| format!("call_{}", i));
                    output.push(Item::FunctionCall(FunctionCallItem::new(
                        format!("fc_{}", item_index + i),
                        call_id,
                        tool_call.function.name.clone(),
                        tool_call.function.arguments.normalized(),
                    )));
                }
            }
        }

        let (status, incomplete_reason, error) = match choice.map(|c| c.finish_reason.as_str()) {
            Some("stop") => (aura_types::ResponseStatus::Completed, None, None),
            Some("tool_calls") => (aura_types::ResponseStatus::Completed, None, None),
            Some("length") => (
                aura_types::ResponseStatus::Incomplete,
                Some(IncompleteReason::MaxTokens),
                None,
            ),
            Some(reason) => {
                warn!(reason = %reason, "Unknown finish reason from Fireworks");
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
            .map(|usage| Usage::new(usage.prompt_tokens, usage.completion_tokens));

        let mut builder = Response::builder(format!("resp_fw_{}", response.id), model)
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

    fn parse_error_response(&self, status: u16, body: &str) -> ProviderError {
        #[derive(Deserialize)]
        struct FireworksErrorEnvelope {
            error: Option<FireworksErrorBody>,
            message: Option<String>,
        }

        #[derive(Deserialize)]
        struct FireworksErrorBody {
            message: Option<String>,
            #[serde(rename = "type")]
            error_type: Option<String>,
        }

        let (message, error_type) =
            if let Ok(envelope) = serde_json::from_str::<FireworksErrorEnvelope>(body) {
                match envelope.error {
                    Some(error) => (
                        error.message.unwrap_or_else(|| format!("HTTP {}", status)),
                        error.error_type,
                    ),
                    None => (
                        envelope
                            .message
                            .unwrap_or_else(|| format!("HTTP {}", status)),
                        None,
                    ),
                }
            } else {
                (body.to_string(), None)
            };

        match status {
            400 | 422 => ProviderError::invalid_request(message),
            401 | 403 => ProviderError::authentication(message),
            404 => {
                if message.to_lowercase().contains("model") {
                    ProviderError::model_not_found(message)
                } else {
                    ProviderError::from_provider(status, message)
                }
            }
            429 => ProviderError::rate_limit(message),
            500 => ProviderError::from_provider(status, message),
            502..=504 => ProviderError::service_unavailable(message),
            _ => ProviderError::ProviderError {
                status_code: status,
                message,
                error_type,
            },
        }
    }
}

#[async_trait]
impl Provider for FireworksProvider {
    fn name(&self) -> &str {
        "fireworks"
    }

    fn models(&self) -> &[&str] {
        SUPPORTED_MODELS
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete(&self, request: CreateResponseRequest) -> Result<Response, ProviderError> {
        let model = request.model.clone();
        let fireworks_request = self.transform_request(&request);

        debug!(model = %model, "Sending request to Fireworks");

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&fireworks_request)
            .send()
            .await?;

        let status = response.status().as_u16();
        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Fireworks API error");
            return Err(self.parse_error_response(status, &body));
        }

        let fireworks_response: FireworksResponse = response.json().await?;
        debug!(id = %fireworks_response.id, "Received response from Fireworks");

        Ok(self.transform_response(fireworks_response, &model))
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete_stream(
        &self,
        request: CreateResponseRequest,
    ) -> Result<EventStream, ProviderError> {
        let model = request.model.clone();
        let mut fireworks_request = self.transform_request(&request);
        fireworks_request.stream = Some(true);

        debug!(model = %model, "Starting streaming request to Fireworks");

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&fireworks_request)
            .send()
            .await?;

        let status = response.status().as_u16();
        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Fireworks API error");
            return Err(self.parse_error_response(status, &body));
        }

        let stream = response.bytes_stream();
        let transformer = FireworksStreamTransformer::new(model);

        Ok(Box::pin(transformer.transform(stream)))
    }
}

/// Transforms Fireworks' OpenAI-compatible SSE stream to Open Responses events.
struct FireworksStreamTransformer {
    model: String,
    response_id: String,
    buffer: String,
    accumulated_text: String,
    accumulated_tool_calls: HashMap<usize, PartialToolCall>,
    accumulated_usage: Option<aura_types::Usage>,
    pending_events: VecDeque<StreamEvent>,
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

impl FireworksStreamTransformer {
    fn new(model: String) -> Self {
        Self {
            model,
            response_id: format!("resp_fw_{}", uuid::Uuid::new_v4()),
            buffer: String::new(),
            accumulated_text: String::new(),
            accumulated_tool_calls: HashMap::new(),
            accumulated_usage: None,
            pending_events: VecDeque::new(),
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

                    if let Some(event) = transformer.pending_events.pop_front() {
                        return Some((Ok(event), (transformer, stream)));
                    }

                    if let Some(line_end) = transformer.buffer.find('\n') {
                        let line = transformer.buffer[..line_end].trim().to_string();
                        transformer.buffer = transformer.buffer[line_end + 1..].to_string();

                        if line.is_empty() {
                            continue;
                        }

                        if line == "data: [DONE]" {
                            if !transformer.accumulated_text.is_empty() {
                                transformer.pending_events.push_back(
                                    StreamEvent::output_text_done(
                                        0,
                                        0,
                                        transformer.accumulated_text.clone(),
                                    ),
                                );
                            }

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

                            let mut builder = Response::builder(
                                transformer.response_id.clone(),
                                transformer.model.clone(),
                            )
                            .outputs(output)
                            .completed();

                            if let Some(usage) = transformer.accumulated_usage.clone() {
                                builder = builder.usage(usage);
                            }

                            let response = builder.build();

                            transformer
                                .pending_events
                                .push_back(StreamEvent::response_completed(response));

                            if let Some(event) = transformer.pending_events.pop_front() {
                                return Some((Ok(event), (transformer, stream)));
                            }
                        }

                        if let Some(data) = line.strip_prefix("data: ") {
                            match serde_json::from_str::<FireworksStreamChunk>(data) {
                                Ok(chunk) => {
                                    if let Some(usage) = chunk.usage {
                                        transformer.accumulated_usage = Some(aura_types::Usage {
                                            input_tokens: usage.prompt_tokens,
                                            output_tokens: usage.completion_tokens,
                                            total_tokens: usage.total_tokens,
                                            cached_tokens: None,
                                            reasoning_tokens: None,
                                            cost_usd: None,
                                        });
                                    }

                                    if let Some(choice) = chunk.choices.first() {
                                        if let Some(content) = &choice.delta.content {
                                            if !transformer.output_item_added {
                                                transformer.output_item_added = true;
                                                let item = Item::Message(MessageItem::assistant(
                                                    "msg_0", "",
                                                ));
                                                transformer.pending_events.push_back(
                                                    StreamEvent::output_item_added(0, item),
                                                );
                                            }

                                            if !transformer.content_part_added {
                                                transformer.content_part_added = true;
                                                transformer.pending_events.push_back(
                                                    StreamEvent::content_part_added(0, 0, "text"),
                                                );
                                            }

                                            transformer.accumulated_text.push_str(content);
                                            transformer.pending_events.push_back(
                                                StreamEvent::output_text_delta(
                                                    0,
                                                    0,
                                                    content.clone(),
                                                ),
                                            );

                                            if let Some(event) =
                                                transformer.pending_events.pop_front()
                                            {
                                                return Some((Ok(event), (transformer, stream)));
                                            }
                                        }

                                        if let Some(tool_calls) = &choice.delta.tool_calls {
                                            for tool_call in tool_calls {
                                                let entry = transformer
                                                    .accumulated_tool_calls
                                                    .entry(tool_call.index)
                                                    .or_default();

                                                if let Some(id) = &tool_call.id {
                                                    entry.id = id.clone();
                                                }
                                                if let Some(function) = &tool_call.function {
                                                    if let Some(name) = &function.name {
                                                        entry.name = name.clone();
                                                    }
                                                    if let Some(arguments) = &function.arguments {
                                                        entry.arguments.push_str(arguments);
                                                        transformer.pending_events.push_back(
                                                            StreamEvent::function_call_arguments_delta(
                                                                tool_call.index,
                                                                arguments.clone(),
                                                            ),
                                                        );

                                                        if let Some(event) =
                                                            transformer.pending_events.pop_front()
                                                        {
                                                            return Some((
                                                                Ok(event),
                                                                (transformer, stream),
                                                            ));
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                Err(error) => {
                                    warn!(
                                        error = %error,
                                        data = %data,
                                        "Failed to parse Fireworks stream chunk"
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
                        Some(Err(error)) => {
                            return Some((
                                Err(ProviderError::stream_error(error.to_string())),
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

#[derive(Debug, Serialize)]
struct FireworksRequest {
    model: String,
    messages: Vec<FireworksMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<FireworksTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<FireworksToolChoice>,
}

#[derive(Debug, Serialize)]
struct FireworksMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<FireworksContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    /// Parallel tool calls go in one array on one assistant message
    /// (OpenAI-compatible), not one message per call.
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<FireworksToolCallRequest>>,
}

#[derive(Debug, Serialize)]
struct FireworksToolCallRequest {
    id: String,
    #[serde(rename = "type")]
    r#type: String,
    function: FireworksFunctionCallRequest,
}

#[derive(Debug, Serialize)]
struct FireworksFunctionCallRequest {
    name: String,
    /// JSON-encoded string, matching OpenAI's
    /// `tool_calls[].function.arguments` shape.
    arguments: String,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum FireworksContent {
    Text(String),
    Parts(Vec<FireworksContentPart>),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum FireworksContentPart {
    Text { text: String },
    ImageUrl { image_url: FireworksImageUrl },
}

#[derive(Debug, Serialize)]
struct FireworksImageUrl {
    url: String,
}

#[derive(Debug, Serialize)]
struct FireworksTool {
    r#type: String,
    function: FireworksFunction,
}

#[derive(Debug, Serialize)]
struct FireworksFunction {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parameters: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum FireworksToolChoice {
    String(String),
    Object {
        r#type: String,
        function: FireworksToolChoiceFunction,
    },
}

#[derive(Debug, Serialize)]
struct FireworksToolChoiceFunction {
    name: String,
}

#[derive(Debug, Deserialize)]
struct FireworksResponse {
    id: String,
    created: i64,
    #[allow(dead_code)]
    model: String,
    choices: Vec<FireworksChoice>,
    usage: Option<FireworksUsage>,
}

#[derive(Debug, Deserialize)]
struct FireworksChoice {
    message: FireworksResponseMessage,
    finish_reason: String,
}

#[derive(Debug, Deserialize)]
struct FireworksResponseMessage {
    content: Option<String>,
    tool_calls: Option<Vec<FireworksToolCallResponse>>,
}

#[derive(Debug, Deserialize)]
struct FireworksToolCallResponse {
    id: Option<String>,
    function: FireworksFunctionCallResponse,
}

#[derive(Debug, Deserialize)]
struct FireworksFunctionCallResponse {
    name: String,
    arguments: FireworksArguments,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum FireworksArguments {
    String(String),
    Json(serde_json::Value),
}

impl FireworksArguments {
    fn normalized(&self) -> String {
        match self {
            Self::String(value) => value.clone(),
            Self::Json(value) => serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string()),
        }
    }
}

#[derive(Debug, Deserialize)]
struct FireworksUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

// Streaming types

#[derive(Debug, Deserialize)]
struct FireworksStreamChunk {
    #[allow(dead_code)]
    id: String,
    choices: Vec<FireworksStreamChoice>,
    #[allow(dead_code)]
    usage: Option<FireworksUsage>,
}

#[derive(Debug, Deserialize)]
struct FireworksStreamChoice {
    delta: FireworksStreamDelta,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FireworksStreamDelta {
    content: Option<String>,
    tool_calls: Option<Vec<FireworksStreamToolCall>>,
}

#[derive(Debug, Deserialize)]
struct FireworksStreamToolCall {
    index: usize,
    id: Option<String>,
    function: Option<FireworksStreamFunction>,
}

#[derive(Debug, Deserialize)]
struct FireworksStreamFunction {
    name: Option<String>,
    arguments: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::FunctionDefinition;
    use serde_json::json;

    const MODEL: &str = "accounts/fireworks/models/glm-5p2";

    #[test]
    fn test_transform_simple_request() {
        let provider = FireworksProvider::new("test-key");
        let request = CreateResponseRequest::text(MODEL, "Hello!");

        let fireworks_request = provider.transform_request(&request);

        assert_eq!(fireworks_request.model, MODEL);
        assert_eq!(fireworks_request.messages.len(), 1);
        assert_eq!(fireworks_request.messages[0].role, "user");
    }

    #[test]
    fn test_transform_request_with_instructions() {
        let provider = FireworksProvider::new("test-key");
        let request = CreateResponseRequest::text(MODEL, "Hello!").with_instructions("Be helpful");

        let fireworks_request = provider.transform_request(&request);

        assert_eq!(fireworks_request.messages.len(), 2);
        assert_eq!(fireworks_request.messages[0].role, "system");
        assert_eq!(fireworks_request.messages[1].role, "user");
    }

    #[test]
    fn test_transform_request_with_tools() {
        let provider = FireworksProvider::new("test-key");
        let request =
            CreateResponseRequest::text(MODEL, "Get weather").with_tools(vec![Tool::function(
                FunctionDefinition::new("get_weather").with_description("Get current weather"),
            )]);

        let fireworks_request = provider.transform_request(&request);

        let tools = fireworks_request.tools.expect("tools should be present");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].function.name, "get_weather");
    }

    #[test]
    fn test_transform_response_with_string_tool_arguments() {
        let provider = FireworksProvider::new("test-key");
        let raw = FireworksResponse {
            id: "abc123".to_string(),
            created: 1_700_000_000,
            model: MODEL.to_string(),
            choices: vec![FireworksChoice {
                message: FireworksResponseMessage {
                    content: None,
                    tool_calls: Some(vec![FireworksToolCallResponse {
                        id: Some("call_123".to_string()),
                        function: FireworksFunctionCallResponse {
                            name: "get_weather".to_string(),
                            arguments: FireworksArguments::String(r#"{"city":"SF"}"#.to_string()),
                        },
                    }]),
                },
                finish_reason: "tool_calls".to_string(),
            }],
            usage: None,
        };

        let response = provider.transform_response(raw, MODEL);

        match &response.output[0] {
            Item::FunctionCall(call) => {
                assert_eq!(call.call_id, "call_123");
                assert_eq!(call.name, "get_weather");
                assert_eq!(call.arguments, r#"{"city":"SF"}"#);
            }
            item => panic!("expected function call, got {:?}", item),
        }
    }

    #[test]
    fn test_transform_response_with_object_tool_arguments() {
        let provider = FireworksProvider::new("test-key");
        let raw = FireworksResponse {
            id: "abc456".to_string(),
            created: 1_700_000_001,
            model: MODEL.to_string(),
            choices: vec![FireworksChoice {
                message: FireworksResponseMessage {
                    content: None,
                    tool_calls: Some(vec![FireworksToolCallResponse {
                        id: Some("call_456".to_string()),
                        function: FireworksFunctionCallResponse {
                            name: "search_docs".to_string(),
                            arguments: FireworksArguments::Json(json!({
                                "query": "pricing",
                                "limit": 3
                            })),
                        },
                    }]),
                },
                finish_reason: "tool_calls".to_string(),
            }],
            usage: Some(FireworksUsage {
                prompt_tokens: 10,
                completion_tokens: 2,
                total_tokens: 12,
            }),
        };

        let response = provider.transform_response(raw, MODEL);

        match &response.output[0] {
            Item::FunctionCall(call) => {
                assert_eq!(call.call_id, "call_456");
                assert_eq!(call.arguments, r#"{"limit":3,"query":"pricing"}"#);
            }
            item => panic!("expected function call, got {:?}", item),
        }
        assert!(response.usage.is_some());
    }

    #[test]
    fn test_supports_model() {
        let provider = FireworksProvider::new("test-key");
        assert!(provider.supports_model("accounts/fireworks/models/glm-5p2"));
        assert!(provider.supports_model("accounts/fireworks/models/kimi-k2p6"));
        assert!(!provider.supports_model("gpt-4o"));
    }

    #[test]
    fn test_supported_models_have_cost_pricing() {
        let provider = FireworksProvider::new("test-key");
        let calculator = crate::CostCalculator::new();

        for model in provider.models() {
            assert!(
                calculator.get_pricing(model).is_some(),
                "Fireworks model {model} should have CostCalculator pricing",
            );
        }
    }

    #[test]
    fn test_error_code_mapping() {
        let provider = FireworksProvider::new("test-key");

        let err = provider.parse_error_response(
            401,
            r#"{"error":{"message":"Invalid API key","type":"auth_error"}}"#,
        );
        assert!(matches!(err, ProviderError::Authentication { .. }));

        let err = provider.parse_error_response(
            429,
            r#"{"error":{"message":"Rate limit exceeded","type":"rate_limit"}}"#,
        );
        assert!(matches!(err, ProviderError::RateLimit { .. }));
    }

    #[tokio::test]
    async fn test_stream_transform_preserves_first_text_delta() {
        let stream = futures_util::stream::iter(vec![
            Ok(bytes::Bytes::from(
                r#"data: {"id":"chunk_1","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}"#,
            )),
            Ok(bytes::Bytes::from("\n\n")),
            Ok(bytes::Bytes::from("data: [DONE]\n\n")),
        ]);

        let events = FireworksStreamTransformer::new(MODEL.to_string())
            .transform(stream)
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<Vec<_>, _>>()
            .expect("stream should parse");

        assert!(matches!(events[0], StreamEvent::ResponseCreated { .. }));
        assert!(matches!(events[1], StreamEvent::ResponseInProgress { .. }));
        assert!(matches!(events[2], StreamEvent::OutputItemAdded { .. }));
        assert!(matches!(events[3], StreamEvent::ContentPartAdded { .. }));

        match &events[4] {
            StreamEvent::OutputTextDelta { delta, .. } => assert_eq!(delta, "Hello"),
            event => panic!("expected text delta, got {:?}", event),
        }

        match &events[5] {
            StreamEvent::OutputTextDone { text, .. } => assert_eq!(text, "Hello"),
            event => panic!("expected text done, got {:?}", event),
        }

        match &events[6] {
            StreamEvent::ResponseCompleted { response } => {
                assert_eq!(response.output.len(), 1);
                assert_eq!(
                    response.output[0]
                        .as_message()
                        .expect("message output")
                        .text(),
                    "Hello"
                );
            }
            event => panic!("expected completed response, got {:?}", event),
        }
    }

    #[test]
    fn test_consecutive_function_calls_batch_into_one_assistant_message() {
        let provider = FireworksProvider::new("test-key");
        let mut request = CreateResponseRequest::text(MODEL, "weather in two cities?");
        request.input.extend(vec![
            InputItem::FunctionCall {
                call_id: "call_a".into(),
                name: "get_weather".into(),
                arguments: r#"{"city":"Paris"}"#.into(),
            },
            InputItem::FunctionCall {
                call_id: "call_b".into(),
                name: "get_weather".into(),
                arguments: r#"{"city":"Tokyo"}"#.into(),
            },
            InputItem::FunctionCallOutput {
                call_id: "call_a".into(),
                output: r#"{"temp":15}"#.into(),
            },
            InputItem::FunctionCallOutput {
                call_id: "call_b".into(),
                output: r#"{"temp":22}"#.into(),
            },
        ]);

        let fireworks = provider.transform_request(&request);

        // [user, assistant(tool_calls=[a, b]), tool(a), tool(b)]
        assert_eq!(
            fireworks.messages.len(),
            4,
            "messages = {:#?}",
            fireworks.messages
        );
        assert_eq!(fireworks.messages[1].role, "assistant");
        let tool_calls = fireworks.messages[1]
            .tool_calls
            .as_ref()
            .expect("assistant message should carry tool_calls");
        assert_eq!(tool_calls.len(), 2);
        assert_eq!(tool_calls[0].id, "call_a");
        assert_eq!(tool_calls[1].id, "call_b");
    }
}
