# Aura LLM Gateway

[![CI](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/ci.yml)
[![Python SDK](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/python-sdk.yml/badge.svg)](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/python-sdk.yml)
[![Security](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/security.yml/badge.svg)](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/security.yml)
[![Release](https://img.shields.io/github/v/release/UmaiTech/aura-llm-gateway?include_prereleases&label=release)](https://github.com/UmaiTech/aura-llm-gateway/releases)
[![Version](https://img.shields.io/badge/version-0.3.1-blue)](https://github.com/UmaiTech/aura-llm-gateway)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/rust-1.75%2B-orange.svg?logo=rust)](https://www.rust-lang.org)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED.svg?logo=docker&logoColor=white)](Dockerfile)
[![GitHub last commit](https://img.shields.io/github/last-commit/UmaiTech/aura-llm-gateway)](https://github.com/UmaiTech/aura-llm-gateway/commits/main)
[![GitHub issues](https://img.shields.io/github/issues/UmaiTech/aura-llm-gateway)](https://github.com/UmaiTech/aura-llm-gateway/issues)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/UmaiTech/aura-llm-gateway/pulls)

<p align="center">
  <img src="assets/logo-horizontal.svg" alt="Aura LLM Gateway" height="140"/>
</p>

A high-performance, production-ready LLM proxy gateway built in Rust that implements the [Open Responses API](https://www.openresponses.org/specification) specification for agentic workflows.

> [!WARNING]
> **Pre-1.0 software.** Aura is under active development. Public APIs, the
> database schema, and the configuration format may still change between
> minor releases (`0.x` → `0.y`) without a formal deprecation cycle. Pin to
> exact versions in production and review the [CHANGELOG](CHANGELOG.md)
> before upgrading. The API will stabilize at `1.0`.

## Overview

Aura LLM Gateway provides a unified interface to multiple LLM providers (OpenAI, Anthropic, Google, Mistral, Ollama, HuggingFace TGI, AWS Bedrock) with built-in load balancing, cost tracking, caching, and observability. It's designed for production deployments requiring high throughput, low latency, and enterprise-grade reliability.

### Key Features

- **7 LLM providers** behind one Open Responses API — OpenAI, Anthropic (Claude), Google (Gemini), Mistral, Ollama, HuggingFace TGI, AWS Bedrock
- **Prompt compression** — TOON, AISP, YAML, JSON strategies, 40–60% token savings on uniform arrays and nested objects
- **Smart routing & failover** — 8 strategies (round-robin, weighted, region-aware, cost-optimized) + circuit breaker
- **Cost tracking** — per-request USD on every response, with input/output/cached/reasoning token breakdown
- **Response validation** — logprobs, self-consistency, best-of-N, confidence thresholds to reduce hallucinations
- **Encrypted credentials** — AES-256-GCM envelope encryption for provider API keys
- **Multi-tenancy** — Organization → Team → Project → End-User hierarchy with scoped API keys
- **API key authentication** — bearer tokens, scopes, per-key rate limits
- **Response caching** — Redis-backed, SHA-256 keys, TTL configurable
- **Rate limiting** — per-key token bucket, monthly token budgets, retry-aware headers
- **Observability** — Prometheus `/metrics`, structured tracing, OpenAPI/Swagger
- **Streaming** — SSE with semantic Open Responses events end-to-end
- **High performance** — Rust + Axum + Tokio, single static binary, sub-10ms gateway overhead

## Architecture

```
aura-llm-gateway/
├── crates/
│   ├── aura-types/      # Shared type definitions (Open Responses API types)
│   ├── aura-db/         # Database models and queries (SQLx)
│   ├── aura-core/       # Core business logic (providers, routing, caching, compression)
│   └── aura-proxy/      # Main server binary (Axum routes, middleware)
├── sdks/
│   └── python/          # Python SDK (aura-llm on PyPI)
├── apps/
│   ├── admin/           # Admin dashboard (React)
│   ├── chat/            # Chat playground (React, deployed at /playground)
│   └── landing/         # Marketing landing + docs site (aura-llm.dev)
├── deploy/
│   └── charts/          # Helm chart for Kubernetes deployment
├── migrations/          # SQLx database migrations
└── docs/                # Contributor/operator docs (user docs live at docs.aura-llm.dev)
```

See [docs/architecture/overview.md](docs/architecture/overview.md) for detailed architecture diagrams.

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

#### Helm Chart (Kubernetes)

Deploy to any Kubernetes cluster with the official Helm chart:

```bash
helm install aura oci://ghcr.io/umaitech/charts/aura-llm-gateway \
  --version 0.1.0 \
  --namespace aura --create-namespace \
  --set secrets.inline.auraMasterKey="$(openssl rand -hex 32)" \
  --set secrets.inline.openaiApiKey="sk-..."
```

Full chart documentation: [`deploy/charts/aura-llm-gateway/README.md`](deploy/charts/aura-llm-gateway/README.md).

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

## Project status

Aura is pre-1.0 but actively used. Current line:

- **Shipping** — 7 providers, smart routing, prompt compression, multi-tenancy, cost tracking, encrypted credentials, response caching, rate limiting, Prometheus metrics, Python SDK on PyPI, Helm chart for k8s deploys
- **In progress** — TypeScript SDK, OpenTelemetry tracing, HF classic Inference API, additional Bedrock model families (Llama/Mistral/Titan), Mistral FIM completions
- **Considering** — webhook callbacks, semantic caching, A/B traffic splitting between models, hard budget caps

For the live roadmap with version-anchored detail, see **[roadmap.aura-llm.dev](https://roadmap.aura-llm.dev)**.

Historical PR-by-PR detail lives in [`docs/internal/implementation-plan.md`](docs/internal/implementation-plan.md).

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
    model="gpt-5.4-mini",
    input="What is the capital of France?"
)
print(response.output_text)

# Streaming
for event in client.responses.create(
    model="gpt-5.4-mini",
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

We welcome contributions! Please read these documents before getting started:

- [CONTRIBUTING.md](.github/CONTRIBUTING.md) — development setup, commit conventions, PR process
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community standards (Contributor Covenant 2.1)
- [CLAUDE.md](CLAUDE.md) — project conventions and architecture notes

We use [Conventional Commits](https://www.conventionalcommits.org/) for automated changelog generation and semantic versioning.

Example commit messages:
```bash
feat(provider): add OpenAI adapter
fix(auth): resolve API key validation issue
docs: update installation instructions
```

## Security

If you believe you have found a security issue, please **do not** open a public
GitHub issue. See [SECURITY.md](SECURITY.md) for our reporting process and
disclosure policy.

## License

MIT License — see [LICENSE](LICENSE) for the full text. By contributing to
this project you agree that your contributions will be licensed under the
same terms.

## Links

### Live sites
- [aura-llm.dev](https://aura-llm.dev) — marketing landing
- [docs.aura-llm.dev](https://docs.aura-llm.dev) — full user documentation
- [roadmap.aura-llm.dev](https://roadmap.aura-llm.dev) — current and planned work
- [playground.aura-llm.dev](https://playground.aura-llm.dev) — interactive chat playground

### Reference
- [Open Responses API Specification](https://www.openresponses.org/specification)
- [Python SDK on PyPI](https://pypi.org/project/aura-llm/)
- [Helm chart](deploy/charts/aura-llm-gateway/README.md)
- [Docker image (GHCR)](https://github.com/UmaiTech/aura-llm-gateway/pkgs/container/aura-llm-gateway)

### Repository docs
- [Contributor docs index](docs/README.md)
- [Architecture](docs/architecture/overview.md)
- [Provider mapping](docs/architecture/provider-mapping.md)
- [Deployment with Helm](docs/deployment/helm.md)
- [Deployment with Docker](docs/deployment/docker.md)
- [Implementation plan (historical)](docs/internal/implementation-plan.md)
