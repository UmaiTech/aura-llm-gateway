//! Aura LLM Gateway - Main server binary
//!
//! This is the main entry point for the Aura LLM Gateway proxy server.
//! It sets up the Axum web server with routes, middleware, and observability.

mod routes;

use anyhow::Context;
use aura_core::router::auto::{
    ArmStats, CatalogSource, CostModel, LearnedModel, TierModels, COST_MODEL_KIND,
};
use aura_core::{
    cost::ScrapedPricing, AnthropicProvider, AutoDecision, AutoRouter, BedrockProvider,
    CostCalculator, FireworksProvider, GatewaySettings, GeminiProvider, HuggingFaceProvider,
    MistralProvider, ModelCatalog, OllamaProvider, OpenAIProvider, OrgAutoRoutingOverride,
    Provider, RateLimiter, RedisPool, ResponseCache, TogetherProvider,
};
use aura_db::{
    ApiKeyUsageRepo, DbPool, GatewaySettingsRepo, ModelPricingRepo, NewApiKeyUsage, NewRequestLog,
    NewRoutingDecision, PoolConfig, RequestLogRepo, RoutingDecisionRepo,
};
use axum::http::HeaderValue;
use axum::{middleware, Router};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
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
    /// Flags an operator may flip at runtime (payload capture, tool-context
    /// replay, response cache, rate limiting). Seeded from the boot config
    /// and the environment, then overridden by the stored gateway settings.
    runtime: Arc<RuntimeFlags>,
    /// Runtime overrides currently applied (`gateway_settings` table).
    gateway_settings: Arc<std::sync::RwLock<GatewaySettings>>,
    /// Complexity-based auto router (`model: "auto"`). Present when auto
    /// routing or shadow scoring is configured and at least one tier has
    /// a model this gateway can serve. Rebuilt whenever the runtime
    /// settings change.
    auto_router: Arc<std::sync::RwLock<Option<Arc<AutoRouter>>>>,
    /// Tier models dropped at the last router build because this gateway
    /// cannot serve them (surfaced in the admin settings page).
    router_dropped: Arc<std::sync::RwLock<Vec<String>>>,
    /// What the gateway knows about each servable model (prices,
    /// capabilities, context window), built from providers + model_pricing.
    model_catalog: Arc<ModelCatalog>,
    /// Short-lived cache of organization settings JSON, keyed by org id.
    org_settings_cache:
        Arc<tokio::sync::RwLock<HashMap<uuid::Uuid, (std::time::Instant, serde_json::Value)>>>,
    /// Learned (tier, model) arm statistics for Thompson sampling,
    /// refreshed by the outcome rollup.
    arm_stats: Arc<std::sync::RwLock<HashMap<(String, String), ArmStats>>>,
    /// Active learned classifier (`classifier: learned`), if any.
    learned_model: Arc<std::sync::RwLock<Option<Arc<LearnedModel>>>>,
    /// Active learned cost model (`within_tier: predicted_cost`,
    /// `routing.max_cost_usd`), if any.
    cost_model: Arc<std::sync::RwLock<Option<Arc<CostModel>>>>,
    /// Per-model circuit breaker fed by auto-routing provider failures.
    model_breaker: Arc<std::sync::Mutex<HashMap<String, BreakerState>>>,
}

/// Runtime-adjustable switches. Atomics so request handlers read them
/// without locking; the admin settings endpoint is the only writer.
#[derive(Debug)]
pub struct RuntimeFlags {
    payload_capture: AtomicBool,
    replay_tool_context: AtomicBool,
    cache_enabled: AtomicBool,
    cache_ttl_secs: AtomicU64,
    rate_limit_enabled: AtomicBool,
    default_rate_limit_rpm: AtomicU32,
}

/// Requests per minute for API keys without their own limit.
pub const DEFAULT_RATE_LIMIT_RPM: u32 = 60;

impl RuntimeFlags {
    /// Boot values: the config file / environment, no overrides.
    fn from_config(config: &aura_core::Config) -> Self {
        Self {
            payload_capture: AtomicBool::new(config.payload_capture_enabled()),
            replay_tool_context: AtomicBool::new(routes::tool_context_replay_from_env()),
            cache_enabled: AtomicBool::new(true),
            cache_ttl_secs: AtomicU64::new(aura_core::cache::DEFAULT_CACHE_TTL),
            rate_limit_enabled: AtomicBool::new(true),
            default_rate_limit_rpm: AtomicU32::new(DEFAULT_RATE_LIMIT_RPM),
        }
    }

    /// Apply overrides on top of the boot values.
    fn apply(&self, config: &aura_core::Config, settings: &GatewaySettings) {
        let boot = Self::from_config(config);
        let get = |flag: &AtomicBool| flag.load(Ordering::Relaxed);
        self.payload_capture.store(
            settings
                .features
                .payload_capture
                .unwrap_or_else(|| get(&boot.payload_capture)),
            Ordering::Relaxed,
        );
        self.replay_tool_context.store(
            settings
                .features
                .replay_tool_context
                .unwrap_or_else(|| get(&boot.replay_tool_context)),
            Ordering::Relaxed,
        );
        self.cache_enabled.store(
            settings
                .cache
                .enabled
                .unwrap_or_else(|| get(&boot.cache_enabled)),
            Ordering::Relaxed,
        );
        self.rate_limit_enabled.store(
            settings
                .rate_limit
                .enabled
                .unwrap_or_else(|| get(&boot.rate_limit_enabled)),
            Ordering::Relaxed,
        );
        self.cache_ttl_secs.store(
            settings
                .cache
                .default_ttl_secs
                .unwrap_or_else(|| boot.cache_ttl_secs.load(Ordering::Relaxed)),
            Ordering::Relaxed,
        );
        self.default_rate_limit_rpm.store(
            settings
                .rate_limit
                .default_rpm
                .unwrap_or_else(|| boot.default_rate_limit_rpm.load(Ordering::Relaxed)),
            Ordering::Relaxed,
        );
    }
}

/// Circuit-breaker state for one model.
#[derive(Debug, Default, Clone)]
struct BreakerState {
    /// Recent failure timestamps within the window.
    failures: Vec<std::time::Instant>,
    /// When set, the model is ineligible until this instant.
    open_until: Option<std::time::Instant>,
}

/// How long organization settings are cached before being re-read.
const ORG_SETTINGS_TTL: std::time::Duration = std::time::Duration::from_secs(60);

impl AppState {
    /// Creates a new AppState with the given configuration
    pub async fn new(
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

        // Register Together provider if API key is configured
        if let Some(api_key) = &config.providers.together_api_key {
            info!("Registering Together provider");
            let together = Arc::new(TogetherProvider::new(api_key)) as Arc<dyn Provider>;

            for model in together.models() {
                model_map.insert(model.to_string(), "together".to_string());
            }

            providers.insert("together".to_string(), together);
        } else {
            warn!("TOGETHER_API_KEY not configured - Together provider disabled");
        }

        // Register Fireworks provider if API key is configured
        if let Some(api_key) = &config.providers.fireworks_api_key {
            info!("Registering Fireworks provider");
            let fireworks = Arc::new(FireworksProvider::new(api_key)) as Arc<dyn Provider>;

            for model in fireworks.models() {
                model_map.insert(model.to_string(), "fireworks".to_string());
            }

            providers.insert("fireworks".to_string(), fireworks);
        } else {
            warn!("FIREWORKS_API_KEY not configured - Fireworks provider disabled");
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

        let runtime = RuntimeFlags::from_config(&config);
        if runtime.payload_capture.load(Ordering::Relaxed) {
            info!("Payload capture enabled (AURA_PAYLOAD_CAPTURE=on)");
        }

        // Seed the cost calculator with hardcoded defaults, then override any
        // models we serve with fresher scraped prices from the DB. The scraped
        // `model_pricing` rows are keyed by display slug; `apply_db_pricing`
        // maps those to the gateway's API slugs and leaves unmatched models on
        // their seed price.
        let cost_calculator = Arc::new(CostCalculator::new());
        let mut catalog_sources: Vec<CatalogSource> = Vec::new();
        if let Some(pool) = &db_pool {
            match ModelPricingRepo::get_all_current(pool).await {
                Ok(rows) => {
                    catalog_sources = rows
                        .iter()
                        .map(|r| CatalogSource {
                            model_id: r.model_id.clone(),
                            provider: r.provider_name.clone(),
                            capabilities: r.capabilities.clone(),
                            good_at: r.good_at.clone(),
                            context_window: r.context_window.and_then(|c| u32::try_from(c).ok()),
                            max_output_tokens: r
                                .max_output_tokens
                                .and_then(|c| u32::try_from(c).ok()),
                            input_per_million: Some(r.input_per_million),
                            output_per_million: Some(r.output_per_million),
                        })
                        .collect();
                    let scraped: Vec<ScrapedPricing> = rows
                        .into_iter()
                        .map(|r| ScrapedPricing {
                            provider: r.provider_name,
                            scraped_model_id: r.model_id,
                            input_per_million: r.input_per_million,
                            output_per_million: r.output_per_million,
                            cached_input_per_million: r.cached_input_per_million,
                        })
                        .collect();
                    let updated = cost_calculator.apply_db_pricing(&scraped);
                    info!(
                        scraped = scraped.len(),
                        applied = updated,
                        "Refreshed cost calculator from scraped model_pricing"
                    );
                }
                Err(e) => {
                    warn!(error = %e, "Failed to load scraped pricing; using hardcoded defaults");
                }
            }
        }

        // Model catalog: every model a provider explicitly lists (Ollama's
        // catch-all is excluded by construction), enriched from the
        // pricing table and the seeded price list.
        let servable: Vec<(String, String)> = model_map
            .iter()
            .map(|(m, p)| (m.clone(), p.clone()))
            .collect();
        let mut model_catalog = ModelCatalog::build(
            &servable,
            &catalog_sources,
            aura_core::cost::api_slug_for_scraped,
        );
        model_catalog.fill_prices(|m| {
            cost_calculator
                .get_pricing(m)
                .map(|p| (p.input_per_million, p.output_per_million))
        });
        info!(
            models = model_catalog.len(),
            enriched = model_catalog
                .entries()
                .iter()
                .filter(|e| e.from_database)
                .count(),
            "Model catalog built"
        );

        let (auto_router, router_dropped) = build_auto_router(
            config.routing.auto.clone(),
            &model_catalog,
            &providers,
            &model_map,
        );

        Self {
            config: Arc::new(config),
            providers: Arc::new(providers),
            model_map: Arc::new(model_map),
            cost_calculator,
            db_pool,
            redis_pool,
            rate_limiter,
            response_cache,
            runtime: Arc::new(runtime),
            gateway_settings: Arc::new(std::sync::RwLock::new(GatewaySettings::default())),
            auto_router: Arc::new(std::sync::RwLock::new(auto_router)),
            router_dropped: Arc::new(std::sync::RwLock::new(router_dropped)),
            model_catalog: Arc::new(model_catalog),
            org_settings_cache: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
            arm_stats: Arc::new(std::sync::RwLock::new(HashMap::new())),
            learned_model: Arc::new(std::sync::RwLock::new(None)),
            cost_model: Arc::new(std::sync::RwLock::new(None)),
            model_breaker: Arc::new(std::sync::Mutex::new(HashMap::new())),
        }
    }

    /// Record a provider failure for a model. Opens the breaker once
    /// `breaker_failures` failures land within `breaker_window_secs`.
    /// Returns true when the breaker is (now) open.
    pub fn record_model_failure(&self, model: &str) -> bool {
        let cfg = &self.config.routing.auto.escalation;
        let now = std::time::Instant::now();
        let window = std::time::Duration::from_secs(cfg.breaker_window_secs.max(1));
        let Ok(mut map) = self.model_breaker.lock() else {
            return false;
        };
        let st = map.entry(model.to_string()).or_default();
        st.failures.retain(|t| now.duration_since(*t) < window);
        st.failures.push(now);
        if st.failures.len() as u32 >= cfg.breaker_failures.max(1) {
            st.open_until =
                Some(now + std::time::Duration::from_secs(cfg.breaker_cooldown_secs.max(1)));
            st.failures.clear();
            warn!(model = %model, cooldown_secs = cfg.breaker_cooldown_secs, "auto routing: circuit breaker opened");
            return true;
        }
        st.open_until.map(|u| u > now).unwrap_or(false)
    }

    /// Record a success for a model: clears its failure history.
    pub fn record_model_success(&self, model: &str) {
        if let Ok(mut map) = self.model_breaker.lock() {
            map.remove(model);
        }
    }

    /// True while a model's breaker is open.
    pub fn is_model_breaker_open(&self, model: &str) -> bool {
        let Ok(map) = self.model_breaker.lock() else {
            return false;
        };
        map.get(model)
            .and_then(|st| st.open_until)
            .map(|u| u > std::time::Instant::now())
            .unwrap_or(false)
    }

    /// The active learned classifier, if one is loaded.
    pub fn learned_model(&self) -> Option<Arc<LearnedModel>> {
        self.learned_model.read().ok().and_then(|g| g.clone())
    }

    /// Install (or clear) the learned classifier.
    pub fn set_learned_model(&self, model: Option<LearnedModel>) {
        if let Ok(mut guard) = self.learned_model.write() {
            *guard = model.map(Arc::new);
        }
    }

    /// The active learned cost model, if one is loaded.
    pub fn cost_model(&self) -> Option<Arc<CostModel>> {
        self.cost_model.read().ok().and_then(|g| g.clone())
    }

    /// Install (or clear) the learned cost model.
    pub fn set_cost_model(&self, model: Option<CostModel>) {
        if let Ok(mut guard) = self.cost_model.write() {
            *guard = model.map(Arc::new);
        }
    }

    /// Weights JSON for a kind: the active `router_models` row when a
    /// database is present, else the configured file. `Ok(None)` when
    /// neither exists.
    async fn load_model_weights(
        &self,
        kind: &str,
        file: Option<&str>,
    ) -> Result<Option<serde_json::Value>, String> {
        if let Some(pool) = &self.db_pool {
            match aura_db::RouterModelRepo::active(pool, kind).await {
                Ok(Some(row)) => return Ok(Some(row.weights)),
                Ok(None) => {}
                Err(e) => return Err(format!("failed to read router_models: {e}")),
            }
        }
        let path = file.map(str::trim).filter(|p| !p.is_empty());
        if let Some(path) = path {
            let text = std::fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?;
            let json: serde_json::Value =
                serde_json::from_str(&text).map_err(|e| format!("{path}: {e}"))?;
            return Ok(Some(json));
        }
        Ok(None)
    }

    /// Load the learned classifier: the active `learned_lr` row when a
    /// database is present, else `routing.auto.learned_weights_file`.
    /// Returns a description of what was loaded.
    pub async fn reload_learned_model(&self) -> Result<Option<String>, String> {
        let file = self.config.routing.auto.learned_weights_file.clone();
        match self
            .load_model_weights("learned_lr", file.as_deref())
            .await?
        {
            Some(json) => {
                let model = LearnedModel::from_json(&json)?;
                let label = model.classifier_label();
                self.set_learned_model(Some(model));
                Ok(Some(label))
            }
            None => {
                self.set_learned_model(None);
                Ok(None)
            }
        }
    }

    /// Load the learned cost model: the active `cost_lr` row when a
    /// database is present, else `routing.auto.cost_weights_file`.
    pub async fn reload_cost_model(&self) -> Result<Option<String>, String> {
        let file = self.config.routing.auto.cost_weights_file.clone();
        match self
            .load_model_weights(COST_MODEL_KIND, file.as_deref())
            .await?
        {
            Some(json) => {
                let model = CostModel::from_json(&json)?;
                let label = model.label();
                self.set_cost_model(Some(model));
                Ok(Some(label))
            }
            None => {
                self.set_cost_model(None);
                Ok(None)
            }
        }
    }

    /// Arm statistics for a (tier, model), if the rollup has produced any.
    pub fn arm_stats_for(&self, tier: &str, model: &str) -> Option<ArmStats> {
        self.arm_stats
            .read()
            .ok()?
            .get(&(tier.to_string(), model.to_string()))
            .copied()
    }

    /// Replace all arm statistics (called by the outcome rollup).
    pub async fn replace_arm_stats(&self, stats: HashMap<(String, String), ArmStats>) {
        if let Ok(mut guard) = self.arm_stats.write() {
            *guard = stats;
        }
    }

    /// The model catalog.
    pub fn model_catalog(&self) -> &ModelCatalog {
        &self.model_catalog
    }

    /// Organization settings JSON, cached for `ORG_SETTINGS_TTL`.
    ///
    /// Returns `None` without a database, for an unknown organization, or
    /// on a database error (which is logged).
    pub async fn org_settings(&self, org_id: uuid::Uuid) -> Option<serde_json::Value> {
        let pool = self.db_pool.as_ref()?;
        {
            let cache = self.org_settings_cache.read().await;
            if let Some((at, value)) = cache.get(&org_id) {
                if at.elapsed() < ORG_SETTINGS_TTL {
                    return Some(value.clone());
                }
            }
        }
        match aura_db::OrganizationRepo::get_settings(pool, org_id).await {
            Ok(settings) => {
                let value = settings.unwrap_or(serde_json::Value::Null);
                self.org_settings_cache
                    .write()
                    .await
                    .insert(org_id, (std::time::Instant::now(), value.clone()));
                if value.is_null() {
                    None
                } else {
                    Some(value)
                }
            }
            Err(e) => {
                warn!(org_id = %org_id, error = %e, "Failed to fetch organization settings");
                None
            }
        }
    }

    /// Forget cached settings for an organization (call after an update).
    pub async fn invalidate_org_settings(&self, org_id: uuid::Uuid) {
        self.org_settings_cache.write().await.remove(&org_id);
    }

    /// Auto-routing override for an organization, if it has one.
    pub async fn org_auto_routing_override(
        &self,
        org_id: Option<uuid::Uuid>,
    ) -> OrgAutoRoutingOverride {
        let Some(org_id) = org_id else {
            return OrgAutoRoutingOverride::default();
        };
        match self.org_settings(org_id).await {
            Some(settings) => OrgAutoRoutingOverride::from_org_settings(&settings),
            None => OrgAutoRoutingOverride::default(),
        }
    }

    /// The auto router, when configured (enabled or shadow-only).
    pub fn auto_router(&self) -> Option<Arc<AutoRouter>> {
        self.auto_router.read().ok().and_then(|g| g.clone())
    }

    /// Tier models dropped at the last router build (`tier:model`).
    pub fn router_dropped_models(&self) -> Vec<String> {
        self.router_dropped
            .read()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    /// The auto-routing configuration in force: boot config plus the
    /// applied runtime overrides, before pruning. Available even when no
    /// router was built (nothing servable), so the admin app can show it.
    pub fn effective_auto_config(&self) -> aura_core::AutoRoutingConfig {
        self.gateway_settings()
            .apply_to_auto(&self.config.routing.auto)
    }

    /// Top-level payload capture switch (`AURA_PAYLOAD_CAPTURE` or the
    /// runtime override). When false the per-org flag is never consulted.
    pub fn payload_capture_enabled(&self) -> bool {
        self.runtime.payload_capture.load(Ordering::Relaxed)
    }

    /// Re-synthesize prior tool calls from `previous_response_id`.
    pub fn replay_tool_context_enabled(&self) -> bool {
        self.runtime.replay_tool_context.load(Ordering::Relaxed)
    }

    /// Serve and store cached responses (still needs Redis).
    pub fn cache_enabled(&self) -> bool {
        self.runtime.cache_enabled.load(Ordering::Relaxed)
    }

    /// TTL for newly cached responses.
    pub fn cache_ttl_secs(&self) -> u64 {
        self.runtime.cache_ttl_secs.load(Ordering::Relaxed)
    }

    /// Enforce per-key rate limits (still needs Redis).
    pub fn rate_limit_enabled(&self) -> bool {
        self.runtime.rate_limit_enabled.load(Ordering::Relaxed)
    }

    /// Requests per minute for keys without their own limit.
    pub fn default_rate_limit_rpm(&self) -> u32 {
        self.runtime.default_rate_limit_rpm.load(Ordering::Relaxed)
    }

    /// The runtime overrides currently applied.
    pub fn gateway_settings(&self) -> GatewaySettings {
        self.gateway_settings
            .read()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    /// Apply runtime overrides: flip the flags and rebuild the auto
    /// router. Returns the tier models dropped because this gateway
    /// cannot serve them. Does not persist; see `save_gateway_settings`.
    pub fn apply_gateway_settings(&self, settings: GatewaySettings) -> Vec<String> {
        self.runtime.apply(&self.config, &settings);
        let auto_cfg = settings.apply_to_auto(&self.config.routing.auto);
        let (router, dropped) = build_auto_router(
            auto_cfg,
            &self.model_catalog,
            &self.providers,
            &self.model_map,
        );
        if let Ok(mut guard) = self.auto_router.write() {
            *guard = router;
        }
        if let Ok(mut guard) = self.router_dropped.write() {
            *guard = dropped.clone();
        }
        if let Ok(mut guard) = self.gateway_settings.write() {
            *guard = settings;
        }
        dropped
    }

    /// Persist runtime overrides. Returns `Ok(false)` without a database
    /// (the overrides then live only in this process).
    pub async fn save_gateway_settings(&self, settings: &GatewaySettings) -> Result<bool, String> {
        let Some(pool) = self.db_pool.as_ref() else {
            return Ok(false);
        };
        let value = serde_json::to_value(settings).map_err(|e| e.to_string())?;
        GatewaySettingsRepo::set(pool, &value)
            .await
            .map(|_| true)
            .map_err(|e| e.to_string())
    }

    /// Load and apply the stored runtime overrides. Returns whether a
    /// non-empty document was found.
    pub async fn load_gateway_settings(&self) -> Result<bool, String> {
        let Some(pool) = self.db_pool.as_ref() else {
            return Ok(false);
        };
        let Some(value) = GatewaySettingsRepo::get(pool)
            .await
            .map_err(|e| e.to_string())?
        else {
            return Ok(false);
        };
        let settings: GatewaySettings =
            serde_json::from_value(value).map_err(|e| format!("stored gateway_settings: {e}"))?;
        if settings.is_empty() {
            return Ok(false);
        }
        settings.validate()?;
        let dropped = self.apply_gateway_settings(settings);
        if !dropped.is_empty() {
            warn!(dropped = ?dropped, "gateway settings: tier models this gateway cannot serve");
        }
        Ok(true)
    }

    /// Cost calculator reference
    pub fn cost_calculator(&self) -> &CostCalculator {
        &self.cost_calculator
    }

    /// Provider name for a model that is explicitly in a provider's
    /// catalog. Unlike `get_provider`, this never falls through to
    /// catch-all providers such as Ollama, so a tier model is only
    /// eligible when the gateway really serves it.
    pub fn provider_name_for_catalog_model(&self, model: &str) -> Option<String> {
        provider_name_for_catalog_model(&self.providers, &self.model_map, model)
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

    /// Return true when payload capture should be active for a given request.
    ///
    /// Layer 1: env flag (`payload_capture_enabled`) must be `true`.
    /// Layer 2: if an `org_id` is provided, the org's
    ///   `settings->>'capture_payloads'` must be `"true"`.
    ///   When `org_id` is `None` (unauthenticated / no org context),
    ///   we fall back to the env flag alone — this matches dev/admin usage.
    pub async fn should_capture_payload(&self, org_id: Option<uuid::Uuid>) -> bool {
        if !self.payload_capture_enabled() {
            return false;
        }
        let Some(oid) = org_id else {
            // No org context — honour the env flag alone.
            return true;
        };
        let Some(pool) = &self.db_pool else {
            // No DB — can't consult org settings; fall back to env flag.
            return true;
        };
        let _ = pool;
        match self.org_settings(oid).await {
            Some(settings) => settings
                .get("capture_payloads")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            None => false,
        }
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

    /// Persist an auto-routing decision (applied or shadow) for a request.
    ///
    /// No-op without a database or without a decision. Upserts on the
    /// gateway request id so completion paths can re-record with the
    /// provider response id once it is known.
    pub async fn record_routing_decision(
        &self,
        decision: Option<&AutoDecision>,
        request_id: &str,
        provider_response_id: Option<&str>,
        auth_context: Option<&crate::routes::AuthContext>,
        conversation_id: Option<uuid::Uuid>,
    ) {
        let (Some(pool), Some(d)) = (&self.db_pool, decision) else {
            return;
        };
        let requested_price = if d.shadow {
            self.cost_calculator
                .blended_cost_per_million(&d.requested_model)
        } else {
            None
        };
        let new = NewRoutingDecision {
            response_id: request_id.to_string(),
            provider_response_id: provider_response_id.map(|s| s.to_string()),
            organization_id: auth_context.and_then(|a| a.tenant.organization_id),
            api_key_id: auth_context.map(|a| a.api_key.id),
            conversation_id,
            requested_model: d.requested_model.clone(),
            mode: d.mode.as_str().to_string(),
            classifier: d.classifier.clone(),
            score: d.score,
            raw_score: d.raw_score,
            classified_tier: d.classified_tier.as_str().to_string(),
            tier: d.tier.as_str().to_string(),
            selected_model: d.selected.clone(),
            selected_provider: d.selected_provider.clone(),
            reason: d.reason.clone(),
            shadow: d.shadow,
            features: serde_json::to_value(&d.features).unwrap_or(serde_json::json!({})),
            signals: serde_json::to_value(&d.signals).unwrap_or(serde_json::json!({})),
            hard_filters: d.hard_filters.clone(),
            candidates: serde_json::to_value(&d.candidates).unwrap_or(serde_json::json!([])),
            requested_blended_per_million: requested_price,
            selected_blended_per_million: self
                .cost_calculator
                .blended_cost_per_million(&d.selected),
            decision_latency_us: d.latency_us.min(i32::MAX as u64) as i32,
            escalations: serde_json::to_value(&d.escalations).unwrap_or(serde_json::json!([])),
        };
        if let Err(e) = RoutingDecisionRepo::upsert(pool, new).await {
            error!(error = %e, request_id = %request_id, "Failed to record routing decision");
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
        auto_decision: Option<&AutoDecision>,
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

                    // Add the auto-routing decision (applied or shadow)
                    if let Some(decision) = auto_decision {
                        if let Ok(value) = serde_json::to_value(decision) {
                            obj.insert("routing".to_string(), value);
                        }
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
        // Each early-return below now logs at INFO so we can grep
        // `flyctl logs` for which branch is short-circuiting. After we
        // identify the culprit we can demote these back to debug.
        info!(
            api_key_id = %auth.api_key.id,
            response_id = %response.id,
            usage_present = response.usage.is_some(),
            db_pool_present = self.db_pool.is_some(),
            "record_api_key_usage: entered"
        );

        let Some(pool) = &self.db_pool else {
            info!(
                api_key_id = %auth.api_key.id,
                "record_api_key_usage: no db_pool — skipping"
            );
            return;
        };

        let usage = match &response.usage {
            Some(u) => u,
            None => {
                info!(
                    api_key_id = %auth.api_key.id,
                    response_id = %response.id,
                    "record_api_key_usage: response.usage is None — skipping"
                );
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
                // Bumped to info! while debugging why api_key_usage was
                // empty in production. Demote back to debug! once
                // diagnostics show rows being written reliably.
                info!(
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
/// Strict model → provider resolution used by the auto router's
/// eligibility oracle: exact catalog hit first, then `supports_model` on
/// every provider except Ollama (whose `supports_model` accepts any
/// non-empty name).
/// Build the auto router from a configuration: derive tiers from the
/// catalog when none are configured, drop models this gateway cannot
/// serve, and return `None` when nothing is left to route to (or neither
/// routing nor shadow scoring is wanted). The second value lists the
/// dropped `tier:model` entries.
fn build_auto_router(
    mut auto_cfg: aura_core::AutoRoutingConfig,
    model_catalog: &ModelCatalog,
    providers: &HashMap<String, Arc<dyn Provider>>,
    model_map: &HashMap<String, String>,
) -> (Option<Arc<AutoRouter>>, Vec<String>) {
    if !auto_cfg.has_candidates() {
        // No tiers configured at all: derive them from the catalog
        // (price thirds, `reasoning` tag) so `auto` works out of
        // the box on any gateway with a pricing table.
        auto_cfg.tiers = TierModels::from_catalog(model_catalog, 3);
        if auto_cfg.has_candidates() {
            info!(
                simple = ?auto_cfg.tiers.simple,
                medium = ?auto_cfg.tiers.medium,
                complex = ?auto_cfg.tiers.complex,
                reasoning = ?auto_cfg.tiers.reasoning,
                "Auto routing: derived tiers from the model catalog"
            );
        }
    }
    let dropped = auto_cfg.prune_unknown_models(|m| {
        provider_name_for_catalog_model(providers, model_map, m).is_some()
    });
    if !dropped.is_empty() {
        warn!(
            dropped = ?dropped,
            "Auto routing: dropped tier models this gateway cannot serve"
        );
    }
    let wanted = auto_cfg.enabled || auto_cfg.shadow_for_pinned_models;
    let router = if wanted && !auto_cfg.has_candidates() {
        warn!("Auto routing: no tier has a servable model; auto routing disabled");
        None
    } else if wanted {
        info!(
            enabled = auto_cfg.enabled,
            shadow = auto_cfg.shadow_for_pinned_models,
            default_mode = %auto_cfg.default_mode,
            simple = ?auto_cfg.tiers.simple,
            medium = ?auto_cfg.tiers.medium,
            complex = ?auto_cfg.tiers.complex,
            reasoning = ?auto_cfg.tiers.reasoning,
            "Auto routing configured"
        );
        Some(Arc::new(AutoRouter::new(auto_cfg)))
    } else {
        None
    };
    (router, dropped)
}

fn provider_name_for_catalog_model(
    providers: &HashMap<String, Arc<dyn Provider>>,
    model_map: &HashMap<String, String>,
    model: &str,
) -> Option<String> {
    if let Some(name) = model_map.get(model) {
        return Some(name.clone());
    }
    providers
        .iter()
        .filter(|(name, _)| name.as_str() != "ollama")
        .find(|(_, p)| p.supports_model(model))
        .map(|(name, _)| name.clone())
}

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
    //
    // We scan all args (not just args[1]) and ignore anything that looks like
    // a self-path. Some runtimes (notably Fly.io's release_command) end up
    // calling the binary with its own path duplicated in argv, e.g.:
    //   argv = ["/app/aura-proxy", "/app/aura-proxy", "migrate"]
    // which would defeat a naive `args[1]` check.
    let args: Vec<String> = std::env::args().collect();
    let self_path = args.first().cloned().unwrap_or_default();
    let known_subcommands = ["migrate"];
    let interesting: Vec<&str> = args
        .iter()
        .skip(1)
        .map(String::as_str)
        .filter(|a| *a != self_path && *a != "aura-proxy")
        .collect();

    match interesting.first().copied() {
        Some("migrate") => return run_migrate().await,
        Some("--version") | Some("-V") => {
            println!("aura-proxy {}", env!("CARGO_PKG_VERSION"));
            return Ok(());
        }
        Some(other) if other.starts_with("--") => {
            // Unknown flag — fall through to start mode
        }
        Some(other) => {
            anyhow::bail!(
                "Unknown subcommand: {other}. Valid: {}",
                known_subcommands.join(", ")
            );
        }
        None => {}
    }

    info!("Starting Aura LLM Gateway v{}", env!("CARGO_PKG_VERSION"));

    // Initialize Prometheus metrics exporter
    init_metrics();

    // Load configuration
    let config = aura_core::Config::load().context("Failed to load configuration")?;
    if let Some(path) = &config.config_file {
        info!(path = %path, "Loaded configuration file (AURA_CONFIG_FILE)");
    }

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
    let state = AppState::new(config.clone(), db_pool, redis_pool).await;

    // Runtime overrides edited from the admin app (gateway_settings table).
    match state.load_gateway_settings().await {
        Ok(true) => info!("Applied stored gateway settings"),
        Ok(false) => debug!("No stored gateway settings"),
        Err(e) => warn!(error = %e, "Failed to load stored gateway settings; using boot config"),
    }

    // Score past auto-routing decisions on a schedule (no-op without a
    // database or a configured router).
    routes::routing_rollup::spawn_rollup_loop(state.clone());

    // Learned classifier and cost model, if active in the database or on disk.
    match state.reload_learned_model().await {
        Ok(Some(label)) => info!(classifier = %label, "Learned router classifier loaded"),
        Ok(None) => debug!("No learned router classifier configured"),
        Err(e) => warn!(error = %e, "Failed to load learned router classifier"),
    }
    match state.reload_cost_model().await {
        Ok(Some(label)) => info!(cost_model = %label, "Learned router cost model loaded"),
        Ok(None) => debug!("No learned router cost model configured"),
        Err(e) => warn!(error = %e, "Failed to load learned router cost model"),
    }

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

    // Retry loop for the Fly release_command:
    //
    // The release_command fires before traffic shifts to the new
    // release. At that exact moment Fly Postgres is sometimes
    // mid-cycle (we've seen both `pool timed out while waiting for an
    // open connection` and `expected to read 5 bytes, got 0 bytes at
    // EOF` — the latter is PG accepting the TCP socket but dropping
    // it before sending the startup packet, i.e. postgres process
    // not yet ready). Both are transient — a single retry 5s later
    // typically succeeds.
    //
    // sqlx's run_migrations is idempotent (tracked in
    // _sqlx_migrations), so a partial success on attempt N and a
    // full success on attempt N+1 is safe.
    //
    // Total grace: ATTEMPTS * BACKOFF_SECS = 6 * 5 = 30s before
    // failing the deploy. Long enough to cover a Fly PG cycle, short
    // enough that a truly broken DB still surfaces fast.
    const ATTEMPTS: u32 = 6;
    const BACKOFF_SECS: u64 = 5;

    info!(attempts = ATTEMPTS, "Running database migrations");

    let mut last_err: Option<anyhow::Error> = None;
    for attempt in 1..=ATTEMPTS {
        // max_connections=2 because this is a one-shot CLI, not a
        // server. connect_timeout=60 absorbs a typical Fly PG cycle
        // within a single attempt.
        let pool_config = PoolConfig::new(&database_url)
            .max_connections(2)
            .connect_timeout(60);

        let outcome: anyhow::Result<()> = async {
            let pool = aura_db::create_pool(pool_config)
                .await
                .context("Failed to connect to database for migrations")?;
            aura_db::run_migrations(&pool)
                .await
                .context("Migration run failed")?;
            Ok(())
        }
        .await;

        match outcome {
            Ok(()) => {
                info!(attempt, "Migrations complete");
                return Ok(());
            }
            Err(e) if attempt < ATTEMPTS => {
                warn!(
                    attempt,
                    next_in_secs = BACKOFF_SECS,
                    error = %e,
                    "Migration attempt failed, retrying"
                );
                tokio::time::sleep(std::time::Duration::from_secs(BACKOFF_SECS)).await;
                last_err = Some(e);
            }
            Err(e) => {
                // Final attempt — bubble up so the release_command
                // fails the deploy and we don't shift traffic to a
                // gateway that can't talk to its DB.
                last_err = Some(e);
                break;
            }
        }
    }

    Err(last_err.unwrap_or_else(|| anyhow::anyhow!("Migrations failed for unknown reason")))
        .context(format!(
            "Migrations failed after {} attempts with {}s backoff",
            ATTEMPTS, BACKOFF_SECS
        ))
}

/// Result of parsing the AURA_CORS_ALLOWED_ORIGINS env var.
#[derive(Debug)]
enum CorsConfig {
    /// Env var unset or all-whitespace — fall back to permissive CORS.
    Unset,
    /// Env var set but every entry was unparseable — fall back to permissive
    /// CORS rather than silently blocking all cross-origin requests.
    AllInvalid { raw: String },
    /// Env var has at least one valid origin. `invalid` lists any entries
    /// that failed to parse and were dropped (for operator-visible logging).
    Strict {
        origins: Vec<HeaderValue>,
        invalid: Vec<String>,
    },
}

/// Parse the comma-separated AURA_CORS_ALLOWED_ORIGINS into a CorsConfig.
fn parse_cors_origins(raw: &str) -> CorsConfig {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return CorsConfig::Unset;
    }

    let entries: Vec<&str> = trimmed
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();

    // All entries were empty after splitting (e.g. ",,,") — treat as unset
    // rather than reporting AllInvalid, since the operator clearly meant nothing.
    if entries.is_empty() {
        return CorsConfig::Unset;
    }

    let mut origins: Vec<HeaderValue> = Vec::with_capacity(entries.len());
    let mut invalid: Vec<String> = Vec::new();
    for entry in &entries {
        match entry.parse::<HeaderValue>() {
            Ok(v) => origins.push(v),
            Err(_) => invalid.push((*entry).to_string()),
        }
    }

    if origins.is_empty() {
        CorsConfig::AllInvalid {
            raw: trimmed.to_string(),
        }
    } else {
        CorsConfig::Strict { origins, invalid }
    }
}

/// Build the permissive CORS layer used as the fallback / dev default.
fn permissive_cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
}

/// Build the CORS layer based on `AURA_CORS_ALLOWED_ORIGINS`.
///
/// 1. **Unset or empty** → permissive CORS (`Any`) with a `warn!` log.
///    Fine for local development; never for production.
///
/// 2. **Set with valid origins** → strict CORS allowing exactly those origins.
///    Invalid entries are logged and dropped.
///
/// 3. **Set but every entry fails to parse** → falls back to permissive CORS
///    with a loud `error!` log, so a typo in the env var doesn't silently
///    break every cross-origin request in production.
fn build_cors_layer() -> CorsLayer {
    let raw = std::env::var("AURA_CORS_ALLOWED_ORIGINS").unwrap_or_default();
    match parse_cors_origins(&raw) {
        CorsConfig::Unset => {
            warn!(
                "AURA_CORS_ALLOWED_ORIGINS unset — using permissive CORS (Any). \
                 Set this in production to restrict to your frontend domains."
            );
            permissive_cors_layer()
        }
        CorsConfig::AllInvalid { raw } => {
            error!(
                raw = %raw,
                "AURA_CORS_ALLOWED_ORIGINS is set but every entry is invalid — \
                 falling back to permissive CORS to avoid silently blocking all \
                 cross-origin requests. Fix the env var to restore strict mode."
            );
            permissive_cors_layer()
        }
        CorsConfig::Strict { origins, invalid } => {
            if !invalid.is_empty() {
                error!(
                    invalid_origins = ?invalid,
                    "AURA_CORS_ALLOWED_ORIGINS contains entries that are not valid \
                     HTTP header values — these will be ignored. Check for typos / \
                     stray whitespace / non-ASCII characters."
                );
            }
            info!(origins = ?origins, "Configuring CORS with explicit allowed origins");
            CorsLayer::new()
                .allow_origin(origins)
                .allow_methods(Any)
                .allow_headers(Any)
                .allow_credentials(false)
        }
    }
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

#[cfg(test)]
mod cors_tests {
    use super::*;

    #[test]
    fn empty_string_returns_unset() {
        assert!(matches!(parse_cors_origins(""), CorsConfig::Unset));
        assert!(matches!(parse_cors_origins("   "), CorsConfig::Unset));
        assert!(matches!(parse_cors_origins(",,, , ,"), CorsConfig::Unset));
    }

    #[test]
    fn single_valid_origin() {
        let cfg = parse_cors_origins("https://playground.aura-llm.dev");
        match cfg {
            CorsConfig::Strict { origins, invalid } => {
                assert_eq!(origins.len(), 1);
                assert_eq!(origins[0], "https://playground.aura-llm.dev");
                assert!(invalid.is_empty());
            }
            _ => panic!("expected Strict variant, got {cfg:?}"),
        }
    }

    #[test]
    fn multiple_valid_origins_trimmed() {
        let cfg = parse_cors_origins(
            "https://aura-llm.dev,  https://playground.aura-llm.dev , https://docs.aura-llm.dev",
        );
        match cfg {
            CorsConfig::Strict { origins, invalid } => {
                assert_eq!(origins.len(), 3);
                assert!(invalid.is_empty());
            }
            _ => panic!("expected Strict variant, got {cfg:?}"),
        }
    }

    #[test]
    fn invalid_entries_partial_kept() {
        // Header values cannot contain whitespace mid-string or non-ASCII.
        let cfg =
            parse_cors_origins("https://valid.example,not\nallowed,https://also-valid.example");
        match cfg {
            CorsConfig::Strict { origins, invalid } => {
                assert_eq!(origins.len(), 2);
                assert_eq!(invalid.len(), 1);
                assert_eq!(invalid[0], "not\nallowed");
            }
            _ => panic!("expected Strict variant with partial validity, got {cfg:?}"),
        }
    }

    #[test]
    fn all_invalid_falls_back() {
        let cfg = parse_cors_origins("not\nallowed,also\rbad");
        match cfg {
            CorsConfig::AllInvalid { raw } => {
                assert!(raw.contains("not\nallowed"));
            }
            _ => panic!("expected AllInvalid variant, got {cfg:?}"),
        }
    }

    #[test]
    fn build_cors_layer_never_panics() {
        // Smoke test — just ensure the public entry point survives each case.
        std::env::remove_var("AURA_CORS_ALLOWED_ORIGINS");
        let _ = build_cors_layer();

        std::env::set_var("AURA_CORS_ALLOWED_ORIGINS", "https://example.com");
        let _ = build_cors_layer();

        std::env::set_var("AURA_CORS_ALLOWED_ORIGINS", "not\nallowed");
        let _ = build_cors_layer();

        std::env::remove_var("AURA_CORS_ALLOWED_ORIGINS");
    }
}
