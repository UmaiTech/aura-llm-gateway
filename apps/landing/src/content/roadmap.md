---
title: "Roadmap"
description: "Planned features and development timeline"
---

# Roadmap

Our vision for Aura is to be the most powerful, easiest-to-use LLM gateway for production applications. Here's what we're building.

## ✅ Launched (v0.2)

### Core Gateway
- **Multi-provider support** - OpenAI, Anthropic (Claude), Google with unified API
- **Automatic cost tracking** - Real-time USD cost calculation
- **Streaming responses** - Server-Sent Events for real-time chat
- **Open Responses API** - Standard specification for agentic workflows
- **Request logging** - PostgreSQL integration for analytics
- **API key authentication** - Bearer token auth with scopes and rate limits
- **Hierarchical organizations** - Org → Teams → Projects with scoped API keys
- **End-user cost tracking** - Per-customer billing via `user` field
- **Credential encryption** - AES-256-GCM envelope encryption for provider keys

### Production Readiness (NEW in v0.2)
- **Response caching** - Redis-backed caching for repeated requests
  - SHA256-based cache keys
  - TTL-based expiration (configurable, default 1 hour)
  - Cache bypass via `X-Cache-Control: no-cache` header
  - Auto-skip for streaming/high-temperature requests

- **Rate limiting** - Per-user and per-key rate limits
  - Token bucket algorithm with Redis
  - Per-API key configurable RPM limits
  - Monthly token budget tracking
  - Rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)

- **Prometheus metrics** - Full observability via `/metrics` endpoint
  - Request count and latency histograms
  - Token usage by provider/model
  - Cost tracking metrics
  - Cache hit/miss ratios
  - Rate limit events

### Developer Experience
- **Chat playground** - Built-in UI for testing
- **Documentation site** - Complete API reference and guides
- **Docker support** - Easy deployment with docker-compose
- **Python SDK** - Full-featured client with sync/async support
- **TypeScript types** - Auto-generated types for clients

## 🚧 In Progress (v0.3)

### Observability
- **Distributed tracing** - OpenTelemetry integration
  - Trace requests across services
  - Identify bottlenecks
  - Debug production issues

## 📅 Planned (v0.3+)

### Advanced Features

**Webhook callbacks** (Q2 2026)
- Configure webhooks for response completion
- Async processing workflows
- Event filtering by provider/model

**Smart routing** (Q2 2026)
- Automatic failover between providers
- Load balancing across API keys
- Cost-optimized routing

**Admin dashboard** (Q2 2026)
- Web UI for analytics and management
- Cost visualization charts
- API key and organization management
- Real-time request monitoring

**Auto-updating pricing** (Q3 2026)
- Automated pricing scraper
- Historical pricing data
- Cost forecasting

### Platform Support

**Additional providers** (Ongoing)
- **AWS Bedrock** - Claude, Llama, Titan models via AWS
- **Mistral AI** - Mistral Large, Medium, Codestral
- **Ollama** - Local models (Llama, Mistral, CodeLlama, Qwen)
- **HuggingFace** - Inference API and Endpoints
- **Cohere** - Command R/R+ models
- Azure OpenAI
- Together AI
- Replicate

**SDKs & Integrations** (Q2-Q3 2026)
- ~~Official Python SDK~~ ✅ Released!
- Official TypeScript/Node SDK
- LangChain integration
- LlamaIndex integration

### Enterprise Features (v1.0)

**Advanced security** (Q3 2026)
- API key rotation
- IP allowlisting
- Request signing
- Audit logs

**High availability** (Q4 2026)
- Active-active deployment
- Automatic failover
- Regional redundancy
- 99.9% uptime SLA

## 💡 Under Consideration

Features we're evaluating based on community feedback:

- **Model fallbacks** - Automatically retry with cheaper model on failure
- **Budget limits** - Hard caps on spending per user/key
- **A/B testing** - Route percentage of traffic to different models
- **Custom models** - Support for fine-tuned models
- **Batch processing** - Bulk request API with lower costs
- **Model playground** - Compare outputs across providers

## How We Prioritize

We prioritize features based on:

1. **User requests** - What the community needs most
2. **Production readiness** - Reliability and performance first
3. **Cost savings** - Features that reduce costs for users
4. **Developer experience** - Making Aura easier to use

## Get Involved

Want to influence the roadmap?

- **Request features**: Open an issue on [GitHub](https://github.com/UmaiTech/aura-llm-gateway/issues)
- **Vote on features**: React to existing issues
- **Contribute**: Submit PRs for features you need
- **Join discussions**: Share your use cases and requirements

## Release Schedule

We aim for:
- **Patch releases** (bug fixes): Weekly
- **Minor releases** (new features): Monthly
- **Major releases** (breaking changes): Quarterly

Current version: **v0.2.6**

Next release: **v0.3.0** (estimated February 2026)
