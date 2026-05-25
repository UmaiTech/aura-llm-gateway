# Aura LLM Gateway

## Project Overview

Rust-based LLM proxy implementing the Open Responses API specification for agentic workflows. Provides a unified interface to multiple LLM providers (OpenAI, Anthropic, Google) with load balancing, cost tracking, and observability.

## Tech Stack

- **Language**: Rust (2021 edition)
- **Web Framework**: Axum
- **Database**: PostgreSQL (SQLx), Redis
- **Async Runtime**: Tokio
- **Serialization**: Serde
- **Error Handling**: thiserror, anyhow
- **Logging**: tracing
- **HTTP Client**: reqwest

## Project Structure

```
/crates/
  aura-types/     # Shared type definitions (Open Responses API types)
    src/
      compression.rs   # Compression config types
      consistency.rs   # Response consistency types
      validation.rs    # Response validation types
  aura-core/      # Core business logic (providers, routing, caching)
    src/
      compression/     # Prompt compression (TOON, YAML, AISP, JSON)
      provider/        # LLM providers (OpenAI, Anthropic, Google)
      router/          # Smart routing with health tracking
  aura-proxy/     # Main server binary (Axum routes, middleware)
  aura-db/        # Database models and queries (SQLx)
/apps/
  chat/           # React chat playground (Vite + React 18)
  landing/        # Marketing landing page (Vite + React, MDX docs)
/docs/            # Documentation
  api/            # API documentation (Markdown)
/migrations/      # SQLx database migrations
/sdks/
  python/         # Python SDK (aura-llm on PyPI)
```

## Development Commands

```bash
# Build
cargo build                    # Build all crates
cargo build --release          # Build optimized binary

# Test
cargo test                     # Run all tests
cargo test -p aura-core        # Test specific crate
cargo test -- --nocapture      # Show println output

# Run
cargo run -p aura-proxy        # Run the proxy server
RUST_LOG=debug cargo run -p aura-proxy  # With debug logging

# Lint & Format
cargo clippy                   # Lint all crates
cargo clippy --fix             # Auto-fix lint issues
cargo fmt                      # Format code
cargo fmt -- --check           # Check formatting

# Database (requires sqlx-cli)
sqlx migrate run               # Run migrations
sqlx migrate add <name>        # Create new migration

# Docker
docker-compose up -d           # Start local stack
docker-compose logs -f         # Follow logs

# Frontend Apps
cd apps/chat && npm run dev    # Run chat playground (port 3000)
cd apps/landing && npm run dev # Run landing page (port 3001)
cd apps/chat && npm run build  # Build chat app for production
```

## Key Conventions

### Error Handling
- Use `thiserror` for library error types in `aura-types` and `aura-core`
- Use `anyhow` for application errors in `aura-proxy`
- Always provide context with `.context()` or custom error variants
- Never use `.unwrap()` in production code (use `.expect()` with clear message if truly infallible)

### Logging
- Use `tracing` macros (`info!`, `debug!`, `error!`, `warn!`)
- Never use `println!` or `eprintln!`
- Add structured fields: `info!(provider = %name, latency_ms = %ms, "request completed")`
- Use spans for request correlation

### Async Patterns
- All async functions should be cancellation-safe
- Use `tokio::select!` carefully with proper branch handling
- Prefer `tokio::spawn` for background tasks over blocking
- Always set timeouts on external calls

### Shared State
- Use `Arc<T>` for state shared across handlers
- Use `Arc<RwLock<T>>` only when mutation is required
- Prefer message passing over shared mutable state

### Provider Pattern
```rust
#[async_trait]
pub trait Provider: Send + Sync {
    fn name(&self) -> &str;
    fn models(&self) -> &[&str];
    async fn complete(&self, request: Request) -> Result<Response, ProviderError>;
    async fn complete_stream(&self, request: Request) -> Result<EventStream, ProviderError>;
}
```

### Testing
- Unit tests in same file as implementation (`#[cfg(test)] mod tests`)
- Integration tests in `/tests/` directory
- Use `#[tokio::test]` for async tests
- Mock external APIs with `wiremock`
- Use `insta` for snapshot testing of JSON responses

### Compression Module
The compression system reduces token usage with multiple strategies:
- **JSON Minification** (15-30% savings): Whitespace removal, key shortening
- **TOON** (40-60% savings): Token-Oriented Object Notation for uniform arrays
- **YAML** (10-25% savings): Fewer delimiters for nested objects
- **AISP** (clarity boost): AI Symbolic Protocol for mathematical notation

```rust
use aura_core::compression::{SmartCompressor, Compressor};

let compressor = SmartCompressor::builder()
    .auto_select(true)
    .build();
let result = compressor.compress(input)?;
```

### Validation Module
Response validation reduces hallucinations:
- `logprobs`: Token-level confidence (OpenAI only)
- `best_of_n`: Generate N responses, select best
- `self_consistency`: Pick most consistent answer
- `confidence_threshold`: Reject below threshold

### Feedback API
Adaptive few-shot learning from user feedback:
- `POST /v1/feedback`: Submit thumbs up/down with optional text
- `GET /v1/feedback`: List feedback samples for few-shot injection
- Positive feedback automatically sampled for context

### Consistency Module
Cross-model response normalization:
- Style profiles for consistent tone/format
- Constitutional AI principles
- Model calibration for alignment

## Open Responses API

The Open Responses API is a specification for agentic LLM workflows.

### Core Concepts

- **Items**: Atomic units of conversation (message, function_call, function_call_output, reasoning)
- **Response**: Container for items with status lifecycle
- **Status**: `in_progress` -> `completed` | `failed` | `incomplete`
- **Streaming**: Semantic events (not raw token deltas)

### Key Stream Events

```
response.in_progress        # Response started
response.output_item.added  # New item in output
response.output_text.delta  # Text chunk for streaming
response.completed          # Response finished successfully
response.failed             # Response failed with error
```

### Conversation Threading

Use `previous_response_id` to continue conversations:

```json
{
  "model": "gpt-4",
  "input": [{"type": "message", "role": "user", "content": "Hello"}],
  "previous_response_id": "resp_abc123"
}
```

### Specification

Full spec: https://www.openresponses.org/specification

## Environment Variables

### Gateway (Rust Server)

```bash
# Required
AURA_HOST=0.0.0.0
AURA_PORT=8080

# Provider API Keys (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# Database (required for persistence features)
DATABASE_URL=postgres://user:pass@localhost/aura

# Redis (required for rate limiting, caching)
REDIS_URL=redis://localhost:6379

# Optional
RUST_LOG=info,aura_proxy=debug
AURA_ADMIN_KEY=admin-secret-key
```

### Chat App (React/Vite)

Create `apps/chat/.env`:

```bash
# Aura Gateway URL (defaults to localhost:8080)
VITE_API_BASE_URL=http://localhost:8080

# Tavily API key for web search tool (optional)
VITE_TAVILY_API_KEY=tvly-xxxxxxxxxxxxx
```

**Note**: Restart the Vite dev server after changing `.env` files for changes to take effect.

## Common Tasks

### Adding a New Provider

1. Create `crates/aura-core/src/provider/<name>.rs`
2. Implement the `Provider` trait
3. Add request/response transformation logic
4. Register in `ProviderRegistry`
5. Add integration tests

### Adding a New Endpoint

1. Create handler in `crates/aura-proxy/src/routes/`
2. Add route to router in `main.rs`
3. Add OpenAPI annotations with `utoipa`
4. Write integration tests

### Database Changes

1. Run `sqlx migrate add <description>`
2. Write SQL in generated migration file
3. Update models in `aura-db`
4. Run `sqlx migrate run`

### Updating the Public Roadmap

The public roadmap at `aura-llm.dev/roadmap` is the source of truth for what the project has shipped and what's coming. It's read by users, prospects, and contributors evaluating the project — keeping it stale undermines trust.

**Rule**: any user-facing change (new feature, new provider, new endpoint, breaking change, deprecations) that ships to production MUST be reflected on the roadmap in the same PR that ships it. Internal refactors, dependency bumps, CI tweaks, and bugfixes that don't change observable behavior do not need a roadmap entry.

**File**: `apps/landing/src/pages/RoadmapPage.tsx`. The `releases` array is a chronological list of `Release` objects.

**When you ship a new feature on an existing in-progress version** (e.g. v0.11 is `phase: 'active'` and you just merged a new provider into it):

1. Find the active release in the `releases` array.
2. Add a `ReleaseItem` to its `items` list with a 1-line `label` and optional `note` for the detail.
3. Keep labels short (3-7 words). Notes are for the "what does this actually mean" disambiguation.

**When you cut a new minor version** (e.g. v0.11.0 → v0.12.0):

1. Promote the current active row to `phase: 'shipped'` and set `when` to the calendar date (`Mar 2026` format).
2. Add a new row above it with `phase: 'active'`, the new version string, a working title, and the first known items.
3. Update the file-level docstring comment (top of `RoadmapPage.tsx`) — the `Latest shipped` and `In progress` lines.

**When you write a new release note in `CHANGELOG.md`**: cross-reference the roadmap. Anything material in the changelog should also appear (in shorter form) in the roadmap. The changelog is the granular log; the roadmap is the editorial summary.

**Issue references**: if the work closes a GitHub issue worth highlighting, add it to the release's `issueRefs` array (e.g. `['#155', '#161']`). Don't enumerate every issue — pick the user-facing ones.

**Tone**: write for a smart non-engineer evaluating the project. "Tool roundtrip context replay" is right; "PR #164 implementation" is wrong. The roadmap is marketing surface as much as engineering record.

### Auto-generated CHANGELOG is incomplete — review it on every release PR

`release-plz` generates each release PR's `CHANGELOG.md` section by attributing commits to Rust crates based on file paths. Two consequences you have to work around manually:

1. **Frontend-only commits get dropped.** Anything that touches only `apps/admin/`, `apps/landing/`, `apps/chat/`, `sdks/`, `.github/`, `CLAUDE.md`, or any other non-`crates/` path is **not attributed to any crate** and never reaches the auto-generated entry. We hit this for v0.11.0–v0.13.0 where most work was frontend.

2. **Per-crate filtering even between Rust crates.** `release-plz.toml` has `changelog_include = ["aura-types", "aura-db", "aura-core"]` on `aura-proxy` so all Rust crates' commits aggregate into the workspace `CHANGELOG.md`. Don't remove that — the workspace will silently de-attribute again.

**Rule**: every release PR (`chore: release vX.Y.Z`) needs a manual changelog review before merge. If the section is short, look at the actual commits in the range with `git log vPREV..HEAD --oneline` and add bullets for the user-facing items the auto-generator missed. Match the existing tone (one line per change, link the PR).

### Vercel Serverless Functions (`/api/*.ts`)

The playground (`playground.aura-llm.dev`) is served by Vercel and uses serverless functions in `/api/`. These functions run under `@vercel/node@5` and **must be emitted as ESM**, because the auth stack (`better-auth@1.6+`) is ESM-only and any `require()` of it throws `ERR_REQUIRE_ESM` at module load.

ESM emit is held together by four settings that must move together. Changing one without the others produces a different failure each time — we burned four deploys learning this:

1. **`/package.json`** has `"type": "module"`. Without this, Node loads the emitted `.js` as CJS and `require()`s an ESM-only dep — `ERR_REQUIRE_ESM`.
2. **`/tsconfig.json`** has `"module": "ESNext"` + `"moduleResolution": "Bundler"`. Without this, `@vercel/node@5`'s TypeScript pass emits CJS (`exports.foo = ...`) even when `package.json` says `module` — runtime then throws `ReferenceError: exports is not defined in ES module scope`. Scoped via `"include": ["api/**/*.ts"]` so apps' own tsconfigs are untouched.
3. **Source files stay `.ts`** (NOT `.mts`). `@vercel/node@5` does map `.mts → .mjs` on emit, but the AWS Lambda Node runtime then rejects the handler name itself: `Runtime.MalformedHandlerName: 'api/auth/[...all].mts' is not a valid handler name`.
4. **Relative imports use explicit `.js` extensions**, even though source is `.ts`. Native ESM in Node refuses extensionless relative imports — `Cannot find module '/var/task/api/_lib/auth' imported from /var/task/api/auth/[...all].js`. `moduleResolution: Bundler` lets tsc still resolve to the `.ts` source at compile time.

#### Adding a new `/api` function

1. Create `api/<name>/<route>.ts`. Keep the `.ts` extension. Default-export an `async function handler(req: IncomingMessage, res: ServerResponse)`.
2. Use ESM syntax only: `import`/`export`. Never `require`, `module.exports`, `__dirname`, or `__filename`.
3. Any relative import between `/api` files **must** end in `.js`:
   ```ts
   import { auth } from '../_lib/auth.js'    // ✅
   import { auth } from '../_lib/auth'       // ❌ ERR_MODULE_NOT_FOUND at runtime
   ```
4. Bare module specifiers (`'better-auth/node'`, `'pg'`, `'node:http'`) don't need extensions.
5. New deps go in **root** `/package.json`, not an app's. Run `npm install <pkg>` from the repo root.
6. Test locally with `npx tsc --noEmit` from the repo root — picks up `/tsconfig.json` and catches import-shape mistakes before deploy.

### CORS Configuration

The gateway uses `tower-http` CORS middleware to allow cross-origin requests from frontend apps.

**Current configuration** (in `crates/aura-proxy/src/main.rs`):
```rust
use tower_http::cors::{Any, CorsLayer};

// In main() function:
.layer(
    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any),
)
```

**Development**: Allows all origins (suitable for local development with chat app on `localhost:3000`)

**Production**: Restrict to specific origins for security:
```rust
use tower_http::cors::CorsLayer;
use http::header::{AUTHORIZATION, CONTENT_TYPE};
use http::Method;

.layer(
    CorsLayer::new()
        .allow_origin("https://your-domain.com".parse::<HeaderValue>().unwrap())
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE]),
)
```

**Multiple origins**:
```rust
.allow_origin([
    "http://localhost:3000".parse::<HeaderValue>().unwrap(),
    "https://chat.yourdomain.com".parse::<HeaderValue>().unwrap(),
])
```

## Troubleshooting

### Vercel `/api/*` Function Failures

If `playground.aura-llm.dev/api/*` returns `FUNCTION_INVOCATION_FAILED`, match the error in Vercel's runtime logs against this table BEFORE patching — every one of these has a wrong "fix" that just surfaces the next error:

| Error | Root cause | Fix |
|---|---|---|
| `Error [ERR_REQUIRE_ESM]: require() of ES Module ... not supported` | Function emitted as CJS but importing an ESM-only dep (e.g. `better-auth/node`). | Confirm `/package.json` has `"type": "module"` AND `/tsconfig.json` has `"module": "ESNext"`. |
| `ReferenceError: exports is not defined in ES module scope` | CJS-style emit (`exports.foo = ...`) loaded as ESM. Means `tsconfig.json` is missing or has `"module": "CommonJS"`. | Set `/tsconfig.json` `compilerOptions.module` to `ESNext` (NOT `NodeNext` — see below). |
| `Runtime.MalformedHandlerName: '...mts' is not a valid handler name` | A `/api/*.mts` source file. AWS Lambda's Node runtime only accepts `.js`/`.mjs`/`.cjs` handler names — `@vercel/node@5` passes the `.mts` filename through verbatim. | Rename back to `.ts`. Force ESM via `tsconfig.json`, not via the file extension. |
| `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/api/_lib/<name>'` | An extensionless relative import (`from '../_lib/auth'`) — Node's native ESM loader refuses these. | Add `.js` to every relative import in `/api/*.ts`, even though source is `.ts`. |

See "Vercel Serverless Functions" under Common Tasks for the full four-setting ESM contract. Don't change just one of {`package.json type`, `tsconfig.json module`, source extension, import extensions} — they're a quartet.

### Git Repository Issues

#### "fatal: not a git repository" Error

**Symptom**: Running `git status` or other git commands fails with:
```
fatal: not a git repository (or any of the parent directories): .git
```

Even though the `.git/` directory exists.

**Cause**: The `.git/HEAD` file is missing or corrupted. This file is critical for git to recognize the repository and track the current branch.

**Fix**: Recreate the HEAD file pointing to your main branch:

```bash
# Recreate the HEAD file
echo "ref: refs/heads/main" > .git/HEAD

# Verify the fix worked
git status
```

If you were on a different branch, replace `main` with your branch name:
```bash
# For a different branch
echo "ref: refs/heads/your-branch-name" > .git/HEAD
```

**Prevention**: This issue can occur if git operations are interrupted or if file system issues corrupt the repository. Always ensure git operations complete cleanly.