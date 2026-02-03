//! YAML conversion for token-efficient structured data.
//!
//! YAML uses fewer tokens than JSON by eliminating:
//! - Quotes around most strings
//! - Commas between items
//! - Curly braces and brackets (uses indentation)
//!
//! Typical savings: 10-25% fewer tokens than JSON.

use aura_types::{CompressionStrategy, YamlConfig};
use serde_json::Value;

use super::Compressor;

/// Error type for YAML conversion.
#[derive(Debug, thiserror::Error)]
pub enum YamlError {
    #[error("Failed to parse JSON: {0}")]
    JsonParse(#[from] serde_json::Error),

    #[error("YAML serialization failed: {0}")]
    YamlSerialize(String),

    #[error("Conversion failed: {0}")]
    ConversionFailed(String),
}

/// YAML converter for JSON to YAML transformation.
#[derive(Debug, Clone)]
pub struct YamlConverter {
    config: YamlConfig,
}

impl YamlConverter {
    /// Create a new YAML converter with default config.
    pub fn new() -> Self {
        Self {
            config: YamlConfig::default(),
        }
    }

    /// Create with custom configuration.
    pub fn with_config(config: YamlConfig) -> Self {
        Self { config }
    }

    /// Convert JSON value to YAML string.
    pub fn convert(&self, value: &Value) -> Result<String, YamlError> {
        Ok(self.to_yaml(value, 0))
    }

    /// Convert JSON string to YAML string.
    pub fn convert_json(&self, json: &str) -> Result<String, YamlError> {
        let value: Value = serde_json::from_str(json)?;
        self.convert(&value)
    }

    fn to_yaml(&self, value: &Value, indent: usize) -> String {
        match value {
            Value::Null => "~".to_string(),
            Value::Bool(b) => if *b { "true" } else { "false" }.to_string(),
            Value::Number(n) => n.to_string(),
            Value::String(s) => self.format_string(s),
            Value::Array(arr) => self.format_array(arr, indent),
            Value::Object(obj) => self.format_object(obj, indent),
        }
    }

    fn format_string(&self, s: &str) -> String {
        // Check if string needs quoting
        let needs_quotes = s.is_empty()
            || s.starts_with(' ')
            || s.ends_with(' ')
            || s.contains(':')
            || s.contains('#')
            || s.contains('\n')
            || s.contains('"')
            || s.contains('\'')
            || s.starts_with('-')
            || s.starts_with('[')
            || s.starts_with('{')
            || s == "true"
            || s == "false"
            || s == "null"
            || s == "~"
            || s.parse::<f64>().is_ok();

        if needs_quotes || !self.config.minimal_quotes {
            // Use double quotes and escape internal quotes
            format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
        } else {
            s.to_string()
        }
    }

    fn format_array(&self, arr: &[Value], indent: usize) -> String {
        if arr.is_empty() {
            return "[]".to_string();
        }

        // Use flow style for short arrays of simple values
        if self.config.flow_short_arrays
            && arr.len() <= self.config.flow_threshold
            && arr.iter().all(|v| !v.is_object() && !v.is_array())
        {
            let items: Vec<String> = arr.iter().map(|v| self.to_yaml(v, 0)).collect();
            return format!("[{}]", items.join(", "));
        }

        // Block style for longer/complex arrays
        let indent_str = "  ".repeat(indent);
        let items: Vec<String> = arr
            .iter()
            .map(|v| {
                let formatted = self.to_yaml(v, indent + 1);
                if v.is_object() {
                    // Objects need special handling - first key on same line as dash
                    if let Some(first_newline) = formatted.find('\n') {
                        let (first_line, rest) = formatted.split_at(first_newline);
                        format!("{}- {}{}", indent_str, first_line, rest)
                    } else {
                        format!("{}- {}", indent_str, formatted)
                    }
                } else if v.is_array() {
                    format!("{}-\n{}", indent_str, formatted)
                } else {
                    format!("{}- {}", indent_str, formatted)
                }
            })
            .collect();

        items.join("\n")
    }

    fn format_object(&self, obj: &serde_json::Map<String, Value>, indent: usize) -> String {
        if obj.is_empty() {
            return "{}".to_string();
        }

        let indent_str = "  ".repeat(indent);
        let items: Vec<String> = obj
            .iter()
            .map(|(key, value)| {
                let formatted_value = self.to_yaml(value, indent + 1);

                // Format key (may need quoting)
                let formatted_key = if key.contains(':') || key.contains(' ') || key.is_empty() {
                    format!("\"{}\"", key)
                } else {
                    key.clone()
                };

                match value {
                    Value::Object(_) | Value::Array(_)
                        if !formatted_value.starts_with('[')
                            && !formatted_value.starts_with('{') =>
                    {
                        // Multi-line value
                        format!("{}{}:\n{}", indent_str, formatted_key, formatted_value)
                    }
                    _ => {
                        // Inline value
                        format!("{}{}: {}", indent_str, formatted_key, formatted_value)
                    }
                }
            })
            .collect();

        items.join("\n")
    }

    /// Estimate token savings compared to JSON.
    pub fn estimate_savings(&self, value: &Value) -> f32 {
        let json = serde_json::to_string(value).unwrap_or_default();
        let yaml = self.convert(value).unwrap_or_default();
        1.0 - (yaml.len() as f32 / json.len() as f32)
    }
}

impl Default for YamlConverter {
    fn default() -> Self {
        Self::new()
    }
}

impl Compressor for YamlConverter {
    fn compress(&self, input: &str) -> Result<String, super::CompressionError> {
        // Try to parse as JSON
        if let Ok(value) = serde_json::from_str::<Value>(input) {
            return self.convert(&value).map_err(super::CompressionError::Yaml);
        }

        // Not JSON, return as-is
        Ok(input.to_string())
    }

    fn strategy(&self) -> CompressionStrategy {
        CompressionStrategy::Yaml
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_simple_object() {
        let converter = YamlConverter::new();
        let value = json!({
            "name": "Alice",
            "age": 30,
            "active": true
        });

        let result = converter.convert(&value).unwrap();
        assert!(result.contains("name: Alice"));
        assert!(result.contains("age: 30"));
        assert!(result.contains("active: true"));
        // Should not have JSON syntax
        assert!(!result.contains('{'));
        assert!(!result.contains('"'));
    }

    #[test]
    fn test_nested_object() {
        let converter = YamlConverter::new();
        let value = json!({
            "user": {
                "name": "Bob",
                "email": "bob@example.com"
            }
        });

        let result = converter.convert(&value).unwrap();
        assert!(result.contains("user:"));
        assert!(result.contains("  name: Bob"));
        assert!(result.contains("  email: bob@example.com"));
    }

    #[test]
    fn test_array_flow_style() {
        let converter = YamlConverter::new();
        let value = json!({"tags": ["a", "b", "c"]});

        let result = converter.convert(&value).unwrap();
        // Short array should use flow style
        assert!(result.contains("[a, b, c]"));
    }

    #[test]
    fn test_array_block_style() {
        let converter = YamlConverter::new();
        let value = json!({
            "items": [
                {"name": "item1"},
                {"name": "item2"}
            ]
        });

        let result = converter.convert(&value).unwrap();
        println!("Array block style result:\n{}", result);
        assert!(
            result.contains("items:"),
            "Expected 'items:' in:\n{}",
            result
        );
        // Check that both items are present
        assert!(result.contains("item1"), "Expected 'item1' in:\n{}", result);
        assert!(result.contains("item2"), "Expected 'item2' in:\n{}", result);
    }

    #[test]
    fn test_string_quoting() {
        let converter = YamlConverter::new();

        // String with colon needs quoting
        let value = json!({"message": "hello: world"});
        let result = converter.convert(&value).unwrap();
        assert!(result.contains("\"hello: world\""));

        // Simple string doesn't need quoting
        let value = json!({"message": "hello"});
        let result = converter.convert(&value).unwrap();
        assert!(result.contains("message: hello"));
        assert!(!result.contains('"'));
    }

    #[test]
    fn test_special_values() {
        let converter = YamlConverter::new();
        let value = json!({
            "null_val": null,
            "bool_true": true,
            "bool_false": false
        });

        let result = converter.convert(&value).unwrap();
        assert!(result.contains("null_val: ~"));
        assert!(result.contains("bool_true: true"));
        assert!(result.contains("bool_false: false"));
    }

    #[test]
    fn test_empty_structures() {
        let converter = YamlConverter::new();

        assert_eq!(converter.convert(&json!({})).unwrap(), "{}");
        assert_eq!(converter.convert(&json!([])).unwrap(), "[]");
    }

    #[test]
    fn test_token_savings() {
        let converter = YamlConverter::new();
        let value = json!({
            "user": {
                "name": "Alice",
                "email": "alice@example.com",
                "roles": ["admin", "user"],
                "active": true,
                "age": 30
            }
        });

        let savings = converter.estimate_savings(&value);
        // YAML saves tokens by removing quotes and braces, but adds indentation
        // Expect some savings, even if modest
        assert!(
            savings > 0.0,
            "Expected some savings, got {:.1}%",
            savings * 100.0
        );
    }

    #[test]
    fn test_compressor_trait() {
        let converter = YamlConverter::new();
        let input = r#"{"name": "test", "value": 42}"#;

        let result = converter.compress(input).unwrap();
        assert!(result.contains("name: test"));
        assert!(result.contains("value: 42"));
        assert_eq!(converter.strategy(), CompressionStrategy::Yaml);
    }

    #[test]
    fn test_non_json_input() {
        let converter = YamlConverter::new();
        let input = "not json content";

        let result = converter.compress(input).unwrap();
        assert_eq!(result, "not json content");
    }

    #[test]
    fn test_numeric_strings_quoted() {
        let converter = YamlConverter::new();
        let value = json!({"version": "123"});

        let result = converter.convert(&value).unwrap();
        // Numeric string should be quoted to preserve type
        assert!(result.contains("\"123\""));
    }
}
