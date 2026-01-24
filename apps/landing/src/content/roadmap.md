---
title: "Roadmap"
description: "Planned features and development timeline"
---

# Roadmap

Our vision for Aura is to be the most powerful, easiest-to-use LLM gateway for production applications. Here's what we're building.

## ✅ Launched (v0.1)

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

### Developer Experience
- **Chat playground** - Built-in UI for testing
- **Documentation site** - Complete API reference and guides
- **Docker support** - Easy deployment with docker-compose
- **Python SDK** - Full-featured client with sync/async support
- **TypeScript types** - Auto-generated types for clients

## 🚧 In Progress (v0.2)

### Performance & Reliability
- **Response caching** - Redis-backed caching for repeated requests
  - LRU eviction policy
  - TTL-based expiration
  - Cache hit metrics

- **Rate limiting** - Per-user and per-key rate limits
  - Token bucket algorithm
  - Redis-backed distributed limiting
  - Custom limits per tier

### Observability
- **Metrics endpoint** - Prometheus-compatible metrics
  - Request latency histograms
  - Cost per provider
  - Error rates by type
  - Cache hit/miss ratios

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
- Azure OpenAI
- Cohere
- Mistral AI
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

Current version: **v0.1.7**

Next release: **v0.2.0** (estimated February 2026)
