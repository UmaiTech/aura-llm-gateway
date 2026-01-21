//! Shared type definitions for the Aura LLM Gateway
//!
//! This crate contains all shared types used across the gateway,
//! including Open Responses API types, provider types, and common utilities.

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
