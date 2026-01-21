//! Database layer for the Aura LLM Gateway
//!
//! This crate handles all database operations using SQLx,
//! including connection pooling, queries, and migrations.

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
        assert_eq!(ver, "0.1.0");
    }
}
