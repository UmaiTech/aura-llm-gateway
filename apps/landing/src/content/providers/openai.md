---
title: "OpenAI Provider"
description: "OpenAI models and capabilities through Aura Gateway"
---

# OpenAI Provider

Aura provides first-class support for OpenAI's latest models including GPT-5, GPT-4.1, o-series reasoning models, and legacy GPT-4 models.

## Supported Models

### GPT-5 Series (Latest)
- **gpt-5** - Most capable model, optimized for complex tasks
- **gpt-5.2** - Enhanced version with improved reasoning
- **gpt-5-mini** - Fast, cost-effective alternative

### GPT-4.1 Series
- **gpt-4.1** - Balanced performance and cost
- **gpt-4.1-mini** - Efficient for most tasks
- **gpt-4.1-nano** - Ultra-fast, low-cost option

### GPT-4o Series (Vision & Multimodal)
- **gpt-4.5** - Original multimodal model
- **gpt-4.5-mini** - Affordable vision-enabled model

### Reasoning Models (o-series)
- **o1** - Advanced reasoning capabilities
- **o1-pro** - Maximum reasoning performance
- **o3** - Next-generation reasoning
- **o3-mini** - Compact reasoning model
- **o4-mini** - Latest compact reasoning model

## Model Capabilities

| Feature | GPT-5 | GPT-4.1 | GPT-4o | o-series |
|---------|-------|---------|--------|----------|
| **Text Generation** | ✅ | ✅ | ✅ | ✅ |
| **Tool/Function Calling** | ✅ | ✅ | ✅ | ✅ |
| **Streaming** | ✅ | ✅ | ✅ | ✅ |
| **Vision/Multimodal** | ✅ | ✅ | ✅ | ❌ |
| **Extended Reasoning** | ❌ | ❌ | ❌ | ✅ |
| **Reasoning Tokens** | ❌ | ❌ | ❌ | ✅ |
| **JSON Mode** | ✅ | ✅ | ✅ | ✅ |
| **Context Window** | 128K | 128K | 128K | 200K |

## Pricing

*Prices per 1M tokens (USD)*

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| **gpt-5** | $5.00 | $20.00 | $1.25 |
| **gpt-5.2** | $5.00 | $20.00 | $1.25 |
| **gpt-5-mini** | $0.50 | $2.00 | $0.125 |
| **gpt-4.1** | $2.00 | $8.00 | $0.50 |
| **gpt-4.1-mini** | $0.40 | $1.60 | $0.10 |
| **gpt-4.1-nano** | $0.10 | $0.40 | $0.025 |
| **gpt-4.5** | $2.50 | $10.00 | $1.25 |
| **gpt-4.5-mini** | $0.15 | $0.60 | $0.075 |
| **o1** | $15.00 | $60.00 | $7.50 |
| **o1-pro** | $150.00 | $600.00 | $75.00 |
| **o3** | $2.00 | $8.00 | $1.00 |
| **o3-mini** | $1.10 | $4.40 | $0.55 |
| **o4-mini** | $1.10 | $4.40 | $0.55 |

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
curl -X POST http://localhost:8080/v1/responses \
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
curl -X POST http://localhost:8080/v1/responses \
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
curl -X POST http://localhost:8080/v1/responses \
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
curl -X POST http://localhost:8080/v1/responses \
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