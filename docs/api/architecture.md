# Architecture Overview

Aura is a high-performance LLM gateway that provides a unified API for multiple AI providers. This page explains how Aura processes your requests and enriches responses.

## How It Works

```
┌─────────────┐     ┌─────────────────────────────────────┐     ┌─────────────┐
│             │     │           Aura Gateway              │     │             │
│   Your App  │────►│  ┌─────────────────────────────┐   │────►│   OpenAI    │
│             │     │  │   Unified API Endpoint      │   │     │  Anthropic  │
│             │◄────│  │   /v1/responses             │   │◄────│   Google    │
│             │     │  └─────────────────────────────┘   │     │             │
└─────────────┘     │                                     │     └─────────────┘
                    │  + Cost Calculation                 │
                    │  + Request Logging                  │
                    │  + Agentic Metadata                 │
                    └─────────────────────────────────────┘
```

## Request Flow

When you send a request to Aura, here's what happens:

### 1. Request Received
Your application sends a request to the `/v1/responses` endpoint using the [Open Responses API](/docs/api) format.

```json
{
  "model": "gpt-5.4-mini",
  "input": [
    {"type": "message", "role": "user", "content": "Hello!"}
  ]
}
```

### 2. Provider Selection
Aura automatically routes your request to the correct provider based on the model name:

| Model Pattern | Provider |
|--------------|----------|
| `gpt-*`, `o1-*`, `o3-*` | OpenAI |
| `claude-*` | Anthropic |
| `gemini-*` | Google |

### 3. Request Transformation
Aura transforms your Open Responses API request into the provider's native format, handling all the differences between APIs.

### 4. Response Enrichment
When the provider responds, Aura enriches the response with:

- **Cost calculation** - Automatic pricing based on token usage
- **Request ID** - Unique identifier for tracing
- **Latency tracking** - Request duration in milliseconds
- **Agentic metadata** - Tool calls, reasoning status, and more

### 5. Response Returned
You receive a standardized response with all the enrichments:

```json
{
  "id": "resp_abc123",
  "status": "completed",
  "output": [...],
  "usage": {
    "input_tokens": 10,
    "output_tokens": 25,
    "cost_usd": 0.00035
  },
  "metadata": {
    "aura": {
      "request_id": "aura_...",
      "provider": "openai",
      "latency_ms": 523
    }
  }
}
```

## Streaming Flow

For streaming requests (`stream: true`), Aura proxies Server-Sent Events (SSE) in real-time:

```
Client                    Aura                     Provider
  │                        │                          │
  │ ─── stream: true ────► │                          │
  │                        │ ─── SSE Connection ────► │
  │ ◄── response.in_progress ◄─────────────────────── │
  │ ◄── output_item.added ◄────────────────────────── │
  │ ◄── output_text.delta ◄────────────────────────── │
  │ ◄── output_text.delta ◄────────────────────────── │
  │ ◄── response.completed (with cost) ◄───────────── │
  │                        │                          │
```

The final `response.completed` event includes the full usage and cost data.

## Supported Providers

### OpenAI
- GPT-5, GPT-5.2, GPT-5-mini
- GPT-4o, GPT-4o-mini, GPT-4.1 family
- o1, o1-pro, o3, o3-mini, o4-mini

### Anthropic
- Claude Opus 4.5, Sonnet 4.5, Haiku 4.5
- Claude 3.5 Sonnet, 3.5 Haiku
- Claude 3 Opus, Sonnet, Haiku

### Google
- Gemini 3 Pro, Gemini 3 Flash
- Gemini 2.5 Pro, 2.5 Flash
- Gemini 2.0 Flash, 1.5 Pro, 1.5 Flash

## Key Benefits

### Unified API
Write once, deploy anywhere. Switch between providers by changing the model name.

### Automatic Cost Tracking
No need to maintain your own pricing tables. Aura calculates costs automatically.

### Agentic Insights
Built-in metadata for agent workflows: tool call counts, requires_action flags, and more.

### Request Logging
Optional database integration for auditing, analytics, and debugging.

## Technical Stack

| Component | Technology |
|-----------|------------|
| Language | Rust (blazing fast) |
| Web Framework | Axum |
| Database | PostgreSQL (optional) |
| Async Runtime | Tokio |

## Next Steps

- [Create Response API](/docs/api/create-response) - Make your first request
- [Streaming Guide](/docs/api/streaming) - Real-time responses
- [Cost Tracking](/docs/api/cost-tracking) - Understand pricing and usage
