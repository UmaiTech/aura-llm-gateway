//! Database layer for the Aura LLM Gateway
//!
//! This crate handles all database operations using SQLx,
//! including connection pooling, queries, and migrations.

pub mod error;
pub mod models;
pub mod pool;
pub mod repo;

pub use error::DbError;
pub use models::*;
pub use pool::{create_pool, run_migrations, DbPool, PoolConfig};
pub use repo::*;

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
        assert!(
            ver.split('.').count() >= 2,
            "version should be in semver format"
        );
    }
}
