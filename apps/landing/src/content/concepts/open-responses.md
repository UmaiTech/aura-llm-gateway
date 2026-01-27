---
title: "Open Responses API"
description: "Understanding the Open Responses API specification"
---

# Open Responses API

The Open Responses API is a specification for agentic LLM workflows. Aura implements this specification to provide a unified interface for building AI agents.

Learn more at [openresponses.org](https://www.openresponses.org/specification)

## Core Concepts

### Items

Items are atomic units of conversation:

- **message** - User or assistant messages
- **function_call** - Tool invocations by the model
- **function_call_output** - Results from tool executions
- **reasoning** - Model's internal reasoning (when available)

### Response Lifecycle

Responses go through a status lifecycle:

```text
in_progress → completed | failed | incomplete
```

| Status | Description |
|--------|-------------|
| `in_progress` | Response is being generated |
| `completed` | Generation finished successfully |
| `failed` | Generation failed (check `error` field) |
| `incomplete` | Generation stopped early (check `incomplete_reason`) |

### Streaming Events

Aura provides semantic streaming events (not raw token deltas):

| Event | Description |
|-------|-------------|
| `response.in_progress` | Response started |
| `response.output_item.added` | New item in output |
| `response.output_text.delta` | Text chunk |
| `response.function_call_arguments.delta` | Function arguments chunk |
| `response.completed` | Response finished |
| `response.failed` | Error occurred |

## Request Structure

### Basic Request

```json
{
  "model": "gpt-4.5",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "Hello!"
    }
  ]
}
```

### With System Instructions

```json
{
  "model": "gpt-4.5",
  "instructions": "You are a helpful assistant.",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "Hello!"
    }
  ]
}
```

### With Tools

```json
{
  "model": "gpt-4.5",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "What is the weather?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "name": "get_weather",
      "description": "Get current weather",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {"type": "string"}
        },
        "required": ["location"]
      }
    }
  ]
}
```

## Response Structure

```json
{
  "id": "resp_abc123",
  "object": "response",
  "created_at": 1706140800,
  "model": "gpt-4.5",
  "status": "completed",
  "output": [
    {
      "type": "message",
      "id": "msg_xyz",
      "role": "assistant",
      "content": [
        {
          "type": "text",
          "text": "Hello! How can I help you?"
        }
      ]
    }
  ],
  "usage": {
    "input_tokens": 10,
    "output_tokens": 8,
    "total_tokens": 18,
    "cost_usd": 0.000045
  }
}
```

## Conversation Threading

Use `previous_response_id` to continue conversations:

```json
{
  "model": "gpt-4.5",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "Continue..."
    }
  ],
  "previous_response_id": "resp_abc123"
}
```

This automatically includes the full conversation history from the previous response.

## Agentic Workflows

The Open Responses API is designed for agentic workflows where the model can:

1. **Call tools** - Invoke functions to gather information
2. **Reason** - Show internal thought process (for reasoning models)
3. **Multi-turn** - Continue conversations across multiple requests

### Agent Loop Example

```javascript
async function runAgent(userMessage) {
  let response = await createResponse({
    model: 'gpt-4.5',
    input: [{type: 'message', role: 'user', content: userMessage}],
    tools: AVAILABLE_TOOLS
  });

  // Agent loop: execute tools until no more tool calls
  while (hasToolCalls(response)) {
    const toolResults = await executeTools(response.output);

    response = await createResponse({
      model: 'gpt-4.5',
      input: toolResults,
      previous_response_id: response.id
    });
  }

  return response;
}
```

### Reasoning Models

For models with extended reasoning (o1, o3, Claude Opus):

```json
{
  "model": "o3-mini",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "Solve this logic puzzle..."
    }
  ]
}
```

Response includes reasoning items:

```json
{
  "output": [
    {
      "type": "reasoning",
      "reasoning": "Let me think through this step by step..."
    },
    {
      "type": "message",
      "role": "assistant",
      "content": [{"type": "text", "text": "The answer is..."}]
    }
  ],
  "usage": {
    "reasoning_tokens": 1500,
    "input_tokens": 100,
    "output_tokens": 50
  }
}
```

## Streaming

Enable streaming for real-time responses:

```javascript
const response = await fetch('/v1/responses', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    model: 'gpt-4.5',
    input: [{type: 'message', role: 'user', content: 'Tell me a story'}],
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const {done, value} = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));

      if (event.type === 'response.output_text.delta') {
        process.stdout.write(event.delta);
      }
    }
  }
}
```

## Error Handling

Errors follow a consistent format:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "The model parameter is required",
    "param": "model"
  }
}
```

Common error codes:
- `invalid_request` - Malformed request or missing parameters
- `authentication_error` - Invalid or missing API key
- `model_not_found` - Requested model not available
- `rate_limit_exceeded` - Too many requests
- `server_error` - Internal server error
- `service_unavailable` - Provider temporarily unavailable

## Differences from OpenAI API

The Open Responses API differs from OpenAI's Chat Completions API:

| Feature | OpenAI Chat API | Open Responses API |
|---------|----------------|-------------------|
| **Request format** | `messages` array | `input` items array |
| **System prompt** | Message with `role: system` | `instructions` field |
| **Streaming events** | Token deltas (`chunk.choices[0].delta`) | Semantic events (`response.output_text.delta`) |
| **Conversation state** | Client-managed messages array | `previous_response_id` |
| **Tool results** | `tool` role messages | `function_call_output` items |
| **Response ID** | `id: chatcmpl-...` | `id: resp_...` |

## Why Open Responses API?

1. **Provider-agnostic** - Works across OpenAI, Anthropic, Google with the same format
2. **Agentic-first** - Designed for multi-turn tool-using agents
3. **Semantic streaming** - Higher-level events instead of raw tokens
4. **Stateful** - Server can track conversation history
5. **Extensible** - Easy to add new item types and metadata

## Specification

The full specification is maintained at [openresponses.org](https://www.openresponses.org/specification).

Aura implements v1.0 of the specification with extensions for:
- Cost tracking (`usage.cost_usd`)
- Provider metadata (`metadata.aura`)
- Agentic workflow insights (`metadata.aura.agentic`)
