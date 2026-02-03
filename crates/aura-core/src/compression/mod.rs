//! Prompt compression module for reducing token usage.
//!
//! This module provides multiple compression strategies:
//!
//! - **JSON minification**: Remove whitespace and shorten keys
//! - **TOON encoding**: Token-Oriented Object Notation for arrays
//! - **YAML conversion**: Fewer delimiters than JSON
//! - **AISP encoding**: AI Symbolic Protocol for unambiguous rules
//! - **Smart selection**: Automatically choose best format

mod aisp;
mod json;
mod selector;
mod toon;
mod yaml;

pub use aisp::{AispEncoder, AispError};
pub use json::{JsonCompressor, JsonError};
pub use selector::{SmartCompressionResult, SmartCompressor, SmartCompressorBuilder};
pub use toon::{ToonEncoder, ToonError};
pub use yaml::{YamlConverter, YamlError};

use aura_types::{CompressionConfig, CompressionMetadata, CompressionStrategy};
use std::time::Instant;

/// Trait for content compressors.
pub trait Compressor: Send + Sync {
    /// Compress the input string.
    fn compress(&self, input: &str) -> Result<String, CompressionError>;

    /// Get the compression strategy used.
    fn strategy(&self) -> CompressionStrategy;

    /// Estimate token count for a string (rough approximation).
    fn estimate_tokens(&self, s: &str) -> u32 {
        // Rough estimate: ~4 chars per token for English
        (s.len() as f32 / 4.0).ceil() as u32
    }
}

/// Unified compression error type.
#[derive(Debug, thiserror::Error)]
pub enum CompressionError {
    #[error("JSON compression error: {0}")]
    Json(#[from] JsonError),

    #[error("TOON encoding error: {0}")]
    Toon(#[from] ToonError),

    #[error("YAML conversion error: {0}")]
    Yaml(#[from] YamlError),

    #[error("AISP encoding error: {0}")]
    Aisp(#[from] AispError),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Compression failed: {0}")]
    Failed(String),
}

/// Compress content using the specified configuration.
pub fn compress(
    input: &str,
    config: &CompressionConfig,
) -> Result<CompressedOutput, CompressionError> {
    let start = Instant::now();
    let original_tokens = estimate_tokens(input);

    if !config.enabled {
        return Ok(CompressedOutput {
            content: input.to_string(),
            original_content: None,
            metadata: CompressionMetadata::none(),
        });
    }

    let compressor = SmartCompressor::from_config(config);
    let result = compressor.compress_smart(input)?;
    let compressed_tokens = estimate_tokens(&result.content);

    let metadata = CompressionMetadata {
        original_tokens: Some(original_tokens),
        compressed_tokens: Some(compressed_tokens),
        ratio: Some(compressed_tokens as f32 / original_tokens as f32),
        latency_ms: Some(start.elapsed().as_millis() as u32),
        strategies: result.strategies,
        ..Default::default()
    };

    Ok(CompressedOutput {
        content: result.content,
        original_content: Some(input.to_string()),
        metadata,
    })
}

/// Output of compression operation.
#[derive(Debug, Clone)]
pub struct CompressedOutput {
    /// Compressed content
    pub content: String,
    /// Original content before compression (for logging)
    pub original_content: Option<String>,
    /// Metadata about compression
    pub metadata: CompressionMetadata,
}

/// Estimate token count for a string.
pub fn estimate_tokens(s: &str) -> u32 {
    // Rough estimate: ~4 chars per token for English text
    // This is a simplification; real tokenization varies by model
    (s.len() as f32 / 4.0).ceil() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_tokens() {
        assert_eq!(estimate_tokens("hello"), 2); // 5 chars / 4 = 1.25 -> 2
        assert_eq!(estimate_tokens("hello world"), 3); // 11 chars / 4 = 2.75 -> 3
        assert_eq!(estimate_tokens(""), 0);
    }

    #[test]
    fn test_compress_disabled() {
        let config = CompressionConfig {
            enabled: false,
            ..Default::default()
        };
        let result = compress("test input", &config).unwrap();
        assert_eq!(result.content, "test input");
        assert_eq!(result.metadata.strategies, vec![CompressionStrategy::None]);
    }
}
