//! JSON compression utilities.
//!
//! Provides JSON minification and optional key shortening for token reduction.

use aura_types::CompressionStrategy;
use serde_json::Value;
use std::collections::HashMap;

use super::Compressor;

/// Error type for JSON compression.
#[derive(Debug, thiserror::Error)]
pub enum JsonError {
    #[error("Failed to parse JSON: {0}")]
    ParseError(#[from] serde_json::Error),

    #[error("Invalid JSON structure: {0}")]
    InvalidStructure(String),
}

/// JSON compression configuration.
#[derive(Debug, Clone)]
pub struct JsonCompressorConfig {
    /// Remove all whitespace
    pub minify: bool,
    /// Shorten common keys (e.g., "message" -> "m")
    pub shorten_keys: bool,
    /// Custom key mappings
    pub key_mappings: HashMap<String, String>,
    /// Remove null values
    pub remove_nulls: bool,
    /// Remove empty arrays
    pub remove_empty_arrays: bool,
    /// Remove empty objects
    pub remove_empty_objects: bool,
}

impl Default for JsonCompressorConfig {
    fn default() -> Self {
        Self {
            minify: true,
            shorten_keys: false,
            key_mappings: HashMap::new(),
            remove_nulls: false,
            remove_empty_arrays: false,
            remove_empty_objects: false,
        }
    }
}

/// JSON compressor for minification and optimization.
#[derive(Debug, Clone)]
pub struct JsonCompressor {
    config: JsonCompressorConfig,
}

impl JsonCompressor {
    /// Create a new JSON compressor with default config.
    pub fn new() -> Self {
        Self {
            config: JsonCompressorConfig::default(),
        }
    }

    /// Create with custom configuration.
    pub fn with_config(config: JsonCompressorConfig) -> Self {
        Self { config }
    }

    /// Create a minify-only compressor.
    pub fn minify_only() -> Self {
        Self {
            config: JsonCompressorConfig {
                minify: true,
                shorten_keys: false,
                ..Default::default()
            },
        }
    }

    /// Create an aggressive compressor with key shortening.
    pub fn aggressive() -> Self {
        let mut key_mappings = HashMap::new();
        // Common keys in LLM contexts
        key_mappings.insert("message".to_string(), "m".to_string());
        key_mappings.insert("content".to_string(), "c".to_string());
        key_mappings.insert("role".to_string(), "r".to_string());
        key_mappings.insert("name".to_string(), "n".to_string());
        key_mappings.insert("type".to_string(), "t".to_string());
        key_mappings.insert("value".to_string(), "v".to_string());
        key_mappings.insert("id".to_string(), "i".to_string());
        key_mappings.insert("text".to_string(), "x".to_string());
        key_mappings.insert("data".to_string(), "d".to_string());
        key_mappings.insert("status".to_string(), "s".to_string());
        key_mappings.insert("error".to_string(), "e".to_string());
        key_mappings.insert("result".to_string(), "rs".to_string());
        key_mappings.insert("arguments".to_string(), "a".to_string());
        key_mappings.insert("function".to_string(), "f".to_string());
        key_mappings.insert("description".to_string(), "dc".to_string());
        key_mappings.insert("parameters".to_string(), "p".to_string());
        key_mappings.insert("properties".to_string(), "pr".to_string());
        key_mappings.insert("required".to_string(), "rq".to_string());
        key_mappings.insert("items".to_string(), "it".to_string());

        Self {
            config: JsonCompressorConfig {
                minify: true,
                shorten_keys: true,
                key_mappings,
                remove_nulls: true,
                remove_empty_arrays: true,
                remove_empty_objects: true,
            },
        }
    }

    /// Compress a JSON value.
    pub fn compress_value(&self, value: &Value) -> Result<Value, JsonError> {
        Ok(self.process_value(value))
    }

    /// Compress a JSON string.
    pub fn compress_json(&self, json: &str) -> Result<String, JsonError> {
        let value: Value = serde_json::from_str(json)?;
        let compressed = self.process_value(&value);
        Ok(serde_json::to_string(&compressed)?)
    }

    /// Minify JSON without any transformation.
    pub fn minify(json: &str) -> Result<String, JsonError> {
        let value: Value = serde_json::from_str(json)?;
        Ok(serde_json::to_string(&value)?)
    }

    fn process_value(&self, value: &Value) -> Value {
        match value {
            Value::Object(map) => {
                let mut new_map = serde_json::Map::new();
                for (key, val) in map {
                    // Skip nulls if configured
                    if self.config.remove_nulls && val.is_null() {
                        continue;
                    }

                    // Skip empty arrays if configured
                    if self.config.remove_empty_arrays {
                        if let Value::Array(arr) = val {
                            if arr.is_empty() {
                                continue;
                            }
                        }
                    }

                    // Skip empty objects if configured
                    if self.config.remove_empty_objects {
                        if let Value::Object(obj) = val {
                            if obj.is_empty() {
                                continue;
                            }
                        }
                    }

                    // Shorten key if configured
                    let new_key = if self.config.shorten_keys {
                        self.config
                            .key_mappings
                            .get(key)
                            .cloned()
                            .unwrap_or_else(|| key.clone())
                    } else {
                        key.clone()
                    };

                    new_map.insert(new_key, self.process_value(val));
                }
                Value::Object(new_map)
            }
            Value::Array(arr) => Value::Array(arr.iter().map(|v| self.process_value(v)).collect()),
            _ => value.clone(),
        }
    }

    /// Get the key mappings for documentation/reversal.
    pub fn key_mappings(&self) -> &HashMap<String, String> {
        &self.config.key_mappings
    }
}

impl Default for JsonCompressor {
    fn default() -> Self {
        Self::new()
    }
}

impl Compressor for JsonCompressor {
    fn compress(&self, input: &str) -> Result<String, super::CompressionError> {
        // First try to parse as JSON
        if let Ok(result) = self.compress_json(input) {
            return Ok(result);
        }

        // If not valid JSON, just return the input (or do basic cleanup)
        if self.config.minify {
            // Basic whitespace cleanup for non-JSON content
            Ok(input
                .lines()
                .map(|line| line.trim())
                .filter(|line| !line.is_empty())
                .collect::<Vec<_>>()
                .join(" "))
        } else {
            Ok(input.to_string())
        }
    }

    fn strategy(&self) -> CompressionStrategy {
        CompressionStrategy::JsonMinify
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_minify_json() {
        let input = r#"{
            "name": "Alice",
            "age": 30,
            "active": true
        }"#;

        let result = JsonCompressor::minify(input).unwrap();
        // Check it's minified (no whitespace) and contains values
        assert!(!result.contains('\n'));
        assert!(!result.contains("  "));
        assert!(result.contains("\"name\":\"Alice\""));
        assert!(result.contains("\"age\":30"));
        assert!(result.contains("\"active\":true"));
    }

    #[test]
    fn test_compress_with_key_shortening() {
        let compressor = JsonCompressor::aggressive();
        let input = r#"{"message": "hello", "content": "world"}"#;

        let result = compressor.compress_json(input).unwrap();
        // Check keys are shortened
        assert!(result.contains("\"m\":\"hello\""));
        assert!(result.contains("\"c\":\"world\""));
        assert!(!result.contains("message"));
        assert!(!result.contains("content"));
    }

    #[test]
    fn test_remove_nulls() {
        let compressor = JsonCompressor::aggressive();
        let input = r#"{"name": "test", "value": null, "data": "ok"}"#;

        let result = compressor.compress_json(input).unwrap();
        assert!(!result.contains("null"));
        assert!(result.contains("test"));
        assert!(result.contains("ok"));
    }

    #[test]
    fn test_remove_empty_arrays() {
        let compressor = JsonCompressor::aggressive();
        let input = r#"{"items": [], "data": "test"}"#;

        let result = compressor.compress_json(input).unwrap();
        assert!(!result.contains("items"));
        assert!(result.contains("test"));
    }

    #[test]
    fn test_nested_compression() {
        let compressor = JsonCompressor::aggressive();
        let input = r#"{
            "message": {
                "role": "user",
                "content": "Hello"
            }
        }"#;

        let result = compressor.compress_json(input).unwrap();
        // Check nested keys are shortened
        assert!(result.contains("\"m\":{"));
        assert!(result.contains("\"r\":\"user\""));
        assert!(result.contains("\"c\":\"Hello\""));
    }

    #[test]
    fn test_array_of_objects() {
        let compressor = JsonCompressor::aggressive();
        let input = r#"[
            {"type": "text", "value": "hello"},
            {"type": "text", "value": "world"}
        ]"#;

        let result = compressor.compress_json(input).unwrap();
        // Check keys are shortened in array elements
        assert!(result.contains("\"t\":\"text\""));
        assert!(result.contains("\"v\":\"hello\""));
        assert!(result.contains("\"v\":\"world\""));
    }

    #[test]
    fn test_compressor_trait() {
        let compressor = JsonCompressor::new();
        let input = r#"{ "test": "value" }"#;

        let result = compressor.compress(input).unwrap();
        assert_eq!(result, r#"{"test":"value"}"#);
        assert_eq!(compressor.strategy(), CompressionStrategy::JsonMinify);
    }

    #[test]
    fn test_non_json_input() {
        let compressor = JsonCompressor::new();
        let input = "This is just plain text\nwith multiple lines";

        let result = compressor.compress(input).unwrap();
        assert_eq!(result, "This is just plain text with multiple lines");
    }

    #[test]
    fn test_savings_calculation() {
        let input = r#"{
            "message": {
                "role": "user",
                "content": "Hello, how are you?"
            },
            "data": null,
            "items": []
        }"#;

        let compressor = JsonCompressor::aggressive();
        let result = compressor.compress_json(input).unwrap();

        let original_len = input.len();
        let compressed_len = result.len();
        let savings = 1.0 - (compressed_len as f32 / original_len as f32);

        assert!(
            savings > 0.4,
            "Expected >40% savings, got {:.1}%",
            savings * 100.0
        );
    }
}
