# Aura LLM Gateway

[![CI](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/ci.yml)
[![Python SDK](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/python-sdk.yml/badge.svg)](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/python-sdk.yml)
[![Security](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/security.yml/badge.svg)](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/security.yml)
[![dependencies](https://deps.rs/repo/github/UmaiTech/aura-llm-gateway/status.svg)](https://deps.rs/repo/github/UmaiTech/aura-llm-gateway)
[![PyPI](https://img.shields.io/pypi/v/aura-llm)](https://pypi.org/project/aura-llm/)
[![Release](https://img.shields.io/github/v/release/UmaiTech/aura-llm-gateway)](https://github.com/UmaiTech/aura-llm-gateway/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/rust-1.75%2B-blue.svg)](https://www.rust-lang.org)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](Dockerfile)

<p align="center">
  <img src="assets/logo-horizontal.svg" alt="Aura LLM Gateway" height="140"/>
</p>

A high-performance, production-ready LLM proxy gateway built in Rust that implements the [Open Responses API](https://www.openresponses.org/specification) specification for agentic workflows.

## Overview

Aura LLM Gateway provides a unified interface to multiple LLM providers (OpenAI, Anthropic, Google) with built-in load balancing, cost tracking, caching, and observability. It's designed for production deployments requiring high throughput, low latency, and enterprise-grade reliability.

### Key Features

- **Multi-Provider Support**: OpenAI, Anthropic (Claude), Google (Gemini)
- **Open Responses API**: Semantic streaming events for agentic workflows
- **API Key Authentication**: Secure API key management with scopes and rate limits
- **Hierarchical Organizations**: Organization → Teams → Projects with scoped API keys
- **End-User Cost Tracking**: Track costs per end-user for billing and allocation
- **Credential Encryption**: AES-256-GCM envelope encryption for provider credentials
- **Cost Tracking**: Real-time usage and cost monitoring per request
- **Agentic Metadata**: Tool call tracking, requires_action flags, reasoning status
- **Load Balancing**: Distribute requests across providers and API keys
- **Response Caching**: Redis-based caching with configurable TTL
- **Rate Limiting**: Per-key and per-user rate limits with burst support
- **Observability**: Prometheus metrics, structured logging, request tracing
- **High Performance**: Built in Rust with async I/O (Tokio + Axum)

## Architecture

```
aura-llm-gateway/
├── crates/
│   ├── aura-types/      # Shared type definitions (Open Responses API types)
│   ├── aura-db/         # Database models and queries (SQLx)
│   ├── aura-core/       # Core business logic (providers, routing, caching)
│   └── aura-proxy/      # Main server binary (Axum routes, middleware)
├── sdks/
│   └── python/          # Python SDK (aura-llm package)
├── apps/
│   ├── chat/            # React chat UI for testing the gateway
│   └── landing/         # Landing page and documentation site
├── migrations/          # SQLx database migrations
├── dashboard/           # React admin dashboard (coming soon)
└── docs/               # Documentation (with Mermaid diagrams)
```

See [docs/architecture.md](docs/architecture.md) for detailed architecture diagrams.

## Quick Start

### Prerequisites

- Rust 1.75+ (2021 edition)
- PostgreSQL 14+ (optional, for persistence)
- Redis 7+ (optional, for caching/rate limiting)
- Docker & Docker Compose (optional, for containerized deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/umaitech/aura-llm-gateway.git
cd aura-llm-gateway

# Build the project (this also installs git hooks automatically)
cargo build --release

# Run tests
cargo test --workspace

# Run the server
./target/release/aura-proxy
```

**Note:** The first `cargo build` automatically installs git hooks (via cargo-husky) that run:
- **Pre-commit**: Formatting and linting checks (lightweight - libs only)
- **Pre-push**: All tests

To skip hooks temporarily: `git commit --no-verify`

### Troubleshooting

**Pre-commit hook failing with build errors?**
```bash
# Clean and retry
cargo clean
git commit -m "your message"

# Or skip the hook temporarily
git commit --no-verify -m "your message"
```

### Configuration

Configuration can be provided via environment variables, YAML files, or both. Environment variables always take precedence over file configuration.

#### Environment Variables

```bash
# Server
export AURA_HOST=0.0.0.0
export AURA_PORT=8080

# Database (required for auth and persistence)
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/aura

# Master encryption key for provider credentials (required)
export AURA_MASTER_KEY=$(openssl rand -hex 32)

# Provider API Keys (at least one required)
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_API_KEY=...

# Optional - Redis for caching/rate limiting
export REDIS_URL=redis://localhost:6379

# Optional - Logging & Admin
export RUST_LOG=info,aura_proxy=debug
export AURA_ADMIN_KEY=your-admin-key
```

#### Set Up Database and Authentication

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Run migrations
make db-migrate

# Create an API key for making requests
./scripts/create_api_key.sh "my-first-key"
# Save the generated API key - you'll need it for authentication
```

#### YAML Configuration (Kubernetes/Helm)

For production deployments, use a YAML config file with secrets injected via environment variables:

```yaml
# config.yaml
server:
  host: "0.0.0.0"
  port: 8080

logging:
  level: "info"

# API keys injected via env vars from K8s Secrets
providers: {}
```

See [`config.example.yaml`](config.example.yaml) for a full example with all options documented.

## Development

### Using the Makefile

The project includes a comprehensive Makefile for common development tasks:

```bash
# Show all available commands
make help

# Run development server with auto-reload
make dev

# Run all CI checks locally (fmt, lint, test, build)
make ci

# Run tests
make test

# Run tests with coverage
make test-coverage

# Format and lint code
make fmt
make lint

# Build release binary
make release

# Clean build artifacts
make clean

# Install development tools
make install
```

### Manual Commands

If you prefer using cargo directly:

```bash
# Build all crates
cargo build

# Build optimized release binary
cargo build --release

# Run specific crate
cargo run -p aura-proxy

# Run with debug logging
RUST_LOG=debug cargo run -p aura-proxy
```

### Testing

```bash
# Run all tests
make test
# or: cargo test

# Test specific crate
cargo test -p aura-core

# Generate coverage report
make test-coverage

# Show test output
cargo test -- --nocapture
```

### Code Quality

```bash
# Run all checks (like CI)
make check

# Lint all crates
make lint
# or: cargo clippy --workspace

# Auto-fix lint issues
make lint-fix

# Format code
make fmt

# Check formatting
make fmt-check
```

### Docker

For containerized development and deployment:

```bash
# Start only dependencies (for local development with cargo run)
make docker-deps
# or: docker compose up postgres redis -d

# Start all services (PostgreSQL, Redis, and the gateway)
make docker-compose-up

# View logs
make docker-compose-logs

# Stop all services
make docker-compose-down

# Build Docker image only
make docker-build
```

The `docker-compose.yml` includes:
- **aura-proxy**: The LLM gateway service
- **postgres**: PostgreSQL 16 database for persistence
- **redis**: Redis 7 for caching and rate limiting

## Project Status

**Current Phase**: Developer Experience & Advanced Features (Milestone 8 & 6) 🔄

### Completed
- [x] **PR #1: Project Scaffolding** - Cargo workspace with 4 crates
- [x] **PR #2: Configuration System** - Environment + YAML config with validation
- [x] **PR #3: Open Responses API Types** - Full type system with 60+ tests
- [x] **PR #4: Basic Axum Server** - Health endpoint, tracing middleware
- [x] **PR #5: HTTP Client Foundation** - Reqwest with retries and timeouts
- [x] **PR #6: OpenAI Adapter** - Provider trait + OpenAI implementation
- [x] **PR #7: Streaming Support** - SSE streaming with semantic events
- [x] **PR #9: Claude Adapter** - Full Anthropic provider with streaming and tool support
- [x] **PR #10: Gemini Adapter** - Full Google Gemini provider with streaming and function calling
- [x] **PR #13: API Key Authentication** - Bearer token auth with scopes and rate limits
- [x] **PR #14: PostgreSQL Setup** - Database schema, models, AppState integration
- [x] **PR #15: Request Logging** - Async logging to database
- [x] **PR #16: Cost Tracking** - Per-request cost calculation with agentic metadata
- [x] **PR #21: Conversation Threading** - Stateful conversations with previous_response_id
- [x] **PR #28: Documentation** - API docs, architecture diagrams (Mermaid)
- [x] **PR #35-36: Python SDK** - Full-featured client with sync/async, streaming, typed events
- [x] **PR #54: Organization Model** - Hierarchical org → teams → projects structure
- [x] **Credential Encryption** - AES-256-GCM envelope encryption for provider API keys
- [x] **End-User Tracking** - Per-user cost allocation with upsert on API requests
- [x] **PR #17: Prometheus Metrics** - `/metrics` endpoint with request/token/cost metrics
- [x] **PR #19: Rate Limiting** - Redis-backed token bucket with per-key limits
- [x] **PR #20: Response Caching** - TTL-based caching with SHA256 cache keys

### In Progress
- 🔄 **PR #37-38: TypeScript SDK** - Coming soon
- 🔄 **Admin Dashboard** - React admin UI for key and org management

### Planned Providers
- 📋 **AWS Bedrock** - Claude, Llama, Titan models via Bedrock
- 📋 **Mistral** - Mistral Large, Medium, Codestral
- 📋 **Ollama** - Local models (Llama, Mistral, etc.)
- 📋 **HuggingFace** - Inference API and Endpoints

### Bonus (Implemented Early)
- [x] **Chat UI** - React chat app with tool execution cards
- [x] **Landing Page** - Marketing site with integrated docs viewer
- [x] **Agent Mode** - Built-in tools with Tavily web search integration
- [x] **Agentic Metadata** - Tool call tracking, requires_action, reasoning status
- [x] **2026 Model Pricing** - GPT-5, Claude 4.5, Gemini 3 supported

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for the complete roadmap.

## Chat UI

A modern chat interface is included for testing and demonstrating the gateway:

```bash
cd apps/chat
npm install
npm run dev
```

Features:
- Multi-model support (OpenAI, Anthropic, Google)
- Streaming responses with real-time updates
- Conversation history with localStorage persistence
- Agent mode with built-in tools (web search, calculator, etc.)
- Dark/light mode

See [apps/chat/README.md](apps/chat/README.md) for detailed documentation.

## SDKs

Official client SDKs for the Aura LLM Gateway:

### Python SDK

[![PyPI](https://img.shields.io/pypi/v/aura-llm)](https://pypi.org/project/aura-llm/)
[![Python](https://img.shields.io/pypi/pyversions/aura-llm)](https://pypi.org/project/aura-llm/)

```bash
# Install with uv (recommended)
uv add aura-llm

# Or with pip
pip install aura-llm
```

```python
from aura import AuraClient

client = AuraClient(base_url="http://localhost:8080")

# Simple completion
response = client.responses.create(
    model="gpt-4o",
    input="What is the capital of France?"
)
print(response.output_text)

# Streaming
for event in client.responses.create(
    model="gpt-4o",
    input="Tell me a story",
    stream=True
):
    if event.type == "response.output_text.delta":
        print(event.delta, end="")
```

Features:
- Sync and async clients (`AuraClient`, `AsyncAuraClient`)
- Full streaming support with typed events
- Conversation threading via `previous_response_id`
- Tool/function calling support
- Comprehensive error handling

See [sdks/python/README.md](sdks/python/README.md) for full documentation.

### TypeScript SDK (Coming Soon)

The TypeScript/JavaScript SDK is planned for a future release.

## Tech Stack

- **Language**: Rust (2021 edition)
- **Web Framework**: Axum
- **Database**: PostgreSQL (SQLx), Redis
- **Async Runtime**: Tokio
- **Serialization**: Serde
- **Error Handling**: thiserror, anyhow
- **Logging**: tracing
- **HTTP Client**: reqwest

## Contributing

We use [Conventional Commits](https://www.conventionalcommits.org/) for automated changelog generation and semantic versioning.

Example commit messages:
```bash
feat(provider): add OpenAI adapter
fix(auth): resolve API key validation issue
docs: update installation instructions
```

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for detailed contribution guidelines and [CLAUDE.md](CLAUDE.md) for development conventions.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [Open Responses API Specification](https://www.openresponses.org/specification)
- [Python SDK Documentation](sdks/python/README.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Admin App Plan](docs/ADMIN_APP_PLAN.md)
- [Chat UI Documentation](apps/chat/README.md)
- [Provider Mapping Guide](docs/PROVIDER_MAPPING.md)
- [Documentation](docs/)
