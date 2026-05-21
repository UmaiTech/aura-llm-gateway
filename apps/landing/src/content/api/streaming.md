---
title: "Streaming Responses"
description: "Real-time streaming with Server-Sent Events"
---

# Streaming Responses

Aura supports Server-Sent Events (SSE) for streaming responses, allowing you to receive tokens as they're generated.

## Enable Streaming

Set `stream: true` in your request:

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.5-mini",
    "input": [
      {"type": "message", "role": "user", "content": "Tell me a story"}
    ],
    "stream": true
  }'
```

## Event Format

Streaming responses use the SSE format:

```text
event: response.in_progress
data: {"type":"response.in_progress","response":{...}}

event: response.output_item.added
data: {"type":"response.output_item.added","item":{...}}

event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"Once"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":" upon"}

event: response.completed
data: {"type":"response.completed","response":{...}}
```

## Event Types

### response.in_progress
Sent when the response starts. Contains the initial response object.

```json
{
  "type": "response.in_progress",
  "response": {
    "id": "resp_abc",
    "status": "in_progress",
    "output": []
  }
}
```

### response.output_item.added
Sent when a new output item is added (message or function call).

```json
{
  "type": "response.output_item.added",
  "output_index": 0,
  "item": {
    "type": "message",
    "id": "msg_xyz",
    "role": "assistant",
    "content": []
  }
}
```

### response.output_text.delta
Sent for each text chunk. This is the most frequent event during generation.

```json
{
  "type": "response.output_text.delta",
  "output_index": 0,
  "content_index": 0,
  "delta": "Hello"
}
```

### response.function_call_arguments.delta
Sent when streaming function call arguments.

```json
{
  "type": "response.function_call_arguments.delta",
  "output_index": 0,
  "delta": "{\"location\":"
}
```

### response.completed
Final event with the complete response, including usage and Aura metadata.

```json
{
  "type": "response.completed",
  "response": {
    "id": "resp_abc",
    "status": "completed",
    "output": [...],
    "usage": {
      "input_tokens": 25,
      "output_tokens": 100,
      "cost_usd": 0.00045
    },
    "metadata": {
      "aura": {
        "provider": "openai",
        "gateway_version": "0.1.7"
      }
    }
  }
}
```

### response.failed
Sent if the response fails.

```json
{
  "type": "response.failed",
  "response": {
    "status": "failed",
    "error": {
      "code": "server_error",
      "message": "Provider returned an error"
    }
  }
}
```

## JavaScript Example

```javascript
const response = await fetch('https://api.aura-llm.dev/v1/responses', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4.5-mini',
    input: [{ type: 'message', role: 'user', content: 'Hello!' }],
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      const event = JSON.parse(data);

      if (event.type === 'response.output_text.delta') {
        process.stdout.write(event.delta);
      } else if (event.type === 'response.completed') {
        console.log('\n\nUsage:', event.response.usage);
      }
    }
  }
}
```

## Python Example

```python
import requests
import json

response = requests.post(
    'https://api.aura-llm.dev/v1/responses',
    json={
        'model': 'gpt-4.5-mini',
        'input': [{'type': 'message', 'role': 'user', 'content': 'Hello!'}],
        'stream': True
    },
    stream=True
)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            data = line[6:]
            if data == '[DONE]':
                continue

            event = json.loads(data)

            if event['type'] == 'response.output_text.delta':
                print(event['delta'], end='', flush=True)
            elif event['type'] == 'response.completed':
                print(f"\n\nUsage: {event['response']['usage']}")
```

## Keep-Alive

Streaming connections include periodic keep-alive comments to prevent timeouts:

```text
: keep-alive
```

The default interval is 15 seconds.
