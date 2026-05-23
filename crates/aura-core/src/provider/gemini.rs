//! Google Gemini provider implementation
//!
//! Transforms between Open Responses API format and Google's Gemini GenerateContent API.

use async_trait::async_trait;
use aura_types::{
    ContentPart, CreateResponseRequest, FunctionCallItem, HeuristicAnalyzer, IncompleteReason,
    InputContent, InputItem, Item, MessageItem, Response, ResponseError, Role, SelectionCriteria,
    StreamEvent, Tool, ToolChoice, ToolChoiceAuto, Usage, ValidationMetadata, ValidationStrategy,
};
use futures_util::{Stream, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, instrument, warn};

use super::{EventStream, Provider, ProviderError};

/// Google AI API base URL
const GEMINI_API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";

/// Supported Gemini models
/// Supported Gemini models.
///
/// IDs verified against Google's `models.list` endpoint
///   GET https://generativelanguage.googleapis.com/v1beta/models?key=$KEY
/// on 2026-05-22. The previous list contained Aura-internal
/// hallucinations (`gemini-3-pro`, `gemini-3-flash`,
/// `gemini-3-pro-latest`) that Google's API rejected with
///   "Model not found: models/gemini-3-flash is not found for API
///    version v1beta, or is not supported for generateContent"
/// when forwarded. To refresh: hit models.list, keep only entries
/// whose `supportedGenerationMethods` includes `generateContent`,
/// drop anything not returned.
const SUPPORTED_MODELS: &[&str] = &[
    // Gemini 3.x family
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-3-pro-preview",
    "gemini-3-flash-preview",
    // Gemini 2.5 family (GA)
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    // Gemini 2.0 family
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-lite-001",
    // Floating aliases — always resolve to Google's current pick
    "gemini-pro-latest",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
];

/// Google Gemini provider implementation
pub struct GeminiProvider {
    client: Client,
    api_key: String,
    base_url: String,
}

impl GeminiProvider {
    /// Create a new Gemini provider with the given API key
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: GEMINI_API_BASE.to_string(),
        }
    }

    /// Create a new Gemini provider with a custom base URL
    pub fn with_base_url(api_key: impl Into<String>, base_url: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: base_url.into(),
        }
    }

    /// Transform Open Responses request to Gemini format
    fn transform_request(&self, request: &CreateResponseRequest) -> GeminiRequest {
        let mut contents = Vec::new();

        // Batch consecutive FunctionCall items into a single `model`
        // content block carrying multiple `functionCall` parts.
        // Gemini requires parallel tool calls to be in one model
        // content; emitting one model content per call breaks the
        // tool-call/tool-response pairing.
        let mut pending_function_calls: Vec<GeminiPart> = Vec::new();
        let flush_pending = |contents: &mut Vec<GeminiContent>, pending: &mut Vec<GeminiPart>| {
            if !pending.is_empty() {
                contents.push(GeminiContent {
                    role: "model".to_string(),
                    parts: std::mem::take(pending),
                });
            }
        };

        // Transform input items to Gemini contents
        for item in &request.input {
            if !matches!(item, InputItem::FunctionCall { .. }) {
                flush_pending(&mut contents, &mut pending_function_calls);
            }
            match item {
                InputItem::Message { role, content } => {
                    // Skip system messages - they go in system_instruction
                    if *role == Role::System {
                        continue;
                    }

                    let parts = match content {
                        InputContent::Text(text) => vec![GeminiPart::Text { text: text.clone() }],
                        InputContent::Parts(parts) => parts
                            .iter()
                            .map(|p| self.transform_content_part(p))
                            .collect(),
                    };

                    let gemini_role = match role {
                        Role::User => "user",
                        Role::Assistant => "model",
                        Role::System => "user", // Handled above, but fallback
                        Role::Tool => "user", // Function responses come from "user" with functionResponse part
                    };

                    contents.push(GeminiContent {
                        role: gemini_role.to_string(),
                        parts,
                    });
                }
                InputItem::FunctionCall {
                    call_id: _,
                    name,
                    arguments,
                } => {
                    // Buffer into the current batch. Gemini groups
                    // parallel tool calls as multiple functionCall
                    // parts inside ONE model content block — see
                    // flush_pending above.
                    //
                    // Gemini pairs functionCall→functionResponse by
                    // name + position rather than call_id, so we
                    // drop the call_id here. arguments is
                    // JSON-parsed; on parse failure we wrap raw
                    // under raw_arguments rather than dropping.
                    let args_value: serde_json::Value = serde_json::from_str(arguments)
                        .unwrap_or_else(|_| serde_json::json!({ "raw_arguments": arguments }));
                    pending_function_calls.push(GeminiPart::FunctionCall {
                        function_call: GeminiFunctionCall {
                            name: name.clone(),
                            args: args_value,
                        },
                    });
                }
                InputItem::FunctionCallOutput { call_id, output } => {
                    // Function responses in Gemini use functionResponse part
                    // The call_id is used as the function name in Gemini
                    let output_value: serde_json::Value =
                        serde_json::from_str(output).unwrap_or(serde_json::json!({
                            "result": output
                        }));

                    contents.push(GeminiContent {
                        role: "user".to_string(),
                        parts: vec![GeminiPart::FunctionResponse {
                            function_response: GeminiFunctionResponse {
                                name: call_id.clone(),
                                response: output_value,
                            },
                        }],
                    });
                }
            }
        }
        // Flush any trailing FunctionCall batch.
        flush_pending(&mut contents, &mut pending_function_calls);

        // Build system instruction from instructions and system messages
        let system_instruction = self.extract_system_instruction(request);

        // Transform tools
        let tools = request.tools.as_ref().map(|tools| {
            vec![GeminiTool {
                function_declarations: tools
                    .iter()
                    .map(|tool| match tool {
                        Tool::Function { function } => GeminiFunctionDeclaration {
                            name: function.name.clone(),
                            description: function.description.clone(),
                            parameters: function.parameters.clone(),
                        },
                    })
                    .collect(),
            }]
        });

        // Transform tool_choice to toolConfig
        let tool_config = request.tool_choice.as_ref().map(|tc| {
            let mode = match tc {
                ToolChoice::Auto(auto) => match auto {
                    ToolChoiceAuto::Auto => "AUTO",
                    ToolChoiceAuto::Required => "ANY",
                    ToolChoiceAuto::None => "NONE",
                },
                ToolChoice::Function { .. } => "ANY", // Force tool use
            };

            GeminiToolConfig {
                function_calling_config: GeminiFunctionCallingConfig {
                    mode: mode.to_string(),
                    allowed_function_names: match tc {
                        ToolChoice::Function { function, .. } => Some(vec![function.name.clone()]),
                        _ => None,
                    },
                },
            }
        });

        // Determine candidate count based on validation config.
        // Gemini 3.x rejects the candidateCount field with "Only one candidate
        // can be specified in the current model" even when set to 1. Omit the
        // field unless we actually need >1 for best_of_n / self_consistency.
        let candidate_count = match request.validation.as_ref().map(|v| &v.strategy) {
            Some(ValidationStrategy::BestOfN | ValidationStrategy::SelfConsistency) => {
                let n = request
                    .validation
                    .as_ref()
                    .and_then(|v| v.n)
                    .unwrap_or(3)
                    .min(8) as u32;
                Some(n)
            }
            _ => None,
        };

        // Build generation config
        let generation_config = GeminiGenerationConfig {
            max_output_tokens: request.max_output_tokens,
            temperature: request.temperature,
            top_p: request.top_p,
            candidate_count,
        };

        GeminiRequest {
            contents,
            system_instruction,
            generation_config: Some(generation_config),
            tools,
            tool_config,
        }
    }

    /// Extract system instruction from instructions and system messages
    fn extract_system_instruction(&self, request: &CreateResponseRequest) -> Option<GeminiContent> {
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
            Some(GeminiContent {
                role: "user".to_string(), // system_instruction doesn't need role, but we include for struct
                parts: vec![GeminiPart::Text {
                    text: system_parts.join("\n\n"),
                }],
            })
        }
    }

    /// Transform content part to Gemini format
    fn transform_content_part(&self, part: &ContentPart) -> GeminiPart {
        match part {
            ContentPart::Text { text } => GeminiPart::Text { text: text.clone() },
            ContentPart::Image {
                url,
                data,
                media_type,
            } => {
                if let Some(data) = data {
                    GeminiPart::InlineData {
                        inline_data: GeminiBlob {
                            mime_type: media_type
                                .clone()
                                .unwrap_or_else(|| "image/png".to_string()),
                            data: data.clone(),
                        },
                    }
                } else if let Some(url) = url {
                    // Gemini supports file URIs for uploaded files
                    GeminiPart::FileData {
                        file_data: GeminiFileData {
                            mime_type: media_type
                                .clone()
                                .unwrap_or_else(|| "image/png".to_string()),
                            file_uri: url.clone(),
                        },
                    }
                } else {
                    GeminiPart::Text {
                        text: "[Invalid image]".to_string(),
                    }
                }
            }
            ContentPart::Audio { data, media_type } => {
                // Gemini supports audio via inlineData
                GeminiPart::InlineData {
                    inline_data: GeminiBlob {
                        mime_type: media_type
                            .clone()
                            .unwrap_or_else(|| "audio/mp3".to_string()),
                        data: data.clone(),
                    },
                }
            }
        }
    }

    /// Transform Gemini response to Open Responses format
    fn transform_response(&self, response: GeminiResponse, model: &str) -> Response {
        self.transform_response_with_validation(response, model, None, None)
    }

    /// Transform response with optional validation config
    fn transform_response_with_validation(
        &self,
        response: GeminiResponse,
        model: &str,
        validation_strategy: Option<ValidationStrategy>,
        selection_criteria: Option<SelectionCriteria>,
    ) -> Response {
        let candidates = response.candidates.as_ref();
        let num_candidates = candidates.map(|c| c.len()).unwrap_or(0);

        // If we have multiple candidates, select the best one
        let (selected_candidate, _selected_index, validation_meta) =
            if num_candidates > 1 && validation_strategy.is_some() {
                let candidates = candidates.unwrap();
                let selection = selection_criteria.unwrap_or(SelectionCriteria::HighestConfidence);

                // Extract text from each candidate for scoring
                let candidate_texts: Vec<String> = candidates
                    .iter()
                    .map(|c| {
                        c.content
                            .as_ref()
                            .map(|content| {
                                content
                                    .parts
                                    .iter()
                                    .filter_map(|p| match p {
                                        GeminiPart::Text { text } => Some(text.as_str()),
                                        _ => None,
                                    })
                                    .collect::<Vec<_>>()
                                    .join("")
                            })
                            .unwrap_or_default()
                    })
                    .collect();

                let (best_idx, confidence, reason) = match selection {
                    SelectionCriteria::Longest => {
                        let idx = candidate_texts
                            .iter()
                            .enumerate()
                            .max_by_key(|(_, t)| t.len())
                            .map(|(i, _)| i)
                            .unwrap_or(0);
                        let conf = 0.5 + (0.5 * (1.0 / num_candidates as f32));
                        (idx, conf, "Selected longest response".to_string())
                    }
                    SelectionCriteria::Shortest => {
                        let idx = candidate_texts
                            .iter()
                            .enumerate()
                            .filter(|(_, t)| !t.is_empty())
                            .min_by_key(|(_, t)| t.len())
                            .map(|(i, _)| i)
                            .unwrap_or(0);
                        let conf = 0.5 + (0.5 * (1.0 / num_candidates as f32));
                        (idx, conf, "Selected shortest response".to_string())
                    }
                    SelectionCriteria::HighestConfidence | SelectionCriteria::LowestPerplexity => {
                        // Use heuristic analyzer for confidence scoring
                        let scores: Vec<f32> = candidate_texts
                            .iter()
                            .map(|t| HeuristicAnalyzer::estimate_confidence(t, ""))
                            .collect();
                        let idx = scores
                            .iter()
                            .enumerate()
                            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
                            .map(|(i, _)| i)
                            .unwrap_or(0);
                        (
                            idx,
                            scores[idx],
                            "Selected by highest heuristic confidence".to_string(),
                        )
                    }
                    SelectionCriteria::MostRelevant => {
                        // For now, use consistency as a proxy for relevance
                        let refs: Vec<&str> = candidate_texts.iter().map(|s| s.as_str()).collect();
                        let consistency = HeuristicAnalyzer::consistency_score(&refs);
                        // Pick the one most similar to others (median-like selection)
                        let idx = 0; // Simplified: pick first
                        (idx, consistency, "Selected for consistency".to_string())
                    }
                };

                let meta = ValidationMetadata::best_of_n(
                    num_candidates as u8,
                    best_idx as u8,
                    confidence,
                    reason,
                );
                (candidates.get(best_idx), Some(best_idx), Some(meta))
            } else {
                let candidate = candidates.and_then(|c| c.first());
                (candidate, None, None)
            };

        let mut output = Vec::new();
        let mut item_index = 0;

        if let Some(candidate) = selected_candidate {
            if let Some(content) = &candidate.content {
                for part in &content.parts {
                    match part {
                        GeminiPart::Text { text } => {
                            output.push(Item::Message(MessageItem::assistant(
                                format!("msg_{}", item_index),
                                text,
                            )));
                            item_index += 1;
                        }
                        GeminiPart::FunctionCall { function_call } => {
                            output.push(Item::FunctionCall(FunctionCallItem::new(
                                format!("fc_{}", item_index),
                                format!("call_{}", function_call.name),
                                &function_call.name,
                                serde_json::to_string(&function_call.args).unwrap_or_default(),
                            )));
                            item_index += 1;
                        }
                        _ => {}
                    }
                }
            }
        }

        // For validation metadata when single candidate
        let validation_meta = validation_meta.or_else(|| {
            if let Some(strategy) = validation_strategy {
                // Add heuristic confidence for single candidate
                let text = output
                    .iter()
                    .filter_map(|item| item.as_message())
                    .map(|m| m.text())
                    .collect::<String>();
                if !text.is_empty() {
                    let confidence = HeuristicAnalyzer::estimate_confidence(&text, "");
                    Some(
                        ValidationMetadata::with_confidence(strategy, confidence).with_warning(
                            "Heuristic confidence (logprobs not available for Gemini)",
                        ),
                    )
                } else {
                    None
                }
            } else {
                None
            }
        });

        // Use the selected candidate for status
        let candidate_for_status = selected_candidate;

        // Determine status from finish reason
        let (status, incomplete_reason, error) =
            match candidate_for_status.and_then(|c| c.finish_reason.as_deref()) {
                Some("STOP") => (aura_types::ResponseStatus::Completed, None, None),
                Some("MAX_TOKENS") => (
                    aura_types::ResponseStatus::Incomplete,
                    Some(IncompleteReason::MaxTokens),
                    None,
                ),
                Some("SAFETY") => (
                    aura_types::ResponseStatus::Incomplete,
                    Some(IncompleteReason::ContentFilter),
                    None,
                ),
                Some("RECITATION") => (
                    aura_types::ResponseStatus::Incomplete,
                    Some(IncompleteReason::ContentFilter),
                    None,
                ),
                Some("OTHER") => (
                    aura_types::ResponseStatus::Failed,
                    None,
                    Some(ResponseError::new(
                        "generation_failed",
                        "Generation stopped for other reasons",
                    )),
                ),
                Some(reason) => {
                    warn!(reason = %reason, "Unknown finish reason from Gemini");
                    (aura_types::ResponseStatus::Completed, None, None)
                }
                None => {
                    if output.is_empty() {
                        (
                            aura_types::ResponseStatus::Failed,
                            None,
                            Some(ResponseError::new("no_response", "No response from model")),
                        )
                    } else {
                        (aura_types::ResponseStatus::Completed, None, None)
                    }
                }
            };

        // Build usage from usageMetadata
        let usage = response.usage_metadata.as_ref().map(|u| {
            Usage::new(
                u.prompt_token_count.unwrap_or(0),
                u.candidates_token_count.unwrap_or(0),
            )
        });

        // Generate response ID
        let response_id = format!("resp_gem_{}", uuid::Uuid::new_v4());

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
        if let Some(validation) = validation_meta {
            builder = builder.validation(validation);
        }

        builder.build()
    }

    /// Parse Gemini error response
    fn parse_error_response(&self, status: u16, body: &str) -> ProviderError {
        #[derive(Deserialize)]
        struct GeminiError {
            error: GeminiErrorInner,
        }

        #[derive(Deserialize)]
        struct GeminiErrorInner {
            message: String,
            #[allow(dead_code)]
            code: Option<u16>,
            status: Option<String>,
        }

        if let Ok(err) = serde_json::from_str::<GeminiError>(body) {
            let message = err.error.message;
            let error_status = err.error.status.as_deref();

            match (status, error_status) {
                (400, _) | (_, Some("INVALID_ARGUMENT")) => ProviderError::invalid_request(message),
                (401, _) | (_, Some("UNAUTHENTICATED")) => ProviderError::authentication(message),
                (403, _) | (_, Some("PERMISSION_DENIED")) => ProviderError::authentication(message),
                (404, _) | (_, Some("NOT_FOUND")) => {
                    if message.to_lowercase().contains("model") {
                        ProviderError::model_not_found(&message)
                    } else {
                        ProviderError::from_provider(status, message)
                    }
                }
                (429, _) | (_, Some("RESOURCE_EXHAUSTED")) => ProviderError::rate_limit(message),
                (500, _) | (_, Some("INTERNAL")) => ProviderError::from_provider(status, message),
                (503, _) | (_, Some("UNAVAILABLE")) => ProviderError::service_unavailable(message),
                _ => ProviderError::ProviderError {
                    status_code: status,
                    message,
                    error_type: err.error.status,
                },
            }
        } else {
            ProviderError::from_provider(status, body.to_string())
        }
    }

    /// Get the API URL for a model
    fn get_api_url(&self, model: &str, stream: bool) -> String {
        if stream {
            format!(
                "{}/models/{}:streamGenerateContent?alt=sse&key={}",
                self.base_url, model, self.api_key
            )
        } else {
            format!(
                "{}/models/{}:generateContent?key={}",
                self.base_url, model, self.api_key
            )
        }
    }
}

#[async_trait]
impl Provider for GeminiProvider {
    fn name(&self) -> &str {
        "google"
    }

    fn models(&self) -> &[&str] {
        SUPPORTED_MODELS
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete(&self, request: CreateResponseRequest) -> Result<Response, ProviderError> {
        let model = request.model.clone();
        let gemini_request = self.transform_request(&request);

        debug!(model = %model, "Sending request to Gemini");

        let response = self
            .client
            .post(self.get_api_url(&model, false))
            .header("Content-Type", "application/json")
            .json(&gemini_request)
            .send()
            .await?;

        let status = response.status().as_u16();

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Gemini API error");
            return Err(self.parse_error_response(status, &body));
        }

        let gemini_response: GeminiResponse = response.json().await?;
        debug!("Received response from Gemini");

        Ok(self.transform_response(gemini_response, &model))
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete_stream(
        &self,
        request: CreateResponseRequest,
    ) -> Result<EventStream, ProviderError> {
        let model = request.model.clone();
        let gemini_request = self.transform_request(&request);

        debug!(model = %model, "Starting streaming request to Gemini");

        let response = self
            .client
            .post(self.get_api_url(&model, true))
            .header("Content-Type", "application/json")
            .json(&gemini_request)
            .send()
            .await?;

        let status = response.status().as_u16();

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Gemini API error");
            return Err(self.parse_error_response(status, &body));
        }

        let stream = response.bytes_stream();
        let transformer = GeminiStreamTransformer::new(model);

        Ok(Box::pin(transformer.transform(stream)))
    }
}

/// Transforms Gemini SSE stream to Open Responses events
struct GeminiStreamTransformer {
    model: String,
    response_id: String,
    buffer: String,
    accumulated_text: String,
    accumulated_function_calls: std::collections::HashMap<usize, PartialFunctionCall>,
    sent_created: bool,
    sent_in_progress: bool,
    output_item_added: bool,
    content_part_added: bool,
    input_tokens: u32,
    output_tokens: u32,
}

#[derive(Default)]
struct PartialFunctionCall {
    name: String,
    args: String,
}

impl GeminiStreamTransformer {
    fn new(model: String) -> Self {
        Self {
            model,
            response_id: format!("resp_gem_{}", uuid::Uuid::new_v4()),
            buffer: String::new(),
            accumulated_text: String::new(),
            accumulated_function_calls: std::collections::HashMap::new(),
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

                        // Gemini SSE format: "data: {json}"
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
                            // Stream ended - emit final response if we have content
                            if !transformer.accumulated_text.is_empty()
                                || !transformer.accumulated_function_calls.is_empty()
                            {
                                let mut output = Vec::new();
                                if !transformer.accumulated_text.is_empty() {
                                    output.push(Item::Message(MessageItem::assistant(
                                        "msg_0",
                                        &transformer.accumulated_text,
                                    )));
                                }
                                for (idx, fc) in &transformer.accumulated_function_calls {
                                    output.push(Item::FunctionCall(FunctionCallItem::new(
                                        format!("fc_{}", idx),
                                        format!("call_{}", fc.name),
                                        &fc.name,
                                        &fc.args,
                                    )));
                                }

                                let usage =
                                    Usage::new(transformer.input_tokens, transformer.output_tokens);
                                let response = Response::builder(
                                    transformer.response_id.clone(),
                                    transformer.model.clone(),
                                )
                                .outputs(output)
                                .usage(usage)
                                .completed()
                                .build();

                                return Some((
                                    Ok(StreamEvent::response_completed(response)),
                                    (transformer, stream),
                                ));
                            }
                            return None;
                        }
                    }
                }
            },
        )
    }

    fn process_sse_data(&mut self, data: &str) -> Option<Result<StreamEvent, ProviderError>> {
        let chunk: GeminiResponse = match serde_json::from_str(data) {
            Ok(c) => c,
            Err(e) => {
                warn!(error = %e, data = %data, "Failed to parse Gemini stream chunk");
                return None;
            }
        };

        // Update usage metadata
        if let Some(usage) = &chunk.usage_metadata {
            if let Some(input) = usage.prompt_token_count {
                self.input_tokens = input;
            }
            if let Some(output) = usage.candidates_token_count {
                self.output_tokens = output;
            }
        }

        let candidate = chunk.candidates.as_ref().and_then(|c| c.first())?;

        // Check for finish reason
        if let Some(finish_reason) = &candidate.finish_reason {
            if finish_reason == "STOP" || finish_reason == "MAX_TOKENS" || finish_reason == "SAFETY"
            {
                // Build final response
                let mut output = Vec::new();
                if !self.accumulated_text.is_empty() {
                    output.push(Item::Message(MessageItem::assistant(
                        "msg_0",
                        &self.accumulated_text,
                    )));
                }
                for (idx, fc) in &self.accumulated_function_calls {
                    output.push(Item::FunctionCall(FunctionCallItem::new(
                        format!("fc_{}", idx),
                        format!("call_{}", fc.name),
                        &fc.name,
                        &fc.args,
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
        }

        // Process content parts
        let content = candidate.content.as_ref()?;
        for (part_idx, part) in content.parts.iter().enumerate() {
            match part {
                GeminiPart::Text { text } => {
                    // Emit output_item.added if not done yet
                    if !self.output_item_added {
                        self.output_item_added = true;
                        let item = Item::Message(MessageItem::assistant("msg_0", ""));
                        return Some(Ok(StreamEvent::output_item_added(0, item)));
                    }

                    // Emit content_part.added if not done yet
                    if !self.content_part_added {
                        self.content_part_added = true;
                        return Some(Ok(StreamEvent::content_part_added(0, 0, "text")));
                    }

                    // Calculate delta (new text since last update)
                    let delta = if text.len() > self.accumulated_text.len() {
                        text[self.accumulated_text.len()..].to_string()
                    } else {
                        text.clone()
                    };

                    if !delta.is_empty() {
                        self.accumulated_text = text.clone();
                        return Some(Ok(StreamEvent::output_text_delta(0, 0, delta)));
                    }
                }
                GeminiPart::FunctionCall { function_call } => {
                    let entry = self.accumulated_function_calls.entry(part_idx).or_default();
                    entry.name = function_call.name.clone();
                    let args_str = serde_json::to_string(&function_call.args).unwrap_or_default();

                    // Calculate delta for arguments
                    let delta = if args_str.len() > entry.args.len() {
                        args_str[entry.args.len()..].to_string()
                    } else {
                        args_str.clone()
                    };

                    entry.args = args_str;

                    if !delta.is_empty() {
                        return Some(Ok(StreamEvent::function_call_arguments_delta(
                            part_idx, delta,
                        )));
                    }
                }
                _ => {}
            }
        }

        None
    }
}

// ============================================================================
// Gemini API Types
// ============================================================================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<GeminiTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_config: Option<GeminiToolConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct GeminiContent {
    #[serde(skip_serializing_if = "String::is_empty", default)]
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
enum GeminiPart {
    Text {
        text: String,
    },
    InlineData {
        #[serde(rename = "inlineData")]
        inline_data: GeminiBlob,
    },
    FileData {
        #[serde(rename = "fileData")]
        file_data: GeminiFileData,
    },
    FunctionCall {
        #[serde(rename = "functionCall")]
        function_call: GeminiFunctionCall,
    },
    FunctionResponse {
        #[serde(rename = "functionResponse")]
        function_response: GeminiFunctionResponse,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GeminiBlob {
    mime_type: String,
    data: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GeminiFileData {
    mime_type: String,
    file_uri: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct GeminiFunctionCall {
    name: String,
    args: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct GeminiFunctionResponse {
    name: String,
    response: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    candidate_count: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiTool {
    function_declarations: Vec<GeminiFunctionDeclaration>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiFunctionDeclaration {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parameters: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiToolConfig {
    function_calling_config: GeminiFunctionCallingConfig,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiFunctionCallingConfig {
    mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    allowed_function_names: Option<Vec<String>>,
}

// Response types

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
    usage_metadata: Option<GeminiUsageMetadata>,
    #[allow(dead_code)]
    prompt_feedback: Option<GeminiPromptFeedback>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiCandidate {
    content: Option<GeminiContent>,
    finish_reason: Option<String>,
    #[allow(dead_code)]
    safety_ratings: Option<Vec<GeminiSafetyRating>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiUsageMetadata {
    prompt_token_count: Option<u32>,
    candidates_token_count: Option<u32>,
    #[allow(dead_code)]
    total_token_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiPromptFeedback {
    #[allow(dead_code)]
    block_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiSafetyRating {
    #[allow(dead_code)]
    category: String,
    #[allow(dead_code)]
    probability: String,
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::FunctionDefinition;

    #[test]
    fn test_transform_simple_request() {
        let provider = GeminiProvider::new("test-key");
        let request = CreateResponseRequest::text("gemini-1.5-pro", "Hello!");

        let gemini_request = provider.transform_request(&request);

        assert_eq!(gemini_request.contents.len(), 1);
        assert_eq!(gemini_request.contents[0].role, "user");
    }

    #[test]
    fn test_candidate_count_omitted_when_no_validation() {
        // Gemini 3.x rejects any candidateCount field, even =1.
        // Without best_of_n / self_consistency, the field must be omitted entirely.
        let provider = GeminiProvider::new("test-key");
        let request = CreateResponseRequest::text("gemini-3-pro-preview", "Hello!");

        let gemini_request = provider.transform_request(&request);
        let gen_config = gemini_request.generation_config.unwrap();
        assert!(
            gen_config.candidate_count.is_none(),
            "candidate_count must be None so it serializes as omitted",
        );

        let serialized = serde_json::to_string(&gen_config).unwrap();
        assert!(
            !serialized.contains("candidateCount"),
            "candidateCount must not appear in serialized JSON, got: {serialized}",
        );
    }

    #[test]
    fn test_transform_request_with_instructions() {
        let provider = GeminiProvider::new("test-key");
        let request =
            CreateResponseRequest::text("gemini-1.5-pro", "Hello!").with_instructions("Be helpful");

        let gemini_request = provider.transform_request(&request);

        assert!(gemini_request.system_instruction.is_some());
        let system = gemini_request.system_instruction.unwrap();
        assert_eq!(system.parts.len(), 1);
        if let GeminiPart::Text { text } = &system.parts[0] {
            assert_eq!(text, "Be helpful");
        } else {
            panic!("Expected text part");
        }
    }

    #[test]
    fn test_transform_request_with_tools() {
        let provider = GeminiProvider::new("test-key");
        let request =
            CreateResponseRequest::text("gemini-1.5-pro", "Get the weather").with_tools(vec![
                Tool::function(
                    FunctionDefinition::new("get_weather").with_description("Get current weather"),
                ),
            ]);

        let gemini_request = provider.transform_request(&request);

        assert!(gemini_request.tools.is_some());
        let tools = gemini_request.tools.unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].function_declarations.len(), 1);
        assert_eq!(tools[0].function_declarations[0].name, "get_weather");
    }

    #[test]
    fn test_role_mapping() {
        let provider = GeminiProvider::new("test-key");

        // Test that assistant role maps to "model"
        let request = CreateResponseRequest::new(
            "gemini-1.5-pro",
            vec![
                InputItem::user("Hello"),
                InputItem::assistant("Hi there!"),
                InputItem::user("How are you?"),
            ],
        );

        let gemini_request = provider.transform_request(&request);

        assert_eq!(gemini_request.contents.len(), 3);
        assert_eq!(gemini_request.contents[0].role, "user");
        assert_eq!(gemini_request.contents[1].role, "model"); // Not "assistant"
        assert_eq!(gemini_request.contents[2].role, "user");
    }

    #[test]
    fn test_supports_model() {
        let provider = GeminiProvider::new("test-key");
        // Verify a sample from each family — full list is in
        // SUPPORTED_MODELS and is sourced from Google's models.list
        // endpoint. Don't add gemini-1.x or invented gemini-3-pro;
        // those don't exist in Google's API.
        assert!(provider.supports_model("gemini-2.0-flash"));
        assert!(provider.supports_model("gemini-2.5-pro"));
        assert!(provider.supports_model("gemini-2.5-flash"));
        assert!(provider.supports_model("gemini-3-pro-preview"));
        assert!(provider.supports_model("gemini-3-flash-preview"));
        assert!(provider.supports_model("gemini-3.5-flash"));
        assert!(provider.supports_model("gemini-pro-latest"));
        assert!(!provider.supports_model("gpt-4"));
        assert!(!provider.supports_model("claude-3-opus"));
        // Negative cases for the previously-hallucinated ids:
        assert!(!provider.supports_model("gemini-3-pro"));
        assert!(!provider.supports_model("gemini-3-flash"));
        assert!(!provider.supports_model("gemini-1.5-pro"));
    }

    #[test]
    fn test_provider_name() {
        let provider = GeminiProvider::new("test-key");
        assert_eq!(provider.name(), "google");
    }

    #[test]
    fn test_api_url_generation() {
        let provider = GeminiProvider::new("test-key");

        let url = provider.get_api_url("gemini-1.5-pro", false);
        assert!(url.contains("gemini-1.5-pro:generateContent"));
        assert!(url.contains("key=test-key"));

        let stream_url = provider.get_api_url("gemini-1.5-pro", true);
        assert!(stream_url.contains("gemini-1.5-pro:streamGenerateContent"));
        assert!(stream_url.contains("alt=sse"));
    }

    #[test]
    fn test_error_code_mapping() {
        let provider = GeminiProvider::new("test-key");

        let err = provider.parse_error_response(
            401,
            r#"{"error":{"message":"Invalid API key","status":"UNAUTHENTICATED"}}"#,
        );
        assert!(matches!(err, ProviderError::Authentication { .. }));

        let err = provider.parse_error_response(
            429,
            r#"{"error":{"message":"Quota exceeded","status":"RESOURCE_EXHAUSTED"}}"#,
        );
        assert!(matches!(err, ProviderError::RateLimit { .. }));

        let err = provider.parse_error_response(
            400,
            r#"{"error":{"message":"Invalid request","status":"INVALID_ARGUMENT"}}"#,
        );
        assert!(matches!(err, ProviderError::InvalidRequest { .. }));

        let err = provider.parse_error_response(
            503,
            r#"{"error":{"message":"Service unavailable","status":"UNAVAILABLE"}}"#,
        );
        assert!(matches!(err, ProviderError::ServiceUnavailable { .. }));
    }

    #[test]
    fn test_function_call_output_transform() {
        let provider = GeminiProvider::new("test-key");

        let request = CreateResponseRequest::new(
            "gemini-1.5-pro",
            vec![
                InputItem::user("What's the weather?"),
                InputItem::FunctionCallOutput {
                    call_id: "get_weather".to_string(),
                    output: r#"{"temperature": 72, "conditions": "sunny"}"#.to_string(),
                },
            ],
        );

        let gemini_request = provider.transform_request(&request);

        assert_eq!(gemini_request.contents.len(), 2);
        assert_eq!(gemini_request.contents[1].role, "user");

        // Verify it's a function response part
        if let GeminiPart::FunctionResponse { function_response } =
            &gemini_request.contents[1].parts[0]
        {
            assert_eq!(function_response.name, "get_weather");
        } else {
            panic!("Expected FunctionResponse part");
        }
    }

    /// Two parallel FunctionCall items should batch into one `model`
    /// content block with TWO functionCall parts. Gemini requires
    /// this — separate model content blocks break the
    /// functionCall→functionResponse pairing.
    #[test]
    fn test_consecutive_function_calls_batch_into_one_model_content() {
        let provider = GeminiProvider::new("test-key");
        let mut request = CreateResponseRequest::text("gemini-2.5-flash", "weather in two cities?");
        request.input.extend(vec![
            InputItem::FunctionCall {
                call_id: "ignored_1".into(),
                name: "get_weather".into(),
                arguments: r#"{"city":"Paris"}"#.into(),
            },
            InputItem::FunctionCall {
                call_id: "ignored_2".into(),
                name: "get_weather".into(),
                arguments: r#"{"city":"Tokyo"}"#.into(),
            },
            InputItem::FunctionCallOutput {
                call_id: "get_weather".into(),
                output: r#"{"temp":15}"#.into(),
            },
        ]);

        let req = provider.transform_request(&request);

        // Expected: [user, model(parts=[fc_1, fc_2]), user(parts=[fr])]
        assert_eq!(req.contents.len(), 3, "contents = {:#?}", req.contents);
        assert_eq!(req.contents[1].role, "model");
        let function_call_parts: Vec<_> = req.contents[1]
            .parts
            .iter()
            .filter(|p| matches!(p, GeminiPart::FunctionCall { .. }))
            .collect();
        assert_eq!(
            function_call_parts.len(),
            2,
            "two parallel calls should batch into one model content with two functionCall parts"
        );
    }
}
