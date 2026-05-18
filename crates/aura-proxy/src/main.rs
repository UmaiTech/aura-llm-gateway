//! Aura LLM Gateway - Main server binary
//!
//! This is the main entry point for the Aura LLM Gateway proxy server.
//! It sets up the Axum web server with routes, middleware, and observability.

mod routes;

use anyhow::Context;
use aura_core::{
    AnthropicProvider, BedrockProvider, CostCalculator, GeminiProvider, HuggingFaceProvider,
    MistralProvider, OllamaProvider, OpenAIProvider, Provider, RateLimiter, RedisPool,
    ResponseCache,
};
use aura_db::{ApiKeyUsageRepo, DbPool, NewApiKeyUsage, NewRequestLog, PoolConfig, RequestLogRepo};
use axum::http::HeaderValue;
use axum::{middleware, Router};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::signal;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::{debug, error, info, warn, Level};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Application state shared across handlers
#[derive(Clone)]
pub struct AppState {
    /// Configuration
    pub config: Arc<aura_core::Config>,
    /// Registered providers
    providers: Arc<HashMap<String, Arc<dyn Provider>>>,
    /// Model to provider mapping
    model_map: Arc<HashMap<String, String>>,
    /// Cost calculator for pricing responses
    cost_calculator: Arc<CostCalculator>,
    /// Database connection pool (optional)
    db_pool: Option<DbPool>,
    /// Redis connection pool (optional)
    redis_pool: Option<RedisPool>,
    /// Rate limiter (optional, requires Redis)
    rate_limiter: Option<RateLimiter>,
    /// Response cache (optional, requires Redis)
    response_cache: Option<ResponseCache>,
}

impl AppState {
    /// Creates a new AppState with the given configuration
    pub fn new(
        config: aura_core::Config,
        db_pool: Option<DbPool>,
        redis_pool: Option<RedisPool>,
    ) -> Self {
        let mut providers: HashMap<String, Arc<dyn Provider>> = HashMap::new();
        let mut model_map: HashMap<String, String> = HashMap::new();

        // Register OpenAI provider if API key is configured
        if let Some(api_key) = &config.providers.openai_api_key {
            info!("Registering OpenAI provider");
            let openai = Arc::new(OpenAIProvider::new(api_key)) as Arc<dyn Provider>;

            // Map all supported models to this provider
            for model in openai.models() {
                model_map.insert(model.to_string(), "openai".to_string());
            }

            providers.insert("openai".to_string(), openai);
        } else {
            warn!("OpenAI API key not configured - OpenAI provider disabled");
        }

        // Register Anthropic provider if API key is configured
        if let Some(api_key) = &config.providers.anthropic_api_key {
            info!("Registering Anthropic provider");
            let anthropic = Arc::new(AnthropicProvider::new(api_key)) as Arc<dyn Provider>;

            // Map all supported models to this provider
            for model in anthropic.models() {
                model_map.insert(model.to_string(), "anthropic".to_string());
            }

            providers.insert("anthropic".to_string(), anthropic);
        } else {
            warn!("Anthropic API key not configured - Anthropic provider disabled");
        }

        // Register Google Gemini provider if API key is configured
        if let Some(api_key) = &config.providers.google_api_key {
            info!("Registering Google Gemini provider");
            let gemini = Arc::new(GeminiProvider::new(api_key)) as Arc<dyn Provider>;

            // Map all supported models to this provider
            for model in gemini.models() {
                model_map.insert(model.to_string(), "google".to_string());
            }

            providers.insert("google".to_string(), gemini);
        } else {
            warn!("Google API key not configured - Gemini provider disabled");
        }

        // Register Mistral provider if API key is configured
        if let Some(api_key) = &config.providers.mistral_api_key {
            info!("Registering Mistral provider");
            let mistral = Arc::new(MistralProvider::new(api_key)) as Arc<dyn Provider>;

            for model in mistral.models() {
                model_map.insert(model.to_string(), "mistral".to_string());
            }

            providers.insert("mistral".to_string(), mistral);
        } else {
            warn!("Mistral API key not configured - Mistral provider disabled");
        }

        // Register Ollama provider if base URL is configured
        // (Ollama requires no API key; the URL presence enables it)
        if let Some(base_url) = &config.providers.ollama_base_url {
            info!("Registering Ollama provider");
            let ollama = Arc::new(OllamaProvider::new(Some(base_url.clone()))) as Arc<dyn Provider>;

            // Only register the hardcoded common models in the static map.
            // Runtime resolution via supports_model() handles any other local model.
            for model in ollama.models() {
                model_map.insert(model.to_string(), "ollama".to_string());
            }

            providers.insert("ollama".to_string(), ollama);
        } else {
            warn!("OLLAMA_BASE_URL not configured - Ollama provider disabled");
        }

        // Register HuggingFace TGI provider if both key and endpoint are configured
        if let (Some(api_key), Some(endpoint_url)) = (
            &config.providers.huggingface_api_key,
            &config.providers.huggingface_endpoint_url,
        ) {
            info!("Registering HuggingFace TGI provider");
            let hf = Arc::new(HuggingFaceProvider::new(api_key, endpoint_url)) as Arc<dyn Provider>;

            // HuggingFace has no static model list; models() returns [].
            // Model resolution happens via supports_model() fallback.
            // Register the configured model name if provided.
            if let Some(model_name) = &config.providers.huggingface_model {
                model_map.insert(model_name.clone(), "huggingface".to_string());
            }

            providers.insert("huggingface".to_string(), hf);
        } else {
            warn!("HuggingFace API key or endpoint URL not configured - HuggingFace provider disabled");
        }

        // Register AWS Bedrock provider if region is configured
        // (Credentials come from the AWS default chain at startup)
        if let Some(region) = &config.providers.aws_region {
            info!("Registering AWS Bedrock provider (region: {})", region);
            let bedrock = Arc::new(
                tokio::runtime::Handle::current().block_on(BedrockProvider::new(region.clone())),
            ) as Arc<dyn Provider>;

            for model in bedrock.models() {
                model_map.insert(model.to_string(), "bedrock".to_string());
            }

            providers.insert("bedrock".to_string(), bedrock);
        } else {
            warn!("AWS_REGION not configured - Bedrock provider disabled");
        }

        if db_pool.is_some() {
            info!("Database connection pool initialized - request logging enabled");
        } else {
            warn!("No database connection - request logging disabled");
        }

        // Initialize rate limiter and cache if Redis is available
        let (rate_limiter, response_cache) = if let Some(ref redis) = redis_pool {
            info!("Redis connection initialized - rate limiting and caching enabled");
            (
                Some(RateLimiter::new(redis.clone())),
                Some(ResponseCache::new(redis.clone())),
            )
        } else {
            warn!("No Redis connection - rate limiting and caching disabled");
            (None, None)
        };

        Self {
            config: Arc::new(config),
            providers: Arc::new(providers),
            model_map: Arc::new(model_map),
            cost_calculator: Arc::new(CostCalculator::new()),
            db_pool,
            redis_pool,
            rate_limiter,
            response_cache,
        }
    }

    /// Get database pool reference
    pub fn db_pool(&self) -> Option<&DbPool> {
        self.db_pool.as_ref()
    }

    /// Get Redis pool reference
    pub fn redis_pool(&self) -> Option<&RedisPool> {
        self.redis_pool.as_ref()
    }

    /// Get rate limiter reference
    pub fn rate_limiter(&self) -> Option<&RateLimiter> {
        self.rate_limiter.as_ref()
    }

    /// Get response cache reference
    pub fn response_cache(&self) -> Option<&ResponseCache> {
        self.response_cache.as_ref()
    }

    /// Log a completed request to the database (if available)
    pub async fn log_request(&self, log: NewRequestLog) {
        if let Some(pool) = &self.db_pool {
            match RequestLogRepo::create(pool, log).await {
                Ok(record) => {
                    debug!(
                        response_id = %record.response_id,
                        provider = %record.provider_name,
                        model = %record.model_id,
                        "Request logged to database"
                    );
                }
                Err(e) => {
                    error!(error = %e, "Failed to log request to database");
                }
            }
        }
    }

    /// Get the provider for a given model
    pub fn get_provider(&self, model: &str) -> Option<Arc<dyn Provider>> {
        // First, check if we have an exact mapping
        if let Some(provider_name) = self.model_map.get(model) {
            return self.providers.get(provider_name).cloned();
        }

        // Otherwise, check if any provider supports this model
        for provider in self.providers.values() {
            if provider.supports_model(model) {
                return Some(provider.clone());
            }
        }

        None
    }

    /// Get all registered provider names
    pub fn provider_names(&self) -> Vec<&str> {
        self.providers.keys().map(|s| s.as_str()).collect()
    }

    /// Get all available models
    pub fn available_models(&self) -> Vec<String> {
        self.model_map.keys().cloned().collect()
    }

    /// Enrich a Response with cost information based on model pricing
    pub async fn enrich_response(
        &self,
        mut response: aura_types::Response,
        request_id: &str,
        auth_context: Option<&crate::routes::AuthContext>,
        request: Option<&aura_types::CreateResponseRequest>,
    ) -> aura_types::Response {
        // Add cost to usage
        if let Some(ref mut usage) = response.usage {
            if let Some(cost) = self.cost_calculator.calculate_cost(
                &response.model,
                usage.input_tokens,
                usage.output_tokens,
                usage.cached_tokens,
                usage.reasoning_tokens,
            ) {
                usage.set_cost(cost);
            }
        }

        // Add Aura-specific metadata
        let provider_name = self
            .model_map
            .get(&response.model)
            .map(|s| s.as_str())
            .unwrap_or_else(|| {
                // Fallback: infer provider from model name
                if response.model.starts_with("gpt-") || response.model.starts_with("o1-") {
                    "openai"
                } else if response.model.starts_with("claude-") {
                    "anthropic"
                } else if response.model.starts_with("gemini-") {
                    "google"
                } else if response.model.starts_with("mistral")
                    || response.model.starts_with("codestral")
                    || response.model.starts_with("ministral")
                    || response.model.starts_with("pixtral")
                {
                    "mistral"
                } else if response.model.starts_with("anthropic.") {
                    "bedrock"
                } else {
                    "unknown"
                }
            });

        // Extract agentic metadata from response
        let tool_calls: Vec<&str> = response
            .output
            .iter()
            .filter_map(|item| item.as_function_call())
            .map(|fc| fc.name.as_str())
            .collect();

        // Extract detailed tool call data with arguments
        let tool_calls_data: Vec<serde_json::Value> = response
            .output
            .iter()
            .filter_map(|item| item.as_function_call())
            .map(|fc| {
                // Parse arguments from JSON string to Value
                let args: serde_json::Value = serde_json::from_str(&fc.arguments)
                    .unwrap_or(serde_json::Value::String(fc.arguments.clone()));
                serde_json::json!({
                    "name": fc.name,
                    "arguments": args,
                    "call_id": fc.call_id,
                })
            })
            .collect();

        let tool_calls_count = tool_calls.len();
        let has_tool_calls = tool_calls_count > 0;

        // Check if response requires action (has pending tool calls)
        let requires_action = response.output.iter().any(|item| {
            item.is_function_call() && item.status() == aura_types::ItemStatus::InProgress
        });

        // Check for reasoning items
        let has_reasoning = response.output.iter().any(|item| item.is_reasoning());

        // Get reasoning tokens if available
        let reasoning_tokens = response.usage.as_ref().and_then(|u| u.reasoning_tokens);

        // Build agentic metadata
        let mut agentic = serde_json::json!({
            "output_items_count": response.output.len(),
            "has_tool_calls": has_tool_calls,
        });

        if has_tool_calls {
            agentic["tool_calls_count"] = serde_json::json!(tool_calls_count);
            agentic["tools_used"] = serde_json::json!(tool_calls);
            agentic["tool_calls_data"] = serde_json::json!(tool_calls_data);
            agentic["requires_action"] = serde_json::json!(requires_action);
        }

        if has_reasoning {
            agentic["has_reasoning"] = serde_json::json!(true);
        }

        if let Some(tokens) = reasoning_tokens {
            agentic["reasoning_tokens"] = serde_json::json!(tokens);
        }

        if let Some(reason) = &response.incomplete_reason {
            agentic["incomplete_reason"] =
                serde_json::json!(format!("{:?}", reason).to_lowercase());
        }

        // Build tenant metadata if auth context is available
        let mut tenant_metadata = serde_json::json!({});
        if let Some(auth) = auth_context {
            let tenant = &auth.tenant;
            let mut tenant_obj = serde_json::json!({
                "api_key_id": tenant.api_key_id,
            });

            if let Some(org_id) = tenant.organization_id {
                tenant_obj["organization_id"] = serde_json::json!(org_id);
                if let Some(ref org_name) = tenant.organization_name {
                    tenant_obj["organization_name"] = serde_json::json!(org_name);
                }
            }
            if let Some(team_id) = tenant.team_id {
                tenant_obj["team_id"] = serde_json::json!(team_id);
                if let Some(ref team_name) = tenant.team_name {
                    tenant_obj["team_name"] = serde_json::json!(team_name);
                }
            }
            if let Some(project_id) = tenant.project_id {
                tenant_obj["project_id"] = serde_json::json!(project_id);
                if let Some(ref project_name) = tenant.project_name {
                    tenant_obj["project_name"] = serde_json::json!(project_name);
                }
            }

            tenant_metadata = tenant_obj;
        }

        // Load end-user metadata if user field is provided
        let mut end_user_metadata = None;
        if let (Some(auth), Some(req)) = (auth_context, request) {
            if let (Some(user_id), Some(org_id)) = (&req.user, auth.tenant.organization_id) {
                if let Some(pool) = &self.db_pool {
                    if let Ok(Some(end_user)) =
                        aura_db::EndUserRepo::find_by_external_id(pool, org_id, user_id).await
                    {
                        let mut user_obj = serde_json::json!({
                            "external_id": end_user.external_id,
                        });
                        if let Some(name) = end_user.name {
                            user_obj["name"] = serde_json::json!(name);
                        }
                        if let Some(email) = end_user.email {
                            user_obj["email"] = serde_json::json!(email);
                        }
                        if let Some(metadata) = end_user.metadata {
                            user_obj["metadata"] = metadata;
                        }
                        end_user_metadata = Some(user_obj);
                    }
                }
            }
        }

        let mut aura_metadata_obj = serde_json::json!({
            "request_id": request_id,
            "model": response.model,
            "provider": provider_name,
            "gateway_version": env!("CARGO_PKG_VERSION"),
            "agentic": agentic,
        });

        // Add tenant metadata if available
        if !tenant_metadata.is_null() {
            aura_metadata_obj["tenant"] = tenant_metadata;
        }

        // Add end-user metadata if available
        if let Some(user) = end_user_metadata {
            aura_metadata_obj["end_user"] = user;
        }

        // Add gateway features metadata from request
        if let Some(req) = request {
            // Add validation config if present
            if let Some(ref validation) = req.validation {
                let mut validation_obj = serde_json::json!({
                    "strategy": format!("{:?}", validation.strategy).to_lowercase(),
                });
                if let Some(n) = validation.n {
                    validation_obj["n"] = serde_json::json!(n);
                }
                if let Some(min_conf) = validation.min_confidence {
                    validation_obj["min_confidence"] = serde_json::json!(min_conf);
                }
                if let Some(ref selection) = validation.selection {
                    validation_obj["selection"] =
                        serde_json::json!(format!("{:?}", selection).to_lowercase());
                }
                if validation.include_logprobs == Some(true) {
                    validation_obj["include_logprobs"] = serde_json::json!(true);
                }
                aura_metadata_obj["validation"] = validation_obj;
            }

            // Add consistency config if present
            if let Some(ref consistency) = req.consistency {
                let mut consistency_obj = serde_json::json!({
                    "strategy": format!("{:?}", consistency.strategy).to_lowercase(),
                });
                if consistency.apply_calibration {
                    consistency_obj["apply_calibration"] = serde_json::json!(true);
                }
                if consistency.principles.is_some() {
                    consistency_obj["has_principles"] = serde_json::json!(true);
                    consistency_obj["principles_count"] = serde_json::json!(consistency
                        .principles
                        .as_ref()
                        .map(|p| p.len())
                        .unwrap_or(0));
                }
                if consistency.style_profile.is_some() {
                    consistency_obj["has_style_profile"] = serde_json::json!(true);
                }
                if consistency.examples.is_some() {
                    consistency_obj["has_examples"] = serde_json::json!(true);
                    consistency_obj["examples_count"] = serde_json::json!(consistency
                        .examples
                        .as_ref()
                        .map(|e| e.len())
                        .unwrap_or(0));
                }
                aura_metadata_obj["consistency"] = consistency_obj;
            }

            // Add compression config indicator (actual stats added in enrich_response_with_latency)
            if let Some(ref compression) = req.compression {
                if compression.enabled {
                    aura_metadata_obj["compression_enabled"] = serde_json::json!(true);
                    aura_metadata_obj["compression_config"] = serde_json::json!({
                        "data_format": format!("{:?}", compression.data_format).to_lowercase(),
                        "semantic_format": format!("{:?}", compression.semantic_format).to_lowercase(),
                        "auto_select": compression.auto_select,
                    });
                }
            }
        }

        let aura_metadata = serde_json::json!({
            "aura": aura_metadata_obj
        });

        // Merge with existing metadata or set new
        response.metadata = Some(match response.metadata {
            Some(existing) => {
                if let (
                    serde_json::Value::Object(mut existing_map),
                    serde_json::Value::Object(new_map),
                ) = (existing, aura_metadata)
                {
                    for (k, v) in new_map {
                        existing_map.insert(k, v);
                    }
                    serde_json::Value::Object(existing_map)
                } else {
                    serde_json::json!({"aura": {"request_id": request_id, "provider": provider_name, "gateway_version": env!("CARGO_PKG_VERSION")}})
                }
            }
            None => aura_metadata,
        });

        response
    }

    /// Enrich a Response with cost, timing, and request ID information
    #[allow(clippy::too_many_arguments)]
    pub async fn enrich_response_with_latency(
        &self,
        response: aura_types::Response,
        request_id: &str,
        latency_ms: u64,
        auth_context: Option<&crate::routes::AuthContext>,
        request: Option<&aura_types::CreateResponseRequest>,
        compression_metadata: Option<&aura_types::CompressionMetadata>,
        routing_strategy: Option<&str>,
    ) -> aura_types::Response {
        let mut response = self
            .enrich_response(response, request_id, auth_context, request)
            .await;

        // Add latency, routing, and compression to aura metadata
        if let Some(ref mut metadata) = response.metadata {
            if let Some(aura) = metadata.get_mut("aura") {
                if let Some(obj) = aura.as_object_mut() {
                    obj.insert("latency_ms".to_string(), serde_json::json!(latency_ms));

                    // Add routing strategy if specified
                    if let Some(strategy) = routing_strategy {
                        obj.insert("routing_strategy".to_string(), serde_json::json!(strategy));
                    }

                    // Add compression metadata if present
                    if let Some(compression) = compression_metadata {
                        let mut compression_obj = serde_json::Map::new();

                        if let Some(orig) = compression.original_tokens {
                            compression_obj
                                .insert("original_tokens".to_string(), serde_json::json!(orig));
                        }
                        if let Some(comp) = compression.compressed_tokens {
                            compression_obj
                                .insert("compressed_tokens".to_string(), serde_json::json!(comp));
                        }
                        if let Some(ratio) = compression.ratio {
                            compression_obj.insert("ratio".to_string(), serde_json::json!(ratio));
                            // Calculate savings percentage
                            let savings = (1.0 - ratio) * 100.0;
                            compression_obj
                                .insert("savings_percent".to_string(), serde_json::json!(savings));
                        }
                        if !compression.strategies.is_empty() {
                            let strategies: Vec<String> = compression
                                .strategies
                                .iter()
                                .map(|s| format!("{:?}", s).to_lowercase())
                                .collect();
                            compression_obj
                                .insert("strategies".to_string(), serde_json::json!(strategies));
                        }
                        if let Some(latency) = compression.latency_ms {
                            compression_obj
                                .insert("latency_ms".to_string(), serde_json::json!(latency));
                        }

                        obj.insert(
                            "compression".to_string(),
                            serde_json::Value::Object(compression_obj),
                        );
                    }
                }
            }
        }

        response
    }

    /// Get or create conversation for a request
    /// Returns (conversation_id, is_new)
    pub async fn get_or_create_conversation(
        &self,
        request: &aura_types::CreateResponseRequest,
    ) -> Result<(uuid::Uuid, bool), anyhow::Error> {
        let pool = self.db_pool.as_ref().context("Database not configured")?;

        // Check if continuing existing conversation
        if let Some(prev_response_id) = &request.previous_response_id {
            if let Some(conv_id) =
                aura_db::ResponseRepo::find_conversation_by_response_id(pool, prev_response_id)
                    .await?
            {
                return Ok((conv_id, false));
            }
        }

        // Create new conversation
        let user_id = request.user.clone();
        let first_message = extract_first_user_message(request);

        let conversation = if let Some(msg) = first_message {
            aura_db::ConversationRepo::create_with_auto_title(
                pool,
                user_id,
                request.model.clone(),
                &msg,
            )
            .await?
        } else {
            aura_db::ConversationRepo::create(
                pool,
                aura_db::NewConversation {
                    user_id,
                    title: Some(format!("Conversation with {}", request.model)),
                    model_id: request.model.clone(),
                    metadata: None,
                },
            )
            .await?
        };

        Ok((conversation.id, true))
    }

    /// Save response to database (non-blocking)
    pub async fn save_response(
        &self,
        conversation_id: uuid::Uuid,
        request: &aura_types::CreateResponseRequest,
        response: &aura_types::Response,
    ) {
        if let Some(pool) = &self.db_pool {
            let new_response = aura_db::NewResponse {
                id: response.id.clone(),
                conversation_id,
                model_id: response.model.clone(),
                status: response_status_to_string(&response.status),
                previous_response_id: request.previous_response_id.clone(),
                input_items: serde_json::to_value(&request.input).unwrap_or(serde_json::json!([])),
                output_items: serde_json::to_value(&response.output)
                    .unwrap_or(serde_json::json!([])),
                usage_input_tokens: response.usage.as_ref().map(|u| u.input_tokens as i32),
                usage_output_tokens: response.usage.as_ref().map(|u| u.output_tokens as i32),
                usage_cached_tokens: response
                    .usage
                    .as_ref()
                    .and_then(|u| u.cached_tokens)
                    .map(|t| t as i32),
                usage_reasoning_tokens: response
                    .usage
                    .as_ref()
                    .and_then(|u| u.reasoning_tokens)
                    .map(|t| t as i32),
                usage_cost_usd: response.usage.as_ref().and_then(|u| u.cost_usd),
                error_code: response.error.as_ref().map(|e| e.code.clone()),
                error_message: response.error.as_ref().map(|e| e.message.clone()),
                incomplete_reason: response
                    .incomplete_reason
                    .as_ref()
                    .map(|r| format!("{:?}", r).to_lowercase()),
                metadata: response.metadata.clone(),
            };

            match aura_db::ResponseRepo::create(pool, new_response).await {
                Ok(_) => {
                    debug!(
                        response_id = %response.id,
                        conversation_id = %conversation_id,
                        "Response saved to database"
                    );
                }
                Err(e) => {
                    error!(
                        error = %e,
                        response_id = %response.id,
                        "Failed to save response to database"
                    );
                }
            }
        }
    }

    /// Save message items to messages table (simplified view)
    pub async fn save_messages_from_items(
        &self,
        conversation_id: uuid::Uuid,
        response_id: &str,
        items: &[aura_types::Item],
    ) {
        use aura_types::{Item, Role};

        if let Some(pool) = &self.db_pool {
            for item in items {
                if let Item::Message(msg) = item {
                    let role = match msg.role {
                        Role::User => "user",
                        Role::Assistant => "assistant",
                        Role::System => "system",
                        Role::Tool => "tool",
                    };

                    let content = msg
                        .content
                        .iter()
                        .filter_map(|part| match part {
                            aura_types::ContentPart::Text { text } => Some(text.as_str()),
                            _ => None,
                        })
                        .collect::<Vec<_>>()
                        .join("\n");

                    let metadata = serde_json::json!({
                        "item_id": msg.id,
                        "response_id": response_id,
                        "status": format!("{:?}", msg.status).to_lowercase(),
                    });

                    let new_msg = aura_db::NewMessage {
                        conversation_id,
                        role: role.to_string(),
                        content,
                        metadata: Some(metadata),
                    };

                    if let Err(e) = aura_db::MessageRepo::create(pool, new_msg).await {
                        error!(error = %e, item_id = %msg.id, "Failed to save message to database");
                    }
                }
            }
        }
    }

    /// Record API key usage to the database
    pub async fn record_api_key_usage(
        &self,
        auth: &routes::AuthContext,
        response: &aura_types::Response,
        request: &aura_types::CreateResponseRequest,
    ) {
        let Some(pool) = &self.db_pool else {
            return;
        };

        let usage = match &response.usage {
            Some(u) => u,
            None => {
                debug!("No usage data in response, skipping usage recording");
                return;
            }
        };

        let provider_name = self
            .model_map
            .get(&response.model)
            .map(|s| s.as_str())
            .unwrap_or("unknown");

        // Resolve end_user_id if user field is provided
        let (end_user_id, end_user_external_id) = if let Some(user_external_id) = &request.user {
            if let Some(org_id) = auth.tenant.organization_id {
                // Try to find existing end user or create new one
                match aura_db::EndUserRepo::find_by_external_id(pool, org_id, user_external_id)
                    .await
                {
                    Ok(Some(end_user)) => (Some(end_user.id), Some(user_external_id.clone())),
                    Ok(None) => {
                        // Auto-create end user if not exists
                        let new_end_user = aura_db::NewEndUser {
                            organization_id: org_id,
                            external_id: user_external_id.clone(),
                            name: None,
                            email: None,
                            metadata: None,
                        };
                        match aura_db::EndUserRepo::upsert(pool, new_end_user).await {
                            Ok(end_user) => {
                                info!(
                                    end_user_id = %end_user.id,
                                    external_id = %user_external_id,
                                    "Auto-created end user"
                                );
                                (Some(end_user.id), Some(user_external_id.clone()))
                            }
                            Err(e) => {
                                warn!(error = %e, "Failed to create end user");
                                (None, Some(user_external_id.clone()))
                            }
                        }
                    }
                    Err(e) => {
                        warn!(error = %e, "Failed to lookup end user");
                        (None, Some(user_external_id.clone()))
                    }
                }
            } else {
                (None, Some(user_external_id.clone()))
            }
        } else {
            (None, None)
        };

        let new_usage = NewApiKeyUsage {
            api_key_id: auth.api_key.id,
            request_id: response.id.clone(),
            model_id: response.model.clone(),
            provider_name: provider_name.to_string(),
            input_tokens: usage.input_tokens as i32,
            output_tokens: usage.output_tokens as i32,
            cached_tokens: usage.cached_tokens.map(|t| t as i32),
            reasoning_tokens: usage.reasoning_tokens.map(|t| t as i32),
            cost_usd: usage.cost_usd,
            end_user_id,
            end_user_external_id,
        };

        match ApiKeyUsageRepo::create(pool, new_usage).await {
            Ok(_) => {
                debug!(
                    api_key_id = %auth.api_key.id,
                    request_id = %response.id,
                    input_tokens = %usage.input_tokens,
                    output_tokens = %usage.output_tokens,
                    "API key usage recorded"
                );
            }
            Err(e) => {
                error!(
                    error = %e,
                    api_key_id = %auth.api_key.id,
                    "Failed to record API key usage"
                );
            }
        }
    }
}

/// Extract first user message from request for conversation title
fn extract_first_user_message(request: &aura_types::CreateResponseRequest) -> Option<String> {
    use aura_types::{ContentPart, InputContent, InputItem, Role};

    request.input.iter().find_map(|item| match item {
        InputItem::Message { role, content } if *role == Role::User => Some(match content {
            InputContent::Text(text) => text.clone(),
            InputContent::Parts(parts) => parts
                .iter()
                .filter_map(|p| match p {
                    ContentPart::Text { text } => Some(text.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(" "),
        }),
        _ => None,
    })
}

/// Convert ResponseStatus to string for database
fn response_status_to_string(status: &aura_types::ResponseStatus) -> String {
    use aura_types::ResponseStatus;
    match status {
        ResponseStatus::InProgress => "in_progress",
        ResponseStatus::Completed => "completed",
        ResponseStatus::Failed => "failed",
        ResponseStatus::Incomplete => "incomplete",
        ResponseStatus::Cancelled => "cancelled",
    }
    .to_string()
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    init_tracing();

    // Subcommand dispatch. Supported:
    //   <bin>                — start the gateway (default)
    //   <bin> migrate        — run database migrations and exit
    //   <bin> --version      — print version and exit
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("migrate") => return run_migrate().await,
        Some("--version") | Some("-V") => {
            println!("aura-proxy {}", env!("CARGO_PKG_VERSION"));
            return Ok(());
        }
        Some(other) if other.starts_with("--") => {
            // Unknown flag — fall through to start mode
        }
        Some(other) => {
            anyhow::bail!("Unknown subcommand: {other}. Valid: migrate, --version");
        }
        None => {}
    }

    info!("Starting Aura LLM Gateway v{}", env!("CARGO_PKG_VERSION"));

    // Initialize Prometheus metrics exporter
    init_metrics();

    // Load configuration
    let config = aura_core::Config::from_env().context("Failed to load configuration")?;

    info!(
        "Server will listen on {}:{}",
        config.server.host, config.server.port
    );

    // Optionally connect to database
    let db_pool = if let Some(ref database_url) = config.database.url {
        info!("Connecting to database...");
        let pool_config = PoolConfig::new(database_url);
        match aura_db::create_pool(pool_config).await {
            Ok(pool) => {
                info!("Database connection established");
                Some(pool)
            }
            Err(e) => {
                warn!(error = %e, "Failed to connect to database - continuing without persistence");
                None
            }
        }
    } else {
        info!("DATABASE_URL not configured - running without database");
        None
    };

    // Optionally connect to Redis
    let redis_pool = if let Some(ref redis_url) = config.redis.url {
        info!("Connecting to Redis...");
        match RedisPool::new(redis_url).await {
            Ok(pool) => {
                // Verify connection with ping
                match pool.ping().await {
                    Ok(()) => {
                        info!("Redis connection established");
                        Some(pool)
                    }
                    Err(e) => {
                        warn!(error = %e, "Redis ping failed - continuing without Redis");
                        None
                    }
                }
            }
            Err(e) => {
                warn!(error = %e, "Failed to connect to Redis - continuing without caching/rate limiting");
                None
            }
        }
    } else {
        info!("REDIS_URL not configured - running without caching/rate limiting");
        None
    };

    // Create app state
    let state = AppState::new(config.clone(), db_pool, redis_pool);

    info!(
        providers = state.provider_names().len(),
        models = state.available_models().len(),
        redis = state.redis_pool().is_some(),
        "Gateway initialized"
    );

    // Build router with middleware
    let app = Router::new()
        .merge(routes::app_router())
        // Rate limiting middleware (after auth, before handlers)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            routes::rate_limit_middleware,
        ))
        // Authentication middleware
        .layer(middleware::from_fn_with_state(
            state.clone(),
            routes::auth_middleware,
        ))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .layer(build_cors_layer())
        .with_state(state);

    // Create TCP listener
    let addr = config.server_addr();
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .context("Failed to bind to address")?;

    info!("Listening on {}", addr);

    // Run server with graceful shutdown
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("Server error")?;

    info!("Server shutdown complete");

    Ok(())
}

/// Run sqlx migrations against DATABASE_URL and exit.
///
/// Used as Fly.io's release_command so each deploy applies pending
/// migrations before the new pod starts serving traffic. Idempotent —
/// sqlx tracks applied migrations in the `_sqlx_migrations` table.
async fn run_migrate() -> anyhow::Result<()> {
    let database_url =
        std::env::var("DATABASE_URL").context("DATABASE_URL must be set to run migrations")?;

    info!("Running database migrations");
    let pool_config = PoolConfig::new(&database_url);
    let pool = aura_db::create_pool(pool_config)
        .await
        .context("Failed to connect to database for migrations")?;

    aura_db::run_migrations(&pool)
        .await
        .context("Migration run failed")?;

    info!("Migrations complete");
    Ok(())
}

/// Build the CORS layer.
///
/// Reads `AURA_CORS_ALLOWED_ORIGINS` (comma-separated origins). If unset or
/// empty, falls back to permissive CORS (`Any`) — fine for local development
/// but never for production. Set the env var in production to restrict
/// origins to your actual frontend domains.
fn build_cors_layer() -> CorsLayer {
    let allowed = std::env::var("AURA_CORS_ALLOWED_ORIGINS").unwrap_or_default();
    if allowed.trim().is_empty() {
        warn!(
            "AURA_CORS_ALLOWED_ORIGINS unset — using permissive CORS (Any). \
             Set this in production to restrict to your frontend domains."
        );
        return CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);
    }

    let origins: Vec<HeaderValue> = allowed
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.parse::<HeaderValue>().ok())
        .collect();

    info!(origins = ?origins, "Configuring CORS with explicit allowed origins");

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods(Any)
        .allow_headers(Any)
        .allow_credentials(false)
}

/// Initialize tracing/logging
fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                // Default log level
                "aura_proxy=debug,aura_core=debug,tower_http=debug,axum::rejection=trace".into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
}

/// Initialize Prometheus metrics exporter
fn init_metrics() {
    use metrics_exporter_prometheus::PrometheusBuilder;

    // Build and install the Prometheus recorder
    let builder = PrometheusBuilder::new();

    // Install the recorder globally
    match builder.install_recorder() {
        Ok(handle) => {
            // Store the handle for later use by the /metrics endpoint
            routes::metrics::set_prometheus_handle(handle);
            info!("Prometheus metrics exporter initialized");

            // Describe all metrics for better Prometheus documentation
            aura_core::metrics::describe_metrics();
        }
        Err(e) => {
            warn!(error = %e, "Failed to initialize Prometheus metrics exporter");
        }
    }
}

/// Graceful shutdown signal handler
///
/// Listens for SIGTERM (Ctrl+C) and SIGINT signals to gracefully shutdown the server.
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            info!("Received Ctrl+C signal, shutting down gracefully");
        },
        _ = terminate => {
            info!("Received SIGTERM signal, shutting down gracefully");
        },
    }
}
