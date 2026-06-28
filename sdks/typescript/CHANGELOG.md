# Changelog

All notable changes to the `aura-llm` TypeScript SDK are documented here.
This SDK is versioned independently from the gateway.

## [0.1.0] - 2026-06-28

Initial alpha release.

### Added
- `AuraClient` with a `responses.create()` resource (one-shot + streaming).
- Universal runtime support (Node 20+, browsers, Deno, Bun, Vercel Edge,
  Cloudflare Workers) via global `fetch` + Web Streams — no Node-only deps.
- `AsyncIterable<StreamEvent>` streaming with back-pressure and SSE parsing.
- Typed error hierarchy (`AuraError` → `APIError` → `AuthenticationError` /
  `BadRequestError` / `NotFoundError` / `RateLimitError`; plus
  `APIConnectionError`, `APITimeoutError`) with `instanceof` support.
- Exponential-backoff retry with jitter; honors `Retry-After`; configurable;
  off by default for streams.
- `onRequest` / `onResponse` / `onError` lifecycle hooks.
- Conversation threading via `previous_response_id`; tools via `functionTool`;
  multi-tenant `user`; `compression` / `validation` / `consistency` blocks.
- Response helpers: `outputText`, `toolCalls`, `hasToolCalls`, `isComplete`,
  `isFailed`.
- ESM + CJS builds with generated `.d.ts` (tsup).
