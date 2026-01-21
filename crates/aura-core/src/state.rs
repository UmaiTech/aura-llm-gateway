//! Application state management for Aura LLM Gateway
//!
//! This module provides the shared application state that is passed
//! to Axum handlers via the State extractor.

use std::sync::Arc;

use crate::config::Config;

/// Shared application state for the Aura LLM Gateway
///
/// This struct holds all shared state that needs to be accessible
/// across different handlers and middleware. It is designed to be
/// wrapped in `Arc` for efficient cloning.
///
/// # Example
///
/// ```
/// use std::sync::Arc;
/// use aura_core::config::ConfigBuilder;
/// use aura_core::state::AppState;
///
/// let config = ConfigBuilder::new()
///     .openai_api_key("sk-test")
///     .build();
///
/// let state = AppState::new(config);
/// let shared_state = Arc::new(state);
///
/// // Access config from state
/// assert!(shared_state.config.has_openai());
/// ```
#[derive(Debug, Clone)]
pub struct AppState {
    /// Application configuration
    pub config: Arc<Config>,
}

impl AppState {
    /// Creates a new AppState with the given configuration
    pub fn new(config: Config) -> Self {
        Self {
            config: Arc::new(config),
        }
    }

    /// Creates a new AppState from an Arc<Config>
    ///
    /// Useful when you already have a shared config reference.
    pub fn with_config(config: Arc<Config>) -> Self {
        Self { config }
    }

    /// Returns a reference to the configuration
    pub fn config(&self) -> &Config {
        &self.config
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new(Config::default())
    }
}

/// Builder for constructing AppState with additional components
///
/// This builder allows for incremental construction of AppState,
/// which is useful when setting up the application with optional
/// components like database pools or Redis connections.
#[derive(Debug)]
pub struct AppStateBuilder {
    config: Config,
}

impl AppStateBuilder {
    /// Creates a new AppStateBuilder with the given configuration
    pub fn new(config: Config) -> Self {
        Self { config }
    }

    /// Builds the AppState
    pub fn build(self) -> AppState {
        AppState::new(self.config)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ConfigBuilder;

    #[test]
    fn test_app_state_new() {
        let config = ConfigBuilder::new()
            .host("localhost")
            .port(9000)
            .openai_api_key("sk-test")
            .build();

        let state = AppState::new(config);

        assert_eq!(state.config.server.host, "localhost");
        assert_eq!(state.config.server.port, 9000);
        assert!(state.config.has_openai());
    }

    #[test]
    fn test_app_state_clone() {
        let config = ConfigBuilder::new().openai_api_key("sk-test").build();
        let state = AppState::new(config);
        let cloned = state.clone();

        // Both should point to the same config
        assert!(Arc::ptr_eq(&state.config, &cloned.config));
    }

    #[test]
    fn test_app_state_with_arc_config() {
        let config = Arc::new(ConfigBuilder::new().openai_api_key("sk-test").build());

        let state = AppState::with_config(config.clone());

        assert!(Arc::ptr_eq(&state.config, &config));
    }

    #[test]
    fn test_app_state_default() {
        let state = AppState::default();

        assert_eq!(state.config.server.host, "0.0.0.0");
        assert_eq!(state.config.server.port, 8080);
    }

    #[test]
    fn test_app_state_builder() {
        let config = ConfigBuilder::new()
            .host("127.0.0.1")
            .openai_api_key("sk-test")
            .build();

        let state = AppStateBuilder::new(config).build();

        assert_eq!(state.config.server.host, "127.0.0.1");
    }
}
