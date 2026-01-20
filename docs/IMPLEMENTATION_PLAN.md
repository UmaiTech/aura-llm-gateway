# Aura LLM Gateway - Implementation Plan

A PR-by-PR roadmap for building the Aura LLM Gateway, designed for incremental Rust learning.

## Overview

| Milestone | PRs | Outcome |
|-----------|-----|---------|
| **M1: Foundation** | PR 1-4 | Project structure, types, config, basic server |
| **M2: Single Provider Proxy** | PR 5-8 | Working OpenAI proxy with streaming |
| **M3: Multi-Provider MVP** | PR 9-13 | Claude + Gemini, load balancing, basic auth |
| **M4: Persistence & Observability** | PR 14-18 | PostgreSQL, request logging, metrics |
| **M5: Production Readiness** | PR 19-23 | Rate limiting, caching, Docker, health checks |
| **M6: Dashboard & Polish** | PR 24-28 | Admin API, basic dashboard, documentation |

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

**Tasks:**
- [ ] Initialize workspace `Cargo.toml` with members
- [ ] Create each crate with minimal `lib.rs`/`main.rs`
- [ ] Set up shared dependencies (tokio, serde, tracing)
- [ ] Configure `rust-analyzer` settings
- [ ] Add `.cargo/config.toml` for build optimizations

**Acceptance Criteria:**
- `cargo build` succeeds for all crates
- `cargo test` runs (even if no tests yet)

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

## Deferred Features (Post-MVP)

These features are intentionally deferred to keep the MVP focused:

| Feature | Reason for Deferral |
|---------|---------------------|
| Intent-based routing | Requires LLM classification, adds complexity |
| Semantic caching | Requires vector database integration |
| Region-based routing | Requires multi-region deployment |
| User/Team management | Complex RBAC, not needed for MVP |
| A/B testing | Nice-to-have, not core functionality |
| HuggingFace adapter | Lower priority than big 3 providers |
| SDKs (Python, Node.js) | Can use standard HTTP initially |
| Prompt templates | Can be added after core is stable |
| Fine-tuning management | Provider-specific, complex |

---

## Success Metrics

After completing all milestones:

- [ ] Proxy 1000 req/s with < 10ms added latency
- [ ] 99.9% uptime in production
- [ ] < 100MB Docker image size
- [ ] Full test coverage for core logic
- [ ] Documentation rated "easy to follow" by 3+ users
