//! Core business logic for the Aura LLM Gateway
//!
//! This crate contains the core logic for the gateway,
//! including provider implementations, routing, caching, and load balancing.

pub mod config;
pub mod http;
pub mod state;

pub use config::{
    AdminConfig, Config, ConfigBuilder, ConfigError, DatabaseConfig, LoggingConfig, ProviderConfig,
    RedisConfig, ServerConfig,
};
pub use http::{HttpClient, HttpClientConfig, HttpError};
pub use state::{AppState, AppStateBuilder};

/// Returns the crate version
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        let ver = version();
        assert!(!ver.is_empty());
        // Verify version follows semver format (e.g., "0.1.1")
        assert!(
            ver.split('.').count() >= 2,
            "version should be in semver format"
        );
    }
}
