# Aura API Reference

Aura implements the [Open Responses API](https://www.openresponses.org/specification) specification with additional enrichments for cost tracking and observability.

## Base URL

```
http://localhost:8080
```

## Authentication

Currently, Aura does not require authentication. Provider API keys are configured on the server side.

## Client SDKs

Official SDKs are available for easy integration:

| Language | Package | Install |
|----------|---------|---------|
| Python | [`aura-llm`](https://pypi.org/project/aura-llm/) | `uv add aura-llm` |
| TypeScript | `@aura/sdk` | Coming soon |

See [Client SDKs](./sdks.md) for detailed SDK documentation.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/responses` | Create a response (streaming or non-streaming) |
| POST | `/v1/feedback` | Submit feedback on a response |
| GET | `/v1/feedback` | List feedback samples |
| GET | `/v1/feedback/stats` | Get feedback statistics |
| GET | `/v1/feedback/{id}` | Get a feedback sample |
| DELETE | `/v1/feedback/{id}` | Delete a feedback sample |
| GET | `/health` | Health check endpoint |

See [Feedback API](./feedback.md) for adaptive few-shot learning documentation.

See [Compression API](./compression.md) for prompt compression and token reduction.

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

### OpenAI ✅
- `gpt-6-astra`
- `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`
- `gpt-5.5-pro`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`
- `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo` (legacy)
- `o1`, `o1-mini`, `o3-mini`

### Anthropic ✅
- `claude-fable-5-1`, `claude-fable-5`
- `claude-opus-5`, `claude-sonnet-5`
- `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6`
- `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-haiku-4-5`
- `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku` (legacy)

### Google Gemini ✅
- `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`
- `gemini-3.1-pro-preview`, `gemini-3-pro-preview`, `gemini-3-flash-preview`
- `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`
- `gemini-2.0-flash`, `gemini-2.0-flash-lite`

### Planned Providers

| Provider | Models | Status |
|----------|--------|--------|
| **AWS Bedrock** | Claude, Llama, Titan via Bedrock | 📋 Planned |
| **Mistral** | mistral-large, codestral | 📋 Planned |
| **Ollama** | Local models (llama3, mistral, etc.) | 📋 Planned |
| **HuggingFace** | Inference API & Endpoints | 📋 Planned |
