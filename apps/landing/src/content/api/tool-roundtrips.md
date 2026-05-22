---
title: "Tool Roundtrips"
description: "How Aura reconstructs prior assistant tool calls so multi-turn tool flows work across every provider"
---

# Tool Roundtrips

When the model emits a function call, your application runs the tool, and then sends the result back on the next request, the **upstream provider needs to see the assistant's prior tool call** to accept the new tool result.

Aura handles this reconstruction automatically. You only need to send the `function_call_output` and the `previous_response_id` — Aura looks up the prior response and injects the assistant context so the provider sees the expected `assistant → tool` pairing.

## The problem this solves

Each upstream provider rejects tool results that arrive without a matching prior tool call:

| Provider | Error if context is missing |
|---|---|
| OpenAI / Mistral / Ollama / HuggingFace / Together | `messages with role 'tool' must be a response to a preceeding message with 'tool_calls'` |
| Anthropic / Bedrock (Claude) | `unexpected tool_use_id found in tool_result blocks: <id>. Each tool_result block must have a corresponding tool_use block in the previous message.` |
| Google Gemini | `functionResponse part requires a preceding functionCall part` |

Naive clients hit this on every second roundtrip. Aura is built around the Open Responses API's `previous_response_id` field — when you set it, the gateway has the context it needs to fix this for you.

## How to use it

### Roundtrip 1 — initial request

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Authorization: Bearer $AURA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4-mini",
    "input": [
      { "type": "message", "role": "user", "content": "What is the weather in Paris and Tokyo?" }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Returns current temperature for a city",
          "parameters": {
            "type": "object",
            "properties": { "city": { "type": "string" } },
            "required": ["city"]
          }
        }
      }
    ]
  }'
```

The response will carry one or more `function_call` items in `output`:

```json
{
  "id": "resp_abc123",
  "output": [
    {
      "type": "function_call",
      "call_id": "call_paris",
      "name": "get_weather",
      "arguments": "{\"city\":\"Paris\"}"
    },
    {
      "type": "function_call",
      "call_id": "call_tokyo",
      "name": "get_weather",
      "arguments": "{\"city\":\"Tokyo\"}"
    }
  ]
}
```

### Roundtrip 2 — return tool results with `previous_response_id`

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Authorization: Bearer $AURA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4-mini",
    "previous_response_id": "resp_abc123",
    "input": [
      { "type": "function_call_output", "call_id": "call_paris", "output": "{\"temp\":15}" },
      { "type": "function_call_output", "call_id": "call_tokyo", "output": "{\"temp\":22}" }
    ]
  }'
```

**You don't include the assistant's tool calls.** Aura looks up `resp_abc123`, finds the `function_call` items in its stored `output_items`, and prepends them as synthesized context before forwarding to the provider. The upstream sees the correct pairing.

## What the gateway does on your behalf

1. Detects the trigger: `previous_response_id` is set AND the current `input` has at least one `function_call_output`.
2. Queries the stored `responses` table for the prior response's `output_items`.
3. Extracts every `function_call` from that array and synthesizes one `InputItem::FunctionCall` per call.
4. **Batches consecutive function calls into one upstream assistant message** — required by every provider. Two parallel `get_weather` calls land as one assistant turn with two tool calls, not two assistant turns.
5. Forwards the reconstructed conversation to the provider, which now sees the expected shape.

## Per-provider behaviour

Aura maps the synthesized `FunctionCall` items into each provider's native shape:

| Provider | What Aura emits |
|---|---|
| OpenAI / Mistral / Ollama / HuggingFace / Together | One `assistant` message with `tool_calls: [{id, type, function: {name, arguments}}, ...]` |
| Anthropic / Bedrock (Claude) | One `assistant` message with `content: [{type: "tool_use", id, name, input}, ...]` |
| Google Gemini | One `model` content block with `parts: [{functionCall: {name, args}}, ...]` |

## When it does NOT replay

Aura skips reconstruction when any of the following hold — the request proceeds as-is:

- `previous_response_id` is not set
- Current `input` has no `function_call_output` items (plain chat continuation doesn't need synthesized context)
- The prior response can't be found in the database
- `AURA_REPLAY_TOOL_CONTEXT=false` is set on the gateway (operator escape hatch)

If reconstruction is skipped and the provider needs the missing context, the provider will return its native error — same behavior as before this feature existed.

## Configuration

Reconstruction is enabled by default. To disable it (for example, while diagnosing a tool-flow regression):

```bash
export AURA_REPLAY_TOOL_CONTEXT=false
```

Accepted truthy values: unset, `1`, `true`, `yes`, `on` (case-insensitive). Falsy: `0`, `false`, `no`, `off`.

## Performance

One indexed primary-key lookup against the `responses` table per tool-roundtrip request — typically under 5ms on a warm pool. Non-tool requests skip the lookup entirely; this feature adds zero latency to plain chat continuations.

## Notes for SDK authors

- The `InputItem` enum in `aura-types` carries a `FunctionCall` variant for completeness. Clients **should not** populate it directly — synthesize-from-prior-response is the supported path. Sending `FunctionCall` items from the client works (the per-provider adapters handle them) but is non-standard and may interact unexpectedly with the replay logic.
- Tool calls are paired by `call_id` for OpenAI-style providers and Anthropic, and by `name + position` for Gemini. Use `call_id` exactly as it appeared in the prior response.

## See also

- [Smart Routing](/docs/api/routing) — picking which provider handles each tool call
- [Conversations](/docs/api/conversations) — `previous_response_id` threading for non-tool flows
- [Create Response](/docs/api/create-response) — full request schema
