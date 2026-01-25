# Aura LLM Gateway - Implementation Plan

A PR-by-PR roadmap for building the Aura LLM Gateway, designed for incremental Rust learning.

## Current Status (January 2026)

**Project Phase:** Multi-Tenancy & Production Readiness

**Recently Completed:**
- ✅ **Hierarchical Organization Model** (January 26, 2026) - Full multi-tenant support
  - Organization → Teams → Projects hierarchy
  - Scoped API keys (org, team, project, user level)
  - End-user cost tracking with upserts
  - Database migrations for all new tables
  - See: [`migrations/20250127_006_hierarchical_org_and_end_users.sql`](../migrations/)

- ✅ **Claude/Anthropic Adapter** (January 26, 2026) - Full Anthropic provider implementation
  - Streaming with SSE event transformation
  - Tool/function calling support
  - Thinking blocks as Item::Reasoning
  - All models: Claude Opus 4.5, Sonnet 4.5, Haiku, etc.

- ✅ **Google Gemini Adapter** (January 25, 2026) - Full Google Gemini provider implementation
  - Non-streaming and streaming via generateContent API
  - Role mapping (assistant → "model", system → system_instruction)
  - Function calling with functionDeclarations format
  - Multi-modal content (images, audio support)
  - Safety and content filter handling
  - All models: Gemini 1.5, 2.0, 2.5, 3.x families

- ✅ **API Key Authentication** (January 26, 2026) - Complete auth system
  - Bearer token authentication middleware
  - API key generation with secure hashing (SHA-256)
  - Scopes, rate limits, monthly token budgets
  - Key management endpoints (create, list, revoke)

- ✅ **Credential Encryption** (January 26, 2026) - Secure credential storage
  - AES-256-GCM envelope encryption
  - Per-credential DEK wrapped with master key
  - Secure storage in PostgreSQL

- ✅ **Python SDK** (January 24, 2026) - Full-featured Python client library
  - Package: `aura-llm` on PyPI
  - Features: Sync/async clients, streaming, tool calling, typed events
  - CI: GitHub Actions with UV, tests Python 3.10-3.13
  - Docs: API documentation with SDK examples
  - See: [`sdks/python/`](../sdks/python/) and [`docs/api/sdks.md`](./api/sdks.md)

- ✅ **Conversation Persistence** (January 23, 2026) - Full stateful conversation support with threading
  - See: [`docs/implementation-conversation-persistence.md`](./implementation-conversation-persistence.md)
  - Database schema: conversations, responses, messages tables
  - REST API: Conversation management endpoints
  - Features: Auto-creation, threading, usage tracking, cost calculation

**Active Milestones:**
- M1-M4: Foundation, Single Provider, Multi-Provider, Persistence ✅ **COMPLETE**
- M5: Production Readiness ✅ **COMPLETE** (Prometheus metrics, Redis rate limiting, response caching)
- M7: Chat Demo App ✅ **COMPLETE**
- M8: SDKs - Python SDK ✅ **COMPLETE**, TypeScript SDK pending
- M12: User & Team Management ✅ **LARGELY COMPLETE** (Org model, API keys, end-users)

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

| Milestone | PRs | Outcome | Status |
|-----------|-----|---------|--------|
| **M7: Chat Demo App** | PR 29-33 | ChatGPT-like demo UI for testing | ✅ Complete |
| **M8: SDKs** | PR 34-39 | Python and TypeScript client libraries | 🔄 Python ✅ |
| **M9: API Docs Website** | PR 40-43 | Beautiful, interactive API documentation | 🔄 In Progress |

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
- Health endpoint returns JSON: `{"status":"ok","service":"aura-llm-gateway","version":"...","timestamp":"..."}`
- Graceful shutdown handles both Ctrl+C and SIGTERM signals
- AppState holds Arc<Config> for shared state across handlers
- 1 passing integration test for health endpoint
- Health check uses `tracing::debug!` to reduce log noise from probes

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

**Status:** ✅ **COMPLETED** (January 26, 2026)

**Tasks:**
- [x] Implement `AnthropicProvider` struct
- [x] Handle Claude's message format differences (system at top level)
- [x] Support system prompts as separate field (not in messages)
- [x] Transform streaming format (message_start, content_block_delta, etc.)
- [x] Handle `thinking` blocks as Item::Reasoning
- [x] Add provider-specific configuration

**Files:**
- `crates/aura-core/src/provider/anthropic.rs` ✅ (~900 lines)

**Acceptance Criteria:**
- ✅ Can proxy requests to Claude API
- ✅ Streaming works correctly with SSE transformation
- ✅ Extended thinking exposed as reasoning items
- ✅ Tool/function calling fully supported
- ✅ All Claude models: Opus 4.5, Sonnet 4.5, Haiku, etc.

**Implementation Notes:**
- Full Anthropic Messages API implementation
- Transforms Open Responses API ↔ Anthropic format
- Supports multimodal content (images)
- Handles content blocks: text, tool_use, tool_result
- Maps `user` field to Anthropic's `metadata.user_id`

---

### PR #10: Gemini Adapter
**Rust Concepts:** Reinforcing patterns, handling edge cases

**Reference:** See `docs/PROVIDER_MAPPING.md` for detailed Google/Gemini type mappings.

**Status:** ✅ **COMPLETED** (January 25, 2026)

**Tasks:**
- [x] Implement `GeminiProvider` struct
- [x] Handle Gemini's `contents` array format
- [x] Map roles correctly (user/model instead of user/assistant)
- [x] Handle system_instruction as separate field
- [x] Support Gemini-specific parameters
- [x] Handle safety settings and content filtering

**Files:**
- `crates/aura-core/src/provider/gemini.rs` ✅ (~1100 lines)

**Acceptance Criteria:**
- ✅ Can proxy requests to Gemini API
- ✅ Safety filter responses handled gracefully (SAFETY, RECITATION → ContentFilter)
- ✅ Role mapping works correctly (assistant → "model")

**Implementation Notes:**
- Full Gemini GenerateContent API implementation
- Transforms Open Responses API ↔ Gemini format
- Supports multimodal content (images via inlineData, audio)
- Streaming via streamGenerateContent with SSE
- Function calling with functionDeclarations format
- System prompt via separate system_instruction field
- All Gemini models: 1.5-pro, 1.5-flash, 2.0-flash, 2.5-pro, 3-pro, etc.
- 9 unit tests for request transformation and error handling

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

**Status:** ✅ **COMPLETED** (January 26, 2026)

**Tasks:**
- [x] Create `ApiKey` extractor
- [x] Add authentication middleware
- [x] Support `Authorization: Bearer` header
- [x] In-memory key validation (database-backed)
- [x] Add key CRUD endpoints (create, list, revoke, delete)
- [x] Implement scopes and rate limits per key

**Files:**
- `crates/aura-proxy/src/routes/auth.rs` ✅ (~480 lines)
- `crates/aura-core/src/crypto.rs` ✅ (~450 lines)
- `crates/aura-db/src/models.rs` ✅ (ApiKey, NewApiKey)
- `crates/aura-db/src/repo.rs` ✅ (ApiKeyRepo)
- `migrations/20250126_005_api_keys_and_credentials.sql` ✅

**Acceptance Criteria:**
- ✅ Requests without valid key get 401
- ✅ Valid keys pass through to handlers with AuthContext
- ✅ API key CRUD via REST endpoints
- ✅ Secure key storage with SHA-256 hashing

**Implementation Notes:**
- API keys use format: `aura_live_<random>` or `aura_test_<random>`
- Keys hashed with SHA-256, never stored in plaintext
- Scopes stored as JSON array (e.g., `["responses:create"]`)
- Rate limits and monthly token budgets per key
- Key expiration support
- AuthContext added to request extensions for handlers

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

**Status:** ✅ **COMPLETED** (January 2026)

**Tasks:**
- [x] Add `metrics` and `metrics-exporter-prometheus`
- [x] Track request latency histogram
- [x] Track requests by provider/model
- [x] Track token usage
- [x] Add `/metrics` endpoint

**Files:**
- `crates/aura-core/src/metrics.rs` ✅ (~280 lines)
- `crates/aura-proxy/src/routes/metrics.rs` ✅ (~72 lines)

**Metrics Implemented:**
- `aura_requests_total` - Counter with provider, model, stream labels
- `aura_request_duration_seconds` - Histogram with provider, model, status labels
- `aura_input_tokens_total` - Counter for input tokens
- `aura_output_tokens_total` - Counter for output tokens
- `aura_cached_tokens_total` - Counter for cached tokens
- `aura_reasoning_tokens_total` - Counter for reasoning tokens
- `aura_cost_usd_total` - Counter for cost tracking
- `aura_cache_hits_total` / `aura_cache_misses_total` - Cache statistics
- `aura_rate_limit_exceeded_total` - Rate limit events

**Acceptance Criteria:**
- ✅ Metrics endpoint returns Prometheus format
- ✅ All request/response metrics tracked
- ✅ Grafana-compatible scraping via `/metrics`

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

**Status:** ✅ **COMPLETED** (January 2026)

**Tasks:**
- [x] Add Redis connection to `AppState`
- [x] Implement token bucket algorithm
- [x] Rate limit by API key
- [x] Add rate limit headers
- [x] Support burst allowance
- [x] Monthly token budget tracking

**Files:**
- `crates/aura-core/src/redis.rs` ✅ (~106 lines) - Redis connection pool
- `crates/aura-core/src/rate_limit.rs` ✅ (~341 lines) - Token bucket with Lua scripts
- `crates/aura-proxy/src/routes/rate_limit.rs` ✅ (~185 lines) - Middleware

**Headers Implemented:**
- `X-RateLimit-Limit` - Requests per minute allowed
- `X-RateLimit-Remaining` - Requests remaining in window
- `X-RateLimit-Reset` - Seconds until window resets

**Implementation Notes:**
- Atomic Lua scripts for Redis operations (thread-safe)
- Per-API key rate limiting with configurable RPM
- Monthly token budget tracking per key
- Graceful degradation when Redis unavailable

**Acceptance Criteria:**
- ✅ Excessive requests get 429
- ✅ Rate limits configurable per key
- ✅ Headers included on all responses

---

### PR #20: Response Caching
**Rust Concepts:** Cache keys, TTL, Redis commands

**Status:** ✅ **COMPLETED** (January 2026)

**Tasks:**
- [x] Hash request for cache key (SHA256)
- [x] Cache responses with TTL
- [x] Support cache bypass header (`X-Cache-Control: no-cache`)
- [x] Add cache hit/miss metrics
- [x] Configure per-model TTL
- [x] Auto-skip caching for streaming/high-temperature requests

**Files:**
- `crates/aura-core/src/cache.rs` ✅ (~583 lines) - Response caching with TTL

**Implementation Notes:**
- SHA256 hash-based cache keys from request content
- Configurable default TTL (default: 1 hour)
- Automatic skip for streaming requests
- Automatic skip for temperature > 0 (non-deterministic)
- Cache bypass via `X-Cache-Control: no-cache` header
- Cache hit/miss metrics integration

**Acceptance Criteria:**
- ✅ Identical requests return cached response
- ✅ Cache bypass via header
- ✅ Streaming requests not cached
- ✅ High-temperature requests not cached

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

**Status:** ✅ **COMPLETED** (January 2026)

**Tasks:**
- [x] Create optimized Dockerfile with multi-stage build
- [x] Use cargo-chef for efficient layer caching
- [ ] Add docker-compose for local dev
- [ ] Include PostgreSQL and Redis
- [x] Add health check in container (HEALTHCHECK directive)
- [x] Document environment variables

**Files:**
- `Dockerfile` ✅

**Implementation Notes:**
- Multi-stage build: chef → planner → builder → runtime
- Uses `rust:1.85-slim-bookworm` for edition2024 support
- Runtime image based on `debian:bookworm-slim` with minimal dependencies
- HEALTHCHECK enabled using wget to poll `/health` endpoint
- Non-root user (`aura`) for security
- Binary stripped in build stage for smaller image

**Acceptance Criteria:**
- ✅ Dockerfile builds successfully for linux/amd64 and linux/arm64
- ✅ Health check configured for container orchestration
- [ ] `docker-compose up` starts full stack (pending)
- [ ] Container is < 100MB (pending verification)

---

### PR #23: Health Checks & Readiness
**Rust Concepts:** Background health polling, circuit breakers

**Status:** 🔄 **PARTIALLY COMPLETE** (January 2026)

**Tasks:**
- [x] Add `/health` endpoint with JSON response
- [ ] Add `/health/live` endpoint (liveness probe)
- [ ] Add `/health/ready` endpoint (readiness probe)
- [ ] Check database connectivity
- [ ] Check Redis connectivity
- [ ] Check provider health

**Implementation Notes:**
- Basic `/health` endpoint returns: status, service name, version, timestamp
- Uses `tracing::debug!` to avoid log spam from orchestration probes
- Docker HEALTHCHECK configured to use this endpoint
- Response format:
  ```json
  {
    "status": "ok",
    "service": "aura-llm-gateway",
    "version": "0.2.5",
    "timestamp": "2026-01-25T21:30:00Z"
  }
  ```

**Acceptance Criteria:**
- ✅ Basic health check works for Docker/Kubernetes
- [ ] Separate liveness vs readiness probes
- [ ] Unhealthy providers marked unavailable

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
**Status:** ✅ **COMPLETED** (Design implemented directly in PR #35)

**Tasks:**
- [x] Design unified SDK interface
- [x] Define common types (Request, Response, StreamEvent)
- [x] Plan error handling strategy
- [x] Design authentication patterns

**Acceptance Criteria:**
- ✅ Clear API design documented
- ✅ Consistent patterns across languages

---

### PR #35: Python SDK Foundation
**Tech Stack:** Python 3.10+, httpx, pydantic v2

**Status:** ✅ **COMPLETED** (January 24, 2026)

**Tasks:**
- [x] Initialize `sdks/python/` with UV (PEP 735 dependency groups)
- [x] Create `aura` package structure
- [x] Implement `AuraClient` class (sync)
- [x] Add Pydantic v2 models for types
- [x] Set up pytest with coverage

**Files:**
```
sdks/python/
├── pyproject.toml          # UV + hatchling build
├── src/aura/
│   ├── __init__.py
│   ├── client.py           # Sync client
│   ├── _async_client.py    # Async client
│   ├── types.py            # Pydantic models
│   └── exceptions.py       # Typed exceptions
├── tests/
│   ├── test_client.py
│   ├── test_async_client.py
│   └── test_streaming.py
└── examples/
    ├── basic_usage.py
    ├── streaming.py
    └── async_example.py
```

**Key Code:**
```python
from aura import AuraClient

client = AuraClient(base_url="http://localhost:8080")
response = client.responses.create(
    model="gpt-4o",
    input="What is 2 + 2?"
)
print(response.output_text)  # "2 + 2 equals 4."
print(response.usage.cost_usd)  # 0.0000048
```

**Acceptance Criteria:**
- ✅ Basic sync client works
- ✅ Types provide autocomplete
- ✅ Pydantic v2 validation

**Implementation Notes:**
- Uses modern Python 3.10+ syntax (`X | None` instead of `Optional[X]`)
- Dropped Python 3.9 support for cleaner type annotations
- Full Pydantic v2 models for request/response types
- Comprehensive exception hierarchy (AuraError, AuraAPIError, etc.)

---

### PR #36: Python SDK Streaming & Async
**Status:** ✅ **COMPLETED** (January 24, 2026)

**Tasks:**
- [x] Add async client with `httpx.AsyncClient`
- [x] Implement streaming with async generators
- [x] Add context manager support
- [x] Implement retry logic with backoff
- [x] Add timeout configuration
- [x] Set up CI with GitHub Actions (UV-based)

**Key Code:**
```python
from aura import AsyncAuraClient

async with AsyncAuraClient() as client:
    stream = await client.responses.create(
        model="gpt-4o",
        input="Tell me a story",
        stream=True
    )
    async for event in stream:
        if event.type == "response.output_text.delta":
            print(event.delta, end="")
```

**CI Configuration:**
- GitHub Actions workflow at `.github/workflows/python-sdk.yml`
- Jobs: lint (ruff), typecheck (mypy), test (Python 3.10-3.13), coverage, build
- Uses `uv` for fast dependency management
- Package verification with `uv tool run twine`

**Acceptance Criteria:**
- ✅ Async operations work
- ✅ Streaming yields events progressively
- ✅ CI passes on Python 3.10-3.13
- ✅ Package builds correctly

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
**Status:** 🔄 **PARTIALLY COMPLETE** (Python docs done, publishing pending)

**Tasks:**
- [ ] Set up PyPI publishing workflow (manual for now)
- [ ] Set up npm publishing workflow
- [x] Write README for Python SDK
- [x] Add usage examples (basic, streaming, async)
- [x] Add SDK documentation to API docs (`docs/api/sdks.md`)
- [x] Update API docs with SDK code examples

**Files:**
- `sdks/python/README.md` ✅
- `sdks/python/examples/*.py` ✅
- `docs/api/sdks.md` ✅
- `docs/api/create-response.md` ✅ (SDK examples added)
- `docs/api/streaming.md` ✅ (SDK examples added)

**Acceptance Criteria:**
- ✅ Python SDK documented with examples
- [ ] SDKs published to package registries (pending)
- [ ] TypeScript SDK documentation (pending)

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

### PR #43b: Documentation Improvements
**Status:** 🔄 **PLANNED**

**Infrastructure Tasks:**
- [ ] Migrate landing page docs from Markdown to MDX
  - Add `@mdx-js/react` and `@mdx-js/rollup` to landing page
  - Convert `.md` files to `.mdx` for JSX component support
  - Enable interactive code examples with live preview
  - Add custom MDX components (Callout, CodeGroup, Tabs)

**Missing Documentation:**
- [x] Conversation threading guide (`previous_response_id` usage) ✅
- [x] Provider credentials guide (storing org-specific API keys) ✅
- [x] Deployment guide (Docker, Kubernetes, production setup) ✅
- [x] Error reference (complete error codes and troubleshooting) ✅
- [ ] Rate limiting guide (per-key, per-user limits)
- [ ] Webhooks guide (when implemented)

**Landing Page Additions:**
- [x] Organizations & End-Users guide ✅ (January 2026)
- [x] Authentication guide ✅ (January 2026)
- [x] Conversations guide ✅ (January 2026)
- [x] Provider Credentials guide ✅ (January 2026)
- [x] Deployment guide ✅ (January 2026)
- [x] Error Reference ✅ (January 2026)
- [x] Providers section navigation (_meta.json) ✅
- [x] Concepts section navigation (_meta.json) ✅

**Technical Writing:**
- [ ] Add API examples for all endpoints
- [ ] Include Python and TypeScript SDK examples side-by-side
- [ ] Add troubleshooting sections to each guide
- [ ] Create FAQ page

**Acceptance Criteria:**
- All features documented with examples
- MDX enables interactive components
- Documentation covers full user journey

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

**Status:** ✅ **LARGELY COMPLETE** (Database models and repos implemented)

### PR #53: User Model
**Status:** 🔄 **PARTIAL** (User fields exist on API keys, full user auth pending)

**Tasks:**
- [ ] Create users table
- [ ] Add user authentication (email/password)
- [ ] Implement JWT token generation
- [ ] Add password reset flow
- [ ] Support OAuth providers (Google, GitHub)

**Tables:**
- `users` - User accounts (pending)
- `sessions` - Active sessions (pending)
- `password_resets` - Reset tokens (pending)

**Acceptance Criteria:**
- Users can sign up and log in
- JWT authentication works

---

### PR #54: Organization Model
**Status:** ✅ **COMPLETED** (January 26, 2026)

**Tasks:**
- [x] Create organizations table
- [x] Add organization membership (organization_members)
- [x] Implement roles (owner, admin, member)
- [x] Organization-level API keys
- [x] Create teams table (subdivisions of orgs)
- [x] Create projects table (subdivisions of teams)
- [x] Scoped API keys (org/team/project/user)
- [ ] Invitation system (pending)

**Tables:**
- `organizations` ✅ - Organization accounts
- `organization_members` ✅ - User-org relationships with roles
- `teams` ✅ - Departments/products within orgs
- `team_members` ✅ - Team membership
- `projects` ✅ - Initiatives within teams
- `end_users` ✅ - Consumer/client tracking
- `provider_credentials` ✅ - Encrypted provider API keys

**Files:**
- `migrations/20250126_005_api_keys_and_credentials.sql` ✅
- `migrations/20250127_006_hierarchical_org_and_end_users.sql` ✅
- `crates/aura-db/src/models.rs` ✅ (Organization, Team, Project, EndUser)
- `crates/aura-db/src/repo.rs` ✅ (All repos)

**Acceptance Criteria:**
- ✅ Organizations with owner and members
- ✅ Teams within organizations
- ✅ Projects within teams
- ✅ Scoped API keys at any level
- ✅ End-user cost tracking

---

### PR #55: Role-Based Access Control
**Status:** 🔄 **PARTIAL** (Roles defined, enforcement pending)

**Tasks:**
- [x] Define permission system (scopes on API keys)
- [x] Implement role hierarchy (owner > admin > member)
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
**Status:** ✅ **COMPLETED** (January 26, 2026)

**Tasks:**
- [x] Per-API-key token limits (monthly_token_limit)
- [x] Per-organization spending tracking
- [x] Per-team token budgets
- [x] Per-project token budgets
- [x] Per-end-user limits and blocking
- [ ] Overage notifications
- [ ] Usage alerts

**Implementation:**
- API keys have `monthly_token_limit` and `current_month_tokens`
- Teams and projects have their own token budgets
- End users can be rate-limited or blocked
- Automatic monthly reset via `usage_reset_month`

**Acceptance Criteria:**
- ✅ Can set spending caps at all levels
- ✅ End users can be blocked
- [ ] Users notified before hitting limits (pending)

---

### PR #57: Team Management Dashboard
**Status:** 🔄 **PENDING**

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

### PR #58: AWS Bedrock Adapter
**Reference:** See `docs/PROVIDER_MAPPING.md` for detailed AWS Bedrock type mappings.

**Tasks:**
- [ ] Implement `BedrockProvider` struct
- [ ] Handle AWS SigV4 authentication
- [ ] Support Bedrock's InvokeModel/InvokeModelWithResponseStream APIs
- [ ] Map to Bedrock's Claude models (anthropic.claude-3-*)
- [ ] Map to Bedrock's Llama models (meta.llama3-*)
- [ ] Map to Bedrock's Titan models (amazon.titan-*)
- [ ] Handle Bedrock-specific error codes
- [ ] Support cross-region inference

**Models:**
- `anthropic.claude-3-5-sonnet`, `anthropic.claude-3-haiku`
- `meta.llama3-1-405b-instruct`, `meta.llama3-1-70b-instruct`
- `amazon.titan-text-express`, `amazon.titan-text-premier`
- `cohere.command-r-plus`, `mistral.mistral-large`

**Acceptance Criteria:**
- Can proxy to AWS Bedrock with IAM/STS credentials
- Streaming works with InvokeModelWithResponseStream
- Multiple model families supported

---

### PR #59: Mistral Adapter
**Reference:** See `docs/PROVIDER_MAPPING.md` for detailed Mistral type mappings.

**Tasks:**
- [ ] Implement `MistralProvider` struct
- [ ] Handle Mistral Chat Completion API format
- [ ] Support function calling (similar to OpenAI)
- [ ] Add Mistral-specific parameters (safe_prompt)
- [ ] Handle JSON mode and structured outputs
- [ ] Support Codestral for code generation

**Models:**
- `mistral-large-latest`, `mistral-medium-latest`, `mistral-small-latest`
- `open-mistral-7b`, `open-mixtral-8x7b`, `open-mixtral-8x22b`
- `codestral-latest`, `codestral-mamba-latest`

**Acceptance Criteria:**
- Full Mistral API support
- Function calling works
- Code generation with Codestral

---

### PR #60: Ollama Adapter (Local Models)
**Reference:** See `docs/PROVIDER_MAPPING.md` for detailed Ollama type mappings.

**Tasks:**
- [ ] Implement `OllamaProvider` struct
- [ ] Support Ollama OpenAI-compatible API (/v1/chat/completions)
- [ ] Auto-discover available local models via /api/tags
- [ ] Handle Ollama-specific parameters (num_ctx, num_gpu, etc.)
- [ ] Support model pulling via /api/pull
- [ ] Graceful fallback when Ollama not running

**Models:**
- `llama3.2`, `llama3.1`, `llama3`
- `mistral`, `mixtral`
- `codellama`, `deepseek-coder`
- `qwen2.5`, `phi3`
- Any model available in Ollama library

**Acceptance Criteria:**
- Can proxy to local Ollama instance
- Zero-config for local development (auto-detect http://localhost:11434)
- Model discovery works

---

### PR #61: HuggingFace Adapter
**Tasks:**
- [ ] Implement `HuggingFaceProvider` struct
- [ ] Support Inference API (serverless)
- [ ] Support Inference Endpoints (dedicated)
- [ ] Handle model-specific parameters
- [ ] Add popular model presets
- [ ] Support Text Generation Inference (TGI) format

**Models:**
- `meta-llama/Meta-Llama-3-70B-Instruct`
- `mistralai/Mistral-7B-Instruct-v0.2`
- `google/gemma-2-9b-it`
- Any model on HuggingFace Hub

**Acceptance Criteria:**
- Can proxy to HuggingFace models
- Streaming works correctly
- Both Inference API and Endpoints supported

---

### PR #62: Cohere Adapter
**Tasks:**
- [ ] Implement `CohereProvider` struct
- [ ] Handle Command R/R+ models
- [ ] Support Cohere Chat API format
- [ ] Handle connectors for RAG
- [ ] Support embeddings endpoint (future)

**Models:**
- `command-r-plus`, `command-r`, `command`
- `command-light`, `command-nightly`

**Acceptance Criteria:**
- Can proxy to Cohere
- RAG connectors work
- Streaming with Command R

---

### PR #63: Provider Management Dashboard
**Tasks:**
- [ ] Provider configuration UI
- [ ] API key management per provider
- [ ] Provider health status
- [ ] Enable/disable providers
- [ ] Custom endpoint configuration
- [ ] Model alias configuration

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
