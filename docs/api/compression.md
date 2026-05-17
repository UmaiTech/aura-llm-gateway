# Prompt Compression API

Reduce token usage and costs through intelligent prompt compression.

## Overview

The Aura Gateway supports multiple compression strategies to reduce token usage while maintaining response quality:

| Strategy | Savings | Best For |
|----------|---------|----------|
| **JSON Minification** | 15-30% | Structured data |
| **TOON** | 40-60% | Uniform arrays |
| **YAML** | 10-25% | Nested objects |
| **AISP** | Clarity boost | Rules and logic |

## Request Configuration

Enable compression by adding a `compression` object to your request:

```json
{
  "model": "gpt-5.4-mini",
  "input": [...],
  "compression": {
    "enabled": true,
    "data_format": "auto",
    "semantic_format": "auto",
    "auto_select": true
  }
}
```

### Configuration Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable compression |
| `data_format` | string | `"json_compact"` | Format for structured data |
| `semantic_format` | string | `"natural"` | Format for instructions |
| `auto_select` | boolean | `false` | Auto-select best format per content |
| `target_ratio` | number | null | Target compression ratio (0.0-1.0) |
| `token_budget` | number | null | Maximum tokens after compression |
| `token_cleanup` | boolean | `true` | Apply whitespace normalization |
| `minify_json` | boolean | `true` | Minify JSON content |

### Data Formats

- `json` - Standard JSON with formatting
- `json_compact` - Minified JSON (default)
- `yaml` - YAML format (fewer delimiters)
- `toon` - Token-Oriented Object Notation (best for arrays)
- `markdown` - Markdown tables (tabular data)

### Semantic Formats

- `natural` - Standard natural language (default)
- `aisp` - AI Symbolic Protocol (formal notation)
- `pseudocode` - Structured pseudocode

## TOON Format

TOON (Token-Oriented Object Notation) achieves 40-60% token savings on uniform arrays by declaring field names once:

```json
// JSON (many tokens)
[
  {"id": 1, "name": "Alice", "role": "admin"},
  {"id": 2, "name": "Bob", "role": "user"}
]

// TOON (fewer tokens)
[2]{id,name,role}:
  1,Alice,admin
  2,Bob,user
```

### TOON Configuration

```json
{
  "compression": {
    "toon": {
      "min_array_size": 2,
      "min_fields": 2,
      "max_depth": 3
    }
  }
}
```

## AISP (AI Symbolic Protocol)

AISP converts natural language rules to formal mathematical notation, reducing ambiguity from 40-65% to under 2%:

```
# Natural Language (ambiguous)
"For all users, if they are an admin, allow access"

# AISP (unambiguous)
∀u∈Users: admin(u) ⇒ allow(u)
```

### Common AISP Symbols

| Symbol | Meaning | Example |
|--------|---------|---------|
| `∀` | For all | `∀x∈Set` |
| `∃` | There exists | `∃x: valid(x)` |
| `⇒` | Implies | `A ⇒ B` |
| `∧` | Logical AND | `A ∧ B` |
| `∨` | Logical OR | `A ∨ B` |
| `¬` | Logical NOT | `¬A` |
| `∈` | Element of | `x ∈ Set` |
| `≜` | Defined as | `x ≜ 5` |
| `≥` | Greater or equal | `x ≥ 10` |
| `≤` | Less or equal | `x ≤ 100` |

### AISP Configuration

```json
{
  "compression": {
    "aisp": {
      "symbol_set": "core",
      "convert_rules": true,
      "convert_definitions": true,
      "convert_quantifiers": true
    }
  }
}
```

Symbol sets:
- `core` - ~50 most common symbols (default)
- `standard` - ~150 practical symbols
- `full` - All 512 Σ₅₁₂ symbols

## Response Metadata

Compression statistics are included in the response:

```json
{
  "usage": {
    "input_tokens": 850,
    "output_tokens": 200,
    "compression": {
      "original_tokens": 2400,
      "compressed_tokens": 850,
      "ratio": 0.35,
      "strategies": ["toon", "aisp"],
      "latency_ms": 8
    }
  }
}
```

## Examples

### Compressing RAG Context

```bash
curl -X POST http://localhost:8080/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4-mini",
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": "Summarize these results"
      }
    ],
    "context": {
      "documents": [
        {"id": 1, "title": "Doc 1", "score": 0.95},
        {"id": 2, "title": "Doc 2", "score": 0.87},
        {"id": 3, "title": "Doc 3", "score": 0.82}
      ]
    },
    "compression": {
      "enabled": true,
      "auto_select": true
    }
  }'
```

### Compressing System Instructions

```bash
curl -X POST http://localhost:8080/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4-mini",
    "instructions": "For all user requests, if the user is authenticated then allow access. If not authenticated, reject with error.",
    "input": [...],
    "compression": {
      "enabled": true,
      "semantic_format": "aisp"
    }
  }'
```

The instructions will be converted to:
```
∀r∈Requests: authenticated(r.user) ⇒ allow(r)
∀r∈Requests: ¬authenticated(r.user) ⇒ reject(r, error)
```

## Best Practices

1. **Use auto-select** - Let the gateway choose the best format:
   ```json
   {"compression": {"enabled": true, "auto_select": true}}
   ```

2. **TOON for batch data** - Especially effective for arrays of similar objects (RAG results, user lists, logs)

3. **AISP for complex rules** - Use for system prompts with conditional logic, validation rules, or access control

4. **Combine strategies** - The gateway can apply multiple strategies to different parts of your request

5. **Monitor savings** - Check the `compression` metadata to measure actual token savings

## References

- [TOON Specification](https://github.com/toon-format/toon)
- [AISP Protocol](https://github.com/bar181/aisp-open-core)
