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
  aura-core/      # Core business logic (providers, routing, caching)
  aura-proxy/     # Main server binary (Axum routes, middleware)
  aura-db/        # Database models and queries (SQLx)
/dashboard/       # React admin dashboard
/docs/            # Documentation
/migrations/      # SQLx database migrations
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
