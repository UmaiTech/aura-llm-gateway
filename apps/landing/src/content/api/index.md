---
title: "API Reference"
description: "Complete API documentation for Aura LLM Gateway"
---

# Aura API Reference

Aura implements the [Open Responses API](https://www.openresponses.org/specification) specification with additional enrichments for cost tracking and observability.

## Base URL

```text
https://api.aura-llm.dev
```

## Interactive API Explorer

Explore the API interactively with our Swagger UI:

**[Open Swagger UI](https://api.aura-llm.dev/swagger-ui/)** - Try out endpoints directly in your browser against the live gateway.

You can also fetch the raw OpenAPI 3.1 specification at [`https://api.aura-llm.dev/openapi.json`](https://api.aura-llm.dev/openapi.json).

> Running self-hosted? Swap `api.aura-llm.dev` for your own host (e.g. `http://localhost:8080`).

## Authentication

All API requests require a valid API key in the `Authorization` header:

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Authorization: Bearer aura_live_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4.5", "input": [...]}'
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
| GET | `/metrics` | Prometheus metrics endpoint |

## Rate Limiting

All API keys have configurable rate limits. Rate limit status is included in response headers:

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 42
```

See [Rate Limiting](/docs/api/rate-limiting) for configuration and best practices.

## Prompt Compression

Reduce token usage and costs with intelligent prompt compression. Supports TOON, YAML, AISP, and JSON minification.

See [Prompt Compression](/docs/api/compression) for strategies and configuration.

## Response Caching

Non-streaming requests with `temperature=0` are automatically cached in Redis. Use the `X-Cache-Control: no-cache` header to bypass caching.

See [Response Caching](/docs/api/caching) for details.

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

| Provider | Models | Status |
|----------|--------|--------|
| **OpenAI** | gpt-4.5, gpt-4.5-mini, gpt-4.5, gpt-3.5-turbo, o1, o1-mini, o3-mini | ✅ Live |
| **Anthropic** | claude-opus-4-5-20251101, claude-sonnet-4-5-20250514, claude-3-5-haiku-20241022 | ✅ Live |
| **Google** | gemini-3-pro, gemini-3-flash, gemini-2.5-pro, gemini-2.0-flash, gemini-1.5-pro | ✅ Live |

### Planned Providers

| Provider | Models | Status |
|----------|--------|--------|
| **AWS Bedrock** | anthropic.claude-3-*, meta.llama3-*, amazon.titan-* | 📋 Planned |
| **Mistral** | mistral-large, mistral-medium, codestral | 📋 Planned |
| **Ollama** | llama3.2, mistral, codellama, qwen2.5 (local models) | 📋 Planned |
| **HuggingFace** | Any model on HF Hub via Inference API | 📋 Planned |

See the [Providers](/docs/providers/openai) section for detailed model capabilities and pricing.
