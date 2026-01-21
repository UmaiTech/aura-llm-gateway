//! Configuration management for Aura LLM Gateway
//!
//! This module provides configuration loading from multiple sources:
//! - YAML configuration files (ideal for Kubernetes/Helm deployments)
//! - Environment variables (with `.env` file support via dotenvy)
//! - Programmatic configuration via builder pattern
//!
//! Configuration priority (highest to lowest):
//! 1. Environment variables
//! 2. YAML configuration file
//! 3. Default values

use serde::{Deserialize, Serialize};
use std::env;
use std::path::Path;
use thiserror::Error;
use tracing::info;

/// Errors that can occur during configuration loading
#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("missing required environment variable: {0}")]
    MissingEnvVar(String),

    #[error("invalid port number: {0}")]
    InvalidPort(String),

    #[error("invalid log level: {0}")]
    InvalidLogLevel(String),

    #[error("at least one provider API key must be configured")]
    NoProviderKeys,

    #[error("failed to read config file: {0}")]
    FileRead(#[from] std::io::Error),

    #[error("failed to parse YAML config: {0}")]
    YamlParse(#[from] serde_yaml::Error),
}

/// Main configuration struct for the Aura LLM Gateway
///
/// Configuration can be loaded from YAML files, environment variables,
/// or constructed programmatically. Supports Kubernetes ConfigMaps
/// and Helm chart values.
///
/// # YAML Example
///
/// ```yaml
/// server:
///   host: "0.0.0.0"
///   port: 8080
///
/// providers:
///   openai_api_key: "sk-..."
///   anthropic_api_key: "sk-ant-..."
///   google_api_key: "..."
///
/// logging:
///   level: "info"
///
/// database:
///   url: "postgres://user:pass@localhost/aura"
///
/// redis:
///   url: "redis://localhost:6379"
///
/// admin:
///   key: "admin-secret-key"
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Server configuration
    #[serde(default)]
    pub server: ServerConfig,

    /// Provider API keys
    #[serde(default)]
    pub providers: ProviderConfig,

    /// Logging configuration
    #[serde(default)]
    pub logging: LoggingConfig,

    /// Database configuration
    #[serde(default)]
    pub database: DatabaseConfig,

    /// Redis configuration
    #[serde(default)]
    pub redis: RedisConfig,

    /// Admin configuration
    #[serde(default)]
    pub admin: AdminConfig,
}

/// Server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ServerConfig {
    /// Host address to bind the server to
    pub host: String,

    /// Port number for the server
    pub port: u16,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: "0.0.0.0".to_string(),
            port: 8080,
        }
    }
}

/// Provider API key configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct ProviderConfig {
    /// OpenAI API key (optional)
    pub openai_api_key: Option<String>,

    /// Anthropic API key (optional)
    pub anthropic_api_key: Option<String>,

    /// Google API key (optional)
    pub google_api_key: Option<String>,
}

/// Logging configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LoggingConfig {
    /// Log level (trace, debug, info, warn, error)
    pub level: String,
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: "info".to_string(),
        }
    }
}

/// Database configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct DatabaseConfig {
    /// PostgreSQL connection URL
    pub url: Option<String>,
}

/// Redis configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct RedisConfig {
    /// Redis connection URL
    pub url: Option<String>,
}

/// Admin configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AdminConfig {
    /// Admin API key for administrative endpoints
    pub key: Option<String>,
}

impl Default for Config {
    /// Returns sensible defaults for development
    fn default() -> Self {
        Self {
            server: ServerConfig::default(),
            providers: ProviderConfig::default(),
            logging: LoggingConfig::default(),
            database: DatabaseConfig::default(),
            redis: RedisConfig::default(),
            admin: AdminConfig::default(),
        }
    }
}

impl Config {
    /// Creates a new Config with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Loads configuration from a YAML file
    ///
    /// # Arguments
    ///
    /// * `path` - Path to the YAML configuration file
    ///
    /// # Example
    ///
    /// ```no_run
    /// use aura_core::config::Config;
    ///
    /// let config = Config::from_file("config.yaml").expect("Failed to load config");
    /// ```
    pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self, ConfigError> {
        let contents = std::fs::read_to_string(path)?;
        Self::from_yaml(&contents)
    }

    /// Loads configuration from a YAML string
    ///
    /// # Arguments
    ///
    /// * `yaml` - YAML configuration string
    ///
    /// # Example
    ///
    /// ```
    /// use aura_core::config::Config;
    ///
    /// let yaml = r#"
    /// server:
    ///   host: "127.0.0.1"
    ///   port: 3000
    /// providers:
    ///   openai_api_key: "sk-test"
    /// "#;
    ///
    /// let config = Config::from_yaml(yaml).expect("Failed to parse config");
    /// assert_eq!(config.server.host, "127.0.0.1");
    /// assert_eq!(config.server.port, 3000);
    /// ```
    pub fn from_yaml(yaml: &str) -> Result<Self, ConfigError> {
        let config: Config = serde_yaml::from_str(yaml)?;
        Ok(config)
    }

    /// Loads configuration from a YAML file with environment variable overrides
    ///
    /// This is the recommended method for production deployments. It loads
    /// configuration from a YAML file first, then applies any environment
    /// variable overrides. This allows for base configuration in ConfigMaps
    /// with secrets injected via environment variables.
    ///
    /// # Arguments
    ///
    /// * `path` - Path to the YAML configuration file
    ///
    /// # Example
    ///
    /// ```no_run
    /// use aura_core::config::Config;
    ///
    /// // Load config.yaml, then override with env vars
    /// let config = Config::from_file_with_env("config.yaml")
    ///     .expect("Failed to load config");
    /// ```
    pub fn from_file_with_env<P: AsRef<Path>>(path: P) -> Result<Self, ConfigError> {
        let mut config = Self::from_file(path)?;
        config.apply_env_overrides();
        Ok(config)
    }

    /// Loads configuration from environment variables only
    ///
    /// This method will first attempt to load a `.env` file if present,
    /// then read configuration from environment variables.
    ///
    /// # Errors
    ///
    /// Returns `ConfigError` if required configuration is missing or invalid.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use aura_core::config::Config;
    ///
    /// let config = Config::from_env().expect("Failed to load config");
    /// println!("Server will listen on {}:{}", config.server.host, config.server.port);
    /// ```
    pub fn from_env() -> Result<Self, ConfigError> {
        // Load .env file if present (ignore errors if file doesn't exist)
        let _ = dotenvy::dotenv();

        let mut config = Self::default();
        config.apply_env_overrides();

        // Validate port if set via env
        if let Ok(port_str) = env::var("AURA_PORT") {
            port_str
                .parse::<u16>()
                .map_err(|_| ConfigError::InvalidPort(port_str))?;
        }

        // Validate log level
        Self::validate_log_level(&config.logging.level)?;

        Ok(config)
    }

    /// Applies environment variable overrides to the current configuration
    ///
    /// Environment variables take precedence over file-based configuration.
    /// This allows secrets to be injected via environment variables while
    /// keeping non-sensitive configuration in files.
    pub fn apply_env_overrides(&mut self) {
        // Load .env file if present
        let _ = dotenvy::dotenv();

        // Server config
        if let Ok(host) = env::var("AURA_HOST") {
            if !host.is_empty() {
                self.server.host = host;
            }
        }
        if let Ok(port) = env::var("AURA_PORT") {
            if let Ok(port) = port.parse() {
                self.server.port = port;
            }
        }

        // Logging
        if let Ok(level) = env::var("RUST_LOG") {
            if !level.is_empty() {
                self.logging.level = level;
            }
        }

        // Provider API keys (typically injected as secrets)
        if let Ok(key) = env::var("OPENAI_API_KEY") {
            if !key.is_empty() {
                self.providers.openai_api_key = Some(key);
            }
        }
        if let Ok(key) = env::var("ANTHROPIC_API_KEY") {
            if !key.is_empty() {
                self.providers.anthropic_api_key = Some(key);
            }
        }
        if let Ok(key) = env::var("GOOGLE_API_KEY") {
            if !key.is_empty() {
                self.providers.google_api_key = Some(key);
            }
        }

        // Database
        if let Ok(url) = env::var("DATABASE_URL") {
            if !url.is_empty() {
                self.database.url = Some(url);
            }
        }

        // Redis
        if let Ok(url) = env::var("REDIS_URL") {
            if !url.is_empty() {
                self.redis.url = Some(url);
            }
        }

        // Admin
        if let Ok(key) = env::var("AURA_ADMIN_KEY") {
            if !key.is_empty() {
                self.admin.key = Some(key);
            }
        }
    }

    /// Validates the log level string
    fn validate_log_level(log_level: &str) -> Result<(), ConfigError> {
        let valid_levels = ["trace", "debug", "info", "warn", "error"];
        let base_level = log_level.split(',').next().unwrap_or(log_level);
        let base_level = base_level.split('=').next().unwrap_or(base_level);

        if !valid_levels.contains(&base_level.to_lowercase().as_str())
            && !base_level.contains("aura")
        {
            // Allow complex log filters like "info,aura_proxy=debug"
            if !log_level.contains('=') && !log_level.contains(',') {
                return Err(ConfigError::InvalidLogLevel(log_level.to_string()));
            }
        }
        Ok(())
    }

    /// Loads configuration from environment, requiring at least one provider key
    ///
    /// This is useful for production deployments where you want to ensure
    /// the gateway has at least one provider configured.
    ///
    /// # Errors
    ///
    /// Returns `ConfigError::NoProviderKeys` if no provider API keys are configured.
    pub fn from_env_strict() -> Result<Self, ConfigError> {
        let config = Self::from_env()?;
        config.validate()?;
        Ok(config)
    }

    /// Validates the configuration
    ///
    /// Checks that at least one provider API key is configured.
    ///
    /// # Errors
    ///
    /// Returns `ConfigError::NoProviderKeys` if no provider API keys are configured.
    pub fn validate(&self) -> Result<(), ConfigError> {
        if self.providers.openai_api_key.is_none()
            && self.providers.anthropic_api_key.is_none()
            && self.providers.google_api_key.is_none()
        {
            return Err(ConfigError::NoProviderKeys);
        }
        Ok(())
    }

    /// Returns true if OpenAI is configured
    pub fn has_openai(&self) -> bool {
        self.providers.openai_api_key.is_some()
    }

    /// Returns true if Anthropic is configured
    pub fn has_anthropic(&self) -> bool {
        self.providers.anthropic_api_key.is_some()
    }

    /// Returns true if Google is configured
    pub fn has_google(&self) -> bool {
        self.providers.google_api_key.is_some()
    }

    /// Returns true if any provider is configured
    pub fn has_any_provider(&self) -> bool {
        self.has_openai() || self.has_anthropic() || self.has_google()
    }

    /// Returns the server address as a string (host:port)
    pub fn server_addr(&self) -> String {
        format!("{}:{}", self.server.host, self.server.port)
    }

    // Legacy accessors for backward compatibility

    /// Returns the host address
    pub fn host(&self) -> &str {
        &self.server.host
    }

    /// Returns the port number
    pub fn port(&self) -> u16 {
        self.server.port
    }

    /// Returns the log level
    pub fn log_level(&self) -> &str {
        &self.logging.level
    }

    /// Returns the OpenAI API key if configured
    pub fn openai_api_key(&self) -> Option<&str> {
        self.providers.openai_api_key.as_deref()
    }

    /// Returns the Anthropic API key if configured
    pub fn anthropic_api_key(&self) -> Option<&str> {
        self.providers.anthropic_api_key.as_deref()
    }

    /// Returns the Google API key if configured
    pub fn google_api_key(&self) -> Option<&str> {
        self.providers.google_api_key.as_deref()
    }

    /// Returns the database URL if configured
    pub fn database_url(&self) -> Option<&str> {
        self.database.url.as_deref()
    }

    /// Returns the Redis URL if configured
    pub fn redis_url(&self) -> Option<&str> {
        self.redis.url.as_deref()
    }

    /// Returns the admin API key if configured
    pub fn admin_key(&self) -> Option<&str> {
        self.admin.key.as_deref()
    }

    /// Logs the current configuration (with sensitive values masked)
    pub fn log_config(&self) {
        info!(
            host = %self.server.host,
            port = %self.server.port,
            log_level = %self.logging.level,
            openai = %self.has_openai(),
            anthropic = %self.has_anthropic(),
            google = %self.has_google(),
            database = %self.database.url.is_some(),
            redis = %self.redis.url.is_some(),
            "Configuration loaded"
        );
    }

    /// Serializes the configuration to YAML
    ///
    /// Useful for generating example configuration files or debugging.
    /// Note: This will include sensitive values like API keys.
    pub fn to_yaml(&self) -> Result<String, ConfigError> {
        Ok(serde_yaml::to_string(self)?)
    }

    /// Serializes the configuration to YAML with sensitive values masked
    pub fn to_yaml_masked(&self) -> Result<String, ConfigError> {
        let mut masked = self.clone();

        // Mask API keys
        if masked.providers.openai_api_key.is_some() {
            masked.providers.openai_api_key = Some("***".to_string());
        }
        if masked.providers.anthropic_api_key.is_some() {
            masked.providers.anthropic_api_key = Some("***".to_string());
        }
        if masked.providers.google_api_key.is_some() {
            masked.providers.google_api_key = Some("***".to_string());
        }
        if masked.admin.key.is_some() {
            masked.admin.key = Some("***".to_string());
        }

        // Mask database URL password if present
        if let Some(ref url) = masked.database.url {
            if url.contains('@') {
                masked.database.url = Some("***".to_string());
            }
        }

        // Mask Redis URL password if present
        if let Some(ref url) = masked.redis.url {
            if url.contains('@') {
                masked.redis.url = Some("***".to_string());
            }
        }

        Ok(serde_yaml::to_string(&masked)?)
    }
}

/// Builder for creating Config instances programmatically
///
/// Useful for testing or when you need to construct configuration
/// without environment variables.
#[derive(Debug, Default)]
pub struct ConfigBuilder {
    config: Config,
}

impl ConfigBuilder {
    /// Creates a new ConfigBuilder with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the host address
    pub fn host(mut self, host: impl Into<String>) -> Self {
        self.config.server.host = host.into();
        self
    }

    /// Sets the port number
    pub fn port(mut self, port: u16) -> Self {
        self.config.server.port = port;
        self
    }

    /// Sets the OpenAI API key
    pub fn openai_api_key(mut self, key: impl Into<String>) -> Self {
        self.config.providers.openai_api_key = Some(key.into());
        self
    }

    /// Sets the Anthropic API key
    pub fn anthropic_api_key(mut self, key: impl Into<String>) -> Self {
        self.config.providers.anthropic_api_key = Some(key.into());
        self
    }

    /// Sets the Google API key
    pub fn google_api_key(mut self, key: impl Into<String>) -> Self {
        self.config.providers.google_api_key = Some(key.into());
        self
    }

    /// Sets the log level
    pub fn log_level(mut self, level: impl Into<String>) -> Self {
        self.config.logging.level = level.into();
        self
    }

    /// Sets the database URL
    pub fn database_url(mut self, url: impl Into<String>) -> Self {
        self.config.database.url = Some(url.into());
        self
    }

    /// Sets the Redis URL
    pub fn redis_url(mut self, url: impl Into<String>) -> Self {
        self.config.redis.url = Some(url.into());
        self
    }

    /// Sets the admin API key
    pub fn admin_key(mut self, key: impl Into<String>) -> Self {
        self.config.admin.key = Some(key.into());
        self
    }

    /// Builds the Config instance
    pub fn build(self) -> Config {
        self.config
    }

    /// Builds and validates the Config instance
    pub fn build_validated(self) -> Result<Config, ConfigError> {
        let config = self.build();
        config.validate()?;
        Ok(config)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.server.host, "0.0.0.0");
        assert_eq!(config.server.port, 8080);
        assert_eq!(config.logging.level, "info");
        assert!(config.providers.openai_api_key.is_none());
        assert!(config.providers.anthropic_api_key.is_none());
        assert!(config.providers.google_api_key.is_none());
    }

    #[test]
    fn test_config_builder() {
        let config = ConfigBuilder::new()
            .host("127.0.0.1")
            .port(3000)
            .openai_api_key("sk-test")
            .log_level("debug")
            .build();

        assert_eq!(config.server.host, "127.0.0.1");
        assert_eq!(config.server.port, 3000);
        assert_eq!(config.providers.openai_api_key, Some("sk-test".to_string()));
        assert_eq!(config.logging.level, "debug");
    }

    #[test]
    fn test_config_validation_no_providers() {
        let config = Config::default();
        assert!(matches!(
            config.validate(),
            Err(ConfigError::NoProviderKeys)
        ));
    }

    #[test]
    fn test_config_validation_with_provider() {
        let config = ConfigBuilder::new().openai_api_key("sk-test").build();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_has_provider_methods() {
        let config = ConfigBuilder::new()
            .openai_api_key("sk-test")
            .anthropic_api_key("sk-ant-test")
            .build();

        assert!(config.has_openai());
        assert!(config.has_anthropic());
        assert!(!config.has_google());
        assert!(config.has_any_provider());
    }

    #[test]
    fn test_server_addr() {
        let config = ConfigBuilder::new().host("localhost").port(9000).build();
        assert_eq!(config.server_addr(), "localhost:9000");
    }

    #[test]
    fn test_builder_validated_fails_without_provider() {
        let result = ConfigBuilder::new().build_validated();
        assert!(result.is_err());
    }

    #[test]
    fn test_builder_validated_succeeds_with_provider() {
        let result = ConfigBuilder::new()
            .openai_api_key("sk-test")
            .build_validated();
        assert!(result.is_ok());
    }

    #[test]
    fn test_yaml_parsing_full() {
        let yaml = r#"
server:
  host: "127.0.0.1"
  port: 3000

providers:
  openai_api_key: "sk-openai-test"
  anthropic_api_key: "sk-anthropic-test"
  google_api_key: "google-test"

logging:
  level: "debug"

database:
  url: "postgres://user:pass@localhost/aura"

redis:
  url: "redis://localhost:6379"

admin:
  key: "admin-secret"
"#;

        let config = Config::from_yaml(yaml).expect("Failed to parse YAML");

        assert_eq!(config.server.host, "127.0.0.1");
        assert_eq!(config.server.port, 3000);
        assert_eq!(
            config.providers.openai_api_key,
            Some("sk-openai-test".to_string())
        );
        assert_eq!(
            config.providers.anthropic_api_key,
            Some("sk-anthropic-test".to_string())
        );
        assert_eq!(
            config.providers.google_api_key,
            Some("google-test".to_string())
        );
        assert_eq!(config.logging.level, "debug");
        assert_eq!(
            config.database.url,
            Some("postgres://user:pass@localhost/aura".to_string())
        );
        assert_eq!(config.redis.url, Some("redis://localhost:6379".to_string()));
        assert_eq!(config.admin.key, Some("admin-secret".to_string()));
    }

    #[test]
    fn test_yaml_parsing_partial() {
        let yaml = r#"
server:
  port: 9000

providers:
  openai_api_key: "sk-test"
"#;

        let config = Config::from_yaml(yaml).expect("Failed to parse YAML");

        // Partial values should be set
        assert_eq!(config.server.port, 9000);
        assert_eq!(config.providers.openai_api_key, Some("sk-test".to_string()));

        // Defaults should be used for missing values
        assert_eq!(config.server.host, "0.0.0.0");
        assert_eq!(config.logging.level, "info");
    }

    #[test]
    fn test_yaml_parsing_empty() {
        let yaml = "";
        let config = Config::from_yaml(yaml).expect("Failed to parse empty YAML");

        // All defaults should be used
        assert_eq!(config.server.host, "0.0.0.0");
        assert_eq!(config.server.port, 8080);
        assert_eq!(config.logging.level, "info");
    }

    #[test]
    fn test_yaml_serialization() {
        let config = ConfigBuilder::new()
            .host("localhost")
            .port(8080)
            .openai_api_key("sk-test")
            .build();

        let yaml = config.to_yaml().expect("Failed to serialize to YAML");

        // Parse it back
        let parsed = Config::from_yaml(&yaml).expect("Failed to parse serialized YAML");

        assert_eq!(parsed.server.host, "localhost");
        assert_eq!(parsed.server.port, 8080);
        assert_eq!(parsed.providers.openai_api_key, Some("sk-test".to_string()));
    }

    #[test]
    fn test_yaml_masked_serialization() {
        let config = ConfigBuilder::new()
            .openai_api_key("sk-secret-key")
            .anthropic_api_key("sk-ant-secret")
            .admin_key("admin-secret")
            .database_url("postgres://user:pass@localhost/db")
            .build();

        let masked_yaml = config
            .to_yaml_masked()
            .expect("Failed to serialize masked YAML");

        // Should contain masked values
        assert!(masked_yaml.contains("'***'") || masked_yaml.contains("\"***\""));
        // Should not contain actual secrets
        assert!(!masked_yaml.contains("sk-secret-key"));
        assert!(!masked_yaml.contains("sk-ant-secret"));
        assert!(!masked_yaml.contains("admin-secret"));
    }

    #[test]
    fn test_legacy_accessors() {
        let config = ConfigBuilder::new()
            .host("localhost")
            .port(3000)
            .log_level("debug")
            .openai_api_key("sk-test")
            .database_url("postgres://localhost/db")
            .redis_url("redis://localhost")
            .admin_key("admin")
            .build();

        assert_eq!(config.host(), "localhost");
        assert_eq!(config.port(), 3000);
        assert_eq!(config.log_level(), "debug");
        assert_eq!(config.openai_api_key(), Some("sk-test"));
        assert_eq!(config.database_url(), Some("postgres://localhost/db"));
        assert_eq!(config.redis_url(), Some("redis://localhost"));
        assert_eq!(config.admin_key(), Some("admin"));
    }

    #[test]
    fn test_yaml_kubernetes_style() {
        // Test a Kubernetes ConfigMap style YAML
        let yaml = r#"
# Aura LLM Gateway Configuration
# This file is typically mounted from a ConfigMap

server:
  host: "0.0.0.0"
  port: 8080

logging:
  level: "info,aura_proxy=debug"

# Provider keys are typically injected via environment variables
# from Kubernetes Secrets, not in this file
providers: {}

database:
  url: null  # Set via DATABASE_URL env var

redis:
  url: null  # Set via REDIS_URL env var
"#;

        let config = Config::from_yaml(yaml).expect("Failed to parse K8s style YAML");

        assert_eq!(config.server.host, "0.0.0.0");
        assert_eq!(config.server.port, 8080);
        assert_eq!(config.logging.level, "info,aura_proxy=debug");
        assert!(config.providers.openai_api_key.is_none());
    }
}
