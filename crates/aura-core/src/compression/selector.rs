//! Smart format selection for automatic compression strategy.
//!
//! Analyzes content and chooses the optimal compression format:
//! - TOON for uniform arrays (40-60% savings)
//! - YAML for nested objects (10-25% savings)
//! - AISP for rule-based instructions
//! - JSON minification as fallback

use aura_types::{
    CompressionAnalysis, CompressionConfig, CompressionStrategy, DataFormat, SemanticFormat,
    StructureType,
};
use regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;

use super::{AispEncoder, Compressor, JsonCompressor, ToonEncoder, YamlConverter};

/// Patterns for detecting rule-like content.
static RULE_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        Regex::new(r"(?i)\bif\s+.+\s+then\b").unwrap(),
        Regex::new(r"(?i)\bwhen\s+.+\s+then\b").unwrap(),
        Regex::new(r"(?i)\bfor (all|each|every)\b").unwrap(),
        Regex::new(r"(?i)\b(must|should|shall|will)\s+(not\s+)?(be|have|allow|deny|reject)\b")
            .unwrap(),
        Regex::new(r"(?i)\b(always|never|only)\s+\w+\b").unwrap(),
        Regex::new(r"(?i)\bvalidate\s+that\b").unwrap(),
        Regex::new(r"(?i)\bensure\s+that\b").unwrap(),
    ]
});

/// Smart compressor that automatically selects the best strategy.
#[derive(Debug, Clone)]
pub struct SmartCompressor {
    json: JsonCompressor,
    toon: ToonEncoder,
    yaml: YamlConverter,
    aisp: AispEncoder,
    config: CompressionConfig,
}

impl SmartCompressor {
    /// Create a new smart compressor with default settings.
    pub fn new() -> Self {
        Self {
            json: JsonCompressor::new(),
            toon: ToonEncoder::new(),
            yaml: YamlConverter::new(),
            aisp: AispEncoder::new(),
            config: CompressionConfig::default(),
        }
    }

    /// Create from a compression config.
    pub fn from_config(config: &CompressionConfig) -> Self {
        Self {
            json: if config.minify_json {
                JsonCompressor::aggressive()
            } else {
                JsonCompressor::minify_only()
            },
            toon: ToonEncoder::with_config(config.toon.clone()),
            yaml: YamlConverter::with_config(config.yaml.clone()),
            aisp: AispEncoder::with_config(config.aisp.clone()),
            config: config.clone(),
        }
    }

    /// Create a builder for custom configuration.
    pub fn builder() -> SmartCompressorBuilder {
        SmartCompressorBuilder::default()
    }

    /// Analyze content and recommend compression strategy.
    pub fn analyze(&self, input: &str) -> CompressionAnalysis {
        let has_rules = self.detect_rules(input);

        // Try to parse as JSON
        if let Ok(value) = serde_json::from_str::<Value>(input) {
            let structure_type = self.detect_structure(&value);
            let (recommended_format, estimated_savings) = match structure_type {
                StructureType::UniformArray => (DataFormat::Toon, 0.45),
                StructureType::NestedObject => (DataFormat::Yaml, 0.20),
                StructureType::Tabular => (DataFormat::Toon, 0.50),
                _ => (DataFormat::JsonCompact, 0.15),
            };

            return CompressionAnalysis {
                recommended_format,
                recommended_semantic: if has_rules {
                    SemanticFormat::Aisp
                } else {
                    SemanticFormat::Natural
                },
                estimated_savings,
                has_rules,
                has_uniform_arrays: structure_type == StructureType::UniformArray,
                has_nested_objects: structure_type == StructureType::NestedObject,
                structure_type,
            };
        }

        // Plain text
        CompressionAnalysis {
            recommended_format: DataFormat::JsonCompact,
            recommended_semantic: if has_rules {
                SemanticFormat::Aisp
            } else {
                SemanticFormat::Natural
            },
            estimated_savings: if has_rules { 0.10 } else { 0.05 },
            has_rules,
            has_uniform_arrays: false,
            has_nested_objects: false,
            structure_type: StructureType::Text,
        }
    }

    /// Compress content using the best strategy.
    pub fn compress_smart(&self, input: &str) -> Result<String, super::CompressionError> {
        let analysis = self.analyze(input);

        // Apply semantic compression if rules detected
        let processed = if analysis.has_rules && self.config.semantic_format == SemanticFormat::Aisp
        {
            self.aisp.compress(input)?
        } else {
            input.to_string()
        };

        // Try to parse as JSON for data format compression
        if let Ok(value) = serde_json::from_str::<Value>(&processed) {
            return self.compress_value(&value, &analysis);
        }

        // Return processed text (may have AISP applied)
        Ok(processed)
    }

    fn compress_value(
        &self,
        value: &Value,
        analysis: &CompressionAnalysis,
    ) -> Result<String, super::CompressionError> {
        // Choose format based on config or analysis
        let format = if self.config.auto_select {
            analysis.recommended_format
        } else {
            self.config.data_format
        };

        match format {
            DataFormat::Toon if analysis.has_uniform_arrays => {
                self.toon.compress(&serde_json::to_string(value).unwrap())
            }
            DataFormat::Yaml => self.yaml.compress(&serde_json::to_string(value).unwrap()),
            DataFormat::Markdown if analysis.structure_type == StructureType::Tabular => {
                self.to_markdown_table(value)
            }
            _ => self.json.compress(&serde_json::to_string(value).unwrap()),
        }
    }

    fn detect_rules(&self, input: &str) -> bool {
        RULE_PATTERNS.iter().any(|pattern| pattern.is_match(input))
    }

    fn detect_structure(&self, value: &Value) -> StructureType {
        match value {
            Value::Array(arr) => {
                if arr.is_empty() {
                    return StructureType::Unknown;
                }

                // Check if uniform array of objects
                if self.toon.is_uniform_array(arr) {
                    return StructureType::UniformArray;
                }

                // Check if all elements are arrays (tabular)
                if arr.iter().all(|v| v.is_array()) {
                    return StructureType::Tabular;
                }

                StructureType::Mixed
            }
            Value::Object(obj) => {
                // Check nesting depth
                let depth = self.object_depth(value);
                if depth > 2 {
                    StructureType::NestedObject
                } else if obj.values().any(|v| v.is_array()) {
                    // Has arrays inside
                    StructureType::Mixed
                } else {
                    StructureType::Unknown
                }
            }
            Value::String(_) => StructureType::Text,
            _ => StructureType::Unknown,
        }
    }

    fn object_depth(&self, value: &Value) -> usize {
        match value {
            Value::Object(obj) => {
                1 + obj
                    .values()
                    .map(|v| self.object_depth(v))
                    .max()
                    .unwrap_or(0)
            }
            Value::Array(arr) => arr.iter().map(|v| self.object_depth(v)).max().unwrap_or(0),
            _ => 0,
        }
    }

    fn to_markdown_table(&self, value: &Value) -> Result<String, super::CompressionError> {
        // Convert array of objects to markdown table
        if let Value::Array(arr) = value {
            if let Some(first) = arr.first().and_then(|v| v.as_object()) {
                let headers: Vec<&String> = first.keys().collect();

                let mut lines = Vec::new();

                // Header row
                lines.push(format!(
                    "| {} |",
                    headers
                        .iter()
                        .map(|h| h.as_str())
                        .collect::<Vec<_>>()
                        .join(" | ")
                ));

                // Separator
                lines.push(format!(
                    "| {} |",
                    headers
                        .iter()
                        .map(|_| "---")
                        .collect::<Vec<_>>()
                        .join(" | ")
                ));

                // Data rows
                for item in arr {
                    if let Value::Object(obj) = item {
                        let row: Vec<String> = headers
                            .iter()
                            .map(|h| {
                                obj.get(*h)
                                    .map(|v| match v {
                                        Value::String(s) => s.clone(),
                                        Value::Null => "".to_string(),
                                        _ => v.to_string(),
                                    })
                                    .unwrap_or_default()
                            })
                            .collect();
                        lines.push(format!("| {} |", row.join(" | ")));
                    }
                }

                return Ok(lines.join("\n"));
            }
        }

        // Fallback to JSON
        self.json.compress(&serde_json::to_string(value).unwrap())
    }
}

impl Default for SmartCompressor {
    fn default() -> Self {
        Self::new()
    }
}

impl Compressor for SmartCompressor {
    fn compress(&self, input: &str) -> Result<String, super::CompressionError> {
        self.compress_smart(input)
    }

    fn strategy(&self) -> CompressionStrategy {
        CompressionStrategy::Hybrid
    }
}

/// Builder for SmartCompressor.
#[derive(Debug, Default)]
pub struct SmartCompressorBuilder {
    config: CompressionConfig,
}

impl SmartCompressorBuilder {
    /// Enable auto-selection of formats.
    pub fn auto_select(mut self, enabled: bool) -> Self {
        self.config.auto_select = enabled;
        self
    }

    /// Set the preferred data format.
    pub fn data_format(mut self, format: DataFormat) -> Self {
        self.config.data_format = format;
        self
    }

    /// Set the preferred semantic format.
    pub fn semantic_format(mut self, format: SemanticFormat) -> Self {
        self.config.semantic_format = format;
        self
    }

    /// Enable JSON minification.
    pub fn minify_json(mut self, enabled: bool) -> Self {
        self.config.minify_json = enabled;
        self
    }

    /// Enable token cleanup.
    pub fn token_cleanup(mut self, enabled: bool) -> Self {
        self.config.token_cleanup = enabled;
        self
    }

    /// Build the compressor.
    pub fn build(self) -> SmartCompressor {
        SmartCompressor::from_config(&self.config)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_detect_rules() {
        let compressor = SmartCompressor::new();

        assert!(compressor.detect_rules("if user is admin then allow access"));
        assert!(compressor.detect_rules("for all users in the system"));
        assert!(compressor.detect_rules("must not be empty"));
        assert!(compressor.detect_rules("always validate input"));

        assert!(!compressor.detect_rules("hello world"));
        assert!(!compressor.detect_rules("this is just text"));
    }

    #[test]
    fn test_analyze_uniform_array() {
        let compressor = SmartCompressor::new();
        let input = r#"[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]"#;

        let analysis = compressor.analyze(input);
        assert_eq!(analysis.structure_type, StructureType::UniformArray);
        assert_eq!(analysis.recommended_format, DataFormat::Toon);
        assert!(analysis.has_uniform_arrays);
    }

    #[test]
    fn test_analyze_nested_object() {
        let compressor = SmartCompressor::new();
        let input = r#"{"user":{"profile":{"name":"Alice","settings":{"theme":"dark"}}}}"#;

        let analysis = compressor.analyze(input);
        assert_eq!(analysis.structure_type, StructureType::NestedObject);
        assert_eq!(analysis.recommended_format, DataFormat::Yaml);
        assert!(analysis.has_nested_objects);
    }

    #[test]
    fn test_analyze_text_with_rules() {
        let compressor = SmartCompressor::new();
        let input = "if the user is authenticated then allow access to the dashboard";

        let analysis = compressor.analyze(input);
        assert!(analysis.has_rules);
        assert_eq!(analysis.recommended_semantic, SemanticFormat::Aisp);
    }

    #[test]
    fn test_compress_smart_toon() {
        let config = CompressionConfig {
            auto_select: true,
            ..Default::default()
        };
        let compressor = SmartCompressor::from_config(&config);
        let input = r#"[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"},{"id":3,"name":"Carol"}]"#;

        let result = compressor.compress_smart(input).unwrap();
        // Should use TOON format
        assert!(result.contains("[3]{"));
    }

    #[test]
    fn test_compress_smart_yaml() {
        let config = CompressionConfig {
            auto_select: false, // Disable auto-select to force YAML
            data_format: DataFormat::Yaml,
            ..Default::default()
        };
        let compressor = SmartCompressor::from_config(&config);
        let input = r#"{"user":{"name":"Alice","active":true}}"#;

        let result = compressor.compress_smart(input).unwrap();
        // Should use YAML format
        assert!(result.contains("user:"), "Expected 'user:' in:\n{}", result);
        assert!(result.contains("Alice"), "Expected 'Alice' in:\n{}", result);
    }

    #[test]
    fn test_compress_smart_aisp() {
        let config = CompressionConfig {
            auto_select: true,
            semantic_format: SemanticFormat::Aisp,
            ..Default::default()
        };
        let compressor = SmartCompressor::from_config(&config);
        let input = "if user is admin then allow access";

        let result = compressor.compress_smart(input).unwrap();
        // Should apply AISP transformation
        assert!(result.contains('⇒'));
    }

    #[test]
    fn test_markdown_table() {
        let compressor = SmartCompressor::new();
        let value = json!([
            {"name": "Alice", "age": 30},
            {"name": "Bob", "age": 25}
        ]);

        let result = compressor.to_markdown_table(&value).unwrap();
        assert!(result.contains("| name | age |") || result.contains("| age | name |"));
        assert!(result.contains("| --- |"));
        assert!(result.contains("Alice"));
        assert!(result.contains("Bob"));
    }

    #[test]
    fn test_builder() {
        let compressor = SmartCompressor::builder()
            .auto_select(true)
            .data_format(DataFormat::Yaml)
            .semantic_format(SemanticFormat::Aisp)
            .build();

        assert!(compressor.config.auto_select);
        assert_eq!(compressor.config.data_format, DataFormat::Yaml);
        assert_eq!(compressor.config.semantic_format, SemanticFormat::Aisp);
    }

    #[test]
    fn test_compressor_trait() {
        let compressor = SmartCompressor::new();
        let input = r#"{"test": "value"}"#;

        let result = compressor.compress(input).unwrap();
        assert!(!result.is_empty());
        assert_eq!(compressor.strategy(), CompressionStrategy::Hybrid);
    }
}
