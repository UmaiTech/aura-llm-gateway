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
        // Verify version follows semver format (e.g., "0.1.1")
        assert!(
            ver.split('.').count() >= 2,
            "version should be in semver format"
        );
    }
}
