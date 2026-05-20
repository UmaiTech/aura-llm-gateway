//! Together AI provider implementation.
//!
//! Together exposes an OpenAI-compatible chat completions API, but tool-call
//! arguments may arrive either as a JSON string or as an already-parsed JSON
//! value. This adapter normalizes both shapes back to the Open Responses API
//! JSON-string representation.

use async_trait::async_trait;
use aura_types::{
    ContentPart, CreateResponseRequest, FunctionCallItem, IncompleteReason, InputContent,
    InputItem, Item, MessageItem, Response, ResponseError, Role, Tool, ToolChoice, ToolChoiceAuto,
    Usage,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, instrument, warn};

use super::{EventStream, Provider, ProviderError};

const TOGETHER_API_BASE: &str = "https://api.together.xyz/v1";

const SUPPORTED_MODELS: &[&str] = &[
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "meta-llama/Llama-3.1-405B-Instruct-Turbo",
    "meta-llama/Llama-3.1-70B-Instruct-Turbo",
    "meta-llama/Llama-3.1-8B-Instruct-Turbo",
    "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "Qwen/Qwen2.5-72B-Instruct-Turbo",
    "Qwen/Qwen2.5-32B-Instruct-Turbo",
    "deepseek-ai/DeepSeek-V3",
    "deepseek-ai/DeepSeek-R1",
    "databricks/dbrx-instruct",
];

pub struct TogetherProvider {
    client: Client,
    api_key: String,
    base_url: String,
}

impl TogetherProvider {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: TOGETHER_API_BASE.to_string(),
        }
    }

    pub fn with_base_url(api_key: impl Into<String>, base_url: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: base_url.into(),
        }
    }

    fn transform_request(&self, request: &CreateResponseRequest) -> TogetherRequest {
        let mut messages = Vec::new();

        if let Some(instructions) = &request.instructions {
            messages.push(TogetherMessage {
                role: "system".to_string(),
                content: Some(TogetherContent::Text(instructions.clone())),
                tool_call_id: None,
            });
        }

        for item in &request.input {
            match item {
                InputItem::Message { role, content } => {
                    if *role == Role::System {
                        continue;
                    }

                    let together_content = match content {
                        InputContent::Text(text) => TogetherContent::Text(text.clone()),
                        InputContent::Parts(parts) => {
                            let parts = parts
                                .iter()
                                .map(|part| match part {
                                    ContentPart::Text { text } => {
                                        TogetherContentPart::Text { text: text.clone() }
                                    }
                                    ContentPart::Image {
                                        url,
                                        data,
                                        media_type,
                                    } => {
                                        if let Some(url) = url {
                                            TogetherContentPart::ImageUrl {
                                                image_url: TogetherImageUrl { url: url.clone() },
                                            }
                                        } else if let Some(data) = data {
                                            let media =
                                                media_type.as_deref().unwrap_or("image/png");
                                            TogetherContentPart::ImageUrl {
                                                image_url: TogetherImageUrl {
                                                    url: format!("data:{};base64,{}", media, data),
                                                },
                                            }
                                        } else {
                                            TogetherContentPart::Text {
                                                text: "[Invalid image]".to_string(),
                                            }
                                        }
                                    }
                                    ContentPart::Audio { data, media_type } => {
                                        TogetherContentPart::Text {
                                            text: format!(
                                                "[Audio: {} bytes, type: {}]",
                                                data.len(),
                                                media_type.as_deref().unwrap_or("audio/mp3"),
                                            ),
                                        }
                                    }
                                })
                                .collect();
                            TogetherContent::Parts(parts)
                        }
                    };

                    messages.push(TogetherMessage {
                        role: match role {
                            Role::User => "user".to_string(),
                            Role::Assistant => "assistant".to_string(),
                            Role::Tool => "tool".to_string(),
                            Role::System => {
                                unreachable!("System messages are filtered out earlier")
                            }
                        },
                        content: Some(together_content),
                        tool_call_id: None,
                    });
                }
                InputItem::FunctionCallOutput { call_id, output } => {
                    messages.push(TogetherMessage {
                        role: "tool".to_string(),
                        content: Some(TogetherContent::Text(output.clone())),
                        tool_call_id: Some(call_id.clone()),
                    });
                }
            }
        }

        let tools = request.tools.as_ref().map(|tools| {
            tools
                .iter()
                .map(|tool| match tool {
                    Tool::Function { function } => TogetherTool {
                        r#type: "function".to_string(),
                        function: TogetherFunction {
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
                ToolChoiceAuto::Auto => TogetherToolChoice::String("auto".to_string()),
                ToolChoiceAuto::Required => TogetherToolChoice::String("required".to_string()),
                ToolChoiceAuto::None => TogetherToolChoice::String("none".to_string()),
            },
            ToolChoice::Function { function, .. } => TogetherToolChoice::Object {
                r#type: "function".to_string(),
                function: TogetherToolChoiceFunction {
                    name: function.name.clone(),
                },
            },
        });

        TogetherRequest {
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

    fn transform_response(&self, response: TogetherResponse, model: &str) -> Response {
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
                warn!(reason = %reason, "Unknown finish reason from Together");
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

        let mut builder = Response::builder(format!("resp_tog_{}", response.id), model)
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
        struct TogetherErrorEnvelope {
            error: Option<TogetherErrorBody>,
            message: Option<String>,
        }

        #[derive(Deserialize)]
        struct TogetherErrorBody {
            message: Option<String>,
            #[serde(rename = "type")]
            error_type: Option<String>,
        }

        let (message, error_type) =
            if let Ok(envelope) = serde_json::from_str::<TogetherErrorEnvelope>(body) {
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
impl Provider for TogetherProvider {
    fn name(&self) -> &str {
        "together"
    }

    fn models(&self) -> &[&str] {
        SUPPORTED_MODELS
    }

    #[instrument(skip(self, request), fields(model = %request.model))]
    async fn complete(&self, request: CreateResponseRequest) -> Result<Response, ProviderError> {
        let model = request.model.clone();
        let together_request = self.transform_request(&request);

        debug!(model = %model, "Sending request to Together");

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&together_request)
            .send()
            .await?;

        let status = response.status().as_u16();
        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Together API error");
            return Err(self.parse_error_response(status, &body));
        }

        let together_response: TogetherResponse = response.json().await?;
        debug!(id = %together_response.id, "Received response from Together");

        Ok(self.transform_response(together_response, &model))
    }

    async fn complete_stream(
        &self,
        _request: CreateResponseRequest,
    ) -> Result<EventStream, ProviderError> {
        Err(ProviderError::internal(
            "Together streaming is not implemented yet",
        ))
    }
}

#[derive(Debug, Serialize)]
struct TogetherRequest {
    model: String,
    messages: Vec<TogetherMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<TogetherTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<TogetherToolChoice>,
}

#[derive(Debug, Serialize)]
struct TogetherMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<TogetherContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum TogetherContent {
    Text(String),
    Parts(Vec<TogetherContentPart>),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum TogetherContentPart {
    Text { text: String },
    ImageUrl { image_url: TogetherImageUrl },
}

#[derive(Debug, Serialize)]
struct TogetherImageUrl {
    url: String,
}

#[derive(Debug, Serialize)]
struct TogetherTool {
    r#type: String,
    function: TogetherFunction,
}

#[derive(Debug, Serialize)]
struct TogetherFunction {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parameters: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum TogetherToolChoice {
    String(String),
    Object {
        r#type: String,
        function: TogetherToolChoiceFunction,
    },
}

#[derive(Debug, Serialize)]
struct TogetherToolChoiceFunction {
    name: String,
}

#[derive(Debug, Deserialize)]
struct TogetherResponse {
    id: String,
    created: i64,
    #[allow(dead_code)]
    model: String,
    choices: Vec<TogetherChoice>,
    usage: Option<TogetherUsage>,
}

#[derive(Debug, Deserialize)]
struct TogetherChoice {
    message: TogetherResponseMessage,
    finish_reason: String,
}

#[derive(Debug, Deserialize)]
struct TogetherResponseMessage {
    content: Option<String>,
    tool_calls: Option<Vec<TogetherToolCallResponse>>,
}

#[derive(Debug, Deserialize)]
struct TogetherToolCallResponse {
    id: Option<String>,
    function: TogetherFunctionCallResponse,
}

#[derive(Debug, Deserialize)]
struct TogetherFunctionCallResponse {
    name: String,
    arguments: TogetherArguments,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum TogetherArguments {
    String(String),
    Json(serde_json::Value),
}

impl TogetherArguments {
    fn normalized(&self) -> String {
        match self {
            Self::String(value) => value.clone(),
            Self::Json(value) => serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string()),
        }
    }
}

#[derive(Debug, Deserialize)]
struct TogetherUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    #[allow(dead_code)]
    total_tokens: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::FunctionDefinition;
    use serde_json::json;

    #[test]
    fn test_transform_simple_request() {
        let provider = TogetherProvider::new("test-key");
        let request =
            CreateResponseRequest::text("meta-llama/Llama-3.3-70B-Instruct-Turbo", "Hello!");

        let together_request = provider.transform_request(&request);

        assert_eq!(
            together_request.model,
            "meta-llama/Llama-3.3-70B-Instruct-Turbo"
        );
        assert_eq!(together_request.messages.len(), 1);
        assert_eq!(together_request.messages[0].role, "user");
    }

    #[test]
    fn test_transform_request_with_instructions() {
        let provider = TogetherProvider::new("test-key");
        let request =
            CreateResponseRequest::text("meta-llama/Llama-3.3-70B-Instruct-Turbo", "Hello!")
                .with_instructions("Be helpful");

        let together_request = provider.transform_request(&request);

        assert_eq!(together_request.messages.len(), 2);
        assert_eq!(together_request.messages[0].role, "system");
        assert_eq!(together_request.messages[1].role, "user");
    }

    #[test]
    fn test_transform_request_with_tools() {
        let provider = TogetherProvider::new("test-key");
        let request =
            CreateResponseRequest::text("meta-llama/Llama-3.3-70B-Instruct-Turbo", "Get weather")
                .with_tools(vec![Tool::function(
                    FunctionDefinition::new("get_weather").with_description("Get current weather"),
                )]);

        let together_request = provider.transform_request(&request);

        let tools = together_request.tools.expect("tools should be present");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].function.name, "get_weather");
    }

    #[test]
    fn test_transform_response_with_string_tool_arguments() {
        let provider = TogetherProvider::new("test-key");
        let raw = TogetherResponse {
            id: "abc123".to_string(),
            created: 1_700_000_000,
            model: "meta-llama/Llama-3.3-70B-Instruct-Turbo".to_string(),
            choices: vec![TogetherChoice {
                message: TogetherResponseMessage {
                    content: None,
                    tool_calls: Some(vec![TogetherToolCallResponse {
                        id: Some("call_123".to_string()),
                        function: TogetherFunctionCallResponse {
                            name: "get_weather".to_string(),
                            arguments: TogetherArguments::String(r#"{"city":"SF"}"#.to_string()),
                        },
                    }]),
                },
                finish_reason: "tool_calls".to_string(),
            }],
            usage: None,
        };

        let response = provider.transform_response(raw, "meta-llama/Llama-3.3-70B-Instruct-Turbo");

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
        let provider = TogetherProvider::new("test-key");
        let raw = TogetherResponse {
            id: "abc456".to_string(),
            created: 1_700_000_001,
            model: "meta-llama/Llama-3.3-70B-Instruct-Turbo".to_string(),
            choices: vec![TogetherChoice {
                message: TogetherResponseMessage {
                    content: None,
                    tool_calls: Some(vec![TogetherToolCallResponse {
                        id: Some("call_456".to_string()),
                        function: TogetherFunctionCallResponse {
                            name: "search_docs".to_string(),
                            arguments: TogetherArguments::Json(json!({
                                "query": "pricing",
                                "limit": 3
                            })),
                        },
                    }]),
                },
                finish_reason: "tool_calls".to_string(),
            }],
            usage: Some(TogetherUsage {
                prompt_tokens: 10,
                completion_tokens: 2,
                total_tokens: 12,
            }),
        };

        let response = provider.transform_response(raw, "meta-llama/Llama-3.3-70B-Instruct-Turbo");

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
        let provider = TogetherProvider::new("test-key");
        assert!(provider.supports_model("meta-llama/Llama-3.3-70B-Instruct-Turbo"));
        assert!(provider.supports_model("deepseek-ai/DeepSeek-V3"));
        assert!(!provider.supports_model("gpt-4o"));
    }

    #[test]
    fn test_error_code_mapping() {
        let provider = TogetherProvider::new("test-key");

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
}
