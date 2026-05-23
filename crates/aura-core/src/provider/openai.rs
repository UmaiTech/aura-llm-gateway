//! OpenAI provider implementation
//!
//! Transforms between Open Responses API format and OpenAI's Chat Completions API.

use async_trait::async_trait;
use aura_types::{
    ContentPart, CreateResponseRequest, FunctionCallItem, IncompleteReason, InputContent,
    InputItem, Item, LogprobsData, MessageItem, Response, ResponseError, Role, StreamEvent,
    TokenLogprob, Tool, ToolChoice, ToolChoiceAuto, TopLogprob, Usage, ValidationMetadata,
    ValidationStrategy,
};
use futures_util::{Stream, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, instrument, warn};

use super::{EventStream, Provider, ProviderError};

/// OpenAI API base URL
const OPENAI_API_BASE: &str = "https://api.openai.com/v1";

/// Supported OpenAI models (most recent first)
const SUPPORTED_MODELS: &[&str] = &[
    // GPT-5.5 family (2026)
    "gpt-5.5-pro",
    "gpt-5.5",
    // GPT-5.4 family (2026)
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    // GPT-5 family (older 2026 line)
    "gpt-5.2",
    "gpt-5",
    "gpt-5-mini",
    // Legacy 4.x / 4o (kept for backward compat)
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo",
    // o-series reasoning models
    "o1",
    "o1-mini",
    "o1-preview",
    "o3-mini",
];

/// OpenAI provider implementation
pub struct OpenAIProvider {
    client: Client,
    api_key: String,
    base_url: String,
}

impl OpenAIProvider {
    /// Create a new OpenAI provider with the given API key
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: OPENAI_API_BASE.to_string(),
        }
    }

    /// Create a new OpenAI provider with a custom base URL (for proxies, Azure, etc.)
    pub fn with_base_url(api_key: impl Into<String>, base_url: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: base_url.into(),
        }
    }

    /// Transform Open Responses request to OpenAI format
    fn transform_request(&self, request: &CreateResponseRequest) -> OpenAIRequest {
        let mut messages = Vec::new();

        // Add system message from instructions if present
        if let Some(instructions) = &request.instructions {
            messages.push(OpenAIMessage {
                role: "system".to_string(),
                content: Some(OpenAIContent::Text(instructions.clone())),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            });
        }

        // Batch consecutive FunctionCall items into a single
        // assistant message with multiple tool_calls. OpenAI requires
        // all parallel tool calls emitted by the assistant in one
        // turn to be in ONE assistant message — not one message per
        // call. See issue feedback on PR #164.
        let mut pending_tool_calls: Vec<OpenAIToolCallRequest> = Vec::new();
        let flush_pending = |messages: &mut Vec<OpenAIMessage>,
                             pending: &mut Vec<OpenAIToolCallRequest>| {
            if !pending.is_empty() {
                messages.push(OpenAIMessage {
                    role: "assistant".to_string(),
                    content: None,
                    tool_calls: Some(std::mem::take(pending)),
                    tool_call_id: None,
                    name: None,
                });
            }
        };

        // Transform input items to OpenAI messages
        for item in &request.input {
            // Any non-FunctionCall item ends the current batch.
            if !matches!(item, InputItem::FunctionCall { .. }) {
                flush_pending(&mut messages, &mut pending_tool_calls);
            }
            match item {
                InputItem::Message { role, content } => {
                    let oai_content = match content {
                        InputContent::Text(text) => OpenAIContent::Text(text.clone()),
                        InputContent::Parts(parts) => {
                            let oai_parts: Vec<OpenAIContentPart> = parts
                                .iter()
                                .map(|p| match p {
                                    ContentPart::Text { text } => {
                                        OpenAIContentPart::Text { text: text.clone() }
                                    }
                                    ContentPart::Image {
                                        url,
                                        data,
                                        media_type,
                                    } => {
                                        if let Some(url) = url {
                                            OpenAIContentPart::ImageUrl {
                                                image_url: OpenAIImageUrl {
                                                    url: url.clone(),
                                                    detail: None,
                                                },
                                            }
                                        } else if let Some(data) = data {
                                            let media =
                                                media_type.as_deref().unwrap_or("image/png");
                                            OpenAIContentPart::ImageUrl {
                                                image_url: OpenAIImageUrl {
                                                    url: format!("data:{};base64,{}", media, data),
                                                    detail: None,
                                                },
                                            }
                                        } else {
                                            OpenAIContentPart::Text {
                                                text: "[Invalid image]".to_string(),
                                            }
                                        }
                                    }
                                    ContentPart::Audio { data, media_type } => {
                                        // OpenAI doesn't support audio in the same way
                                        // This is a placeholder
                                        OpenAIContentPart::Text {
                                            text: format!(
                                                "[Audio: {} bytes, type: {}]",
                                                data.len(),
                                                media_type.as_deref().unwrap_or("audio/mp3")
                                            ),
                                        }
                                    }
                                })
                                .collect();
                            OpenAIContent::Parts(oai_parts)
                        }
                    };

                    messages.push(OpenAIMessage {
                        role: match role {
                            Role::User => "user".to_string(),
                            Role::Assistant => "assistant".to_string(),
                            Role::System => "system".to_string(),
                            Role::Tool => "tool".to_string(),
                        },
                        content: Some(oai_content),
                        tool_calls: None,
                        tool_call_id: None,
                        name: None,
                    });
                }
                InputItem::FunctionCallOutput { call_id, output } => {
                    messages.push(OpenAIMessage {
                        role: "tool".to_string(),
                        content: Some(OpenAIContent::Text(output.clone())),
                        tool_calls: None,
                        tool_call_id: Some(call_id.clone()),
                        name: None,
                    });
                }
                InputItem::FunctionCall {
                    call_id,
                    name,
                    arguments,
                } => {
                    // Buffer this call into the current batch. The
                    // batch is flushed into a single assistant
                    // message when the NEXT non-FunctionCall item is
                    // seen (or at end of loop). This is what makes
                    // parallel tool calls land in one message
                    // rather than N.
                    pending_tool_calls.push(OpenAIToolCallRequest {
                        id: call_id.clone(),
                        r#type: "function".to_string(),
                        function: OpenAIFunctionCall {
                            name: name.clone(),
                            arguments: arguments.clone(),
                        },
                    });
                }
            }
        }
        // Flush any trailing FunctionCall batch (last item(s) were
        // FunctionCalls — the in-loop flush only fires on the NEXT
        // non-FunctionCall item).
        flush_pending(&mut messages, &mut pending_tool_calls);

        // Transform tools
        let tools = request.tools.as_ref().map(|tools| {
            tools
                .iter()
                .map(|tool| match tool {
                    Tool::Function { function } => OpenAITool {
                        r#type: "function".to_string(),
                        function: OpenAIFunction {
                            name: function.name.clone(),
                            description: function.description.clone(),
                            parameters: function.parameters.clone(),
                            strict: function.strict,
                        },
                    },
                })
                .collect()
        });

        // Transform tool_choice
        let tool_choice = request.tool_choice.as_ref().map(|tc| match tc {
            ToolChoice::Auto(auto) => match auto {
                ToolChoiceAuto::Auto => OpenAIToolChoice::String("auto".to_string()),
                ToolChoiceAuto::Required => OpenAIToolChoice::String("required".to_string()),
                ToolChoiceAuto::None => OpenAIToolChoice::String("none".to_string()),
            },
            ToolChoice::Function { function, .. } => OpenAIToolChoice::Object {
                r#type: "function".to_string(),
                function: OpenAIToolChoiceFunction {
                    name: function.name.clone(),
                },
            },
        });

        // Determine if we need logprobs based on validation config.
        // OpenAI rejects top_logprobs unless logprobs is also true, so we only
        // send top_logprobs when logprobs is enabled.
        let (logprobs, top_logprobs) = if let Some(ref validation) = request.validation {
            match validation.strategy {
                ValidationStrategy::Logprobs | ValidationStrategy::ConfidenceThreshold => {
                    let include = validation.include_logprobs.unwrap_or(true);
                    if include {
                        let top = validation.top_logprobs.unwrap_or(5).min(20);
                        (Some(true), Some(top))
                    } else {
                        (Some(false), None)
                    }
                }
                ValidationStrategy::BestOfN | ValidationStrategy::SelfConsistency => {
                    // Also enable logprobs for selection if highest confidence is used
                    if validation.selection
                        == Some(aura_types::SelectionCriteria::HighestConfidence)
                        || validation.selection
                            == Some(aura_types::SelectionCriteria::LowestPerplexity)
                    {
                        (Some(true), Some(5))
                    } else {
                        (None, None)
                    }
                }
                _ => (None, None),
            }
        } else {
            (None, None)
        };

        OpenAIRequest {
            model: request.model.clone(),
            messages,
            max_tokens: request.max_output_tokens,
            temperature: request.temperature,
            top_p: request.top_p,
            stream: Some(request.stream),
            tools,
            tool_choice,
            user: request.user.clone(),
            stream_options: if request.stream {
                Some(StreamOptions {
                    include_usage: true,
                })
            } else {
                None
            },
            logprobs,
            top_logprobs,
        }
    }

    /// Transform OpenAI response to Open Responses format
    fn transform_response(&self, response: OpenAIResponse, model: &str) -> Response {
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
            Some("content_filter") => (
                aura_types::ResponseStatus::Incomplete,
                Some(IncompleteReason::ContentFilter),
                None,
            ),
            Some(reason) => {
                warn!(reason = %reason, "Unknown finish reason from OpenAI");
                (aura_types::ResponseStatus::Completed, None, None)
            }
            None => (
                aura_types::ResponseStatus::Failed,
                None,
                Some(ResponseError::new("no_response", "No response from model")),
            ),
        };

        // Build usage
        let usage = response
            .usage
            .map(|u| Usage::new(u.prompt_tokens, u.completion_tokens));

        // Extract logprobs and build validation metadata
        let validation = choice.and_then(|c| {
            c.logprobs.as_ref().and_then(|lp| {
                lp.content.as_ref().map(|tokens| {
                    let token_logprobs: Vec<TokenLogprob> = tokens
                        .iter()
                        .map(|t| {
                            let top = t.top_logprobs.as_ref().map(|tops| {
                                tops.iter()
                                    .map(|tp| TopLogprob::new(&tp.token, tp.logprob))
                                    .collect()
                            });
                            TokenLogprob::new(&t.token, t.logprob)
                                .with_top_logprobs(top.unwrap_or_default())
                        })
                        .collect();

                    let logprobs_data = LogprobsData::new(token_logprobs);
                    let confidence = logprobs_data.confidence_score();
                    let perplexity = logprobs_data.perplexity();

                    ValidationMetadata::with_confidence(ValidationStrategy::Logprobs, confidence)
                        .with_perplexity(perplexity)
                        .with_logprobs(logprobs_data)
                })
            })
        });

        let mut builder = Response::builder(format!("resp_oai_{}", response.id), model)
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
        if let Some(validation) = validation {
            builder = builder.validation(validation);
        }

        builder.build()
    }

    /// Parse OpenAI error response
    fn parse_error_response(&self, status: u16, body: &str) -> ProviderError {
        #[derive(Deserialize)]
        struct OpenAIError {
            error: OpenAIErrorInner,
        }

        #[derive(Deserialize)]
        struct OpenAIErrorInner {
            message: String,
            r#type: Option<String>,
            code: Option<String>,
        }

        if let Ok(err) = serde_json::from_str::<OpenAIError>(body) {
            let message = err.error.message;
            let error_type = err.error.r#type.or(err.error.code);

            match status {
                400 => ProviderError::invalid_request(message),
                401 => ProviderError::authentication(message),
                403 => ProviderError::authentication(message),
                404 => {
                    if message.contains("model") {
                        ProviderError::model_not_found(&message)
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
        } else {
            ProviderError::from_provider(status, body.to_string())
        }
    }
}

#[async_trait]
impl Provider for OpenAIProvider {
    fn name(&self) -> &str {
        "openai"
    }

    fn models(&self) -> &[&str] {
        SUPPORTED_MODELS
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete(&self, request: CreateResponseRequest) -> Result<Response, ProviderError> {
        let model = request.model.clone();
        let oai_request = self.transform_request(&request);

        debug!(model = %model, "Sending request to OpenAI");

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&oai_request)
            .send()
            .await?;

        let status = response.status().as_u16();

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "OpenAI API error");
            return Err(self.parse_error_response(status, &body));
        }

        let oai_response: OpenAIResponse = response.json().await?;
        debug!(id = %oai_response.id, "Received response from OpenAI");

        Ok(self.transform_response(oai_response, &model))
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete_stream(
        &self,
        request: CreateResponseRequest,
    ) -> Result<EventStream, ProviderError> {
        let model = request.model.clone();
        let mut oai_request = self.transform_request(&request);
        oai_request.stream = Some(true);

        debug!(model = %model, "Starting streaming request to OpenAI");

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&oai_request)
            .send()
            .await?;

        let status = response.status().as_u16();

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "OpenAI API error");
            return Err(self.parse_error_response(status, &body));
        }

        let stream = response.bytes_stream();
        let transformer = OpenAIStreamTransformer::new(model);

        Ok(Box::pin(transformer.transform(stream)))
    }
}

/// Transforms OpenAI SSE stream to Open Responses events
struct OpenAIStreamTransformer {
    model: String,
    response_id: String,
    buffer: String,
    accumulated_text: String,
    accumulated_tool_calls: std::collections::HashMap<usize, PartialToolCall>,
    accumulated_usage: Option<aura_types::Usage>,
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

impl OpenAIStreamTransformer {
    fn new(model: String) -> Self {
        Self {
            model,
            response_id: format!("resp_oai_{}", uuid::Uuid::new_v4()),
            buffer: String::new(),
            accumulated_text: String::new(),
            accumulated_tool_calls: std::collections::HashMap::new(),
            accumulated_usage: None,
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
                    // First, check if we have buffered events to emit
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

                    // Try to process any complete lines in the buffer
                    if let Some(line_end) = transformer.buffer.find('\n') {
                        let line = transformer.buffer[..line_end].trim().to_string();
                        transformer.buffer = transformer.buffer[line_end + 1..].to_string();

                        if line.is_empty() {
                            continue;
                        }

                        if line == "data: [DONE]" {
                            // Stream completed - emit final events
                            let mut events = Vec::new();

                            // Emit output_text.done if we have text
                            if !transformer.accumulated_text.is_empty() {
                                events.push(StreamEvent::output_text_done(
                                    0,
                                    0,
                                    transformer.accumulated_text.clone(),
                                ));
                            }

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

                            let mut builder = Response::builder(
                                transformer.response_id.clone(),
                                transformer.model.clone(),
                            )
                            .outputs(output)
                            .completed();

                            // Add usage if available
                            if let Some(usage) = transformer.accumulated_usage.clone() {
                                builder = builder.usage(usage);
                            }

                            let response = builder.build();

                            return Some((
                                Ok(StreamEvent::response_completed(response)),
                                (transformer, stream),
                            ));
                        }

                        if let Some(data) = line.strip_prefix("data: ") {
                            match serde_json::from_str::<OpenAIStreamChunk>(data) {
                                Ok(chunk) => {
                                    // Extract usage if present (comes in final chunk before [DONE])
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
                                        // Handle content delta
                                        if let Some(content) = &choice.delta.content {
                                            // Emit output_item.added if not done yet
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

                                            // Emit content_part.added if not done yet
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

                                        // Handle tool call deltas
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
                                    warn!(error = %e, data = %data, "Failed to parse OpenAI stream chunk");
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
                            // Stream ended without [DONE]
                            return None;
                        }
                    }
                }
            },
        )
    }
}

// OpenAI API types

#[derive(Debug, Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OpenAITool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<OpenAIToolChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream_options: Option<StreamOptions>,
    /// Whether to return log probabilities
    #[serde(skip_serializing_if = "Option::is_none")]
    logprobs: Option<bool>,
    /// Number of top log probabilities to return (1-20)
    #[serde(skip_serializing_if = "Option::is_none")]
    top_logprobs: Option<u8>,
}

#[derive(Debug, Serialize)]
struct StreamOptions {
    include_usage: bool,
}

#[derive(Debug, Serialize)]
struct OpenAIMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<OpenAIContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OpenAIToolCallRequest>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum OpenAIContent {
    Text(String),
    Parts(Vec<OpenAIContentPart>),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum OpenAIContentPart {
    Text { text: String },
    ImageUrl { image_url: OpenAIImageUrl },
}

#[derive(Debug, Serialize)]
struct OpenAIImageUrl {
    url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

#[derive(Debug, Serialize)]
struct OpenAITool {
    r#type: String,
    function: OpenAIFunction,
}

#[derive(Debug, Serialize)]
struct OpenAIFunction {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parameters: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    strict: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum OpenAIToolChoice {
    String(String),
    Object {
        r#type: String,
        function: OpenAIToolChoiceFunction,
    },
}

#[derive(Debug, Serialize)]
struct OpenAIToolChoiceFunction {
    name: String,
}

#[derive(Debug, Serialize)]
struct OpenAIToolCallRequest {
    id: String,
    r#type: String,
    function: OpenAIFunctionCall,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIFunctionCall {
    name: String,
    arguments: String,
}

// Response types

#[derive(Debug, Deserialize)]
struct OpenAIResponse {
    id: String,
    created: i64,
    #[allow(dead_code)]
    model: String,
    choices: Vec<OpenAIChoice>,
    usage: Option<OpenAIUsage>,
}

#[derive(Debug, Deserialize)]
struct OpenAIChoice {
    message: OpenAIResponseMessage,
    finish_reason: String,
    /// Log probabilities for the generated tokens
    logprobs: Option<OpenAILogprobs>,
}

/// OpenAI logprobs structure
#[derive(Debug, Deserialize)]
struct OpenAILogprobs {
    /// List of token logprobs
    content: Option<Vec<OpenAITokenLogprob>>,
}

/// Log probability for a single token
#[derive(Debug, Deserialize)]
struct OpenAITokenLogprob {
    /// The token string
    token: String,
    /// Log probability of this token
    logprob: f32,
    /// Byte representation (required for deserialization but not used)
    #[allow(dead_code)]
    bytes: Option<Vec<u8>>,
    /// Top alternative tokens
    top_logprobs: Option<Vec<OpenAITopLogprob>>,
}

/// Alternative token with its log probability
#[derive(Debug, Deserialize)]
struct OpenAITopLogprob {
    /// The alternative token
    token: String,
    /// Log probability
    logprob: f32,
    /// Byte representation (required for deserialization but not used)
    #[allow(dead_code)]
    bytes: Option<Vec<u8>>,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponseMessage {
    content: Option<String>,
    tool_calls: Option<Vec<OpenAIToolCallResponse>>,
}

#[derive(Debug, Deserialize)]
struct OpenAIToolCallResponse {
    id: String,
    function: OpenAIFunctionCall,
}

#[derive(Debug, Deserialize)]
struct OpenAIUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    #[allow(dead_code)]
    total_tokens: u32,
}

// Streaming types

#[derive(Debug, Deserialize)]
struct OpenAIStreamChunk {
    #[allow(dead_code)]
    id: String,
    choices: Vec<OpenAIStreamChoice>,
    #[allow(dead_code)]
    usage: Option<OpenAIUsage>,
}

#[derive(Debug, Deserialize)]
struct OpenAIStreamChoice {
    delta: OpenAIStreamDelta,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAIStreamDelta {
    content: Option<String>,
    tool_calls: Option<Vec<OpenAIStreamToolCall>>,
}

#[derive(Debug, Deserialize)]
struct OpenAIStreamToolCall {
    index: usize,
    id: Option<String>,
    function: Option<OpenAIStreamFunction>,
}

#[derive(Debug, Deserialize)]
struct OpenAIStreamFunction {
    name: Option<String>,
    arguments: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::FunctionDefinition;

    #[test]
    fn test_transform_simple_request() {
        let provider = OpenAIProvider::new("test-key");
        let request = CreateResponseRequest::text("gpt-4", "Hello!");

        let oai_request = provider.transform_request(&request);

        assert_eq!(oai_request.model, "gpt-4");
        assert_eq!(oai_request.messages.len(), 1);
        assert_eq!(oai_request.messages[0].role, "user");
    }

    #[test]
    fn test_top_logprobs_suppressed_when_logprobs_disabled() {
        // OpenAI rejects top_logprobs unless logprobs is true. When the client
        // sets include_logprobs=false (e.g. confidence_threshold strategy),
        // we must NOT send top_logprobs at all.
        use aura_types::{ValidationConfig, ValidationStrategy};

        let provider = OpenAIProvider::new("test-key");
        let validation = ValidationConfig {
            strategy: ValidationStrategy::ConfidenceThreshold,
            min_confidence: Some(0.7),
            n: None,
            selection: None,
            include_logprobs: Some(false),
            top_logprobs: None,
        };
        let request = CreateResponseRequest::text("gpt-4", "Hello!").with_validation(validation);

        let oai_request = provider.transform_request(&request);

        assert_eq!(oai_request.logprobs, Some(false));
        assert_eq!(
            oai_request.top_logprobs, None,
            "top_logprobs must be omitted when logprobs is not true",
        );
    }

    #[test]
    fn test_transform_request_with_instructions() {
        let provider = OpenAIProvider::new("test-key");
        let request =
            CreateResponseRequest::text("gpt-4", "Hello!").with_instructions("Be helpful");

        let oai_request = provider.transform_request(&request);

        assert_eq!(oai_request.messages.len(), 2);
        assert_eq!(oai_request.messages[0].role, "system");
    }

    #[test]
    fn test_transform_request_with_tools() {
        let provider = OpenAIProvider::new("test-key");
        let request = CreateResponseRequest::text("gpt-4", "Get the weather").with_tools(vec![
            Tool::function(
                FunctionDefinition::new("get_weather").with_description("Get current weather"),
            ),
        ]);

        let oai_request = provider.transform_request(&request);

        assert!(oai_request.tools.is_some());
        let tools = oai_request.tools.unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].function.name, "get_weather");
    }

    #[test]
    fn test_supports_model() {
        let provider = OpenAIProvider::new("test-key");
        assert!(provider.supports_model("gpt-4"));
        assert!(provider.supports_model("gpt-4o"));
        assert!(provider.supports_model("gpt-3.5-turbo"));
        assert!(!provider.supports_model("claude-3"));
    }

    #[test]
    fn test_provider_name() {
        let provider = OpenAIProvider::new("test-key");
        assert_eq!(provider.name(), "openai");
    }

    #[test]
    fn test_error_code_mapping() {
        let provider = OpenAIProvider::new("test-key");

        // Test various error scenarios
        let err = provider.parse_error_response(
            401,
            r#"{"error":{"message":"Invalid API key","type":"invalid_request_error"}}"#,
        );
        assert!(matches!(err, ProviderError::Authentication { .. }));

        let err = provider.parse_error_response(
            429,
            r#"{"error":{"message":"Rate limit exceeded","type":"rate_limit_error"}}"#,
        );
        assert!(matches!(err, ProviderError::RateLimit { .. }));

        let err = provider.parse_error_response(
            503,
            r#"{"error":{"message":"Service unavailable","type":"server_error"}}"#,
        );
        assert!(matches!(err, ProviderError::ServiceUnavailable { .. }));
    }

    /// Two parallel FunctionCall items + one FunctionCallOutput
    /// should land as one assistant message carrying both tool_calls,
    /// followed by one tool message — not two separate assistant
    /// messages with one tool_call each. OpenAI requires the
    /// batched shape.
    #[test]
    fn test_consecutive_function_calls_batch_into_one_assistant_message() {
        let provider = OpenAIProvider::new("test-key");
        let mut request = CreateResponseRequest::text("gpt-4", "what's the weather in two cities?");
        request.input.extend(vec![
            InputItem::FunctionCall {
                call_id: "call_1".into(),
                name: "get_weather".into(),
                arguments: r#"{"city":"Paris"}"#.into(),
            },
            InputItem::FunctionCall {
                call_id: "call_2".into(),
                name: "get_weather".into(),
                arguments: r#"{"city":"Tokyo"}"#.into(),
            },
            InputItem::FunctionCallOutput {
                call_id: "call_1".into(),
                output: r#"{"temp":15}"#.into(),
            },
            InputItem::FunctionCallOutput {
                call_id: "call_2".into(),
                output: r#"{"temp":22}"#.into(),
            },
        ]);

        let oai = provider.transform_request(&request);

        // Expected message sequence:
        //   [user, assistant(tool_calls=[call_1, call_2]), tool(call_1), tool(call_2)]
        assert_eq!(oai.messages.len(), 4, "messages = {:#?}", oai.messages);
        assert_eq!(oai.messages[0].role, "user");
        assert_eq!(oai.messages[1].role, "assistant");
        let tool_calls = oai.messages[1]
            .tool_calls
            .as_ref()
            .expect("assistant message should carry tool_calls");
        assert_eq!(
            tool_calls.len(),
            2,
            "two parallel calls should batch into one assistant message"
        );
        assert_eq!(tool_calls[0].id, "call_1");
        assert_eq!(tool_calls[1].id, "call_2");
        assert_eq!(oai.messages[2].role, "tool");
        assert_eq!(oai.messages[3].role, "tool");
    }

    /// Single FunctionCall still produces one assistant message with
    /// one tool_call. (No regression on the non-parallel case.)
    #[test]
    fn test_single_function_call_still_works() {
        let provider = OpenAIProvider::new("test-key");
        let mut request = CreateResponseRequest::text("gpt-4", "weather?");
        request.input.extend(vec![
            InputItem::FunctionCall {
                call_id: "call_x".into(),
                name: "get_weather".into(),
                arguments: r#"{"city":"Paris"}"#.into(),
            },
            InputItem::FunctionCallOutput {
                call_id: "call_x".into(),
                output: r#"{"temp":15}"#.into(),
            },
        ]);

        let oai = provider.transform_request(&request);

        // [user, assistant(tool_calls=[call_x]), tool]
        assert_eq!(oai.messages.len(), 3);
        let tool_calls = oai.messages[1].tool_calls.as_ref().unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "call_x");
    }
}
