# Aura LLM Gateway

[![CI](https://github.com/UmaiTech/aura-llm-gateway/workflows/CI/badge.svg)](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/ci.yml)
[![Security Audit](https://github.com/UmaiTech/aura-llm-gateway/workflows/Security%20Audit/badge.svg)](https://github.com/UmaiTech/aura-llm-gateway/actions/workflows/security.yml)
[![Release](https://img.shields.io/github/v/release/UmaiTech/aura-llm-gateway)](https://github.com/UmaiTech/aura-llm-gateway/releases)
[![codecov](https://codecov.io/gh/UmaiTech/aura-llm-gateway/branch/main/graph/badge.svg)](https://codecov.io/gh/UmaiTech/aura-llm-gateway)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Rust Version](https://img.shields.io/badge/rust-1.70%2B-blue.svg)](https://www.rust-lang.org)

A high-performance, production-ready LLM proxy gateway built in Rust that implements the [Open Responses API](https://www.openresponses.org/specification) specification for agentic workflows.

## Overview

Aura LLM Gateway provides a unified interface to multiple LLM providers (OpenAI, Anthropic, Google) with built-in load balancing, cost tracking, caching, and observability. It's designed for production deployments requiring high throughput, low latency, and enterprise-grade reliability.

### Key Features

- **Multi-Provider Support**: OpenAI, Anthropic (Claude), Google (Gemini)
- **Open Responses API**: Semantic streaming events for agentic workflows
- **Load Balancing**: Distribute requests across providers and API keys
- **Cost Tracking**: Real-time usage and cost monitoring per request
- **Response Caching**: Redis-based caching with configurable TTL
- **Rate Limiting**: Per-key rate limits with burst support
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
├── migrations/          # SQLx database migrations
├── dashboard/           # React admin dashboard (coming soon)
└── docs/               # Documentation
```

## Quick Start

### Prerequisites

- Rust 1.70+ (2021 edition)
- PostgreSQL 14+ (optional, for persistence)
- Redis 6+ (optional, for caching/rate limiting)

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

Set environment variables for your provider API keys:

```bash
# Required
export AURA_HOST=0.0.0.0
export AURA_PORT=8080

# Provider API Keys (at least one required)
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_API_KEY=...

# Optional - Database & Redis
export DATABASE_URL=postgres://user:pass@localhost/aura
export REDIS_URL=redis://localhost:6379

# Optional - Logging
export RUST_LOG=info,aura_proxy=debug
```

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

## Project Status

**Current Phase**: Foundation (Milestone 1)

- [x] **PR #1: Project Scaffolding** - Cargo workspace with 4 crates
- [ ] PR #2: Configuration System
- [ ] PR #3: Open Responses API Types
- [ ] PR #4: Basic Axum Server

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for the complete roadmap.

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
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Documentation](docs/)
