//! Redis connection management for Aura LLM Gateway
//!
//! Provides a connection pool for Redis operations used by
//! rate limiting and caching features.

use redis::aio::ConnectionManager;
use redis::Client;
use thiserror::Error;
use tracing::{debug, info};

/// Errors that can occur during Redis operations
#[derive(Debug, Error)]
pub enum RedisError {
    #[error("Redis connection error: {0}")]
    Connection(#[from] redis::RedisError),

    #[error("Redis not configured")]
    NotConfigured,

    #[error("Redis operation failed: {0}")]
    Operation(String),
}

/// Redis connection pool wrapper
///
/// Uses `ConnectionManager` for automatic reconnection and connection pooling.
#[derive(Clone)]
pub struct RedisPool {
    manager: ConnectionManager,
}

impl RedisPool {
    /// Creates a new Redis pool from a connection URL
    ///
    /// # Arguments
    ///
    /// * `url` - Redis connection URL (e.g., "redis://localhost:6379")
    ///
    /// # Example
    ///
    /// ```no_run
    /// use aura_core::redis::RedisPool;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let pool = RedisPool::new("redis://localhost:6379").await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn new(url: &str) -> Result<Self, RedisError> {
        info!(url = %mask_redis_url(url), "Connecting to Redis");

        let client = Client::open(url)?;
        let manager = ConnectionManager::new(client).await?;

        debug!("Redis connection established");

        Ok(Self { manager })
    }

    /// Returns a clone of the connection manager for executing commands
    pub fn connection(&self) -> ConnectionManager {
        self.manager.clone()
    }

    /// Health check - ping the Redis server
    pub async fn ping(&self) -> Result<(), RedisError> {
        let mut conn = self.manager.clone();
        redis::cmd("PING").query_async::<String>(&mut conn).await?;
        Ok(())
    }
}

/// Mask password in Redis URL for logging
fn mask_redis_url(url: &str) -> String {
    // Parse URL and mask password if present
    if let Ok(mut parsed) = url::Url::parse(url) {
        if parsed.password().is_some() {
            let _ = parsed.set_password(Some("***"));
        }
        parsed.to_string()
    } else {
        // If parsing fails, just return a generic masked version
        "redis://***@***".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_redis_url_with_password() {
        let url = "redis://user:secret123@localhost:6379/0";
        let masked = mask_redis_url(url);
        assert!(masked.contains("***"));
        assert!(!masked.contains("secret123"));
    }

    #[test]
    fn test_mask_redis_url_without_password() {
        let url = "redis://localhost:6379";
        let masked = mask_redis_url(url);
        assert!(masked.starts_with("redis://localhost:6379"));
        assert!(!masked.contains("***")); // No password to mask
    }
}
