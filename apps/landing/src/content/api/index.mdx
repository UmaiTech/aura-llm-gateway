---
title: "API Reference"
description: "Complete API documentation for Aura LLM Gateway"
---

# Aura API Reference

Aura implements the [Open Responses API](https://www.openresponses.org/specification) specification with additional enrichments for cost tracking and observability.

## Base URL

```
http://localhost:8080
```

## Authentication

Currently, Aura does not require authentication. Provider API keys are configured on the server side.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/responses` | Create a response (streaming or non-streaming) |
| GET | `/health` | Health check endpoint |

## Response Enrichment

Aura automatically enriches all responses with:

```json
{
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50,
    "total_tokens": 150,
    "cost_usd": 0.0035
  },
  "metadata": {
    "aura": {
      "provider": "openai",
      "gateway_version": "0.1.7",
      "latency_ms": 245
    }
  }
}
```

## Error Handling

Errors follow the Open Responses API format:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Description of what went wrong",
    "param": "model"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `invalid_request` | 400 | Malformed request or invalid parameters |
| `authentication_error` | 401 | Invalid or missing API key |
| `model_not_found` | 404 | Requested model is not available |
| `rate_limit_exceeded` | 429 | Too many requests |
| `server_error` | 500 | Internal server error |
| `service_unavailable` | 503 | Provider temporarily unavailable |

## Supported Models

### OpenAI
- `gpt-4o`
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-3.5-turbo`
- `o1`, `o1-mini`, `o3-mini`

### Anthropic (coming soon)
- `claude-3-5-sonnet-20241022`
- `claude-3-5-haiku-20241022`

### Google (coming soon)
- `gemini-2.0-flash`
- `gemini-1.5-pro`
