# Aura LLM Gateway - Implementation Plan

A PR-by-PR roadmap for building the Aura LLM Gateway, designed for incremental Rust learning.

## Current Status (January 2026)

**Project Phase:** MVP - In Progress

**Recently Completed:**
- ✅ **Conversation Persistence** (January 23, 2026) - Full stateful conversation support with threading
  - See: [`docs/implementation-conversation-persistence.md`](./implementation-conversation-persistence.md)
  - Database schema: conversations, responses, messages tables
  - REST API: Conversation management endpoints
  - Features: Auto-creation, threading, usage tracking, cost calculation

**Active Milestones:**
- M1-M4: Foundation, Single Provider, Multi-Provider, Persistence ✅ **LARGELY COMPLETE**
- M5: Production Readiness - In Progress
- M7: Chat Demo App ✅ **COMPLETE**

---

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
**Rust Concepts:** Environment variables, `Arc<T>` for shared state, builder pattern, serde serialization

**Status:** ✅ **COMPLETED**

**Tasks:**
- [x] Add `dotenvy` and `serde_yaml` dependencies to `aura-core`
- [x] Create `Config` struct with environment-based loading
- [x] Implement `Default` trait for development defaults
- [x] Create `AppState` struct with `Arc<Config>`
- [x] Add configuration validation
- [x] Add YAML configuration file support for Kubernetes/Helm deployments

**Files:**
- `crates/aura-core/src/config.rs`
- `crates/aura-core/src/state.rs`
- `config.example.yaml`

**Key Code:**
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub server: ServerConfig,      // host, port
    pub providers: ProviderConfig, // openai_api_key, anthropic_api_key, google_api_key
    pub logging: LoggingConfig,    // level
    pub database: DatabaseConfig,  // url
    pub redis: RedisConfig,        // url
    pub admin: AdminConfig,        // key
}

pub struct AppState {
    pub config: Arc<Config>,
}
```

**Acceptance Criteria:**
- ✅ Config loads from environment variables
- ✅ Config loads from YAML files (`Config::from_file()`)
- ✅ Environment variables override file config (`Config::from_file_with_env()`)
- ✅ Missing required vars return clear error messages
- ✅ Validation ensures at least one provider API key is configured

**Implementation Notes:**
- Restructured Config into nested sections for cleaner YAML representation
- Added `serde_yaml` for YAML parsing/serialization
- Environment variables take precedence over file config (ideal for K8s Secrets)
- Added `ConfigBuilder` for programmatic construction
- Added `to_yaml_masked()` for safe logging of configuration
- Created `config.example.yaml` with full documentation
- 21 unit tests + 5 doc tests

---

### PR #3: Open Responses API Types
**Rust Concepts:** Enums, structs, `serde` derive macros, `Option<T>`, `Result<T, E>`

Define the core Open Responses API types in `aura-types`.

**Status:** ✅ **COMPLETED**

**Tasks:**
- [x] Define `Item` enum (message, function_call, function_call_output, reasoning)
- [x] Define `ItemStatus` enum (in_progress, completed, failed, incomplete)
- [x] Define `Response` struct with status lifecycle
- [x] Define `StreamEvent` enum for SSE events
- [x] Add serde serialization with `#[serde(rename_all = "snake_case")]`
- [x] Write unit tests for JSON serialization

**Files:**
- `crates/aura-types/src/item.rs`
- `crates/aura-types/src/response.rs`
- `crates/aura-types/src/stream.rs`
- `crates/aura-types/src/lib.rs` (re-exports)

**Acceptance Criteria:**
- ✅ Types serialize to match Open Responses API spec
- ✅ All enums handle unknown variants gracefully

**Implementation Notes:**
- Created comprehensive type system with 59 unit tests + 1 doc test
- `Item` enum supports Message, FunctionCall, FunctionCallOutput, and Reasoning variants
- `Response` struct includes builder pattern for easy construction
- `StreamEvent` enum covers full SSE lifecycle (created, in_progress, deltas, completed, failed)
- Added `InputItem` for request construction with simple helper methods
- Added `CreateResponseRequest` with builder methods for common options
- Added `Tool` and `FunctionDefinition` types for function calling
- Added `SseMessage` for parsing/formatting Server-Sent Events
- Created `docs/PROVIDER_MAPPING.md` documenting type mappings for each provider

---

### PR #4: Basic Axum Server
**Rust Concepts:** Async handlers, `Router`, `State` extractor, middleware basics

**Status:** ✅ **COMPLETED**

**Tasks:**
- [x] Add Axum and Tower dependencies to `aura-proxy`
- [x] Create basic router with health check endpoint
- [x] Inject `AppState` into handlers
- [x] Add request logging middleware with `tower-http`
- [x] Add graceful shutdown handling

**Files:**
- `crates/aura-proxy/src/main.rs`
- `crates/aura-proxy/src/routes/mod.rs`
- `crates/aura-proxy/src/routes/health.rs`

**Acceptance Criteria:**
- ✅ Server starts on configured port (127.0.0.1:8080)
- ✅ `GET /health` returns 200 OK with JSON response
- ✅ Logs show incoming requests with structured tracing
- ✅ Graceful shutdown on SIGTERM/SIGINT

**Implementation Notes:**
- Created Axum server with TraceLayer middleware for request logging
- Health endpoint returns JSON: `{"status":"ok","service":"aura-llm-gateway","version":"0.1.3"}`
- Graceful shutdown handles both Ctrl+C and SIGTERM signals
- AppState holds Arc<Config> for shared state across handlers
- 1 passing integration test for health endpoint

---

## Milestone 2: Single Provider Proxy

### PR #5: HTTP Client Foundation
**Rust Concepts:** `reqwest`, async/await, error handling with `?`

**Status:** ✅ **COMPLETED**

**Tasks:**
- [x] Add `reqwest` with `rustls-tls` feature to `aura-core`
- [x] Create `HttpClient` wrapper struct
- [x] Implement timeout and retry configuration
- [x] Add request/response logging hooks
- [x] Write integration test with network requests

**Files:**
- `crates/aura-core/src/http.rs`
- `crates/aura-core/src/lib.rs` (exports)

**Acceptance Criteria:**
- ✅ HTTP client makes requests with configurable timeouts
- ✅ TLS works correctly via rustls
- ✅ Exponential backoff retry logic (3 retries by default)
- ✅ Automatic retry on 5xx and 429 errors
- ✅ Request/response logging with tracing

**Implementation Notes:**
- Created `HttpClient` wrapper around reqwest with configurable timeouts and retries
- Default config: 60s timeout, 10s connect timeout, 3 max retries with exponential backoff
- Retry logic: starts at 500ms delay, doubles on each retry (500ms, 1s, 2s)
- Convenience methods: `get()`, `post_json()`
- Custom error type `HttpError` with proper error context
- 4 unit tests + 1 integration test (network-dependent)
- User agent: `aura-llm-gateway/0.1.3`

---

### PR #6: OpenAI Adapter (First Working Proxy!)
**Rust Concepts:** Traits, async traits, JSON transformation

**Reference:** See `docs/PROVIDER_MAPPING.md` for detailed type mappings between Open Responses API and OpenAI.

**Status:** ✅ **COMPLETED**

**Tasks:**
- [x] Define `Provider` trait in `aura-core`
- [x] Implement `OpenAIProvider` struct
- [x] Transform Open Responses request → OpenAI format (see mapping guide)
- [x] Transform OpenAI response → Open Responses format (see mapping guide)
- [x] Add `/v1/responses` endpoint
- [x] Add `ProviderError` types for structured error handling
- [x] Write unit tests for transformation logic

**Files:**
- `crates/aura-core/src/provider/mod.rs`
- `crates/aura-core/src/provider/error.rs`
- `crates/aura-core/src/provider/openai.rs`
- `crates/aura-proxy/src/routes/responses.rs`

**Key Code:**
```rust
#[async_trait]
pub trait Provider: Send + Sync {
    fn name(&self) -> &str;
    fn models(&self) -> &[&str];
    fn supports_model(&self, model: &str) -> bool;
    async fn complete(&self, request: CreateResponseRequest) -> Result<Response, ProviderError>;
    async fn complete_stream(&self, request: CreateResponseRequest) -> Result<EventStream, ProviderError>;
    async fn health_check(&self) -> Result<(), ProviderError>;
}
```

**Acceptance Criteria:**
- ✅ Can proxy a simple chat completion to OpenAI
- ✅ Response follows Open Responses format
- ✅ Error responses properly formatted

**Implementation Notes:**
- Created `Provider` trait with async methods for completion and streaming
- OpenAI adapter transforms requests/responses between Open Responses API and OpenAI Chat API
- Full support for tools/function calling transformation
- `ProviderError` enum with variants for InvalidRequest, Authentication, RateLimit, etc.
- Unit tests for request transformation and error handling

---

### PR #7: Streaming Support
**Rust Concepts:** `Stream` trait, SSE, tokio channels, `Pin<Box<dyn Stream>>`

**Status:** ✅ **COMPLETED**

**Tasks:**
- [x] Add `futures-util` and streaming dependencies
- [x] Implement SSE response handling in OpenAI adapter
- [x] Transform OpenAI stream events → Open Responses events
- [x] Add `/v1/responses` streaming endpoint with SSE
- [x] Handle connection drops gracefully

**Files:**
- `crates/aura-core/src/provider/openai.rs` (OpenAIStreamTransformer)
- `crates/aura-proxy/src/routes/responses.rs`

**Key Events:**
- `response.created`
- `response.in_progress`
- `response.output_item.added`
- `response.output_text.delta`
- `response.completed`

**Acceptance Criteria:**
- ✅ Streaming responses work end-to-end
- ✅ Events follow Open Responses semantic format
- ✅ Keep-alive for long-running connections

**Implementation Notes:**
- `OpenAIStreamTransformer` converts OpenAI's raw SSE chunks to Open Responses events
- Handles buffering of partial SSE data across chunks
- Emits semantic events (response.created, output_item.added, text deltas, completed)
- SSE keep-alive interval of 15 seconds
- Error events properly formatted for stream failures

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

**Reference:** See `docs/PROVIDER_MAPPING.md` for detailed Anthropic/Claude type mappings.

**Tasks:**
- [ ] Implement `ClaudeProvider` struct
- [ ] Handle Claude's message format differences (system at top level)
- [ ] Support system prompts as separate field (not in messages)
- [ ] Transform streaming format (message_start, content_block_delta, etc.)
- [ ] Handle `thinking` blocks as Item::Reasoning
- [ ] Add provider-specific configuration

**Files:**
- `crates/aura-core/src/provider/claude.rs`

**Acceptance Criteria:**
- Can proxy requests to Claude API
- Streaming works correctly
- Extended thinking exposed as reasoning items

---

### PR #10: Gemini Adapter
**Rust Concepts:** Reinforcing patterns, handling edge cases

**Reference:** See `docs/PROVIDER_MAPPING.md` for detailed Google/Gemini type mappings.

**Tasks:**
- [ ] Implement `GeminiProvider` struct
- [ ] Handle Gemini's `contents` array format
- [ ] Map roles correctly (user/model instead of user/assistant)
- [ ] Handle system_instruction as separate field
- [ ] Support Gemini-specific parameters
- [ ] Handle safety settings and content filtering

**Files:**
- `crates/aura-core/src/provider/gemini.rs`

**Acceptance Criteria:**
- Can proxy requests to Gemini API
- Safety filter responses handled gracefully
- Role mapping works correctly

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

**Status:** ✅ **COMPLETED** (Schema, models, and AppState integration done)

**Tasks:**
- [x] Add SQLx dependencies with Postgres feature
- [x] Create initial migration for core tables
- [x] Set up connection pool configuration
- [x] Add `DATABASE_URL` configuration
- [x] Create `aura-db` models
- [x] Integrate pool into `AppState` at startup
- [ ] Run migrations on startup (manual for now)

**Tables (Implemented):**
- `providers` - Provider configuration
- `model_pricing` - Model pricing with temporal validity
- `conversations` - Conversation records
- `messages` - Message records
- `request_logs` - Request logging with cost tracking

**Files:**
- `crates/aura-db/src/lib.rs` ✅
- `crates/aura-db/src/models.rs` ✅
- `crates/aura-db/src/pool.rs` ✅
- `crates/aura-db/src/repo.rs` ✅
- `crates/aura-db/src/error.rs` ✅
- `crates/aura-proxy/src/main.rs` ✅ (AppState with optional DbPool)
- `migrations/20250122_001_initial_schema.sql` ✅

**Acceptance Criteria:**
- ✅ Migration schema defined with all tables
- ✅ Connection pool configuration ready
- ✅ Repository functions for all models
- ✅ Pool integrated with AppState (optional - graceful degradation)
- [ ] Migrations run at startup

**Implementation Notes:**
- Database is optional - gateway runs without it and logs warning
- `AppState` holds `Option<DbPool>` for graceful degradation
- `PoolConfig` exported from aura-db for custom configuration

---

### PR #15: Request Logging
**Rust Concepts:** Background tasks, `tokio::spawn`, non-blocking writes

**Status:** ✅ **COMPLETED**

**Tasks:**
- [x] Log requests to database asynchronously
- [x] Capture request/response metadata
- [x] Add correlation IDs (aura_request_id)
- [ ] Implement log rotation/cleanup
- [ ] Add query endpoints for logs

**Fields Logged:**
- `response_id` - Unique request identifier (aura_uuid format)
- `provider_name` - Which provider handled the request
- `model_id` - Model used
- `input_tokens`, `output_tokens`, `cached_tokens`, `reasoning_tokens`
- `cost_usd` - Calculated cost
- `latency_ms` - Request duration
- `status` - completed/failed/incomplete/cancelled
- `error_code`, `error_message` - Error details (if any)
- `metadata` - Full aura metadata JSON

**Files:**
- `crates/aura-proxy/src/main.rs` ✅ (log_request method)
- `crates/aura-proxy/src/routes/responses.rs` ✅ (async logging)
- `crates/aura-db/src/repo.rs` ✅ (RequestLogRepo)

**Acceptance Criteria:**
- ✅ All requests logged without blocking response (tokio::spawn)
- ✅ Both successful and failed requests logged
- [ ] Logs queryable by time range (endpoint pending)

**Implementation Notes:**
- Logging runs in background task (`tokio::spawn`)
- Non-blocking - response returns immediately
- Graceful degradation - works without database
- Error logging includes error_code and error_message

---

### PR #16: Cost Tracking
**Rust Concepts:** Decimal math, lookups, aggregation

**Status:** ✅ **COMPLETED** (Core module, response enrichment, agentic metadata)

**Tasks:**
- [x] Create pricing configuration per model
- [x] Calculate cost per request (input/output/cached/reasoning tokens)
- [x] Create database schema for model pricing with temporal validity
- [x] Add `cost_usd` to response `Usage` struct (server-side enrichment)
- [x] Enrich responses with Aura metadata (provider, latency, request_id)
- [x] Add agentic metadata (tool calls, requires_action, reasoning status)
- [x] Update pricing for 2026 models (GPT-5, Claude 4.5, Gemini 3)
- [ ] Aggregate costs by API key
- [ ] Add cost alerts/limits
- [ ] Create cost summary endpoint

**Files:**
- `crates/aura-core/src/cost.rs` ✅ (2026 pricing included)
- `crates/aura-types/src/response.rs` (Usage.cost_usd) ✅
- `crates/aura-proxy/src/main.rs` (enrich_response methods) ✅
- `crates/aura-db/src/models.rs` (ModelPricing) ✅
- `crates/aura-db/src/repo.rs` (ModelPricingRepo) ✅
- `docs/api/cost-tracking.md` ✅ (full documentation)
- `migrations/20250122_001_initial_schema.sql` ✅

**Acceptance Criteria:**
- ✅ Costs calculated accurately per request
- ✅ Pricing data stored in database with effective dates
- ✅ Responses enriched with cost_usd in usage
- ✅ Aura metadata added to response (provider, gateway_version, latency_ms, request_id)
- ✅ Agentic metadata for agent workflows
- [ ] Costs queryable by key and time period

**Implementation Notes:**
- `ModelPricing` struct with input/output/cached/reasoning token pricing
- `CostCalculator` with default pricing for OpenAI, Anthropic, and Google models
- **2026 Models Supported:** GPT-5, GPT-5.2, GPT-5-mini, Claude Opus 4.5, Claude Sonnet 4.5, Gemini 3 Pro
- Database schema supports temporal pricing (effective_from/effective_until)
- Response enrichment adds Aura-specific metadata with agentic insights:
  ```json
  {
    "usage": { "cost_usd": 0.0035, ... },
    "metadata": {
      "aura": {
        "request_id": "aura_550e8400-...",
        "model": "gpt-4o",
        "provider": "openai",
        "gateway_version": "0.1.7",
        "latency_ms": 245,
        "agentic": {
          "output_items_count": 2,
          "has_tool_calls": true,
          "tool_calls_count": 1,
          "tools_used": ["web_search"],
          "requires_action": false,
          "has_reasoning": false
        }
      }
    }
  }
  ```

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
**Rust Concepts:** State management, ID generation, JSONB storage, async background tasks

**Status:** ✅ **COMPLETED** (January 23, 2026)

**Tasks:**
- [x] Implement `previous_response_id` handling
- [x] Store conversation context in database
- [x] Add `responses` table with JSONB for full Open Responses API data
- [x] Add conversation list endpoint (`GET /v1/conversations`)
- [x] Add conversation detail endpoint (`GET /v1/conversations/{id}`)
- [x] Add conversation delete endpoint (`DELETE /v1/conversations/{id}`)
- [x] Auto-create conversations from first user message
- [x] Link responses via `previous_response_id` chain
- [x] Save full responses and simplified messages
- [x] Non-blocking persistence with graceful degradation

**Implementation:**
- Created `responses` table storing complete Open Responses API objects as JSONB
- Auto-generates conversation titles from first ~100 chars of initial message
- Background tokio tasks for all database writes (non-blocking)
- Works without database (graceful degradation)
- Both streaming and non-streaming responses saved
- Full usage tracking (tokens, cost) persisted

**Files:**
- `migrations/20250124_003_add_responses_table.sql` ✅
- `migrations/20250125_004_fix_cost_usd_type.sql` ✅ (DOUBLE PRECISION fix)
- `crates/aura-db/src/models.rs` ✅ (ResponseRecord, NewResponse)
- `crates/aura-db/src/repo.rs` ✅ (ResponseRepo)
- `crates/aura-proxy/src/main.rs` ✅ (conversation helpers)
- `crates/aura-proxy/src/routes/responses.rs` ✅ (persistence logic)
- `crates/aura-proxy/src/routes/conversations.rs` ✅ (management endpoints)
- `docs/implementation-conversation-persistence.md` ✅ (full documentation)

**Acceptance Criteria:**
- ✅ Multi-turn conversations work correctly
- ✅ Context properly maintained via previous_response_id
- ✅ Conversation management API functional
- ✅ Full response objects stored in database
- ✅ Non-blocking persistence doesn't affect latency

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
**Status:** ✅ **COMPLETED** (API docs, architecture diagrams, landing page)

**Tasks:**
- [ ] API reference with OpenAPI
- [x] API documentation in Markdown (auto-loaded)
- [x] Architecture diagrams (Mermaid for repo, ASCII for public)
- [ ] Getting started guide
- [ ] Provider configuration docs
- [ ] Deployment guide
- [ ] SDK examples (curl, Python, Node.js)

**Files:**
- `docs/api/README.md` ✅ - API overview
- `docs/api/create-response.md` ✅ - Create response endpoint
- `docs/api/streaming.md` ✅ - SSE streaming documentation
- `docs/api/cost-tracking.md` ✅ - Cost tracking and agentic metadata
- `docs/api/architecture.md` ✅ - Architecture overview (public docs)
- `docs/architecture.md` ✅ - Detailed architecture with Mermaid diagrams
- `docs/design/pricing-scraper.md` ✅ - Pricing scraper design document
- `apps/landing/` ✅ - Landing page with docs viewer

**Architecture Diagrams (Mermaid):**
- System overview flowchart
- Crate dependency graph
- Non-streaming request sequence diagram
- Streaming request sequence diagram
- Provider system class diagram
- Database schema ER diagram
- Data flow summary with annotations
- Error handling flowchart

**Implementation Notes:**
- Created `apps/landing/` React app with landing page and docs viewer
- Docs auto-load from `docs/api/*.md` using Vite glob imports
- Edit MD files and rebuild - they automatically appear in the docs UI
- `react-markdown` + `remark-gfm` for rendering with custom styling
- Mermaid diagrams render natively on GitHub

**Acceptance Criteria:**
- ✅ API docs viewable in landing page
- ✅ Markdown files auto-loaded at build time
- ✅ Architecture diagrams in repo and public docs
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

**Status:** ✅ **COMPLETED** (Implemented early alongside PR #6)

**Tasks:**
- [x] Initialize `apps/chat/` with Vite + React + TypeScript
- [x] Add Tailwind CSS with dark mode support
- [x] Create base layout (sidebar, main chat area)
- [x] Add environment configuration for API endpoint
- [ ] Set up routing with React Router (optional - single page app)

**Files:**
- `apps/chat/` directory structure ✅
- `apps/chat/src/App.tsx` ✅
- `apps/chat/src/components/` ✅
- `apps/chat/tailwind.config.js` ✅
- `apps/chat/vite.config.ts` ✅

**Acceptance Criteria:**
- ✅ App builds and runs locally
- ✅ Dark/light mode support via CSS variables

**Implementation Notes:**
- Built with React 18 + Vite 5 + TypeScript
- Tailwind CSS with Aura brand colors (Violet/Indigo palette)
- CSS variable-based theming for light/dark modes
- Responsive sidebar layout

---

### PR #30: Chat Interface
**Status:** ✅ **COMPLETED** (Implemented early alongside PR #6, enhanced with tool cards and cost display)

**Tasks:**
- [x] Create message bubble components (user/assistant)
- [x] Add chat input with auto-resize textarea
- [x] Implement message list with auto-scroll
- [x] Add typing indicator during streaming
- [x] Support markdown rendering in responses
- [x] Add code syntax highlighting
- [x] Add tool execution cards with icons and styling
- [x] Display Aura gateway metadata (provider, latency, cost)
- [x] Show request_id for debugging

**Components:**
- `MessageBubble` - Single message display with markdown ✅
- `ChatInput` - Input area with send button ✅
- `ChatContainer` - Scrollable message container ✅
- `Header` - Model selector and controls ✅
- `Sidebar` - Conversation list ✅
- `WelcomeScreen` - Initial empty state ✅

**Enhanced Features:**
- Tool execution cards with tool-specific icons (Search, Calculator, Clock, Cloud)
- Color-coded tool cards by type (blue for search, green for calculate, etc.)
- Collapsible tool call details (arguments and results)
- Gateway metadata display (provider name, latency, cost per message)
- Request ID shown for debugging/tracing

**Acceptance Criteria:**
- ✅ Can send messages and see responses
- ✅ Streaming responses render progressively
- ✅ Code blocks render with syntax highlighting (react-syntax-highlighter)
- ✅ Tool executions displayed as visual cards
- ✅ Cost and metadata visible per message

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
**Tech Stack:** React + Vite + Tailwind (landing page with integrated docs)

**Status:** ✅ **COMPLETED** (Implemented as landing page with docs viewer)

**Tasks:**
- [x] Initialize `apps/landing/` with Vite + React + TypeScript
- [x] Configure Tailwind CSS with Aura branding
- [x] Set up navigation structure (sidebar with sections)
- [x] Add syntax highlighting for code blocks
- [x] Auto-load MD files from `docs/api/` using Vite glob imports
- [ ] Configure search (optional)

**Files:**
- `apps/landing/src/App.tsx` ✅ - Main app with routing
- `apps/landing/src/pages/DocsPage.tsx` ✅ - Docs viewer with sidebar
- `apps/landing/src/pages/LandingPage.tsx` ✅ - Marketing landing page

**Implementation Notes:**
- Landing page showcases gateway features with gradient hero section
- Docs viewer auto-loads markdown from `docs/api/*.md`
- Uses `react-markdown` + `remark-gfm` for GFM rendering
- Custom styled markdown components for dark theme
- Sidebar navigation with sections (Getting Started, API Reference, Concepts)
- Fallback content provided for docs not yet written

**Acceptance Criteria:**
- ✅ Docs site builds and deploys
- ✅ Navigation works correctly
- ✅ Markdown auto-loaded from files

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
