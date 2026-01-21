# Aura LLM Gateway - Implementation Plan

A PR-by-PR roadmap for building the Aura LLM Gateway, designed for incremental Rust learning.

## Overview

### Phase 1: MVP (Sellable Product)

| Milestone | PRs | Outcome |
|-----------|-----|---------|
| **M1: Foundation** | PR 1-4 | Project structure, types, config, basic server |
| **M2: Single Provider Proxy** | PR 5-8 | Working OpenAI proxy with streaming |
| **M3: Multi-Provider MVP** | PR 9-13 | Claude + Gemini, load balancing, basic auth |
| **M4: Persistence & Observability** | PR 14-18 | PostgreSQL, request logging, metrics |
| **M5: Production Readiness** | PR 19-23 | Rate limiting, caching, Docker, health checks |
| **M6: Dashboard & Polish** | PR 24-28 | Admin API, basic dashboard, documentation |

### Phase 2: Developer Experience

| Milestone | PRs | Outcome |
|-----------|-----|---------|
| **M7: Chat Demo App** | PR 29-33 | ChatGPT-like demo UI for testing |
| **M8: SDKs** | PR 34-39 | Python and TypeScript client libraries |
| **M9: API Docs Website** | PR 40-43 | Beautiful, interactive API documentation |

### Phase 3: Advanced Features

| Milestone | PRs | Outcome |
|-----------|-----|---------|
| **M10: Smart Routing** | PR 44-48 | Intent-based and region-based routing |
| **M11: Semantic Caching** | PR 49-52 | Vector DB for similar query caching |
| **M12: User & Team Management** | PR 53-57 | Full RBAC, organizations, quotas |
| **M13: Additional Providers** | PR 58-62 | HuggingFace, Mistral, Cohere, local models |
| **M14: Advanced Features** | PR 63-68 | A/B testing, prompt templates, fine-tuning

---

## Milestone 1: Foundation

### PR #1: Project Scaffolding
**Rust Concepts:** Cargo workspaces, crate organization, module system

Create the Cargo workspace structure:

```
aura-llm-gateway/
├── Cargo.toml              # Workspace root
├── crates/
│   ├── aura-types/         # Shared type definitions
│   │   ├── Cargo.toml
│   │   └── src/lib.rs
│   ├── aura-core/          # Core business logic
│   │   ├── Cargo.toml
│   │   └── src/lib.rs
│   ├── aura-proxy/         # Main server binary
│   │   ├── Cargo.toml
│   │   └── src/main.rs
│   └── aura-db/            # Database models and queries
│       ├── Cargo.toml
│       └── src/lib.rs
└── .cargo/config.toml      # Cargo configuration
```

**Status:** ✅ **COMPLETED**

**Tasks:**
- [x] Initialize workspace `Cargo.toml` with members
- [x] Create each crate with minimal `lib.rs`/`main.rs`
- [x] Set up shared dependencies (tokio, serde, tracing)
- [x] Configure `rust-analyzer` settings
- [x] Add `.cargo/config.toml` for build optimizations

**Acceptance Criteria:**
- ✅ `cargo build` succeeds for all crates
- ✅ `cargo test` runs (3 tests pass)
- ✅ `cargo clippy` has no warnings
- ✅ `cargo fmt --check` passes
- ✅ `aura-proxy` binary runs and prints version

**Implementation Notes:**
- Created Cargo workspace with resolver = "2"
- Set up 4 crates: `aura-types`, `aura-db`, `aura-core`, `aura-proxy`
- Configured workspace dependencies for version inheritance
- Added build optimizations in `.cargo/config.toml` (LTO, codegen-units=1)
- Each library crate includes a simple `version()` function with unit test
- Binary crate prints versions of all workspace crates
- Created `migrations/` directory for future SQLx migrations

---

### PR #2: Configuration System
**Rust Concepts:** Environment variables, `Arc<T>` for shared state, builder pattern

**Tasks:**
- [ ] Add `config` and `dotenvy` dependencies to `aura-core`
- [ ] Create `Config` struct with environment-based loading
- [ ] Implement `Default` trait for development defaults
- [ ] Create `AppState` struct with `Arc<Config>`
- [ ] Add configuration validation

**Files:**
- `crates/aura-core/src/config.rs`
- `crates/aura-core/src/state.rs`

**Key Code:**
```rust
#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub openai_api_key: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub google_api_key: Option<String>,
    pub log_level: String,
}

pub struct AppState {
    pub config: Arc<Config>,
}
```

**Acceptance Criteria:**
- Config loads from environment variables
- Missing required vars return clear error messages

---

### PR #3: Open Responses API Types
**Rust Concepts:** Enums, structs, `serde` derive macros, `Option<T>`, `Result<T, E>`

Define the core Open Responses API types in `aura-types`.

**Tasks:**
- [ ] Define `Item` enum (message, function_call, function_call_output, reasoning)
- [ ] Define `ItemStatus` enum (in_progress, completed, failed, incomplete)
- [ ] Define `Response` struct with status lifecycle
- [ ] Define `StreamEvent` enum for SSE events
- [ ] Add serde serialization with `#[serde(rename_all = "snake_case")]`
- [ ] Write unit tests for JSON serialization

**Files:**
- `crates/aura-types/src/item.rs`
- `crates/aura-types/src/response.rs`
- `crates/aura-types/src/stream.rs`
- `crates/aura-types/src/lib.rs` (re-exports)

**Acceptance Criteria:**
- Types serialize to match Open Responses API spec
- All enums handle unknown variants gracefully

---

### PR #4: Basic Axum Server
**Rust Concepts:** Async handlers, `Router`, `State` extractor, middleware basics

**Tasks:**
- [ ] Add Axum and Tower dependencies to `aura-proxy`
- [ ] Create basic router with health check endpoint
- [ ] Inject `AppState` into handlers
- [ ] Add request logging middleware with `tower-http`
- [ ] Add graceful shutdown handling

**Files:**
- `crates/aura-proxy/src/main.rs`
- `crates/aura-proxy/src/routes/mod.rs`
- `crates/aura-proxy/src/routes/health.rs`

**Acceptance Criteria:**
- Server starts on configured port
- `GET /health` returns 200 OK
- Logs show incoming requests

---

## Milestone 2: Single Provider Proxy

### PR #5: HTTP Client Foundation
**Rust Concepts:** `reqwest`, async/await, error handling with `?`

**Tasks:**
- [ ] Add `reqwest` with `rustls-tls` feature to `aura-core`
- [ ] Create `HttpClient` wrapper struct
- [ ] Implement timeout and retry configuration
- [ ] Add request/response logging hooks
- [ ] Write integration test with mock server

**Files:**
- `crates/aura-core/src/http.rs`

**Acceptance Criteria:**
- HTTP client makes requests with configurable timeouts
- TLS works correctly

---

### PR #6: OpenAI Adapter (First Working Proxy!)
**Rust Concepts:** Traits, async traits, JSON transformation

**Tasks:**
- [ ] Define `Provider` trait in `aura-core`
- [ ] Implement `OpenAIProvider` struct
- [ ] Transform Open Responses request → OpenAI format
- [ ] Transform OpenAI response → Open Responses format
- [ ] Add `/v1/responses` endpoint
- [ ] Write integration tests with recorded responses

**Files:**
- `crates/aura-core/src/provider/mod.rs`
- `crates/aura-core/src/provider/trait.rs`
- `crates/aura-core/src/provider/openai.rs`
- `crates/aura-proxy/src/routes/responses.rs`

**Key Code:**
```rust
#[async_trait]
pub trait Provider: Send + Sync {
    fn name(&self) -> &str;
    async fn complete(&self, request: Request) -> Result<Response, ProviderError>;
    async fn complete_stream(&self, request: Request) -> Result<EventStream, ProviderError>;
}
```

**Acceptance Criteria:**
- Can proxy a simple chat completion to OpenAI
- Response follows Open Responses format

---

### PR #7: Streaming Support
**Rust Concepts:** `Stream` trait, SSE, tokio channels, `Pin<Box<dyn Stream>>`

**Tasks:**
- [ ] Add `futures` and `async-stream` dependencies
- [ ] Implement SSE response handling in OpenAI adapter
- [ ] Transform OpenAI stream events → Open Responses events
- [ ] Add `/v1/responses` streaming endpoint
- [ ] Handle connection drops gracefully

**Files:**
- `crates/aura-core/src/stream.rs`
- `crates/aura-proxy/src/routes/responses.rs` (update)

**Key Events:**
- `response.in_progress`
- `response.output_item.added`
- `response.output_text.delta`
- `response.completed`

**Acceptance Criteria:**
- Streaming responses work end-to-end
- Events follow Open Responses semantic format

---

### PR #8: Error Handling
**Rust Concepts:** Custom error types, `thiserror`, `From` trait implementations

**Tasks:**
- [ ] Define `AuraError` enum with variants
- [ ] Implement `IntoResponse` for Axum integration
- [ ] Add error codes following Open Responses spec
- [ ] Create error response JSON format
- [ ] Add context to errors with `anyhow` or error chains

**Files:**
- `crates/aura-types/src/error.rs`
- `crates/aura-core/src/error.rs`
- `crates/aura-proxy/src/error.rs`

**Error Categories:**
- `InvalidRequest` - malformed input
- `AuthenticationError` - invalid API key
- `ProviderError` - upstream provider failed
- `RateLimitError` - too many requests
- `InternalError` - unexpected failures

**Acceptance Criteria:**
- All errors return proper JSON with error codes
- Stack traces logged but not exposed to clients

---

## Milestone 3: Multi-Provider MVP

### PR #9: Claude Adapter
**Rust Concepts:** Applying trait patterns, different API shapes

**Tasks:**
- [ ] Implement `ClaudeProvider` struct
- [ ] Handle Claude's message format differences
- [ ] Support system prompts as first message
- [ ] Transform streaming format
- [ ] Add provider-specific configuration

**Files:**
- `crates/aura-core/src/provider/claude.rs`

**Acceptance Criteria:**
- Can proxy requests to Claude API
- Streaming works correctly

---

### PR #10: Gemini Adapter
**Rust Concepts:** Reinforcing patterns, handling edge cases

**Tasks:**
- [ ] Implement `GeminiProvider` struct
- [ ] Handle Gemini's `contents` array format
- [ ] Map roles correctly (user/model)
- [ ] Support Gemini-specific parameters
- [ ] Handle safety settings

**Files:**
- `crates/aura-core/src/provider/gemini.rs`

**Acceptance Criteria:**
- Can proxy requests to Gemini API
- Safety filter responses handled gracefully

---

### PR #11: Provider Registry
**Rust Concepts:** `HashMap`, dynamic dispatch, `Box<dyn Provider>`

**Tasks:**
- [ ] Create `ProviderRegistry` struct
- [ ] Register providers by name at startup
- [ ] Add provider health checks
- [ ] Support provider aliases (e.g., "gpt-4" → openai)
- [ ] Model-to-provider mapping

**Files:**
- `crates/aura-core/src/registry.rs`

**Key Code:**
```rust
pub struct ProviderRegistry {
    providers: HashMap<String, Arc<dyn Provider>>,
    model_map: HashMap<String, String>, // model -> provider
}
```

**Acceptance Criteria:**
- Requests route to correct provider based on model
- Unknown models return clear error

---

### PR #12: Load Balancing
**Rust Concepts:** `AtomicUsize`, thread-safe counters, round-robin

**Tasks:**
- [ ] Add load balancing strategies enum
- [ ] Implement round-robin with atomic counter
- [ ] Support multiple API keys per provider
- [ ] Add weighted distribution option
- [ ] Track provider health for failover

**Files:**
- `crates/aura-core/src/balancer.rs`

**Acceptance Criteria:**
- Requests distributed across multiple keys
- Failed providers skipped temporarily

---

### PR #13: API Key Authentication (Sellable MVP!)
**Rust Concepts:** Axum middleware, extractors, tower layers

**Tasks:**
- [ ] Create `ApiKey` extractor
- [ ] Add authentication middleware
- [ ] Support `Authorization: Bearer` header
- [ ] Support `X-API-Key` header
- [ ] In-memory key storage (database later)
- [ ] Add key validation endpoint

**Files:**
- `crates/aura-proxy/src/middleware/auth.rs`
- `crates/aura-proxy/src/extractors/api_key.rs`

**Acceptance Criteria:**
- Requests without valid key get 401
- Valid keys pass through to handlers

---

## Milestone 4: Persistence & Observability

### PR #14: PostgreSQL Setup
**Rust Concepts:** SQLx, compile-time query checking, migrations

**Tasks:**
- [ ] Add SQLx dependencies with Postgres feature
- [ ] Create initial migration for core tables
- [ ] Set up connection pool in `AppState`
- [ ] Add `DATABASE_URL` configuration
- [ ] Create `aura-db` models

**Tables:**
- `api_keys` - API key storage
- `requests` - Request logging
- `providers` - Provider configuration

**Files:**
- `crates/aura-db/src/lib.rs`
- `crates/aura-db/src/models/`
- `migrations/001_initial.sql`

**Acceptance Criteria:**
- Migrations run successfully
- Connection pool works

---

### PR #15: Request Logging
**Rust Concepts:** Background tasks, `tokio::spawn`, non-blocking writes

**Tasks:**
- [ ] Log requests to database asynchronously
- [ ] Capture request/response metadata
- [ ] Add correlation IDs
- [ ] Implement log rotation/cleanup
- [ ] Add query endpoints for logs

**Fields to Log:**
- Request ID, timestamp, provider, model
- Token counts (input/output)
- Latency, status code
- Error details (if any)

**Acceptance Criteria:**
- All requests logged without blocking response
- Logs queryable by time range

---

### PR #16: Cost Tracking
**Rust Concepts:** Decimal math, lookups, aggregation

**Tasks:**
- [ ] Create pricing table per model
- [ ] Calculate cost per request
- [ ] Aggregate costs by API key
- [ ] Add cost alerts/limits
- [ ] Create cost summary endpoint

**Files:**
- `crates/aura-core/src/cost.rs`
- `crates/aura-db/src/models/pricing.rs`

**Acceptance Criteria:**
- Costs calculated accurately per request
- Costs queryable by key and time period

---

### PR #17: Metrics with Prometheus
**Rust Concepts:** Metrics crates, histograms, counters

**Tasks:**
- [ ] Add `metrics` and `metrics-exporter-prometheus`
- [ ] Track request latency histogram
- [ ] Track requests by provider/model
- [ ] Track token usage
- [ ] Add `/metrics` endpoint

**Metrics:**
- `aura_request_duration_seconds`
- `aura_requests_total`
- `aura_tokens_total`
- `aura_errors_total`

**Acceptance Criteria:**
- Metrics endpoint returns Prometheus format
- Grafana can scrape metrics

---

### PR #18: Structured Logging
**Rust Concepts:** `tracing`, spans, structured fields

**Tasks:**
- [ ] Replace any `println!` with `tracing`
- [ ] Add request spans with correlation ID
- [ ] Configure JSON output for production
- [ ] Add log levels per module
- [ ] Integrate with OpenTelemetry (optional)

**Files:**
- `crates/aura-proxy/src/telemetry.rs`

**Acceptance Criteria:**
- Logs are structured JSON in production
- Request correlation works across async boundaries

---

## Milestone 5: Production Readiness

### PR #19: Rate Limiting
**Rust Concepts:** Token buckets, Redis integration, middleware

**Tasks:**
- [ ] Add Redis connection to `AppState`
- [ ] Implement token bucket algorithm
- [ ] Rate limit by API key
- [ ] Add rate limit headers
- [ ] Support burst allowance

**Headers:**
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

**Acceptance Criteria:**
- Excessive requests get 429
- Rate limits configurable per key

---

### PR #20: Response Caching
**Rust Concepts:** Cache keys, TTL, Redis commands

**Tasks:**
- [ ] Hash request for cache key
- [ ] Cache responses with TTL
- [ ] Support cache bypass header
- [ ] Add cache hit/miss metrics
- [ ] Configure per-model TTL

**Acceptance Criteria:**
- Identical requests return cached response
- Cache properly invalidated

---

### PR #21: Conversation Threading
**Rust Concepts:** State management, ID generation

**Tasks:**
- [ ] Implement `previous_response_id` handling
- [ ] Store conversation context
- [ ] Support context window management
- [ ] Add conversation list endpoint
- [ ] Handle conversation branching

**Acceptance Criteria:**
- Multi-turn conversations work correctly
- Context properly maintained

---

### PR #22: Docker Setup
**Rust Concepts:** Multi-stage builds, cargo-chef

**Tasks:**
- [ ] Create optimized Dockerfile
- [ ] Add docker-compose for local dev
- [ ] Include PostgreSQL and Redis
- [ ] Add health check in container
- [ ] Document environment variables

**Files:**
- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.dev.yml`

**Acceptance Criteria:**
- `docker-compose up` starts full stack
- Container is < 100MB

---

### PR #23: Health Checks & Readiness
**Rust Concepts:** Background health polling, circuit breakers

**Tasks:**
- [ ] Add `/health/live` endpoint
- [ ] Add `/health/ready` endpoint
- [ ] Check database connectivity
- [ ] Check Redis connectivity
- [ ] Check provider health

**Acceptance Criteria:**
- Kubernetes probes work correctly
- Unhealthy providers marked unavailable

---

## Milestone 6: Dashboard & Polish

### PR #24: Admin API
**Rust Concepts:** CRUD operations, authorization

**Tasks:**
- [ ] Add admin authentication
- [ ] CRUD endpoints for API keys
- [ ] Provider configuration endpoints
- [ ] Usage statistics endpoints
- [ ] System status endpoint

**Endpoints:**
- `POST /admin/keys`
- `GET /admin/keys`
- `DELETE /admin/keys/:id`
- `GET /admin/usage`
- `GET /admin/status`

**Acceptance Criteria:**
- Admin can manage API keys
- Usage data accessible via API

---

### PR #25: Dashboard Foundation
**Rust Concepts:** N/A (React/TypeScript)

**Tasks:**
- [ ] Initialize React + Vite + TypeScript
- [ ] Add Tailwind CSS
- [ ] Create layout components
- [ ] Add authentication flow
- [ ] Set up API client

**Files:**
- `dashboard/` directory structure

**Acceptance Criteria:**
- Dashboard builds and loads
- Can authenticate with admin credentials

---

### PR #26: Dashboard - Key Management
**Tasks:**
- [ ] List API keys page
- [ ] Create key form
- [ ] Delete key confirmation
- [ ] Key usage display
- [ ] Copy key to clipboard

**Acceptance Criteria:**
- Full CRUD for API keys in UI

---

### PR #27: Dashboard - Analytics
**Tasks:**
- [ ] Usage charts (requests over time)
- [ ] Cost breakdown by provider
- [ ] Top models used
- [ ] Error rate trends
- [ ] Real-time request feed

**Acceptance Criteria:**
- Visual analytics dashboard
- Data updates in near real-time

---

### PR #28: Documentation
**Tasks:**
- [ ] API reference with OpenAPI
- [ ] Getting started guide
- [ ] Provider configuration docs
- [ ] Deployment guide
- [ ] SDK examples (curl, Python, Node.js)

**Files:**
- `docs/api-reference.md`
- `docs/getting-started.md`
- `docs/deployment.md`
- `docs/providers/`

**Acceptance Criteria:**
- New users can get started in < 15 minutes
- All endpoints documented

---

---

# Phase 2: Developer Experience

---

## Milestone 7: Chat Demo App

A ChatGPT/Ollama-style demo application for testing and showcasing the gateway.

### PR #29: Chat App Foundation
**Tech Stack:** React + Vite + TypeScript + Tailwind

**Tasks:**
- [ ] Initialize `apps/chat/` with Vite + React + TypeScript
- [ ] Add Tailwind CSS with dark mode support
- [ ] Create base layout (sidebar, main chat area)
- [ ] Set up routing with React Router
- [ ] Add environment configuration for API endpoint

**Files:**
- `apps/chat/` directory structure
- `apps/chat/src/App.tsx`
- `apps/chat/src/components/Layout.tsx`

**Acceptance Criteria:**
- App builds and runs locally
- Dark/light mode toggle works

---

### PR #30: Chat Interface
**Tasks:**
- [ ] Create message bubble components (user/assistant)
- [ ] Add chat input with auto-resize textarea
- [ ] Implement message list with auto-scroll
- [ ] Add typing indicator during streaming
- [ ] Support markdown rendering in responses
- [ ] Add code syntax highlighting

**Components:**
- `MessageBubble` - Single message display
- `ChatInput` - Input area with send button
- `MessageList` - Scrollable message container
- `TypingIndicator` - Animated dots during response

**Acceptance Criteria:**
- Can send messages and see responses
- Streaming responses render progressively
- Code blocks render with syntax highlighting

---

### PR #31: Conversation Management
**Tasks:**
- [ ] Create conversation sidebar
- [ ] New conversation button
- [ ] Conversation history list
- [ ] Delete conversation
- [ ] Rename conversation
- [ ] Local storage persistence

**Acceptance Criteria:**
- Can create multiple conversations
- Conversations persist across page refresh
- Can switch between conversations

---

### PR #32: Model Selection & Settings
**Tasks:**
- [ ] Model dropdown selector
- [ ] Fetch available models from API
- [ ] Settings panel (temperature, max tokens)
- [ ] System prompt input
- [ ] Provider indicator badge
- [ ] Token count display

**Acceptance Criteria:**
- Can switch between models
- Settings affect API requests
- Shows which provider is being used

---

### PR #33: Chat App Polish
**Tasks:**
- [ ] Add keyboard shortcuts (Cmd+Enter, Cmd+N)
- [ ] Error handling with retry option
- [ ] Loading states and skeletons
- [ ] Mobile responsive design
- [ ] Export conversation as JSON/Markdown
- [ ] Share conversation link (optional)

**Acceptance Criteria:**
- Works on mobile devices
- Graceful error handling
- Professional, polished UI

---

## Milestone 8: SDKs

Client libraries for Python and TypeScript developers.

### PR #34: SDK Core Design
**Tasks:**
- [ ] Design unified SDK interface
- [ ] Define common types (Request, Response, StreamEvent)
- [ ] Plan error handling strategy
- [ ] Design authentication patterns
- [ ] Create SDK specification document

**Files:**
- `docs/sdk-spec.md`

**Acceptance Criteria:**
- Clear API design documented
- Consistent patterns across languages

---

### PR #35: Python SDK Foundation
**Tech Stack:** Python 3.9+, httpx, pydantic

**Tasks:**
- [ ] Initialize `sdks/python/` with Poetry/uv
- [ ] Create `aura` package structure
- [ ] Implement `AuraClient` class
- [ ] Add Pydantic models for types
- [ ] Set up pytest for testing

**Files:**
```
sdks/python/
├── pyproject.toml
├── src/aura/
│   ├── __init__.py
│   ├── client.py
│   ├── types.py
│   └── exceptions.py
└── tests/
```

**Key Code:**
```python
from aura import AuraClient

client = AuraClient(api_key="...")
response = client.responses.create(
    model="gpt-4",
    input=[{"role": "user", "content": "Hello!"}]
)
```

**Acceptance Criteria:**
- Basic sync client works
- Types provide autocomplete

---

### PR #36: Python SDK Streaming & Async
**Tasks:**
- [ ] Add async client with `httpx.AsyncClient`
- [ ] Implement streaming with async generators
- [ ] Add context manager support
- [ ] Implement retry logic with backoff
- [ ] Add timeout configuration

**Key Code:**
```python
async with AuraClient(api_key="...") as client:
    async for event in client.responses.create_stream(
        model="gpt-4",
        input=[{"role": "user", "content": "Hello!"}]
    ):
        print(event.delta, end="")
```

**Acceptance Criteria:**
- Async operations work
- Streaming yields events progressively

---

### PR #37: TypeScript SDK Foundation
**Tech Stack:** TypeScript, fetch/node-fetch, zod

**Tasks:**
- [ ] Initialize `sdks/typescript/` with npm/pnpm
- [ ] Create package structure
- [ ] Implement `AuraClient` class
- [ ] Add Zod schemas for validation
- [ ] Set up Vitest for testing
- [ ] Configure for both Node.js and browser

**Files:**
```
sdks/typescript/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── client.ts
│   ├── types.ts
│   └── errors.ts
└── tests/
```

**Key Code:**
```typescript
import { AuraClient } from '@aura/sdk';

const client = new AuraClient({ apiKey: '...' });
const response = await client.responses.create({
  model: 'gpt-4',
  input: [{ role: 'user', content: 'Hello!' }]
});
```

**Acceptance Criteria:**
- Works in Node.js and browser
- Full TypeScript types

---

### PR #38: TypeScript SDK Streaming
**Tasks:**
- [ ] Implement streaming with ReadableStream
- [ ] Add Server-Sent Events parsing
- [ ] Support both Node.js and browser streaming
- [ ] Add abort controller support
- [ ] Implement retry with exponential backoff

**Key Code:**
```typescript
for await (const event of client.responses.stream({
  model: 'gpt-4',
  input: [{ role: 'user', content: 'Hello!' }]
})) {
  process.stdout.write(event.delta);
}
```

**Acceptance Criteria:**
- Streaming works in both environments
- Can cancel in-progress requests

---

### PR #39: SDK Publishing & Docs
**Tasks:**
- [ ] Set up PyPI publishing workflow
- [ ] Set up npm publishing workflow
- [ ] Write README for each SDK
- [ ] Add usage examples
- [ ] Generate API reference docs
- [ ] Add to main documentation

**Acceptance Criteria:**
- SDKs published to package registries
- Documentation complete with examples

---

## Milestone 9: API Documentation Website

Interactive, beautiful API documentation.

### PR #40: OpenAPI Specification
**Tasks:**
- [ ] Generate OpenAPI spec from Axum routes
- [ ] Add `utoipa` annotations to all endpoints
- [ ] Include request/response examples
- [ ] Document authentication methods
- [ ] Add error response schemas

**Files:**
- `crates/aura-proxy/src/openapi.rs`
- `docs/openapi.json` (generated)

**Acceptance Criteria:**
- Complete OpenAPI 3.1 spec
- All endpoints documented

---

### PR #41: Docs Site Foundation
**Tech Stack:** Astro + Starlight or Mintlify

**Tasks:**
- [ ] Initialize `apps/docs/` with Astro Starlight
- [ ] Configure theme and branding
- [ ] Set up navigation structure
- [ ] Add syntax highlighting for code blocks
- [ ] Configure search

**Files:**
- `apps/docs/` directory structure

**Acceptance Criteria:**
- Docs site builds and deploys
- Navigation works correctly

---

### PR #42: API Reference Pages
**Tasks:**
- [ ] Generate reference from OpenAPI spec
- [ ] Add interactive "Try it" functionality
- [ ] Include code examples in multiple languages
- [ ] Add response previews
- [ ] Document rate limits and errors

**Sections:**
- Authentication
- Responses API
- Streaming
- Models
- Admin API

**Acceptance Criteria:**
- All endpoints documented with examples
- Can test API from docs

---

### PR #43: Guides & Tutorials
**Tasks:**
- [ ] Getting started guide
- [ ] SDK quickstart guides
- [ ] Provider configuration guide
- [ ] Streaming implementation guide
- [ ] Self-hosting guide
- [ ] Migration from OpenAI guide

**Acceptance Criteria:**
- New users can get started in < 10 minutes
- Guides have copy-paste code examples

---

# Phase 3: Advanced Features

---

## Milestone 10: Smart Routing

### PR #44: Router Framework
**Rust Concepts:** Strategy pattern, pluggable routing

**Tasks:**
- [ ] Define `Router` trait for routing strategies
- [ ] Create `RouterRegistry` for multiple routers
- [ ] Add routing configuration schema
- [ ] Implement fallback chain logic
- [ ] Add routing decision logging

**Files:**
- `crates/aura-core/src/router/mod.rs`
- `crates/aura-core/src/router/trait.rs`

**Acceptance Criteria:**
- Pluggable routing architecture
- Can chain multiple routing strategies

---

### PR #45: Intent-Based Routing
**Tasks:**
- [ ] Create intent classification prompt
- [ ] Implement lightweight LLM classifier
- [ ] Define intent categories (code, creative, analysis, etc.)
- [ ] Map intents to optimal providers/models
- [ ] Add intent caching to avoid re-classification
- [ ] Configurable intent rules

**Intent Categories:**
- `code` → Claude or GPT-4
- `creative_writing` → Claude
- `data_analysis` → GPT-4
- `simple_qa` → GPT-3.5 or Gemini Flash
- `vision` → GPT-4V or Claude Vision

**Acceptance Criteria:**
- Requests automatically route to best model
- Classification adds < 200ms latency

---

### PR #46: Cost-Based Routing
**Tasks:**
- [ ] Define cost optimization rules
- [ ] Implement budget-aware routing
- [ ] Add quality vs. cost tradeoff config
- [ ] Route simple queries to cheaper models
- [ ] Track savings from smart routing

**Acceptance Criteria:**
- Can set monthly budget limits
- Automatic fallback to cheaper models

---

### PR #47: Region-Based Routing
**Tasks:**
- [ ] Add region configuration per provider
- [ ] Implement geo-IP detection
- [ ] Route to nearest region for latency
- [ ] Support data residency requirements
- [ ] Add region failover

**Regions:**
- `us-east`, `us-west`, `eu-west`, `asia-pacific`

**Acceptance Criteria:**
- Requests route to optimal region
- Supports GDPR data residency

---

### PR #48: Routing Dashboard
**Tasks:**
- [ ] Add routing analytics to dashboard
- [ ] Show routing decisions distribution
- [ ] Display cost savings metrics
- [ ] Routing rule configuration UI
- [ ] A/B test routing strategies

**Acceptance Criteria:**
- Visual routing insights
- Can configure routing from UI

---

## Milestone 11: Semantic Caching

### PR #49: Vector Database Setup
**Tech Stack:** pgvector or Qdrant

**Tasks:**
- [ ] Add pgvector extension to PostgreSQL
- [ ] Create embeddings table schema
- [ ] Set up embedding generation (OpenAI or local)
- [ ] Implement vector similarity search
- [ ] Add index for fast retrieval

**Files:**
- `migrations/xxx_add_vector_support.sql`
- `crates/aura-core/src/embedding.rs`

**Acceptance Criteria:**
- Can store and search embeddings
- Similarity search < 50ms

---

### PR #50: Semantic Cache Implementation
**Tasks:**
- [ ] Generate embeddings for requests
- [ ] Store request-response pairs with embeddings
- [ ] Implement similarity threshold matching
- [ ] Add cache hit/miss tracking
- [ ] Configurable similarity threshold

**Key Logic:**
```rust
// If similar request found with similarity > 0.95
// Return cached response instead of calling provider
```

**Acceptance Criteria:**
- Similar queries return cached responses
- Significant cost savings on repeated queries

---

### PR #51: Cache Management
**Tasks:**
- [ ] Cache invalidation strategies
- [ ] TTL-based expiration
- [ ] Manual cache clear API
- [ ] Cache warming for common queries
- [ ] Cache statistics endpoint

**Acceptance Criteria:**
- Cache doesn't serve stale data
- Can manually manage cache

---

### PR #52: Semantic Cache Dashboard
**Tasks:**
- [ ] Cache hit rate visualization
- [ ] Cost savings calculator
- [ ] Cache entry browser
- [ ] Similarity threshold tuning UI
- [ ] Cache clear functionality

**Acceptance Criteria:**
- Insights into cache performance
- Easy cache management

---

## Milestone 12: User & Team Management

### PR #53: User Model
**Tasks:**
- [ ] Create users table
- [ ] Add user authentication (email/password)
- [ ] Implement JWT token generation
- [ ] Add password reset flow
- [ ] Support OAuth providers (Google, GitHub)

**Tables:**
- `users` - User accounts
- `sessions` - Active sessions
- `password_resets` - Reset tokens

**Acceptance Criteria:**
- Users can sign up and log in
- JWT authentication works

---

### PR #54: Organization Model
**Tasks:**
- [ ] Create organizations table
- [ ] Add organization membership
- [ ] Implement roles (owner, admin, member)
- [ ] Organization-level API keys
- [ ] Invitation system

**Tables:**
- `organizations` - Organization accounts
- `org_members` - User-org relationships
- `org_invitations` - Pending invites

**Acceptance Criteria:**
- Users can create organizations
- Can invite team members

---

### PR #55: Role-Based Access Control
**Tasks:**
- [ ] Define permission system
- [ ] Implement role hierarchy
- [ ] Add resource-level permissions
- [ ] Create permission checking middleware
- [ ] Audit log for permission changes

**Permissions:**
- `keys:read`, `keys:write`, `keys:delete`
- `usage:read`, `settings:write`
- `members:invite`, `members:remove`

**Acceptance Criteria:**
- Fine-grained access control
- Permissions enforced on all endpoints

---

### PR #56: Quotas & Limits
**Tasks:**
- [ ] Per-user token limits
- [ ] Per-organization spending limits
- [ ] Per-API-key rate limits
- [ ] Overage notifications
- [ ] Usage alerts

**Acceptance Criteria:**
- Can set spending caps
- Users notified before hitting limits

---

### PR #57: Team Management Dashboard
**Tasks:**
- [ ] Organization settings page
- [ ] Member management UI
- [ ] Role assignment interface
- [ ] Invitation management
- [ ] Usage breakdown by member

**Acceptance Criteria:**
- Full team management from UI
- Clear usage attribution

---

## Milestone 13: Additional Providers

### PR #58: HuggingFace Adapter
**Tasks:**
- [ ] Implement `HuggingFaceProvider`
- [ ] Support Inference API
- [ ] Support Inference Endpoints
- [ ] Handle model-specific parameters
- [ ] Add popular model presets

**Models:**
- Llama, Mistral, Falcon, etc.

**Acceptance Criteria:**
- Can proxy to HuggingFace models
- Streaming works correctly

---

### PR #59: Mistral Adapter
**Tasks:**
- [ ] Implement `MistralProvider`
- [ ] Handle Mistral API format
- [ ] Support function calling
- [ ] Add Mistral-specific parameters

**Acceptance Criteria:**
- Full Mistral API support
- Function calling works

---

### PR #60: Cohere Adapter
**Tasks:**
- [ ] Implement `CohereProvider`
- [ ] Handle Command models
- [ ] Support Cohere embeddings
- [ ] Add RAG capabilities

**Acceptance Criteria:**
- Can proxy to Cohere
- Embeddings API works

---

### PR #61: Local Model Support (Ollama)
**Tasks:**
- [ ] Implement `OllamaProvider`
- [ ] Auto-discover local models
- [ ] Support custom model paths
- [ ] Handle local-specific errors
- [ ] Add GPU detection

**Acceptance Criteria:**
- Can proxy to local Ollama
- Zero-config for local development

---

### PR #62: Provider Management Dashboard
**Tasks:**
- [ ] Provider configuration UI
- [ ] API key management per provider
- [ ] Provider health status
- [ ] Enable/disable providers
- [ ] Custom endpoint configuration

**Acceptance Criteria:**
- Easy provider setup from UI
- Clear provider status

---

## Milestone 14: Advanced Features

### PR #63: A/B Testing Framework
**Tasks:**
- [ ] Create experiment model
- [ ] Implement traffic splitting
- [ ] Track metrics per variant
- [ ] Statistical significance calculator
- [ ] Experiment dashboard

**Acceptance Criteria:**
- Can run A/B tests on models
- Clear winner identification

---

### PR #64: Prompt Templates
**Tasks:**
- [ ] Create prompt template model
- [ ] Variable substitution engine
- [ ] Template versioning
- [ ] Template library UI
- [ ] Import/export templates

**Key Features:**
```
Template: "Translate to {{language}}: {{text}}"
Variables: { language: "Spanish", text: "Hello" }
Result: "Translate to Spanish: Hello"
```

**Acceptance Criteria:**
- Reusable prompt templates
- Version history

---

### PR #65: Prompt Template Management
**Tasks:**
- [ ] Template CRUD API
- [ ] Template categories/tags
- [ ] Template sharing (public/private)
- [ ] Usage analytics per template
- [ ] Template testing UI

**Acceptance Criteria:**
- Full template lifecycle
- Templates shareable across team

---

### PR #66: Fine-Tuning Management
**Tasks:**
- [ ] Fine-tuning job model
- [ ] OpenAI fine-tuning integration
- [ ] Training data validation
- [ ] Job status tracking
- [ ] Cost estimation

**Acceptance Criteria:**
- Can initiate fine-tuning jobs
- Track job progress

---

### PR #67: Fine-Tuning Dashboard
**Tasks:**
- [ ] Training data upload UI
- [ ] Fine-tuning job creation wizard
- [ ] Job monitoring dashboard
- [ ] Model comparison tools
- [ ] Deployment to production

**Acceptance Criteria:**
- End-to-end fine-tuning workflow
- Easy model deployment

---

### PR #68: Guardrails & Safety
**Tasks:**
- [ ] Content moderation integration
- [ ] PII detection and redaction
- [ ] Custom blocklist/allowlist
- [ ] Safety score tracking
- [ ] Compliance reporting

**Acceptance Criteria:**
- Automatic content filtering
- PII protection

---

## Success Metrics

### Phase 1 (MVP) Completion:
- [ ] Proxy 1000 req/s with < 10ms added latency
- [ ] 99.9% uptime in production
- [ ] < 100MB Docker image size
- [ ] Full test coverage for core logic

### Phase 2 (DX) Completion:
- [ ] SDKs downloaded 1000+ times
- [ ] Documentation rated 4.5+/5 by users
- [ ] Chat demo used for customer demos

### Phase 3 (Advanced) Completion:
- [ ] 30%+ cost savings from smart routing
- [ ] 50%+ cache hit rate on repeated queries
- [ ] Enterprise customers with team features
