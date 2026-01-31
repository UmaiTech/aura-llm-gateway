---
title: "Prompt Compression"
description: "Reduce token usage with intelligent prompt compression"
---

# Prompt Compression

Aura can automatically compress prompts to reduce token usage and costs while maintaining response quality.

## Overview

The gateway supports multiple compression strategies:

| Strategy | Savings | Best For |
|----------|---------|----------|
| **JSON Minification** | 15-30% | Structured data |
| **TOON** | 40-60% | Uniform arrays |
| **YAML** | 10-25% | Nested objects |
| **AISP** | Clarity boost | Rules and logic |

## Enabling Compression

Add a `compression` object to your request:

```json
{
  "model": "gpt-4o",
  "input": [...],
  "compression": {
    "enabled": true,
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

## Data Formats

Choose the format that best fits your data structure:

- **`json_compact`** - Minified JSON (default, safe for all data)
- **`yaml`** - YAML format (fewer delimiters, good for nested objects)
- **`toon`** - Token-Oriented Object Notation (best for arrays of similar objects)
- **`markdown`** - Markdown tables (good for tabular data)

## TOON Format

TOON (Token-Oriented Object Notation) achieves 40-60% token savings on uniform arrays by declaring field names once:

```
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

| Field | Default | Description |
|-------|---------|-------------|
| `min_array_size` | 2 | Minimum array size for TOON encoding |
| `min_fields` | 2 | Minimum fields per object |
| `max_depth` | 3 | Maximum nesting depth |

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

### AISP Configuration

```json
{
  "compression": {
    "semantic_format": "aisp",
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
- **`core`** - ~50 most common symbols (default)
- **`standard`** - ~150 practical symbols
- **`full`** - All 512 symbols

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

| Field | Description |
|-------|-------------|
| `original_tokens` | Estimated tokens before compression |
| `compressed_tokens` | Actual tokens after compression |
| `ratio` | Compression ratio (lower is better) |
| `strategies` | Compression strategies applied |
| `latency_ms` | Time spent compressing |

## Examples

### Compressing RAG Context

```bash
curl -X POST http://localhost:8080/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
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
    "model": "gpt-4o",
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

### 1. Use Auto-Select

Let the gateway choose the best format automatically:

```json
{"compression": {"enabled": true, "auto_select": true}}
```

### 2. TOON for Batch Data

Especially effective for:
- RAG retrieval results
- User lists
- Log entries
- API responses with arrays

### 3. AISP for Complex Rules

Use for system prompts with:
- Conditional logic
- Validation rules
- Access control policies
- Business rules

### 4. Monitor Savings

Check the `compression` metadata in responses to measure actual token savings and optimize your configuration.

## Cost Impact

Compression reduces input tokens, directly lowering costs:

| Compression | Input Tokens | Cost (GPT-4o) |
|-------------|--------------|---------------|
| None | 2,400 | $0.012 |
| 35% ratio | 850 | $0.004 |
| **Savings** | **1,550** | **$0.008** |

## See Also

- [Response Caching](/docs/api/caching) - Cache responses for additional savings
- [Cost Tracking](/docs/api/cost-tracking) - Monitor your spending
- [Rate Limiting](/docs/api/rate-limiting) - Request limits
