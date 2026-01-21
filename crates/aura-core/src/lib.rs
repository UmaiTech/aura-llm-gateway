//! Core business logic for the Aura LLM Gateway
//!
//! This crate contains the core logic for the gateway,
//! including provider implementations, routing, caching, and load balancing.

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
