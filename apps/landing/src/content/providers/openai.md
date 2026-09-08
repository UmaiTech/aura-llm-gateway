---
title: "OpenAI Provider"
description: "OpenAI models and capabilities through Aura Gateway"
---

# OpenAI Provider

Aura provides first-class support for OpenAI's latest models including GPT-6 Astra, the GPT-5.6 Sol / Terra / Luna tiers, the GPT-5.5 and GPT-5.4 families, o-series reasoning models, and legacy GPT-4o models. Catalog last refreshed 2026-09-07.

## Supported Models

### GPT-6 (Latest — September 2026)
- **gpt-6-astra** - Flagship for computer use, browsing, software engineering and multi-step professional work

### GPT-5.6 Series (August 2026)
- **gpt-5.6-sol** - Flagship tier for complex reasoning, coding and agentic workflows (`gpt-5.6` is an alias for Sol)
- **gpt-5.6-terra** - Production default with the 5.6 family's capabilities at a lower price
- **gpt-5.6-luna** - Cheapest tier for classification, extraction and routing

### GPT-5.5 / GPT-5.4 Series
- **gpt-5.5-pro**, **gpt-5.5** - Previous flagship line
- **gpt-5.4**, **gpt-5.4-mini**, **gpt-5.4-nano** - Balanced, efficient and ultra-low-cost options

### GPT-5 Series (older 2026 line)
- **gpt-5.2**, **gpt-5**, **gpt-5-mini**

### Legacy (kept for backward compatibility)
- **gpt-4o**, **gpt-4o-mini**, **gpt-4-turbo**, **gpt-4**, **gpt-3.5-turbo**
- GPT-4.5 was retired by OpenAI on 2026-06-27 and is no longer routable.

### Reasoning Models (o-series)
- **o1**, **o1-mini**, **o1-preview**, **o3-mini**

## Model Capabilities

| Feature | GPT-6 | GPT-5.6 | GPT-5.5 / 5.4 | GPT-4o (legacy) | o-series |
|---------|-------|---------|---------------|-----------------|----------|
| **Text Generation** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Tool/Function Calling** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Streaming** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Vision/Multimodal** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Extended Reasoning** | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Reasoning Tokens** | ✅ | ✅ | ✅ | ❌ | ✅ |
| **JSON Mode** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Context Window** | 1M | 1M | 1M | 128K | 200K |

## Pricing

*Prices per 1M tokens (USD), as published 2026-09-07. GPT-5.6 Sol is promotional pricing through 2026-11-21.*

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| **gpt-6-astra** | $10.00 | $50.00 | $1.00 |
| **gpt-5.6-sol** | $4.00 | $20.00 | $0.40 |
| **gpt-5.6-terra** | $2.00 | $12.00 | $0.20 |
| **gpt-5.6-luna** | $0.20 | $1.20 | $0.02 |
| **gpt-5.5-pro** | $30.00 | $180.00 | — |
| **gpt-5.5** | $5.00 | $30.00 | $0.50 |
| **gpt-5.4** | $2.50 | $15.00 | $0.25 |
| **gpt-5.4-mini** | $0.75 | $4.50 | $0.075 |
| **gpt-5.4-nano** | $0.20 | $1.25 | $0.02 |
| **gpt-5.2** | $5.00 | $20.00 | $1.25 |
| **gpt-5** | $5.00 | $20.00 | $1.25 |
| **gpt-5-mini** | $0.50 | $2.00 | $0.125 |
| **gpt-4o** | $2.50 | $10.00 | $1.25 |
| **gpt-4o-mini** | $0.15 | $0.60 | $0.075 |
| **o1** | $15.00 | $60.00 | $7.50 |
| **o3-mini** | $1.10 | $4.40 | $0.55 |

## Configuration

Set your OpenAI API key in the environment:

```bash
export OPENAI_API_KEY=sk-proj-...
```

Or in `.env`:

```env
OPENAI_API_KEY=sk-proj-...
```

## Example Usage

### Basic Completion

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1-mini",
    "input": [
      {"type": "message", "role": "user", "content": "Hello!"}
    ]
  }'
```

### With Function Calling

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "input": [
      {"type": "message", "role": "user", "content": "What is the weather in San Francisco?"}
    ],
    "tools": [
      {
        "type": "function",
        "name": "get_weather",
        "description": "Get current weather",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string"}
          },
          "required": ["location"]
        }
      }
    ]
  }'
```

### Reasoning Model (o3-mini)

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "o3-mini",
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": "Solve this logic puzzle: ..."
      }
    ]
  }'
```

The response will include `reasoning_tokens` in the usage object for o-series models.

## Special Features

### Prompt Caching

OpenAI supports prompt caching for repeated prefixes. Aura automatically tracks `cached_tokens` in the usage object:

```json
{
  "usage": {
    "input_tokens": 1000,
    "cached_tokens": 800,
    "output_tokens": 200,
    "cost_usd": 0.00145
  }
}
```

Cached tokens are billed at a lower rate (see pricing table above).

### Vision Inputs (GPT-4o/GPT-5)

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.5",
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": [
          {"type": "text", "text": "What is in this image?"},
          {"type": "image_url", "image_url": {"url": "https://..."}}
        ]
      }
    ]
  }'
```

## Rate Limits

OpenAI enforces rate limits by tier. Aura respects these limits and returns appropriate 429 errors when exceeded.

Default limits (may vary by account):
- **Tier 1**: 500 RPM, 200K TPM
- **Tier 2**: 5K RPM, 2M TPM
- **Tier 3**: 10K RPM, 10M TPM
- **Tier 4**: 30K RPM, 30M TPM
- **Tier 5**: 60K RPM, 150M TPM

## Error Handling

OpenAI-specific errors are normalized to the Open Responses API format:

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit reached for gpt-4.5 in organization org-...",
    "param": null
  }
}
```

## Best Practices

1. **Use -mini variants** for most tasks to reduce costs
2. **Enable caching** for repeated prompts (especially with long system instructions)
3. **Use o-series models** only when complex reasoning is required
4. **Set max_output_tokens** to prevent runaway costs
5. **Monitor usage** via Aura's cost tracking met