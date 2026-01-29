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
curl -X POST http://localhost:8080/v1/responses \
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
      "gateway_version": "0.1.7",
      "latency_ms": 312
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
curl -X POST http://localhost:8080/v1/responses \
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
curl -X POST http://localhost:8080/v1/responses \
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
