//! Aura LLM Gateway - Main server binary
//!
//! This is the main entry point for the Aura LLM Gateway proxy server.
//! It sets up the Axum web server with routes, middleware, and observability.

mod routes;

use anyhow::Context;
use aura_core::{CostCalculator, OpenAIProvider, Provider};
use aura_db::{DbPool, NewRequestLog, PoolConfig, RequestLogRepo};
use axum::Router;
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
}

impl AppState {
    /// Creates a new AppState with the given configuration
    pub fn new(config: aura_core::Config, db_pool: Option<DbPool>) -> Self {
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

        // TODO: Add Anthropic provider when implemented
        // TODO: Add Google provider when implemented

        if db_pool.is_some() {
            info!("Database connection pool initialized - request logging enabled");
        } else {
            warn!("No database connection - request logging disabled");
        }

        Self {
            config: Arc::new(config),
            providers: Arc::new(providers),
            model_map: Arc::new(model_map),
            cost_calculator: Arc::new(CostCalculator::new()),
            db_pool,
        }
    }

    /// Get database pool reference
    pub fn db_pool(&self) -> Option<&DbPool> {
        self.db_pool.as_ref()
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
    pub fn enrich_response(
        &self,
        mut response: aura_types::Response,
        request_id: &str,
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
            .unwrap_or("unknown");

        // Extract agentic metadata from response
        let tool_calls: Vec<&str> = response
            .output
            .iter()
            .filter_map(|item| item.as_function_call())
            .map(|fc| fc.name.as_str())
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

        let aura_metadata = serde_json::json!({
            "aura": {
                "request_id": request_id,
                "model": response.model,
                "provider": provider_name,
                "gateway_version": env!("CARGO_PKG_VERSION"),
                "agentic": agentic,
            }
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
    pub fn enrich_response_with_latency(
        &self,
        response: aura_types::Response,
        request_id: &str,
        latency_ms: u64,
    ) -> aura_types::Response {
        let mut response = self.enrich_response(response, request_id);

        // Add latency to aura metadata
        if let Some(ref mut metadata) = response.metadata {
            if let Some(aura) = metadata.get_mut("aura") {
                if let Some(obj) = aura.as_object_mut() {
                    obj.insert("latency_ms".to_string(), serde_json::json!(latency_ms));
                }
            }
        }

        response
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    init_tracing();

    info!("Starting Aura LLM Gateway v{}", env!("CARGO_PKG_VERSION"));

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

    // Create app state
    let state = AppState::new(config.clone(), db_pool);

    // Build router with middleware
    let app = Router::new()
        .merge(routes::app_router())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
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
