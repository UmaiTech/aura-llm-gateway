//! Database error types

use thiserror::Error;

/// Database errors
#[derive(Debug, Error)]
pub enum DbError {
    /// Database connection error
    #[error("Database connection error: {0}")]
    Connection(#[from] sqlx::Error),

    /// Entity not found
    #[error("{entity} not found: {id}")]
    NotFound { entity: &'static str, id: String },

    /// Duplicate entry
    #[error("Duplicate {entity}: {key}")]
    Duplicate { entity: &'static str, key: String },

    /// Migration error
    #[error("Migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),

    /// Configuration error
    #[error("Configuration error: {0}")]
    Config(String),
}

impl DbError {
    /// Create a not found error
    pub fn not_found(entity: &'static str, id: impl Into<String>) -> Self {
        Self::NotFound {
            entity,
            id: id.into(),
        }
    }

    /// Create a duplicate error
    pub fn duplicate(entity: &'static str, key: impl Into<String>) -> Self {
        Self::Duplicate {
            entity,
            key: key.into(),
        }
    }

    /// Create a config error
    pub fn config(msg: impl Into<String>) -> Self {
        Self::Config(msg.into())
    }
}
