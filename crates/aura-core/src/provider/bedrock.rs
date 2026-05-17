//! AWS Bedrock provider implementation
//!
//! Uses the `aws-sdk-bedrockruntime` crate to invoke models via Amazon Bedrock.
//! Credentials are sourced from the AWS default credential chain (environment
//! variables, shared credentials file, EC2/ECS instance metadata, etc.).
//!
//! ## Implemented model families
//!
//! **Anthropic Claude on Bedrock** — fully supported, including streaming and tool
//! calling. The request/response shape is the same as Anthropic's native Messages API
//! with the addition of `anthropic_version: "bedrock-2023-05-31"`.
//!
//! ## Deferred model families (follow-up issues filed)
//!
//! The methods `_bedrock_llama_unimplemented`, `_bedrock_mistral_unimplemented`, and
//! `_bedrock_titan_unimplemented` mark the out-of-scope families. When invoked they
//! return `ProviderError::Internal` with a clear message. Implement them in a
//! follow-up PR once the Claude path is stabilised.
//!
//! See filed issues:
//! - "feat(bedrock): add Meta Llama model family support"
//! - "feat(bedrock): add Mistral model family support"
//! - "feat(bedrock): add Amazon Titan model family support"
//!
//! ## Authentication
//!
//! Credentials are loaded from the AWS SDK default chain at provider construction
//! time. Alternatively, explicit credentials can be supplied via
//! `with_credentials(access_key, secret_key, region)` for testing or non-standard
//! deployments.
//!
//! ## Streaming
//!
//! Streaming uses `invoke_model_with_response_stream`. The SDK decodes the
//! binary framing; this adapter maps the resulting `ResponseStream` events to
//! `StreamEvent` values using the same logic as the Anthropic native adapter.

use async_trait::async_trait;
use aura_types::{
    CreateResponseRequest, FunctionCallItem, IncompleteReason, InputContent, InputItem, Item,
    MessageItem, Response, ResponseError, Role, StreamEvent, Tool, ToolChoice, ToolChoiceAuto,
    Usage,
};
use aws_config::BehaviorVersion;
use aws_sdk_bedrockruntime::primitives::Blob;
use aws_sdk_bedrockruntime::Client as BedrockClient;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, instrument, warn};

use super::{EventStream, Provider, ProviderError};

/// Anthropic API version required by Bedrock
const BEDROCK_ANTHROPIC_VERSION: &str = "bedrock-2023-05-31";

/// Supported Bedrock model IDs
const SUPPORTED_MODELS: &[&str] = &[
    // Anthropic Claude on Bedrock (fully implemented)
    "anthropic.claude-opus-4-5-20251001-v1:0",
    "anthropic.claude-sonnet-4-5-20250929-v1:0",
    "anthropic.claude-haiku-4-5-20251001-v1:0",
    "anthropic.claude-3-7-sonnet-20250219-v1:0",
    // Meta Llama on Bedrock (deferred — returns Unsupported)
    "meta.llama3-3-70b-instruct-v1:0",
    "meta.llama3-2-90b-instruct-v1:0",
    // Mistral on Bedrock (deferred — returns Unsupported)
    "mistral.mistral-large-2407-v1:0",
    // Amazon Titan (deferred — returns Unsupported)
    "amazon.titan-text-premier-v1:0",
];

/// AWS Bedrock provider
pub struct BedrockProvider {
    client: BedrockClient,
    region: String,
}

impl BedrockProvider {
    /// Create a new Bedrock provider using the AWS default credential chain.
    ///
    /// Credentials are resolved from (in order):
    /// 1. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` environment variables
    /// 2. `~/.aws/credentials` shared credentials file
    /// 3. EC2/ECS/EKS instance metadata service
    pub async fn new(region: impl Into<String>) -> Self {
        let region = region.into();
        let config = aws_config::defaults(BehaviorVersion::latest())
            .region(aws_sdk_bedrockruntime::config::Region::new(region.clone()))
            .load()
            .await;

        let client = BedrockClient::new(&config);

        Self { client, region }
    }

    /// Create a new Bedrock provider with explicit static credentials.
    ///
    /// Prefer `new()` for production deployments. Use this for local testing or
    /// when IAM role-based auth is not available.
    pub async fn with_credentials(
        access_key: impl Into<String>,
        secret_key: impl Into<String>,
        region: impl Into<String>,
    ) -> Self {
        let region = region.into();
        let credentials = aws_credential_types::Credentials::new(
            access_key.into(),
            secret_key.into(),
            None, // session token
            None, // expiry
            "aura-bedrock-static",
        );

        let config = aws_config::defaults(BehaviorVersion::latest())
            .region(aws_sdk_bedrockruntime::config::Region::new(region.clone()))
            .credentials_provider(credentials)
            .load()
            .await;

        let client = BedrockClient::new(&config);

        Self { client, region }
    }

    /// Returns true if the model ID belongs to the Anthropic Claude family on Bedrock
    fn is_claude_model(model: &str) -> bool {
        model.starts_with("anthropic.claude")
    }

    /// Returns an error for Llama models which are not yet implemented
    fn _bedrock_llama_unimplemented() -> ProviderError {
        ProviderError::Internal {
            message: "Meta Llama on Bedrock is not yet implemented. \
                      Tracked in: feat(bedrock): add Meta Llama model family support"
                .to_string(),
        }
    }

    /// Returns an error for Mistral models which are not yet implemented
    fn _bedrock_mistral_unimplemented() -> ProviderError {
        ProviderError::Internal {
            message: "Mistral on Bedrock is not yet implemented. \
                      Tracked in: feat(bedrock): add Mistral model family support"
                .to_string(),
        }
    }

    /// Returns an error for Amazon Titan which is not yet implemented
    fn _bedrock_titan_unimplemented() -> ProviderError {
        ProviderError::Internal {
            message: "Amazon Titan on Bedrock is not yet implemented. \
                      Tracked in: feat(bedrock): add Amazon Titan model family support"
                .to_string(),
        }
    }

    /// Route to the correct model family, returning Unsupported for deferred families
    fn check_model_family(&self, model: &str) -> Result<(), ProviderError> {
        if Self::is_claude_model(model) {
            Ok(())
        } else if model.starts_with("meta.llama") {
            Err(Self::_bedrock_llama_unimplemented())
        } else if model.starts_with("mistral.") {
            Err(Self::_bedrock_mistral_unimplemented())
        } else if model.starts_with("amazon.titan") {
            Err(Self::_bedrock_titan_unimplemented())
        } else {
            Err(ProviderError::model_not_found(model))
        }
    }

    /// Transform Open Responses request to Bedrock Claude (Anthropic Messages) format
    fn transform_claude_request(&self, request: &CreateResponseRequest) -> BedrockClaudeRequest {
        let mut messages = Vec::new();

        for item in &request.input {
            match item {
                InputItem::Message { role, content } => {
                    if *role == Role::System {
                        continue;
                    }

                    let content_blocks = match content {
                        InputContent::Text(text) => {
                            vec![BedrockContentBlock::Text { text: text.clone() }]
                        }
                        InputContent::Parts(parts) => parts
                            .iter()
                            .map(|p| match p {
                                aura_types::ContentPart::Text { text } => {
                                    BedrockContentBlock::Text { text: text.clone() }
                                }
                                aura_types::ContentPart::Image {
                                    url,
                                    data,
                                    media_type,
                                } => {
                                    if let Some(data) = data {
                                        BedrockContentBlock::Image {
                                            source: BedrockImageSource {
                                                source_type: "base64".to_string(),
                                                media_type: media_type
                                                    .clone()
                                                    .unwrap_or_else(|| "image/png".to_string()),
                                                data: data.clone(),
                                            },
                                        }
                                    } else if let Some(url) = url {
                                        BedrockContentBlock::Image {
                                            source: BedrockImageSource {
                                                source_type: "url".to_string(),
                                                media_type: media_type
                                                    .clone()
                                                    .unwrap_or_else(|| "image/png".to_string()),
                                                data: url.clone(),
                                            },
                                        }
                                    } else {
                                        BedrockContentBlock::Text {
                                            text: "[Invalid image]".to_string(),
                                        }
                                    }
                                }
                                aura_types::ContentPart::Audio { data, media_type } => {
                                    BedrockContentBlock::Text {
                                        text: format!(
                                            "[Audio: {} bytes, type: {}]",
                                            data.len(),
                                            media_type.as_deref().unwrap_or("audio/mp3")
                                        ),
                                    }
                                }
                            })
                            .collect(),
                    };

                    let bedrock_role = match role {
                        Role::User | Role::Tool => "user",
                        Role::Assistant => "assistant",
                        Role::System => "user",
                    };

                    messages.push(BedrockMessage {
                        role: bedrock_role.to_string(),
                        content: content_blocks,
                    });
                }
                InputItem::FunctionCallOutput { call_id, output } => {
                    messages.push(BedrockMessage {
                        role: "user".to_string(),
                        content: vec![BedrockContentBlock::ToolResult {
                            tool_use_id: call_id.clone(),
                            content: output.clone(),
                            is_error: None,
                        }],
                    });
                }
            }
        }

        // Extract system prompt from instructions and system messages
        let mut system_parts = Vec::new();
        if let Some(instructions) = &request.instructions {
            system_parts.push(instructions.clone());
        }
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
                            if let aura_types::ContentPart::Text { text } = part {
                                system_parts.push(text.clone());
                            }
                        }
                    }
                }
            }
        }
        let system = if system_parts.is_empty() {
            None
        } else {
            Some(system_parts.join("\n\n"))
        };

        // Transform tools
        let tools = request.tools.as_ref().map(|tools| {
            tools
                .iter()
                .map(|tool| match tool {
                    Tool::Function { function } => BedrockTool {
                        name: function.name.clone(),
                        description: function.description.clone(),
                        input_schema: function
                            .parameters
                            .clone()
                            .unwrap_or(serde_json::json!({"type":"object","properties":{}})),
                    },
                })
                .collect()
        });

        // Transform tool_choice
        let tool_choice = request.tool_choice.as_ref().map(|tc| match tc {
            ToolChoice::Auto(auto) => match auto {
                ToolChoiceAuto::Auto => BedrockToolChoice::Auto,
                ToolChoiceAuto::Required => BedrockToolChoice::Any,
                ToolChoiceAuto::None => BedrockToolChoice::Auto,
            },
            ToolChoice::Function { function, .. } => BedrockToolChoice::Tool {
                name: function.name.clone(),
            },
        });

        BedrockClaudeRequest {
            anthropic_version: BEDROCK_ANTHROPIC_VERSION.to_string(),
            model: request.model.clone(),
            messages,
            system,
            max_tokens: request.max_output_tokens.unwrap_or(4096),
            temperature: request.temperature,
            top_p: request.top_p,
            tools,
            tool_choice,
        }
    }

    /// Transform Bedrock Claude response to Open Responses format
    fn transform_claude_response(&self, response: BedrockClaudeResponse, model: &str) -> Response {
        let mut output = Vec::new();
        let mut item_index = 0;

        for content in &response.content {
            match content {
                BedrockContentBlock::Text { text } => {
                    output.push(Item::Message(MessageItem::assistant(
                        format!("msg_{}", item_index),
                        text,
                    )));
                    item_index += 1;
                }
                BedrockContentBlock::ToolUse { id, name, input } => {
                    output.push(Item::FunctionCall(FunctionCallItem::new(
                        format!("fc_{}", item_index),
                        id,
                        name,
                        serde_json::to_string(input).unwrap_or_default(),
                    )));
                    item_index += 1;
                }
                _ => {}
            }
        }

        let (status, incomplete_reason, error) = match response.stop_reason.as_deref() {
            Some("end_turn") | Some("stop_sequence") => {
                (aura_types::ResponseStatus::Completed, None, None)
            }
            Some("max_tokens") => (
                aura_types::ResponseStatus::Incomplete,
                Some(IncompleteReason::MaxTokens),
                None,
            ),
            Some("tool_use") => (aura_types::ResponseStatus::Completed, None, None),
            Some(reason) => {
                warn!(reason = %reason, "Unknown stop reason from Bedrock Claude");
                (aura_types::ResponseStatus::Completed, None, None)
            }
            None => (
                aura_types::ResponseStatus::Failed,
                None,
                Some(ResponseError::new("no_response", "No response from model")),
            ),
        };

        let usage = Usage::new(response.usage.input_tokens, response.usage.output_tokens);

        let response_id = format!("resp_bed_{}", uuid::Uuid::new_v4());

        let mut builder = Response::builder(response_id, model)
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

    /// Map AWS SDK errors to ProviderError
    fn map_sdk_error(e: impl std::fmt::Display) -> ProviderError {
        let msg = e.to_string();
        if msg.contains("AccessDenied") || msg.contains("AuthFailure") {
            ProviderError::authentication(msg)
        } else if msg.contains("ThrottlingException") || msg.contains("TooManyRequestsException") {
            ProviderError::rate_limit(msg)
        } else if msg.contains("ModelNotReadyException") || msg.contains("ModelNotFoundException") {
            ProviderError::model_not_found(msg)
        } else if msg.contains("ServiceUnavailableException")
            || msg.contains("InternalServerException")
        {
            ProviderError::service_unavailable(msg)
        } else if msg.contains("timeout") || msg.contains("Timeout") {
            ProviderError::timeout(0)
        } else {
            ProviderError::network(msg)
        }
    }
}

#[async_trait]
impl Provider for BedrockProvider {
    fn name(&self) -> &str {
        "bedrock"
    }

    fn models(&self) -> &[&str] {
        SUPPORTED_MODELS
    }

    #[instrument(skip(self, request), fields(model = %request.model, region = %self.region))]
    async fn complete(&self, request: CreateResponseRequest) -> Result<Response, ProviderError> {
        let model = request.model.clone();

        self.check_model_family(&model)?;

        debug!(model = %model, region = %self.region, "Sending request to AWS Bedrock");

        let bedrock_request = self.transform_claude_request(&request);

        let body_bytes = serde_json::to_vec(&bedrock_request)
            .map_err(|e| ProviderError::internal(format!("Failed to serialize request: {}", e)))?;

        let response = self
            .client
            .invoke_model()
            .model_id(&model)
            .content_type("application/json")
            .accept("application/json")
            .body(Blob::new(body_bytes))
            .send()
            .await
            .map_err(|e| {
                error!(error = %e, model = %model, "Bedrock invoke_model failed");
                Self::map_sdk_error(e)
            })?;

        let body = response.body().as_ref();
        let claude_response: BedrockClaudeResponse = serde_json::from_slice(body).map_err(|e| {
            ProviderError::parse_error(format!("Failed to parse Bedrock response: {}", e))
        })?;

        debug!(model = %model, "Received response from AWS Bedrock");

        Ok(self.transform_claude_response(claude_response, &model))
    }

    #[instrument(skip(self, request), fields(model = %request.model, region = %self.region))]
    async fn complete_stream(
        &self,
        request: CreateResponseRequest,
    ) -> Result<EventStream, ProviderError> {
        use aws_sdk_bedrockruntime::types::ResponseStream;

        let model = request.model.clone();

        self.check_model_family(&model)?;

        debug!(model = %model, region = %self.region, "Starting streaming request to AWS Bedrock");

        let bedrock_request = self.transform_claude_request(&request);
        let body_bytes = serde_json::to_vec(&bedrock_request)
            .map_err(|e| ProviderError::internal(format!("Failed to serialize request: {}", e)))?;

        let sdk_response = self
            .client
            .invoke_model_with_response_stream()
            .model_id(&model)
            .content_type("application/json")
            .body(Blob::new(body_bytes))
            .send()
            .await
            .map_err(|e| {
                error!(error = %e, model = %model, "Bedrock invoke_model_with_response_stream failed");
                Self::map_sdk_error(e)
            })?;

        let response_id = format!("resp_bed_{}", uuid::Uuid::new_v4());

        // `sdk_response.body` is the EventReceiver we consume with `.recv()`
        let stream = futures_util::stream::unfold(
            BedrockStreamState {
                sdk_output: sdk_response,
                response_id,
                model,
                accumulated_text: String::new(),
                accumulated_tool_calls: std::collections::HashMap::new(),
                input_tokens: 0,
                output_tokens: 0,
                sent_created: false,
                sent_in_progress: false,
                output_item_added: false,
                content_part_added: false,
                done: false,
            },
            |mut state| async move {
                if state.done {
                    return None;
                }

                if !state.sent_created {
                    state.sent_created = true;
                    let resp =
                        Response::in_progress(state.response_id.clone(), state.model.clone());
                    return Some((Ok(StreamEvent::response_created(resp)), state));
                }

                if !state.sent_in_progress {
                    state.sent_in_progress = true;
                    let resp =
                        Response::in_progress(state.response_id.clone(), state.model.clone());
                    return Some((Ok(StreamEvent::response_in_progress(resp)), state));
                }

                // Receive next SDK event via the public `body` field on the output
                match state.sdk_output.body.recv().await {
                    Ok(Some(event)) => {
                        match event {
                            ResponseStream::Chunk(chunk) => {
                                let bytes = chunk.bytes.map(|b| b.into_inner()).unwrap_or_default();
                                match serde_json::from_slice::<BedrockStreamEvent>(&bytes) {
                                    Ok(bedrock_event) => match bedrock_event {
                                        BedrockStreamEvent::MessageStart { message } => {
                                            state.input_tokens = message.usage.input_tokens;
                                            Some((
                                                Ok(StreamEvent::response_in_progress(
                                                    Response::in_progress(
                                                        state.response_id.clone(),
                                                        state.model.clone(),
                                                    ),
                                                )),
                                                state,
                                            ))
                                        }
                                        BedrockStreamEvent::ContentBlockStart {
                                            index,
                                            content_block,
                                        } => {
                                            match content_block {
                                                BedrockContentBlock::ToolUse {
                                                    id, name, ..
                                                } => {
                                                    let entry = state
                                                        .accumulated_tool_calls
                                                        .entry(index)
                                                        .or_default();
                                                    entry.id = id;
                                                    entry.name = name;
                                                }
                                                BedrockContentBlock::Text { .. }
                                                    if !state.output_item_added =>
                                                {
                                                    state.output_item_added = true;
                                                    let item = Item::Message(
                                                        MessageItem::assistant("msg_0", ""),
                                                    );
                                                    return Some((
                                                        Ok(StreamEvent::output_item_added(0, item)),
                                                        state,
                                                    ));
                                                }
                                                BedrockContentBlock::Text { .. } => {}
                                                _ => {}
                                            }
                                            Some((
                                                Ok(StreamEvent::response_in_progress(
                                                    Response::in_progress(
                                                        state.response_id.clone(),
                                                        state.model.clone(),
                                                    ),
                                                )),
                                                state,
                                            ))
                                        }
                                        BedrockStreamEvent::ContentBlockDelta { index, delta } => {
                                            match delta {
                                                BedrockDelta::TextDelta { text } => {
                                                    if !state.content_part_added {
                                                        state.content_part_added = true;
                                                        return Some((
                                                            Ok(StreamEvent::content_part_added(
                                                                0, 0, "text",
                                                            )),
                                                            state,
                                                        ));
                                                    }
                                                    state.accumulated_text.push_str(&text);
                                                    Some((
                                                        Ok(StreamEvent::output_text_delta(
                                                            0, 0, text,
                                                        )),
                                                        state,
                                                    ))
                                                }
                                                BedrockDelta::InputJsonDelta { partial_json } => {
                                                    if let Some(tc) =
                                                        state.accumulated_tool_calls.get_mut(&index)
                                                    {
                                                        tc.arguments.push_str(&partial_json);
                                                        Some((
                                                            Ok(StreamEvent::function_call_arguments_delta(
                                                                index,
                                                                partial_json,
                                                            )),
                                                            state,
                                                        ))
                                                    } else {
                                                        Some((
                                                            Ok(StreamEvent::response_in_progress(
                                                                Response::in_progress(
                                                                    state.response_id.clone(),
                                                                    state.model.clone(),
                                                                ),
                                                            )),
                                                            state,
                                                        ))
                                                    }
                                                }
                                            }
                                        }
                                        BedrockStreamEvent::ContentBlockStop { .. } => Some((
                                            Ok(StreamEvent::response_in_progress(
                                                Response::in_progress(
                                                    state.response_id.clone(),
                                                    state.model.clone(),
                                                ),
                                            )),
                                            state,
                                        )),
                                        BedrockStreamEvent::MessageDelta { delta, usage } => {
                                            if let Some(out_tokens) =
                                                usage.as_ref().and_then(|u| u.output_tokens)
                                            {
                                                state.output_tokens = out_tokens;
                                            }

                                            let stop_reason = delta.stop_reason.as_deref();
                                            if matches!(
                                                stop_reason,
                                                Some("end_turn")
                                                    | Some("tool_use")
                                                    | Some("stop_sequence")
                                            ) {
                                                let mut output = Vec::new();
                                                if !state.accumulated_text.is_empty() {
                                                    output.push(Item::Message(
                                                        MessageItem::assistant(
                                                            "msg_0",
                                                            &state.accumulated_text,
                                                        ),
                                                    ));
                                                }
                                                for (idx, tc) in &state.accumulated_tool_calls {
                                                    output.push(Item::FunctionCall(
                                                        FunctionCallItem::new(
                                                            format!("fc_{}", idx),
                                                            &tc.id,
                                                            &tc.name,
                                                            &tc.arguments,
                                                        ),
                                                    ));
                                                }
                                                let final_usage = Usage::new(
                                                    state.input_tokens,
                                                    state.output_tokens,
                                                );
                                                let final_response = Response::builder(
                                                    state.response_id.clone(),
                                                    state.model.clone(),
                                                )
                                                .outputs(output)
                                                .usage(final_usage)
                                                .completed()
                                                .build();

                                                state.done = true;
                                                return Some((
                                                    Ok(StreamEvent::response_completed(
                                                        final_response,
                                                    )),
                                                    state,
                                                ));
                                            }
                                            Some((
                                                Ok(StreamEvent::response_in_progress(
                                                    Response::in_progress(
                                                        state.response_id.clone(),
                                                        state.model.clone(),
                                                    ),
                                                )),
                                                state,
                                            ))
                                        }
                                        BedrockStreamEvent::MessageStop => Some((
                                            Ok(StreamEvent::response_in_progress(
                                                Response::in_progress(
                                                    state.response_id.clone(),
                                                    state.model.clone(),
                                                ),
                                            )),
                                            state,
                                        )),
                                    },
                                    Err(e) => {
                                        warn!(
                                            error = %e,
                                            "Failed to parse Bedrock stream event"
                                        );
                                        // Skip unparseable events rather than failing the stream
                                        Some((
                                            Ok(StreamEvent::response_in_progress(
                                                Response::in_progress(
                                                    state.response_id.clone(),
                                                    state.model.clone(),
                                                ),
                                            )),
                                            state,
                                        ))
                                    }
                                }
                            }
                            _ => {
                                // Unknown ResponseStream variant — skip
                                Some((
                                    Ok(StreamEvent::response_in_progress(Response::in_progress(
                                        state.response_id.clone(),
                                        state.model.clone(),
                                    ))),
                                    state,
                                ))
                            }
                        }
                    }
                    Ok(None) => None,
                    Err(e) => {
                        error!(error = %e, "Bedrock stream error");
                        Some((Err(ProviderError::stream_error(e.to_string())), state))
                    }
                }
            },
        );

        Ok(Box::pin(stream))
    }
}

/// State threaded through the Bedrock streaming unfold.
///
/// We hold the entire `InvokeModelWithResponseStreamOutput` (which owns the
/// private `EventReceiver`) and call `.body.recv()` through its public field.
struct BedrockStreamState {
    /// The SDK response object — `.body` is the public `EventReceiver` field.
    sdk_output: aws_sdk_bedrockruntime::operation::invoke_model_with_response_stream::InvokeModelWithResponseStreamOutput,
    response_id: String,
    model: String,
    accumulated_text: String,
    accumulated_tool_calls: std::collections::HashMap<usize, PartialToolCall>,
    input_tokens: u32,
    output_tokens: u32,
    sent_created: bool,
    sent_in_progress: bool,
    output_item_added: bool,
    content_part_added: bool,
    done: bool,
}

#[derive(Default)]
struct PartialToolCall {
    id: String,
    name: String,
    arguments: String,
}

// Bedrock Claude request types

#[derive(Debug, Serialize)]
struct BedrockClaudeRequest {
    anthropic_version: String,
    /// The model ID — stored for debugging but not serialized (model goes in the SDK call)
    #[serde(skip)]
    #[allow(dead_code)]
    model: String,
    messages: Vec<BedrockMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<BedrockTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<BedrockToolChoice>,
}

#[derive(Debug, Serialize, Deserialize)]
struct BedrockMessage {
    role: String,
    content: Vec<BedrockContentBlock>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
enum BedrockContentBlock {
    Text {
        text: String,
    },
    Image {
        source: BedrockImageSource,
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
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct BedrockImageSource {
    #[serde(rename = "type")]
    source_type: String,
    media_type: String,
    data: String,
}

#[derive(Debug, Serialize)]
struct BedrockTool {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    input_schema: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum BedrockToolChoice {
    Auto,
    Any,
    Tool { name: String },
}

// Response types

#[derive(Debug, Deserialize)]
struct BedrockClaudeResponse {
    content: Vec<BedrockContentBlock>,
    stop_reason: Option<String>,
    usage: BedrockUsage,
}

#[derive(Debug, Deserialize)]
struct BedrockUsage {
    input_tokens: u32,
    output_tokens: u32,
}

// Streaming types

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum BedrockStreamEvent {
    MessageStart {
        message: BedrockMessageStart,
    },
    ContentBlockStart {
        index: usize,
        content_block: BedrockContentBlock,
    },
    ContentBlockDelta {
        index: usize,
        delta: BedrockDelta,
    },
    ContentBlockStop {
        #[allow(dead_code)]
        index: usize,
    },
    MessageDelta {
        delta: BedrockMessageDelta,
        usage: Option<BedrockDeltaUsage>,
    },
    MessageStop,
}

#[derive(Debug, Deserialize)]
struct BedrockMessageStart {
    usage: BedrockUsage,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(clippy::enum_variant_names)]
enum BedrockDelta {
    TextDelta { text: String },
    InputJsonDelta { partial_json: String },
}

#[derive(Debug, Deserialize)]
struct BedrockMessageDelta {
    stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BedrockDeltaUsage {
    output_tokens: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::FunctionDefinition;

    /// Helper to construct a BedrockProvider without touching AWS.
    ///
    /// Tests only exercise pure transform functions and never call the SDK,
    /// so we build a client with static credentials and the latest behavior version.
    fn fake_provider() -> BedrockProvider {
        use aws_credential_types::Credentials;
        let creds = Credentials::new(
            "AKIAIOSFODNN7EXAMPLE",
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            None,
            None,
            "test",
        );
        let config = aws_sdk_bedrockruntime::Config::builder()
            .behavior_version(aws_sdk_bedrockruntime::config::BehaviorVersion::latest())
            .region(aws_sdk_bedrockruntime::config::Region::new("us-east-1"))
            .credentials_provider(creds)
            .build();
        BedrockProvider {
            client: BedrockClient::from_conf(config),
            region: "us-east-1".to_string(),
        }
    }

    #[test]
    fn test_is_claude_model() {
        assert!(BedrockProvider::is_claude_model(
            "anthropic.claude-sonnet-4-5-20250929-v1:0"
        ));
        assert!(!BedrockProvider::is_claude_model(
            "meta.llama3-3-70b-instruct-v1:0"
        ));
    }

    #[test]
    fn test_check_model_family_claude_ok() {
        let provider = fake_provider();
        assert!(provider
            .check_model_family("anthropic.claude-opus-4-5-20251001-v1:0")
            .is_ok());
    }

    #[test]
    fn test_check_model_family_llama_err() {
        let provider = fake_provider();
        let err = provider.check_model_family("meta.llama3-3-70b-instruct-v1:0");
        assert!(err.is_err());
        assert!(matches!(err.unwrap_err(), ProviderError::Internal { .. }));
    }

    #[test]
    fn test_check_model_family_titan_err() {
        let provider = fake_provider();
        let err = provider.check_model_family("amazon.titan-text-premier-v1:0");
        assert!(err.is_err());
    }

    #[test]
    fn test_transform_simple_request() {
        let provider = fake_provider();
        let request =
            CreateResponseRequest::text("anthropic.claude-sonnet-4-5-20250929-v1:0", "Hello!");

        let bedrock_req = provider.transform_claude_request(&request);

        assert_eq!(bedrock_req.anthropic_version, "bedrock-2023-05-31");
        assert_eq!(bedrock_req.messages.len(), 1);
        assert_eq!(bedrock_req.messages[0].role, "user");
    }

    #[test]
    fn test_transform_request_with_instructions() {
        let provider = fake_provider();
        let request =
            CreateResponseRequest::text("anthropic.claude-sonnet-4-5-20250929-v1:0", "Hello!")
                .with_instructions("Be concise");

        let bedrock_req = provider.transform_claude_request(&request);

        assert_eq!(bedrock_req.system, Some("Be concise".to_string()));
        assert_eq!(bedrock_req.messages.len(), 1);
    }

    #[test]
    fn test_transform_request_with_tools() {
        let provider = fake_provider();
        let request = CreateResponseRequest::text(
            "anthropic.claude-sonnet-4-5-20250929-v1:0",
            "Check the weather",
        )
        .with_tools(vec![Tool::function(
            FunctionDefinition::new("get_weather").with_description("Get weather data"),
        )]);

        let bedrock_req = provider.transform_claude_request(&request);

        assert!(bedrock_req.tools.is_some());
        let tools = bedrock_req.tools.unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "get_weather");
    }

    #[test]
    fn test_transform_response_completed() {
        let provider = fake_provider();
        let raw = BedrockClaudeResponse {
            content: vec![BedrockContentBlock::Text {
                text: "Hi from Bedrock!".to_string(),
            }],
            stop_reason: Some("end_turn".to_string()),
            usage: BedrockUsage {
                input_tokens: 12,
                output_tokens: 8,
            },
        };

        let response =
            provider.transform_claude_response(raw, "anthropic.claude-sonnet-4-5-20250929-v1:0");

        assert_eq!(response.status, aura_types::ResponseStatus::Completed);
        assert_eq!(response.output.len(), 1);
        assert!(response.id.starts_with("resp_bed_"));
        assert!(response.usage.is_some());
    }

    #[test]
    fn test_transform_response_max_tokens() {
        let provider = fake_provider();
        let raw = BedrockClaudeResponse {
            content: vec![BedrockContentBlock::Text {
                text: "Truncated response...".to_string(),
            }],
            stop_reason: Some("max_tokens".to_string()),
            usage: BedrockUsage {
                input_tokens: 100,
                output_tokens: 4096,
            },
        };

        let response =
            provider.transform_claude_response(raw, "anthropic.claude-sonnet-4-5-20250929-v1:0");

        assert_eq!(response.status, aura_types::ResponseStatus::Incomplete);
        assert!(matches!(
            response.incomplete_reason,
            Some(IncompleteReason::MaxTokens)
        ));
    }

    #[test]
    fn test_provider_name() {
        let provider = fake_provider();
        assert_eq!(provider.name(), "bedrock");
    }

    #[test]
    fn test_supports_listed_models() {
        let provider = fake_provider();
        assert!(provider.supports_model("anthropic.claude-sonnet-4-5-20250929-v1:0"));
        assert!(provider.supports_model("meta.llama3-3-70b-instruct-v1:0"));
        assert!(!provider.supports_model("gpt-4"));
    }
}
