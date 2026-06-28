# Aura LLM Gateway — TypeScript SDK

[![npm](https://img.shields.io/npm/v/aura-llm.svg)](https://www.npmjs.com/package/aura-llm)

TypeScript/JavaScript SDK for the [Aura LLM Gateway](https://aura-llm.dev) and
its Open Responses API. Universal (Node 20+, browsers, Deno, Bun, Vercel Edge,
Cloudflare Workers) — built on the global `fetch` and Web Streams, with no
Node-only dependencies. Streaming is exposed as an `AsyncIterable`, and errors
are a typed hierarchy you can `instanceof`.

This mirrors the [Python SDK](../python/) feature set. There is **one** client
(JS is async by default) — every call returns a `Promise`, and streaming
returns an `AsyncIterable`.

## Installation

```bash
npm install aura-llm
# or: pnpm add aura-llm / yarn add aura-llm / bun add aura-llm
```

## Quick start

```ts
import { AuraClient, outputText } from 'aura-llm'

const client = new AuraClient({
  apiKey: process.env.AURA_API_KEY, // or set AURA_API_KEY in the environment
  baseUrl: 'http://localhost:8080', // or AURA_BASE_URL (default localhost:8080)
})

const response = await client.responses.create({
  model: 'gpt-5.4-mini',
  input: 'What is the capital of France?',
})

console.log(outputText(response))
// → The capital of France is Paris.
```

## Streaming

`create({ stream: true })` returns an `AsyncIterable<StreamEvent>` with full
back-pressure — you only pull events as fast as you consume them.

```ts
const stream = await client.responses.create({
  model: 'gpt-5.4-mini',
  input: 'Tell me a story',
  stream: true,
})

for await (const event of stream) {
  if (event.type === 'response.output_text.delta') {
    process.stdout.write(event.delta)
  }
}
```

> Streaming requests are **not** retried — re-issuing a partial stream would
> replay events. Errors before the first byte still surface as typed errors.

## Conversation threading

Use `previous_response_id` (the canonical Open Responses mechanism):

```ts
const r1 = await client.responses.create({ model: 'gpt-5.4-mini', input: 'My name is Alice.' })
const r2 = await client.responses.create({
  model: 'gpt-5.4-mini',
  input: 'What is my name?',
  previous_response_id: r1.id,
})
console.log(outputText(r2)) // → Your name is Alice.
```

## Tools

```ts
import { functionTool, toolCalls } from 'aura-llm'

const response = await client.responses.create({
  model: 'gpt-5.4-mini',
  input: "What's the weather in Tokyo?",
  tools: [
    functionTool('get_weather', 'Get current weather', {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    }),
  ],
})

for (const call of toolCalls(response)) {
  console.log(call.name, call.arguments)
}
```

## Multi-tenancy & config blocks

```ts
await client.responses.create({
  model: 'gpt-5.4-mini',
  input: 'Hello',
  user: 'customer_42', // end-user cost tracking
  compression: { strategy: 'toon', auto_select: true },
  validation: { strategy: 'best_of_n', n: 3, min_confidence: 0.85 },
  consistency: { style_profile: 'concise' },
})
```

## Configuration

| Option | Default | Description |
|---|---|---|
| `apiKey` | `AURA_API_KEY` env | Bearer token |
| `baseUrl` | `AURA_BASE_URL` env / `http://localhost:8080` | Gateway URL |
| `timeout` | `60000` | Per-request timeout (ms); guards time-to-first-byte for streams |
| `maxRetries` | `2` | Retries for 408/429/5xx + network errors; `0` disables |
| `headers` | — | Extra headers merged into every request |
| `fetch` | global `fetch` | Custom fetch (edge runtimes / tests) |
| `onRequest` / `onResponse` / `onError` | — | Lifecycle hooks |

## Response helpers

Interfaces can't carry methods, so the Python `@property` accessors are
functions here:

```ts
import { outputText, toolCalls, hasToolCalls, isComplete, isFailed } from 'aura-llm'

outputText(response)   // assistant text ('' if none)
toolCalls(response)    // FunctionCallItem[]
hasToolCalls(response) // boolean
isComplete(response)   // status === 'completed'
isFailed(response)     // status === 'failed'
```

## Error handling

```ts
import { AuraError, RateLimitError, AuthenticationError } from 'aura-llm'

try {
  await client.responses.create({ model: 'gpt-5.4-mini', input: 'Hi' })
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`Retry after ${err.retryAfter}s`)
  } else if (err instanceof AuthenticationError) {
    console.log('Check your API key')
  } else if (err instanceof AuraError) {
    console.log(err.status, err.code, err.message, err.requestId)
  }
}
```

Hierarchy: `AuraError` → `APIError` → `AuthenticationError` (401) /
`BadRequestError` (400) / `NotFoundError` (404) / `RateLimitError` (429); plus
`APIConnectionError` (network) and `APITimeoutError` (timeout).

## Retry policy

- Retries on: 408, 429, 500, 502, 503, 504, and network errors.
- Never retries other 4xx, or streaming requests.
- Exponential backoff with jitter, capped at 30s; honors `Retry-After`.

## Edge runtimes

No Node-only APIs — works on Vercel Edge, Cloudflare Workers, Deno, and Bun
out of the box. Inject a custom `fetch` if your runtime needs it:

```ts
const client = new AuraClient({ apiKey, fetch: myFetch })
```

## Environment variables

| Variable | Purpose |
|---|---|
| `AURA_API_KEY` | API key (used if `apiKey` not passed) |
| `AURA_BASE_URL` | Gateway base URL (used if `baseUrl` not passed) |

## Development

```bash
npm install
npm run build         # tsup → ESM + CJS + .d.ts
npm test              # vitest
npm run test:coverage
npm run typecheck
```

## Compatibility

Versioned independently from the gateway. This SDK targets the Open Responses
API as served by aura-proxy ≥ v0.13.

## License

MIT
