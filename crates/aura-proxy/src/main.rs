//! Aura LLM Gateway - Main server binary
//!
//! This is the main entry point for the Aura LLM Gateway proxy server.
//! It sets up the Axum web server with routes, middleware, and observability.

mod routes;

use anyhow::Context;
use aura_core::{OpenAIProvider, Provider};
use axum::Router;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::signal;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::{info, warn, Level};
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
}

impl AppState {
    /// Creates a new AppState with the given configuration
    pub fn new(config: aura_core::Config) -> Self {
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

        Self {
            config: Arc::new(config),
            providers: Arc::new(providers),
            model_map: Arc::new(model_map),
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

    // Create app state
    let state = AppState::new(config.clone());

    // Build router with middleware
    let app = Router::new()
        .merge(routes::app_router())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
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
