//! TOON (Token-Oriented Object Notation) encoder/decoder.
//!
//! TOON is a compact format optimized for LLM token efficiency.
//! It achieves 40-60% token savings on uniform arrays by:
//! - Declaring field names once in a header
//! - Using CSV-style tabular data
//! - Eliminating repeated structural tokens
//!
//! Example:
//! ```text
//! # JSON (many tokens)
//! [{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]
//!
//! # TOON (fewer tokens)
//! [2]{id,name}:
//!   1,Alice
//!   2,Bob
//! ```

use aura_types::{CompressionStrategy, ToonConfig};
use serde_json::Value;

use super::Compressor;

/// Error type for TOON encoding.
#[derive(Debug, thiserror::Error)]
pub enum ToonError {
    #[error("Failed to parse JSON: {0}")]
    JsonParse(#[from] serde_json::Error),

    #[error("Not a uniform array: {0}")]
    NotUniformArray(String),

    #[error("Array too small for TOON encoding")]
    ArrayTooSmall,

    #[error("Encoding failed: {0}")]
    EncodingFailed(String),
}

/// TOON encoder for converting JSON to TOON format.
#[derive(Debug, Clone)]
pub struct ToonEncoder {
    config: ToonConfig,
}

impl ToonEncoder {
    /// Create a new TOON encoder with default config.
    pub fn new() -> Self {
        Self {
            config: ToonConfig::default(),
        }
    }

    /// Create with custom configuration.
    pub fn with_config(config: ToonConfig) -> Self {
        Self { config }
    }

    /// Encode a JSON value to TOON format.
    pub fn encode(&self, value: &Value) -> Result<String, ToonError> {
        match value {
            Value::Array(arr) => self.encode_array(arr),
            Value::Object(obj) => self.encode_object(obj),
            _ => Ok(value.to_string()),
        }
    }

    /// Encode a JSON string to TOON format.
    pub fn encode_json(&self, json: &str) -> Result<String, ToonError> {
        let value: Value = serde_json::from_str(json)?;
        self.encode(&value)
    }

    /// Check if an array is uniform (all objects with same keys).
    pub fn is_uniform_array(&self, arr: &[Value]) -> bool {
        if arr.len() < self.config.min_array_size {
            return false;
        }

        let first = match arr.first() {
            Some(Value::Object(obj)) => obj,
            _ => return false,
        };

        if first.len() < self.config.min_fields {
            return false;
        }

        let keys: Vec<_> = first.keys().collect();

        arr.iter().all(|item| {
            if let Value::Object(obj) = item {
                obj.len() == first.len() && keys.iter().all(|k| obj.contains_key(*k))
            } else {
                false
            }
        })
    }

    /// Estimate token savings for encoding this value.
    pub fn estimate_savings(&self, value: &Value) -> f32 {
        let original = serde_json::to_string(value).unwrap_or_default();
        match self.encode(value) {
            Ok(encoded) => 1.0 - (encoded.len() as f32 / original.len() as f32),
            Err(_) => 0.0,
        }
    }

    fn encode_array(&self, arr: &[Value]) -> Result<String, ToonError> {
        if arr.is_empty() {
            return Ok("[]".to_string());
        }

        // Check if this is a uniform array of objects
        if self.is_uniform_array(arr) {
            return self.encode_tabular(arr);
        }

        // Otherwise, encode each element
        let encoded: Result<Vec<String>, ToonError> = arr.iter().map(|v| self.encode(v)).collect();
        let encoded = encoded?;

        // Use compact array format for simple values
        if arr.iter().all(|v| !v.is_object() && !v.is_array()) {
            return Ok(format!("[{}]", encoded.join(",")));
        }

        Ok(format!("[\n  {}\n]", encoded.join(",\n  ")))
    }

    fn encode_tabular(&self, arr: &[Value]) -> Result<String, ToonError> {
        let first = arr.first().and_then(|v| v.as_object()).ok_or_else(|| {
            ToonError::NotUniformArray("Array is empty or first element is not an object".into())
        })?;

        // Get field names in consistent order
        let fields: Vec<&String> = first.keys().collect();

        // Build header: [count]{field1,field2,...}:
        let header = format!(
            "[{}]{{{}}}:",
            arr.len(),
            fields
                .iter()
                .map(|s| s.as_str())
                .collect::<Vec<_>>()
                .join(",")
        );

        // Build rows
        let rows: Vec<String> = arr
            .iter()
            .filter_map(|v| v.as_object())
            .map(|obj| {
                fields
                    .iter()
                    .map(|field| self.encode_value(obj.get(*field).unwrap_or(&Value::Null)))
                    .collect::<Vec<_>>()
                    .join(",")
            })
            .collect();

        Ok(format!("{}\n  {}", header, rows.join("\n  ")))
    }

    fn encode_object(&self, obj: &serde_json::Map<String, Value>) -> Result<String, ToonError> {
        if obj.is_empty() {
            return Ok("{}".to_string());
        }

        let mut parts = Vec::new();

        for (key, value) in obj {
            let encoded_value = match value {
                Value::Array(arr) if self.is_uniform_array(arr) => {
                    // Nested tabular array
                    let tabular = self.encode_tabular(arr)?;
                    format!("{}:\n  {}", key, tabular.replace('\n', "\n  "))
                }
                Value::Object(nested) => {
                    let encoded = self.encode_object(nested)?;
                    format!("{}:\n  {}", key, encoded.replace('\n', "\n  "))
                }
                _ => format!("{}: {}", key, self.encode_value(value)),
            };
            parts.push(encoded_value);
        }

        Ok(parts.join("\n"))
    }

    fn encode_value(&self, value: &Value) -> String {
        match value {
            Value::Null => "~".to_string(), // YAML-style null
            Value::Bool(b) => if *b { "T" } else { "F" }.to_string(),
            Value::Number(n) => n.to_string(),
            Value::String(s) => {
                // Quote if contains special characters
                if s.contains(',') || s.contains('\n') || s.contains('"') {
                    format!("\"{}\"", s.replace('"', "\\\""))
                } else {
                    s.clone()
                }
            }
            Value::Array(arr) => {
                if arr.is_empty() {
                    "[]".to_string()
                } else {
                    format!(
                        "[{}]",
                        arr.iter()
                            .map(|v| self.encode_value(v))
                            .collect::<Vec<_>>()
                            .join(",")
                    )
                }
            }
            Value::Object(_) => serde_json::to_string(value).unwrap_or_default(),
        }
    }
}

impl Default for ToonEncoder {
    fn default() -> Self {
        Self::new()
    }
}

impl Compressor for ToonEncoder {
    fn compress(&self, input: &str) -> Result<String, super::CompressionError> {
        // Try to parse as JSON first
        if let Ok(value) = serde_json::from_str::<Value>(input) {
            match self.encode(&value) {
                Ok(encoded) => return Ok(encoded),
                Err(_) => {
                    // Fall back to minified JSON if TOON encoding fails
                    return Ok(serde_json::to_string(&value).unwrap_or_else(|_| input.to_string()));
                }
            }
        }

        // Not JSON, return as-is
        Ok(input.to_string())
    }

    fn strategy(&self) -> CompressionStrategy {
        CompressionStrategy::Toon
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_simple_array() {
        let encoder = ToonEncoder::new();
        let value = json!([
            {"id": 1, "name": "Alice"},
            {"id": 2, "name": "Bob"},
            {"id": 3, "name": "Carol"}
        ]);

        let result = encoder.encode(&value).unwrap();
        assert!(result.contains("[3]{"));
        assert!(result.contains("id,name") || result.contains("name,id"));
        assert!(result.contains("Alice"));
        assert!(result.contains("Bob"));
    }

    #[test]
    fn test_is_uniform_array() {
        let encoder = ToonEncoder::new();

        // Uniform array
        let uniform = vec![json!({"a": 1, "b": 2}), json!({"a": 3, "b": 4})];
        assert!(encoder.is_uniform_array(&uniform));

        // Non-uniform (different keys)
        let non_uniform = vec![json!({"a": 1, "b": 2}), json!({"a": 3, "c": 4})];
        assert!(!encoder.is_uniform_array(&non_uniform));

        // Too small
        let small = vec![json!({"a": 1})];
        assert!(!encoder.is_uniform_array(&small));

        // Not objects
        let not_objects = vec![json!(1), json!(2), json!(3)];
        assert!(!encoder.is_uniform_array(&not_objects));
    }

    #[test]
    fn test_nested_object() {
        let encoder = ToonEncoder::new();
        let value = json!({
            "users": [
                {"id": 1, "name": "Alice"},
                {"id": 2, "name": "Bob"}
            ],
            "count": 2
        });

        let result = encoder.encode(&value).unwrap();
        assert!(result.contains("users:"));
        assert!(result.contains("[2]{"));
    }

    #[test]
    fn test_special_values() {
        let encoder = ToonEncoder::new();
        let value = json!([
            {"active": true, "value": null},
            {"active": false, "value": null}
        ]);

        let result = encoder.encode(&value).unwrap();
        // Should use T/F for booleans and ~ for null
        assert!(result.contains('T') || result.contains("true"));
        assert!(result.contains('F') || result.contains("false"));
    }

    #[test]
    fn test_string_escaping() {
        let encoder = ToonEncoder::new();
        let value = json!([
            {"text": "hello, world"},
            {"text": "simple"}
        ]);

        let result = encoder.encode(&value).unwrap();
        // Comma in value should be quoted
        assert!(result.contains("\"hello, world\""));
        assert!(result.contains("simple"));
    }

    #[test]
    fn test_empty_structures() {
        let encoder = ToonEncoder::new();

        assert_eq!(encoder.encode(&json!([])).unwrap(), "[]");
        assert_eq!(encoder.encode(&json!({})).unwrap(), "{}");
    }

    #[test]
    fn test_token_savings() {
        let encoder = ToonEncoder::new();
        let value = json!([
            {"id": 1, "name": "Alice", "role": "admin"},
            {"id": 2, "name": "Bob", "role": "user"},
            {"id": 3, "name": "Carol", "role": "user"},
            {"id": 4, "name": "Dave", "role": "admin"},
            {"id": 5, "name": "Eve", "role": "user"}
        ]);

        let savings = encoder.estimate_savings(&value);
        assert!(
            savings > 0.3,
            "Expected >30% savings, got {:.1}%",
            savings * 100.0
        );
    }

    #[test]
    fn test_compressor_trait() {
        let encoder = ToonEncoder::new();
        let input = r#"[{"a":1,"b":2},{"a":3,"b":4}]"#;

        let result = encoder.compress(input).unwrap();
        assert!(result.contains("[2]{"));
        assert_eq!(encoder.strategy(), CompressionStrategy::Toon);
    }

    #[test]
    fn test_non_json_input() {
        let encoder = ToonEncoder::new();
        let input = "not json";

        let result = encoder.compress(input).unwrap();
        assert_eq!(result, "not json");
    }
}
