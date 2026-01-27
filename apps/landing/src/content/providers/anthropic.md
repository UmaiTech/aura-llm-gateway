---
title: "Anthropic Provider"
description: "Claude models and capabilities through Aura Gateway"
---

# Anthropic Provider

Aura provides comprehensive support for Anthropic's Claude models, including the latest Claude 4.5 series with extended context windows and advanced reasoning capabilities.

## Supported Models

### Claude 4.5 Series (Latest)
- **claude-opus-4-5** - Most capable model for complex tasks
- **claude-sonnet-4-5** - Balanced performance and speed
- **claude-haiku-4-5** - Fast, cost-effective option

### Claude 3.5 Series
- **claude-3-5-sonnet** - Powerful general-purpose model
- **claude-3-5-haiku** - Efficient for high-volume tasks

### Claude 3 Series (Legacy)
- **claude-opus-4-5** - Previous flagship model

## Model Capabilities

| Feature | Opus 4.5 | Sonnet 4.5 | Haiku 4.5 | Sonnet 3.5 |
|---------|----------|------------|-----------|------------|
| **Text Generation** | ✅ | ✅ | ✅ | ✅ |
| **Tool/Function Calling** | ✅ | ✅ | ✅ | ✅ |
| **Streaming** | ✅ | ✅ | ✅ | ✅ |
| **Vision/Multimodal** | ✅ | ✅ | ✅ | ✅ |
| **Extended Thinking** | ✅ | ✅ | ❌ | ❌ |
| **JSON Mode** | ✅ | ✅ | ✅ | ✅ |
| **Prompt Caching** | ✅ | ✅ | ✅ | ✅ |
| **Context Window** | 200K | 200K | 200K | 200K |
| **Max Output** | 16K | 16K | 8K | 8K |

## Pricing

*Prices per 1M tokens (USD)*

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| **claude-opus-4-5** | $15.00 | $75.00 | $1.50 |
| **claude-sonnet-4-5** | $3.00 | $15.00 | $0.30 |
| **claude-haiku-4-5** | $1.00 | $5.00 | $0.10 |
| **claude-3-5-sonnet** | $3.00 | $15.00 | $0.30 |
| **claude-3-5-haiku** | $0.80 | $4.00 | $0.08 |
| **claude-opus-4-5** | $15.00 | $75.00 | $1.50 |

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
curl -X POST http://localhost:8080/v1/responses \
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
curl -X POST http://localhost:8080/v1/responses \
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
curl -X POST http://localhost:8080/v1/responses \
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
curl -X POST http://localhost:8080/v1/responses \
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

### Extended Thinking (Opus/Sonnet 4.5)

Claude 4.5 models support extended thinking for complex reasoning tasks. Enable with:

```bash
curl -X POST http://localhost:8080/v1/responses \
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
curl -X POST http://localhost:8080/v1/responses \
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
