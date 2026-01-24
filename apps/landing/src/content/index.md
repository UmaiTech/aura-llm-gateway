---
title: "Introduction"
description: "Unified LLM Gateway for Modern AI Apps"
---

# Aura LLM Gateway

Aura is a Rust-based LLM proxy implementing the [Open Responses API](https://www.openresponses.org/specification) specification for agentic workflows. It provides a unified interface to multiple LLM providers with load balancing, cost tracking, and observability.

## Features

- **Multi-Provider Support**: Unified API for OpenAI, Anthropic, and Google models
- **API Key Authentication**: Secure bearer token auth with scopes and rate limits
- **Hierarchical Organizations**: Org → Teams → Projects with scoped API keys
- **End-User Cost Tracking**: Per-customer billing and cost allocation via `user` field
- **Credential Encryption**: AES-256-GCM envelope encryption for provider API keys
- **Cost Tracking**: Real-time cost calculation per request with detailed usage metrics
- **Open Responses API**: Built on the specification for agentic workflows with streaming and tool use
- **Enterprise Ready**: Load balancing, rate limiting, caching, and observability built-in
- **Self-Hosted**: Run on your own infrastructure with full control
- **Developer First**: Clean Rust codebase with comprehensive API documentation

## Quick Start

```bash
# Clone the repository
git clone https://github.com/UmaiTech/aura-llm-gateway
cd aura-llm-gateway

# Set up environment
cp .env.example .env
# Add your API keys to .env

# Run with Docker
docker-compose up -d

# Or run with Cargo
cargo run -p aura-proxy
```

The gateway will be available at `http://localhost:8080`.

## Make Your First Request

```javascript
const response = await fetch('http://localhost:8080/v1/responses', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer aura_live_your_api_key'
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    input: [
      { type: 'message', role: 'user', content: 'Hello!' }
    ],
    user: 'customer_123'  // Optional: track costs per end-user
  })
});

const data = await response.json();
console.log(data);
```

## Architecture

Aura is built with:
- **Rust** for performance and safety
- **Axum** for web framework
- **PostgreSQL** for persistence
- **Redis** for caching and rate limiting
- **Tokio** for async runtime

## Next Steps

- [API Reference](/docs/api) - Explore the API endpoints
- [Authentication](/docs/api/authentication) - Learn about API keys and scopes
- [Architecture](/docs/architecture) - Learn about the system design
- [Cost Tracking](/docs/api/cost-tracking) - Understand cost calculation
