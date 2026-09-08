---
title: "Anthropic Provider"
description: "Claude models and capabilities through Aura Gateway"
---

# Anthropic Provider

Aura provides comprehensive support for Anthropic's Claude models, including Claude Fable 5.1, the Claude 5 generation (Opus 5, Sonnet 5) and the Claude 4.x line, with 1M-token context windows and adaptive reasoning. Catalog last refreshed 2026-09-07.

## Supported Models

Claude 5-generation ids carry no date suffix (`claude-opus-5`, never `claude-opus-5-2026MMDD`).

### Claude Fable 5.x (Latest — September 2026)
- **claude-fable-5-1** - Anthropic's most capable widely available model (released 2026-09-01); demanding reasoning, long-running agents, document-heavy work
- **claude-fable-5** - Previous Fable release, same tier and price

### Claude 5 Series (July 2026)
- **claude-opus-5** - Recommended starting point for most complex workloads
- **claude-sonnet-5** - Lower-cost tier for agent workflows

### Claude 4.x Series
- **claude-opus-4-8**, **claude-opus-4-7**, **claude-opus-4-6** - Opus 4.x line
- **claude-sonnet-4-6** - Sonnet 4.x line
- **claude-opus-4-5**, **claude-sonnet-4-5**, **claude-haiku-4-5** - Claude 4.5 (dated and alias ids)

### Claude 3.x Series (Legacy)
- **claude-3-7-sonnet-20250219**, **claude-3-5-sonnet**, **claude-3-5-haiku**, **claude-3-opus**, **claude-3-haiku** - kept for backward compatibility; Anthropic has retired several of these upstream

## Model Capabilities

| Feature | Fable 5.1 | Opus 5 | Sonnet 5 | Opus 4.8 / 4.7 | Sonnet 4.6 | Haiku 4.5 |
|---------|-----------|--------|----------|----------------|------------|-----------|
| **Text Generation** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Tool/Function Calling** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Streaming** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Vision/Multimodal** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Extended Thinking** | ✅ (always on) | ✅ (adaptive) | ✅ (adaptive) | ✅ (adaptive) | ✅ (adaptive) | ✅ (budget) |
| **JSON Mode** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Prompt Caching** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Context Window** | 1M | 1M | 1M | 1M | 1M | 200K |
| **Max Output** | 128K | 128K | 128K | 128K | 128K | 64K |

## Pricing

*Prices per 1M tokens (USD), Anthropic first-party rates as of 2026-09-07*

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| **claude-fable-5-1** | $10.00 | $50.00 | $0.25 |
| **claude-fable-5** | $10.00 | $50.00 | $1.00 |
| **claude-opus-5** | $5.00 | $25.00 | $0.50 |
| **claude-sonnet-5** | $2.00 | $10.00 | $0.20 |
| **claude-opus-4-8** | $5.00 | $25.00 | $0.50 |
| **claude-opus-4-7** | $5.00 | $25.00 | $0.50 |
| **claude-opus-4-6** | $5.00 | $25.00 | $0.50 |
| **claude-sonnet-4-6** | $3.00 | $15.00 | $0.30 |
| **claude-opus-4-5** | $15.00 | $75.00 | $1.50 |
| **claude-sonnet-4-5** | $3.00 | $15.00 | $0.30 |
| **claude-haiku-4-5** | $1.00 | $5.00 | $0.10 |
| **claude-3-5-haiku** | $0.80 | $4.00 | $0.08 |

## Configuration

Set your Anthropic API key in the environment:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or in `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

## Example Usage

### Basic Completion

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "input": [
      {"type": "message", "role": "user", "content": "Hello Claude!"}
    ]
  }'
```

### With System Instructions

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "instructions": "You are a helpful coding assistant.",
    "input": [
      {"type": "message", "role": "user", "content": "Write a function to reverse a string"}
    ]
  }'
```

### With Tool Use

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "input": [
      {"type": "message", "role": "user", "content": "What is the current time?"}
    ],
    "tools": [
      {
        "type": "function",
        "name": "get_time",
        "description": "Get the current time",
        "parameters": {
          "type": "object",
          "properties": {}
        }
      }
    ]
  }'
```

### Vision Input

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": [
          {"type": "text", "text": "Describe this image"},
          {
            "type": "image",
            "source": {
              "type": "url",
              "url": "https://example.com/image.jpg"
            }
          }
        ]
      }
    ]
  }'
```

## Special Features

### Prompt Caching

Claude supports prompt caching for long system prompts or repeated context. Cached content is automatically detected and billed at 90% lower rates:

```json
{
  "usage": {
    "input_tokens": 5000,
    "cached_tokens": 4000,
    "output_tokens": 500,
    "cost_usd": 0.0141
  }
}
```

Cache hits can reduce latency by up to 85% for repeated requests.

### Extended Thinking

Claude models support extended thinking for complex reasoning tasks. On Claude 4.6 and later (including the Claude 5 generation) Anthropic uses adaptive thinking and the `budget_tokens` form below is only accepted by older models; the Claude 5 / Fable models reason by default. Enable a budget on a pre-4.6 model with:

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-5",
    "input": [
      {"type": "message", "role": "user", "content": "Solve this complex problem..."}
    ],
    "thinking": {
      "type": "enabled",
      "budget_tokens": 10000
    }
  }'
```

The response will include reasoning items showing the model's thought process.

### JSON Mode

Force JSON output with:

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "input": [
      {"type": "message", "role": "user", "content": "Extract entities from: John lives in NYC"}
    ],
    "response_format": {"type": "json_object"}
  }'
```

## Rate Limits

Anthropic enforces rate limits by tier:

Default limits (may vary by account):
- **Tier 1**: 50 RPM, 40K TPM
- **Tier 2**: 1K RPM, 400K TPM
- **Tier 3**: 3K RPM, 2M TPM
- **Tier 4**: 4K RPM, 4M TPM

Aura returns 429 errors when limits are exceeded.

## Error Handling

Anthropic-specific errors are normalized to the Open Responses API format:

```json
{
  "error": {
    "code": "overloaded_error",
    "message": "Anthropic's API is temporarily overloaded",
    "param": null
  }
}
```

Common error codes:
- `invalid_request_error` - Malformed request
- `authentication_error` - Invalid API key
- `permission_error` - Insufficient permissions
- `rate_limit_error` - Rate limit exceeded
- `overloaded_error` - Service temporarily unavailable

## Best Practices

1. **Use Haiku for simple tasks** - 80% cheaper than Sonnet
2. **Enable prompt caching** - Reuse system prompts across requests
3. **Set max_tokens** - Prevent runaway generation costs
4. **Use extended thinking sparingly** - Reserve for complex reasoning tasks
5. **Batch similar requests** - Maximize cache hit rate
6. **Monitor cached_tokens** - Track caching effectiveness via Aura metadata
