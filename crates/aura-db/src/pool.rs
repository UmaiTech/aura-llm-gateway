//! Database connection pool management

use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;
use tracing::info;

use crate::error::DbError;

/// Type alias for the database pool
pub type DbPool = PgPool;

/// Configuration for the database pool
#[derive(Debug, Clone)]
pub struct PoolConfig {
    /// Database URL
    pub url: String,
    /// Maximum number of connections
    pub max_connections: u32,
    /// Minimum number of connections
    pub min_connections: u32,
    /// Connection timeout in seconds
    pub connect_timeout: u64,
    /// Idle timeout in seconds
    pub idle_timeout: u64,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            max_connections: 10,
            min_connections: 1,
            connect_timeout: 10,
            idle_timeout: 300,
        }
    }
}

impl PoolConfig {
    /// Create a new pool config with the given URL
    pub fn new(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            ..Default::default()
        }
    }

    /// Set max connections
    pub fn max_connections(mut self, max: u32) -> Self {
        self.max_connections = max;
        self
    }

    /// Set min connections
    pub fn min_connections(mut self, min: u32) -> Self {
        self.min_connections = min;
        self
    }

    /// Set connect timeout in seconds. Useful for the migrate
    /// subcommand which runs during Fly's release_command — at that
    /// point the PG primary can be cycling and the default 10s isn't
    /// always long enough.
    pub fn connect_timeout(mut self, secs: u64) -> Self {
        self.connect_timeout = secs;
        self
    }
}

/// Create a database connection pool
pub async fn create_pool(config: PoolConfig) -> Result<DbPool, DbError> {
    if config.url.is_empty() {
        return Err(DbError::config("Database URL is required"));
    }

    info!(
        max_connections = config.max_connections,
        min_connections = config.min_connections,
        "Creating database connection pool"
    );

    let pool = PgPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .acquire_timeout(Duration::from_secs(config.connect_timeout))
        .idle_timeout(Duration::from_secs(config.idle_timeout))
        .connect(&config.url)
        .await?;

    info!("Database connection pool created successfully");

    Ok(pool)
}

/// Run database migrations
pub async fn run_migrations(pool: &DbPool) -> Result<(), DbError> {
    info!("Running database migrations");
    sqlx::migrate!("../../migrations").run(pool).await?;
    info!("Database migrations completed successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pool_config_default() {
        let config = PoolConfig::default();
        assert_eq!(config.max_connections, 10);
        assert_eq!(config.min_connections, 1);
    }

    #[test]
    fn test_pool_config_builder() {
        let config = PoolConfig::new("postgres://localhost/test")
            .max_connections(20)
            .min_connections(5);
        assert_eq!(config.max_connections, 20);
        assert_eq!(config.min_connections, 5);
    }
}
