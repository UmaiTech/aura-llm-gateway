//! Prompt compression types and configuration.
//!
//! This module provides types for compressing prompts to reduce token usage
//! while maintaining semantic clarity. Supports multiple strategies:
//!
//! - **Data formats**: TOON, YAML, JSON (for structured data efficiency)
//! - **Semantic formats**: AISP (for unambiguous rule specification)
//! - **Token-level**: Whitespace normalization, JSON minification

use serde::{Deserialize, Serialize};

/// Data serialization format for structured content.
///
/// Different formats have different token efficiency characteristics:
/// - TOON: Best for uniform arrays (40-60% savings)
/// - YAML: Good for nested objects (10-25% savings)
/// - JSON Compact: Safe default (15-30% savings)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataFormat {
    /// Standard JSON with formatting
    Json,
    /// Minified JSON (no whitespace)
    #[default]
    JsonCompact,
    /// YAML format (fewer delimiters)
    Yaml,
    /// Token-Oriented Object Notation (best for arrays)
    Toon,
    /// Markdown tables (good for tabular data in context)
    Markdown,
}

/// Semantic notation format for instructions and logic.
///
/// AISP (AI Symbolic Protocol) uses mathematical notation to eliminate
/// ambiguity in rule specifications, achieving <2% ambiguity vs 40-65%
/// with natural language.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SemanticFormat {
    /// Standard natural language
    #[default]
    Natural,
    /// AI Symbolic Protocol (formal notation)
    Aisp,
    /// Structured pseudocode
    Pseudocode,
}

/// AISP symbol set complexity level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AispSymbolSet {
    /// ~50 most common symbols (∀, ∃, ⇒, ∧, ∨, etc.)
    #[default]
    Core,
    /// ~150 practical symbols
    Standard,
    /// All 512 Σ₅₁₂ symbols
    Full,
}

/// Configuration for AISP encoding.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AispConfig {
    /// Symbol set complexity level
    #[serde(default)]
    pub symbol_set: AispSymbolSet,

    /// Convert if/then rules to logical notation
    #[serde(default = "default_true")]
    pub convert_rules: bool,

    /// Convert definitions (x = 5 → x ≜ 5)
    #[serde(default = "default_true")]
    pub convert_definitions: bool,

    /// Convert quantifiers (for all → ∀, exists → ∃)
    #[serde(default = "default_true")]
    pub convert_quantifiers: bool,

    /// Include proof/evidence blocks
    #[serde(default)]
    pub include_proofs: bool,
}

impl Default for AispConfig {
    fn default() -> Self {
        Self {
            symbol_set: AispSymbolSet::Core,
            convert_rules: true,
            convert_definitions: true,
            convert_quantifiers: true,
            include_proofs: false,
        }
    }
}

/// Configuration for TOON encoding.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToonConfig {
    /// Minimum array size to use tabular format
    #[serde(default = "default_toon_threshold")]
    pub min_array_size: usize,

    /// Minimum fields per object to use tabular format
    #[serde(default = "default_min_fields")]
    pub min_fields: usize,

    /// Maximum nesting depth for TOON (deeper = use JSON)
    #[serde(default = "default_max_depth")]
    pub max_depth: usize,
}

impl Default for ToonConfig {
    fn default() -> Self {
        Self {
            min_array_size: 2,
            min_fields: 2,
            max_depth: 3,
        }
    }
}

/// Configuration for YAML conversion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YamlConfig {
    /// Use flow style for short arrays
    #[serde(default = "default_true")]
    pub flow_short_arrays: bool,

    /// Maximum items for flow style arrays
    #[serde(default = "default_flow_threshold")]
    pub flow_threshold: usize,

    /// Omit quotes on safe strings
    #[serde(default = "default_true")]
    pub minimal_quotes: bool,
}

impl Default for YamlConfig {
    fn default() -> Self {
        Self {
            flow_short_arrays: true,
            flow_threshold: 5,
            minimal_quotes: true,
        }
    }
}

/// Main compression configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionConfig {
    /// Enable compression
    #[serde(default)]
    pub enabled: bool,

    /// Data format for structured content ("auto" uses smart selection)
    #[serde(default)]
    pub data_format: DataFormat,

    /// Semantic format for instructions
    #[serde(default)]
    pub semantic_format: SemanticFormat,

    /// Auto-select best format per content type
    #[serde(default)]
    pub auto_select: bool,

    /// Target compression ratio (0.0-1.0, where 0.25 = 4x compression)
    pub target_ratio: Option<f32>,

    /// Maximum tokens after compression (alternative to ratio)
    pub token_budget: Option<u32>,

    /// AISP-specific configuration
    #[serde(default)]
    pub aisp: AispConfig,

    /// TOON-specific configuration
    #[serde(default)]
    pub toon: ToonConfig,

    /// YAML-specific configuration
    #[serde(default)]
    pub yaml: YamlConfig,

    /// Apply token-level cleanup (whitespace, etc.)
    #[serde(default = "default_true")]
    pub token_cleanup: bool,

    /// Minify JSON in content
    #[serde(default = "default_true")]
    pub minify_json: bool,
}

impl Default for CompressionConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            data_format: DataFormat::default(),
            semantic_format: SemanticFormat::default(),
            auto_select: false,
            target_ratio: None,
            token_budget: None,
            aisp: AispConfig::default(),
            toon: ToonConfig::default(),
            yaml: YamlConfig::default(),
            token_cleanup: true,
            minify_json: true,
        }
    }
}

/// Compression strategy used for a piece of content.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompressionStrategy {
    /// No compression applied
    None,
    /// Token-level cleanup only
    TokenCleanup,
    /// JSON minification
    JsonMinify,
    /// YAML conversion
    Yaml,
    /// TOON encoding
    Toon,
    /// Markdown tables
    Markdown,
    /// AISP symbolic notation
    Aisp,
    /// Multiple strategies combined
    Hybrid,
}

/// Metadata about compression applied to a request.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CompressionMetadata {
    /// Original estimated token count
    pub original_tokens: Option<u32>,

    /// Compressed token count
    pub compressed_tokens: Option<u32>,

    /// Compression ratio (compressed/original)
    pub ratio: Option<f32>,

    /// Strategies applied
    #[serde(default)]
    pub strategies: Vec<CompressionStrategy>,

    /// Time spent compressing (ms)
    pub latency_ms: Option<u32>,

    /// Number of AISP symbols used
    pub aisp_symbols: Option<u32>,

    /// Bytes saved (for structured data)
    pub bytes_saved: Option<u32>,
}

impl CompressionMetadata {
    /// Create metadata for no compression
    pub fn none() -> Self {
        Self {
            strategies: vec![CompressionStrategy::None],
            ..Default::default()
        }
    }

    /// Calculate savings percentage
    pub fn savings_percent(&self) -> Option<f32> {
        self.ratio.map(|r| (1.0 - r) * 100.0)
    }

    /// Add a strategy to the list
    pub fn add_strategy(&mut self, strategy: CompressionStrategy) {
        if !self.strategies.contains(&strategy) {
            self.strategies.push(strategy);
        }
    }
}

/// Result of analyzing content for compression.
#[derive(Debug, Clone)]
pub struct CompressionAnalysis {
    /// Recommended data format
    pub recommended_format: DataFormat,

    /// Recommended semantic format
    pub recommended_semantic: SemanticFormat,

    /// Estimated token savings (0.0-1.0)
    pub estimated_savings: f32,

    /// Whether content contains rule-like patterns
    pub has_rules: bool,

    /// Whether content has uniform arrays (good for TOON)
    pub has_uniform_arrays: bool,

    /// Whether content has nested objects (good for YAML)
    pub has_nested_objects: bool,

    /// Detected structure type
    pub structure_type: StructureType,
}

/// Type of structure detected in content.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StructureType {
    /// Array of objects with consistent fields
    UniformArray,
    /// Deeply nested object hierarchy
    NestedObject,
    /// Mix of text and structured data
    Mixed,
    /// Primarily text content
    Text,
    /// Tabular data
    Tabular,
    /// Unknown/unstructured
    Unknown,
}

// Default value helpers
fn default_true() -> bool {
    true
}

fn default_toon_threshold() -> usize {
    2
}

fn default_min_fields() -> usize {
    2
}

fn default_max_depth() -> usize {
    3
}

fn default_flow_threshold() -> usize {
    5
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compression_config_default() {
        let config = CompressionConfig::default();
        assert!(!config.enabled);
        assert_eq!(config.data_format, DataFormat::JsonCompact);
        assert_eq!(config.semantic_format, SemanticFormat::Natural);
        assert!(config.token_cleanup);
        assert!(config.minify_json);
    }

    #[test]
    fn test_compression_metadata_savings() {
        let mut meta = CompressionMetadata {
            original_tokens: Some(1000),
            compressed_tokens: Some(250),
            ratio: Some(0.25),
            ..Default::default()
        };
        meta.add_strategy(CompressionStrategy::Toon);

        assert_eq!(meta.savings_percent(), Some(75.0));
        assert!(meta.strategies.contains(&CompressionStrategy::Toon));
    }

    #[test]
    fn test_data_format_serialization() {
        let format = DataFormat::Toon;
        let json = serde_json::to_string(&format).unwrap();
        assert_eq!(json, "\"toon\"");

        let parsed: DataFormat = serde_json::from_str("\"yaml\"").unwrap();
        assert_eq!(parsed, DataFormat::Yaml);
    }

    #[test]
    fn test_aisp_config_default() {
        let config = AispConfig::default();
        assert_eq!(config.symbol_set, AispSymbolSet::Core);
        assert!(config.convert_rules);
        assert!(config.convert_definitions);
        assert!(config.convert_quantifiers);
        assert!(!config.include_proofs);
    }

    #[test]
    fn test_toon_config_default() {
        let config = ToonConfig::default();
        assert_eq!(config.min_array_size, 2);
        assert_eq!(config.min_fields, 2);
        assert_eq!(config.max_depth, 3);
    }
}
