---
title: "Mistral Provider"
description: "Mistral AI models through Aura Gateway"
---

# Mistral Provider

Aura supports Mistral AI's full model lineup including Mistral Large 2, the Codestral coding model, and the lightweight Ministral edge models. Mistral exposes an OpenAI-compatible API, so streaming and tool calling work transparently.

## Supported Models

### Flagship
- **mistral-large-latest** — Top-tier reasoning, multilingual, 128K context
- **mistral-large-2411** — Pinned Large snapshot

### Balanced
- **mistral-medium-latest** — Strong performance at lower cost
- **mistral-small-latest** — Fast and cheap for high-volume work

### Specialized
- **codestral-latest** — Optimized for code generation and FIM-style completion
- **pixtral-large-latest** — Vision-capable multimodal model

### Edge / On-Device
- **ministral-8b-latest** — 8B parameter model for edge deployment
- **ministral-3b-latest** — 3B parameter model, smallest in the lineup

## Model Capabilities

| Feature | Large | Medium | Small | Codestral | Pixtral | Ministral |
|---|---|---|---|---|---|---|
| Text generation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tool / function calling | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Streaming | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vision | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| JSON mode | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Context window | 128K | 128K | 128K | 32K | 128K | 128K |

## Pricing

*Prices per 1M tokens (USD), as of 2026*

| Model | Input | Output |
|---|---|---|
| mistral-large-latest | $2.00 | $6.00 |
| mistral-medium-latest | $0.40 | $2.00 |
| mistral-small-latest | $0.20 | $0.60 |
| codestral-latest | $0.30 | $0.90 |
| ministral-8b-latest | $0.10 | $0.10 |
| ministral-3b-latest | $0.04 | $0.04 |

Aura automatically computes `cost_usd` per request based on these rates.

## Configuration

Set your Mistral API key in the environment:

```bash
export MISTRAL_API_KEY=...
```

Or in `.env`:

```env
MISTRAL_API_KEY=...
```

Get a key at [console.mistral.ai](https://console.mistral.ai).

## Example Usage

### Basic Completion

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral-large-latest",
    "input": [
      {"type": "message", "role": "user", "content": "Bonjour!"}
    ]
  }'
```

### Tool Calling

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral-large-latest",
    "input": [
      {"type": "message", "role": "user", "content": "What is the weather in Paris?"}
    ],
    "tools": [
      {
        "type": "function",
        "name": "get_weather",
        "description": "Get current weather",
        "parameters": {
          "type": "object",
          "properties": { "location": {"type": "string"} },
          "required": ["location"]
        }
      }
    ]
  }'
```

### Code Generation (Codestral)

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "codestral-latest",
    "input": [
      {"type": "message", "role": "user", "content": "Write a Rust fn that reverses a string."}
    ]
  }'
```

## Limitations

- **Fill-in-the-middle** (`/v1/fim/completions`) is not yet routed through Aura. Use Codestral's standard chat completion endpoint for now. Tracked in [#75](https://github.com/UmaiTech/aura-llm-gateway/issues/75).
- Ministral edge models have weaker tool-calling reliability than the Large/Medium tier.

## Best Practices

1. Default to **mistral-small-latest** for high-volume routing; it's cheap and fast.
2. Use **mistral-large-latest** for agentic workflows that need multi-step tool use.
3. **codestral-latest** is the right pick for code-completion sidecars and IDE-style assistants.
