---
title: "API Reference"
description: "Complete API documentation for Aura LLM Gateway"
---

# Aura API Reference

Aura implements the [Open Responses API](https://www.openresponses.org/specification) specification with additional enrichments for cost tracking and observability.

## Base URL

```text
http://localhost:8080
```

## Authentication

All API requests require a valid API key in the `Authorization` header:

```bash
curl -X POST http://localhost:8080/v1/responses \
  -H "Authorization: Bearer aura_live_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "input": [...]}'
```

See [Authentication](/docs/api/authentication) for details on API key management, scopes, and rate limits.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/responses` | Create a response (streaming or non-streaming) |
| GET | `/v1/conversations` | List conversations |
| GET | `/v1/conversations/{id}` | Get a conversation |
| DELETE | `/v1/conversations/{id}` | Delete a conversation |
| POST | `/v1/api-keys` | Create an API key (admin) |
| GET | `/v1/api-keys` | List API keys (admin) |
| DELETE | `/v1/api-keys/{key_id}` | Revoke an API key (admin) |
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

| Provider | Models |
|----------|--------|
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo, o1, o1-mini, o3-mini |
| **Anthropic** | claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022 (coming soon) |
| **Google** | gemini-2.0-flash, gemini-1.5-pro (coming soon) |

See the [Providers](/docs/providers/openai) section for detailed model capabilities and pricing.
