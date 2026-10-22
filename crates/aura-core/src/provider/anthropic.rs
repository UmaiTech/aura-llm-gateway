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

/// Supported Claude models (most recent first)
///
/// Refreshed 2026-10-15. Claude 5-generation ids carry no date suffix
/// (`claude-opus-5`, never `claude-opus-5-2026MMDD`).
const SUPPORTED_MODELS: &[&str] = &[
    // Claude Fable 5.x (2026 — top tier; Fable 5.1 released 2026-09-01)
    "claude-fable-5-1",
    "claude-fable-5",
    // Claude 5.5 (2026 — Opus 5.5 2026-09-22, Sonnet 5.5 2026-09-28, Haiku 5.5 2026-10-07)
    "claude-opus-5-5",
    "claude-sonnet-5-5",
    "claude-haiku-5-5",
    // Claude 5 (2026 — Opus 5 released 2026-07-24)
    "claude-opus-5",
    "claude-sonnet-5",
    // Claude 4.8 (2026 — Opus only in this line)
    "claude-opus-4-8",
    // Claude 4.7 (2026 — Opus only in this line)
    "claude-opus-4-7-20260416",
    "claude-opus-4-7",
    // Claude 4.6 (2026)
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    // Claude 4.5 (dated versions)
    "claude-opus-4-5-20250514",
    "claude-sonnet-4-5-20250514",
    "claude-haiku-4-5-20251001",
    // Claude 4.5 (aliases)
    "claude-opus-4-5",
    "claude-sonnet-4-5",
    "claude-haiku-4-5",
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

        // Batch consecutive FunctionCall items into a single
        // assistant message with multiple tool_use blocks. Anthropic
        // requires all parallel tool calls emitted in one turn to be
        // in ONE assistant message — not one per call. The
        // tool_result blocks that follow then pair against those
        // tool_use blocks by tool_use_id.
        let mut pending_tool_uses: Vec<AnthropicContentBlock> = Vec::new();
        let flush_pending = |messages: &mut Vec<AnthropicMessage>,
                             pending: &mut Vec<AnthropicContentBlock>| {
            if !pending.is_empty() {
                messages.push(AnthropicMessage {
                    role: "assistant".to_string(),
                    content: std::mem::take(pending),
                });
            }
        };

        // Transform input items to Anthropic messages
        for item in &request.input {
            if !matches!(item, InputItem::FunctionCall { .. }) {
                flush_pending(&mut messages, &mut pending_tool_uses);
            }
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
                InputItem::FunctionCall {
                    call_id,
                    name,
                    arguments,
                } => {
                    // Buffer into the current batch. Anthropic
                    // requires parallel tool_use blocks to land in
                    // ONE assistant message; flush_pending above
                    // emits them all together when the next non-
                    // FunctionCall item (or end-of-loop) is hit.
                    //
                    // Without batching, Anthropic rejects with:
                    //   "unexpected tool_use_id found in tool_result
                    //    blocks: <id>. Each tool_result block must
                    //    have a corresponding tool_use block in the
                    //    previous message."
                    //
                    // Arguments are JSON-encoded in our InputItem
                    // schema; Anthropic wants the parsed object.
                    // Fall back to a raw_arguments wrapper on parse
                    // failure rather than dropping the call.
                    let input_value: serde_json::Value = serde_json::from_str(arguments)
                        .unwrap_or_else(|_| serde_json::json!({ "raw_arguments": arguments }));
                    pending_tool_uses.push(AnthropicContentBlock::ToolUse {
                        id: call_id.clone(),
                        name: name.clone(),
                        input: input_value,
                    });
                }
            }
        }
        // Flush any trailing FunctionCall batch.
        flush_pending(&mut messages, &mut pending_tool_uses);

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
                        cache_control: None,
                    },
                })
                .collect::<Vec<_>>()
        });

        let (system, tools) = Self::place_cache_breakpoints(system, tools);

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
            // Automatic caching: Anthropic places this breakpoint on the last
            // cacheable block and moves it forward as the conversation grows,
            // so each turn reads the previous turn's prefix from cache.
            cache_control: Some(AnthropicCacheControl::ephemeral()),
        }
    }

    /// Place the explicit prompt-cache breakpoint for the static prefix.
    ///
    /// Anthropic renders `tools` -> `system` -> `messages`, so one marker on
    /// the last system block caches tools and system together. With no system
    /// prompt, the marker goes on the last tool instead. Together with the
    /// top-level automatic breakpoint this uses 2 of the 4 allowed slots.
    ///
    /// The marker uses the same (default 5-minute) TTL as the top-level
    /// field; a differing TTL on the last block would be a 400. Prefixes
    /// below the model's minimum (512 tokens on the 5.x line, 1024-4096 on
    /// older models) silently don't cache — no error, just no hit.
    fn place_cache_breakpoints(
        system: Option<String>,
        mut tools: Option<Vec<AnthropicTool>>,
    ) -> (
        Option<Vec<AnthropicSystemBlock>>,
        Option<Vec<AnthropicTool>>,
    ) {
        let system = system.map(|text| {
            vec![AnthropicSystemBlock {
                block_type: "text",
                text,
                cache_control: Some(AnthropicCacheControl::ephemeral()),
            }]
        });
        if system.is_none() {
            if let Some(last) = tools.as_mut().and_then(|t| t.last_mut()) {
                last.cache_control = Some(AnthropicCacheControl::ephemeral());
            }
        }
        (system, tools)
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
        let usage = response.usage.to_usage();

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
    cache_creation_input_tokens: u32,
    cache_read_input_tokens: u32,
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
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0,
        }
    }

    /// Final usage in the gateway convention (`input_tokens` = whole prompt).
    fn usage(&self) -> Usage {
        AnthropicUsage {
            input_tokens: self.input_tokens,
            output_tokens: self.output_tokens,
            cache_creation_input_tokens: Some(self.cache_creation_input_tokens),
            cache_read_input_tokens: Some(self.cache_read_input_tokens),
        }
        .to_usage()
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
                let usage = message.usage;
                self.input_tokens = usage.input_tokens;
                self.cache_creation_input_tokens = usage.cache_creation_input_tokens.unwrap_or(0);
                self.cache_read_input_tokens = usage.cache_read_input_tokens.unwrap_or(0);
                if usage.output_tokens > 0 {
                    self.output_tokens = usage.output_tokens;
                }
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
                if let Some(usage) = usage.as_ref() {
                    // message_delta usage is cumulative; input/cache counts
                    // are only present on some API versions.
                    if let Some(output_tokens) = usage.output_tokens {
                        self.output_tokens = output_tokens;
                    }
                    if let Some(input_tokens) = usage.input_tokens {
                        self.input_tokens = input_tokens;
                    }
                    if let Some(n) = usage.cache_creation_input_tokens {
                        self.cache_creation_input_tokens = n;
                    }
                    if let Some(n) = usage.cache_read_input_tokens {
                        self.cache_read_input_tokens = n;
                    }
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

                    let usage = self.usage();
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
    system: Option<Vec<AnthropicSystemBlock>>,
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
    /// Top-level automatic prompt caching
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_control: Option<AnthropicCacheControl>,
}

/// Prompt-cache breakpoint (`{"type": "ephemeral"}`, 5-minute TTL)
#[derive(Debug, Clone, PartialEq, Serialize)]
struct AnthropicCacheControl {
    #[serde(rename = "type")]
    cache_type: &'static str,
}

impl AnthropicCacheControl {
    fn ephemeral() -> Self {
        Self {
            cache_type: "ephemeral",
        }
    }
}

/// System prompt text block (array form, so it can carry `cache_control`)
#[derive(Debug, Serialize)]
struct AnthropicSystemBlock {
    #[serde(rename = "type")]
    block_type: &'static str,
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_control: Option<AnthropicCacheControl>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_control: Option<AnthropicCacheControl>,
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
    /// Uncached prompt tokens after the last cache breakpoint
    input_tokens: u32,
    #[serde(default)]
    output_tokens: u32,
    /// Prompt tokens written to the cache by this request
    #[serde(default)]
    cache_creation_input_tokens: Option<u32>,
    /// Prompt tokens read from the cache by this request
    #[serde(default)]
    cache_read_input_tokens: Option<u32>,
}

impl AnthropicUsage {
    /// Convert to the gateway convention: Anthropic's `input_tokens` excludes
    /// cache reads and writes, so the whole prompt is the sum of all three and
    /// `cached_tokens` is the cache-read subset.
    fn to_usage(&self) -> Usage {
        let cache_read = self.cache_read_input_tokens.unwrap_or(0);
        let total_input = self
            .input_tokens
            .saturating_add(self.cache_creation_input_tokens.unwrap_or(0))
            .saturating_add(cache_read);
        Usage::new(total_input, self.output_tokens).with_cache_hits(cache_read)
    }
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
    #[serde(default)]
    input_tokens: Option<u32>,
    #[serde(default)]
    cache_creation_input_tokens: Option<u32>,
    #[serde(default)]
    cache_read_input_tokens: Option<u32>,
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

        let system = anthropic_request.system.expect("system blocks");
        assert_eq!(system.len(), 1);
        assert_eq!(system[0].text, "Be helpful");
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
        // October 2026 line
        assert!(provider.supports_model("claude-opus-5-5"));
        assert!(provider.supports_model("claude-sonnet-5-5"));
        assert!(provider.supports_model("claude-haiku-5-5"));
        // September 2026 line
        assert!(provider.supports_model("claude-fable-5-1"));
        assert!(provider.supports_model("claude-opus-5"));
        assert!(provider.supports_model("claude-sonnet-5"));
        assert!(provider.supports_model("claude-opus-4-8"));
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

    /// Two parallel FunctionCall items should batch into one
    /// assistant message carrying TWO tool_use blocks. Anthropic
    /// requires this — separate assistant messages with one
    /// tool_use each break the tool_result pairing.
    #[test]
    fn test_consecutive_function_calls_batch_into_one_assistant_message() {
        let provider = AnthropicProvider::new("test-key");
        let mut request =
            CreateResponseRequest::text("claude-sonnet-4-5", "weather in two cities?");
        request.input.extend(vec![
            InputItem::FunctionCall {
                call_id: "tu_1".into(),
                name: "get_weather".into(),
                arguments: r#"{"city":"Paris"}"#.into(),
            },
            InputItem::FunctionCall {
                call_id: "tu_2".into(),
                name: "get_weather".into(),
                arguments: r#"{"city":"Tokyo"}"#.into(),
            },
            InputItem::FunctionCallOutput {
                call_id: "tu_1".into(),
                output: r#"{"temp":15}"#.into(),
            },
            InputItem::FunctionCallOutput {
                call_id: "tu_2".into(),
                output: r#"{"temp":22}"#.into(),
            },
        ]);

        let req = provider.transform_request(&request);

        // [user, assistant(content: [tool_use_1, tool_use_2]), user(tool_result_1), user(tool_result_2)]
        assert_eq!(req.messages.len(), 4, "messages = {:#?}", req.messages);
        assert_eq!(req.messages[1].role, "assistant");
        let tool_uses: Vec<_> = req.messages[1]
            .content
            .iter()
            .filter(|b| matches!(b, AnthropicContentBlock::ToolUse { .. }))
            .collect();
        assert_eq!(
            tool_uses.len(),
            2,
            "two parallel calls should batch into one assistant message with two tool_use blocks"
        );
    }
    #[test]
    fn test_cache_breakpoints_on_system_and_top_level() {
        let provider = AnthropicProvider::new("test-key");
        let request = CreateResponseRequest::text("claude-sonnet-5-5", "Hi")
            .with_instructions("Be helpful")
            .with_tools(vec![
                Tool::function(FunctionDefinition::new("a")),
                Tool::function(FunctionDefinition::new("b")),
            ]);

        let body = serde_json::to_value(provider.transform_request(&request)).unwrap();

        // Top-level automatic caching for the conversation tail
        assert_eq!(
            body["cache_control"],
            serde_json::json!({"type": "ephemeral"})
        );
        // System is an array of text blocks; the last carries the marker
        // (tools render before system, so this caches tools + system).
        assert_eq!(
            body["system"],
            serde_json::json!([{
                "type": "text",
                "text": "Be helpful",
                "cache_control": {"type": "ephemeral"}
            }])
        );
        // No extra markers on tools when the system marker covers them
        for tool in body["tools"].as_array().unwrap() {
            assert!(tool.get("cache_control").is_none(), "tool = {tool}");
        }
        // Messages carry no explicit markers (automatic caching handles them)
        assert!(!body["messages"].to_string().contains("cache_control"));
    }

    #[test]
    fn test_cache_breakpoint_on_last_tool_without_system() {
        let provider = AnthropicProvider::new("test-key");
        let request = CreateResponseRequest::text("claude-sonnet-5-5", "Hi").with_tools(vec![
            Tool::function(FunctionDefinition::new("a")),
            Tool::function(FunctionDefinition::new("b")),
        ]);

        let body = serde_json::to_value(provider.transform_request(&request)).unwrap();

        assert!(body.get("system").is_none());
        let tools = body["tools"].as_array().unwrap();
        assert!(tools[0].get("cache_control").is_none());
        assert_eq!(
            tools[1]["cache_control"],
            serde_json::json!({"type": "ephemeral"})
        );
        assert_eq!(
            body["cache_control"],
            serde_json::json!({"type": "ephemeral"})
        );
    }

    #[test]
    fn test_request_serialization_is_deterministic() {
        // A changed byte in the prefix invalidates the cache, so identical
        // requests must serialize to identical bytes.
        let provider = AnthropicProvider::new("test-key");
        let params = serde_json::json!({
            "type": "object",
            "properties": {"z": {"type": "string"}, "a": {"type": "number"}},
            "required": ["z", "a"]
        });
        let request = CreateResponseRequest::text("claude-sonnet-5-5", "Hi")
            .with_instructions("sys")
            .with_tools(vec![Tool::function(
                FunctionDefinition::new("f").with_parameters(params),
            )]);
        let a = serde_json::to_string(&provider.transform_request(&request)).unwrap();
        let b = serde_json::to_string(&provider.transform_request(&request)).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn test_usage_with_cache_read_and_write() {
        let provider = AnthropicProvider::new("test-key");
        let response: AnthropicResponse = serde_json::from_value(serde_json::json!({
            "id": "msg_1",
            "content": [{"type": "text", "text": "hi"}],
            "stop_reason": "end_turn",
            "usage": {
                "input_tokens": 50,
                "output_tokens": 20,
                "cache_creation_input_tokens": 200,
                "cache_read_input_tokens": 1000
            }
        }))
        .unwrap();

        let usage = provider
            .transform_response(response, "claude-sonnet-5-5")
            .usage
            .unwrap();
        // Whole prompt = uncached + written + read
        assert_eq!(usage.input_tokens, 1250);
        assert_eq!(usage.cached_tokens, Some(1000));
        assert_eq!(usage.output_tokens, 20);
        assert_eq!(usage.total_tokens, 1270);
    }

    #[test]
    fn test_usage_without_cache_fields() {
        let provider = AnthropicProvider::new("test-key");
        let response: AnthropicResponse = serde_json::from_value(serde_json::json!({
            "id": "msg_1",
            "content": [],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 10, "output_tokens": 5}
        }))
        .unwrap();

        let usage = provider
            .transform_response(response, "claude-sonnet-5-5")
            .usage
            .unwrap();
        assert_eq!(usage.input_tokens, 10);
        assert_eq!(usage.cached_tokens, None);
    }

    #[test]
    fn test_stream_usage_includes_cache_reads() {
        let mut transformer = AnthropicStreamTransformer::new("claude-sonnet-5-5".into());
        assert!(transformer
            .process_sse_data(
                r#"{"type":"message_start","message":{"usage":{"input_tokens":30,"output_tokens":1,"cache_creation_input_tokens":0,"cache_read_input_tokens":4000}}}"#,
            )
            .is_none());
        let event = transformer
            .process_sse_data(
                r#"{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":42}}"#,
            )
            .expect("completed event")
            .expect("ok");

        let StreamEvent::ResponseCompleted { response, .. } = event else {
            panic!("expected response.completed, got {event:?}");
        };
        let usage = response.usage.expect("usage");
        assert_eq!(usage.input_tokens, 4030);
        assert_eq!(usage.cached_tokens, Some(4000));
        assert_eq!(usage.output_tokens, 42);
    }

    #[tokio::test]
    async fn test_wire_request_carries_cache_markers_and_reports_hits() {
        use wiremock::matchers::{body_partial_json, header, method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/messages"))
            .and(header("anthropic-version", "2023-06-01"))
            .and(body_partial_json(serde_json::json!({
                "cache_control": {"type": "ephemeral"},
                "system": [{"type": "text", "text": "Be helpful", "cache_control": {"type": "ephemeral"}}]
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": "msg_1",
                "content": [{"type": "text", "text": "hi"}],
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 5, "output_tokens": 2, "cache_read_input_tokens": 600}
            })))
            .expect(1)
            .mount(&server)
            .await;

        let provider = AnthropicProvider::with_base_url("k", server.uri());
        let request =
            CreateResponseRequest::text("claude-sonnet-5-5", "Hi").with_instructions("Be helpful");
        let response = provider.complete(request).await.expect("complete");
        let usage = response.usage.expect("usage");
        assert_eq!(usage.input_tokens, 605);
        assert_eq!(usage.cached_tokens, Some(600));
    }
}
