---
title: "Create Response"
description: "Create model responses with the Open Responses API"
---

# Create Response

Create a model response with optional streaming and tool use.

## Endpoint

```http
POST /v1/responses
```

## Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | Yes | Model identifier (e.g., `gpt-4.5`, `gpt-4.5-mini`) |
| `input` | array | Yes | Array of input items (messages, function outputs) |
| `instructions` | string | No | System instructions for the model |
| `stream` | boolean | No | Enable streaming (default: `false`) |
| `max_output_tokens` | integer | No | Maximum tokens to generate |
| `temperature` | number | No | Sampling temperature (0-2) |
| `top_p` | number | No | Nucleus sampling parameter |
| `tools` | array | No | Available tools/functions |
| `tool_choice` | string/object | No | How to select tools |
| `previous_response_id` | string | No | Continue a conversation |
| `validation` | object | No | Response validation configuration |
| `consistency` | object | No | Cross-model consistency configuration |
| `compression` | object | No | Prompt compression configuration |

### Request Headers

| Header | Type | Description |
|--------|------|-------------|
| `Authorization` | string | Bearer token for authentication |
| `X-Routing-Strategy` | string | Load balancing strategy (see below) |

### Routing Strategies

| Strategy | Description |
|----------|-------------|
| `round_robin` | Distribute evenly across endpoints (default) |
| `weighted` | Route based on endpoint weights |
| `least_latency` | Route to healthiest endpoint |
| `cost_optimized` | Route to cheapest capable model |
| `tool_aware` | Route based on tools in request |
| `context_adaptive` | Route based on input token count |
| `reasoning_depth` | Route complex reasoning to thinking models |

### Validation Configuration

```json
{
  "validation": {
    "strategy": "logprobs",
    "min_confidence": 0.7,
    "n": 3,
    "selection": "highest_confidence"
  }
}
```

### Consistency Configuration

```json
{
  "consistency": {
    "strategy": "constitutional",
    "principles": ["Be concise", "Use technical terms"],
    "apply_calibration": true
  }
}
```

### Compression Configuration

```json
{
  "compression": {
    "enabled": true,
    "data_format": "toon",
    "auto_select": false
  }
}
```

### Input Items

#### Message Item
```json
{
  "type": "message",
  "role": "user" | "assistant" | "system",
  "content": "string or array of content parts"
}
```

#### Function Call Output Item
```json
{
  "type": "function_call_output",
  "call_id": "call_abc123",
  "output": "Result of the function call"
}
```

### Tool Definition
```json
{
  "type": "function",
  "name": "get_weather",
  "description": "Get current weather for a location",
  "parameters": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City name"
      }
    },
    "required": ["location"]
  }
}
```

## Example Request

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.5-mini",
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": "What is 2 + 2?"
      }
    ],
    "stream": false
  }'
```

## Example Response

```json
{
  "id": "resp_oai_chatcmpl-abc123",
  "object": "response",
  "created_at": 1706140800,
  "model": "gpt-4.5-mini",
  "status": "completed",
  "output": [
    {
      "type": "message",
      "id": "msg_xyz789",
      "role": "assistant",
      "content": [
        {
          "type": "text",
          "text": "2 + 2 equals 4."
        }
      ]
    }
  ],
  "usage": {
    "input_tokens": 12,
    "output_tokens": 8,
    "total_tokens": 20,
    "cost_usd": 0.0000048
  },
  "metadata": {
    "aura": {
      "provider": "openai",
      "gateway_version": "0.2.8",
      "latency_ms": 312,
      "request_id": "aura_abc123",
      "routing_strategy": "round_robin"
    }
  }
}
```

### Full Response with All Gateway Features

When using validation, consistency, and compression:

```json
{
  "id": "resp_oai_d46d074d-4991-4637-9fec-9026c6c9c211",
  "object": "response",
  "model": "gpt-5.2",
  "status": "completed",
  "output": [...],
  "usage": {
    "input_tokens": 264,
    "output_tokens": 1563,
    "total_tokens": 1827,
    "cost_usd": 0.03258
  },
  "metadata": {
    "aura": {
      "provider": "openai",
      "gateway_version": "0.2.8",
      "latency_ms": 3208,
      "request_id": "aura_1a7aa7ef-5203-48bd-b6ca-6a36f1aeaccb",
      "routing_strategy": "round_robin",
      "validation": {
        "strategy": "logprobs",
        "n": 3,
        "min_confidence": 0.7,
        "selection": "highestconfidence"
      },
      "consistency": {
        "strategy": "modelcalibration"
      },
      "compression_enabled": true,
      "compression_config": {
        "data_format": "toon",
        "semantic_format": "natural"
      },
      "compression": {
        "original_tokens": 95,
        "compressed_tokens": 35,
        "ratio": 0.368,
        "savings_percent": 63.2,
        "strategies": ["toon"],
        "latency_ms": 12
      }
    }
  }
}
```

## Response Status

| Status | Description |
|--------|-------------|
| `in_progress` | Response is being generated |
| `completed` | Generation finished successfully |
| `failed` | Generation failed (check `error` field) |
| `incomplete` | Generation stopped early (check `incomplete_reason`) |

## With Tools

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.5",
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": "What time is it?"
      }
    ],
    "tools": [
      {
        "type": "function",
        "name": "get_current_time",
        "description": "Get the current time",
        "parameters": {
          "type": "object",
          "properties": {}
        }
      }
    ]
  }'
```

When the model decides to call a tool, the response will include:

```json
{
  "output": [
    {
      "type": "function_call",
      "id": "fc_abc123",
      "name": "get_current_time",
      "call_id": "call_xyz",
      "arguments": "{}"
    }
  ]
}
```

Submit the tool result to continue:

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.5",
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": "What time is it?"
      },
      {
        "type": "function_call_output",
        "call_id": "call_xyz",
        "output": "The current time is 3:45 PM"
      }
    ]
  }'
```
