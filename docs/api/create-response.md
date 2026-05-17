# Create Response

Create a model response with optional streaming and tool use.

## Endpoint

```
POST /v1/responses
```

## Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | Yes | Model identifier (e.g., `gpt-5.4-mini`, `gpt-5.4-nano`) |
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
| `X-Routing-Strategy` | string | Load balancing strategy (see [Routing Strategies](#routing-strategies)) |

### Routing Strategies

| Strategy | Description |
|----------|-------------|
| `round_robin` | Distribute evenly across endpoints (default) |
| `weighted` | Route based on endpoint weights |
| `random` | Random endpoint selection |
| `least_latency` | Route to healthiest endpoint |
| `priority` | Route to highest priority endpoint |
| `cost_optimized` | Route to cheapest capable model |
| `tool_aware` | Route based on tools in request |
| `context_adaptive` | Route based on input token count |
| `sticky_session` | Maintain endpoint affinity per conversation |
| `reasoning_depth` | Route complex reasoning to thinking models |

### Validation Configuration

Control response quality with validation strategies:

```json
{
  "validation": {
    "strategy": "logprobs",
    "min_confidence": 0.7,
    "n": 3,
    "selection": "highest_confidence",
    "include_logprobs": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `strategy` | string | `none`, `logprobs`, `best_of_n`, `self_consistency`, `confidence_threshold` |
| `min_confidence` | number | Minimum confidence threshold (0-1) |
| `n` | integer | Number of candidates for best_of_n/self_consistency |
| `selection` | string | `highest_confidence`, `longest`, `shortest`, `most_relevant`, `lowest_perplexity` |
| `include_logprobs` | boolean | Include token log probabilities in response |

### Consistency Configuration

Ensure consistent responses across different models:

```json
{
  "consistency": {
    "strategy": "constitutional",
    "principles": [
      "Be concise and direct",
      "Use technical terminology appropriately"
    ],
    "apply_calibration": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `strategy` | string | `none`, `constitutional`, `model_calibration`, `style_profile`, `few_shot_priming` |
| `principles` | array | Guiding principles for constitutional strategy |
| `style_profile` | object | Tone, formality, verbosity settings |
| `examples` | array | Input/output examples for few-shot priming |
| `apply_calibration` | boolean | Apply model-specific corrections |

### Compression Configuration

Reduce token usage with prompt compression:

```json
{
  "compression": {
    "enabled": true,
    "data_format": "toon",
    "semantic_format": "natural",
    "auto_select": false
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable compression |
| `data_format` | string | `json`, `json_compact`, `yaml`, `toon`, `markdown` |
| `semantic_format` | string | `natural`, `aisp`, `pseudocode` |
| `auto_select` | boolean | Automatically choose best compression strategy |

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

### cURL

```bash
curl -X POST http://localhost:8080/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4-nano",
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

### Python SDK

```python
from aura import AuraClient

client = AuraClient(base_url="http://localhost:8080")

response = client.responses.create(
    model="gpt-5.4-nano",
    input="What is 2 + 2?"
)
print(response.output_text)  # "2 + 2 equals 4."
print(response.usage.cost_usd)  # 0.0000048
```

### Python SDK (Async)

```python
from aura import AsyncAuraClient

async with AsyncAuraClient() as client:
    response = await client.responses.create(
        model="gpt-5.4-nano",
        input="What is 2 + 2?"
    )
    print(response.output_text)
```

## Example Response

```json
{
  "id": "resp_oai_chatcmpl-abc123",
  "object": "response",
  "created_at": 1706140800,
  "model": "gpt-5.4-nano",
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
      "request_id": "aura_abc123-def456",
      "routing_strategy": "round_robin"
    }
  }
}
```

### Full Gateway Features Response

When using validation, consistency, and compression, the response metadata includes detailed information about each feature:

```json
{
  "id": "resp_oai_d46d074d-4991-4637-9fec-9026c6c9c211",
  "object": "response",
  "created_at": 1770148188,
  "model": "gpt-5.2",
  "status": "completed",
  "output": [
    {
      "type": "message",
      "id": "msg_0",
      "role": "assistant",
      "content": [
        {
          "type": "text",
          "text": "Here are the parsed results..."
        }
      ],
      "status": "completed"
    }
  ],
  "usage": {
    "input_tokens": 264,
    "output_tokens": 1563,
    "total_tokens": 1827,
    "cost_usd": 0.03258
  },
  "metadata": {
    "aura": {
      "provider": "openai",
      "model": "gpt-5.2",
      "gateway_version": "0.2.8",
      "latency_ms": 3208,
      "request_id": "aura_1a7aa7ef-5203-48bd-b6ca-6a36f1aeaccb",
      "routing_strategy": "round_robin",
      "agentic": {
        "has_tool_calls": false,
        "output_items_count": 1
      },
      "validation": {
        "strategy": "logprobs",
        "n": 3,
        "min_confidence": 0.7,
        "selection": "highestconfidence",
        "include_logprobs": true
      },
      "consistency": {
        "strategy": "modelcalibration",
        "apply_calibration": true
      },
      "compression_enabled": true,
      "compression_config": {
        "data_format": "toon",
        "semantic_format": "natural",
        "auto_select": false
      },
      "compression": {
        "original_tokens": 95,
        "compressed_tokens": 35,
        "ratio": 0.368,
        "savings_percent": 63.2,
        "strategies": ["toon"],
        "latency_ms": 12
      },
      "tenant": {
        "api_key_id": "aura_live_xxxxx"
      }
    }
  }
}
```

### Metadata Fields

| Field | Description |
|-------|-------------|
| `provider` | Backend provider used (openai, anthropic, google) |
| `model` | Actual model used for the request |
| `gateway_version` | Aura gateway version |
| `latency_ms` | Total request latency in milliseconds |
| `request_id` | Unique request ID for tracing |
| `routing_strategy` | Load balancing strategy used |
| `validation` | Validation configuration applied |
| `consistency` | Consistency configuration applied |
| `compression_enabled` | Whether compression was enabled |
| `compression_config` | Compression configuration used |
| `compression` | Actual compression results (tokens saved, strategies used) |
| `tenant` | Tenant information (API key ID) |

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
    "model": "gpt-5.4-mini",
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
    "model": "gpt-5.4-mini",
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
