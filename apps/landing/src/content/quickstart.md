---
title: "Quickstart"
description: "Get up and running with Aura in minutes"
---

# Quickstart

Get up and running with Aura in just a few minutes.

## 1. Clone and Build

```bash
git clone https://github.com/UmaiTech/aura-llm-gateway.git
cd aura-llm-gateway
cargo build --release
```

## 2. Configure Environment

```bash
# Required: At least one provider API key
export OPENAI_API_KEY=sk-...

# Optional: Additional providers
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_API_KEY=...

# Server configuration
export AURA_HOST=0.0.0.0
export AURA_PORT=8080
```

Alternatively, create a `.env` file:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
AURA_HOST=0.0.0.0
AURA_PORT=8080
```

## 3. Run the Gateway

```bash
cargo run -p aura-proxy

# Or with debug logging
RUST_LOG=debug cargo run -p aura-proxy
```

The gateway will start on `http://localhost:8080`.

## 4. Make a Request

```bash
curl -X POST http://localhost:8080/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "input": [
      {"type": "message", "role": "user", "content": "Hello!"}
    ]
  }'
```

You should receive a response with:
- Generated text from the model
- Token usage counts
- Cost calculation in USD
- Provider metadata

```json
{
  "id": "resp_abc123",
  "status": "completed",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [{"type": "text", "text": "Hello! How can I help you today?"}]
    }
  ],
  "usage": {
    "input_tokens": 8,
    "output_tokens": 9,
    "cost_usd": 0.0000066
  },
  "metadata": {
    "aura": {
      "provider": "openai",
      "latency_ms": 342
    }
  }
}
```

## Using Docker

Alternatively, use Docker Compose:

```bash
# Start all services (gateway + PostgreSQL)
docker-compose up -d

# View logs
docker-compose logs -f aura-proxy

# Stop services
docker-compose down
```

The gateway will be available at `http://localhost:8080`.

## Try the Chat UI

Aura includes a chat playground for testing:

```bash
# Start the chat UI (in a separate terminal)
cd apps/chat
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

## Next Steps

- [Configuration](/docs/configuration) - Configure providers and settings
- [API Reference](/docs/api) - Explore all API endpoints
- [Architecture](/docs/architecture) - Understand how Aura works
- [Cost Tracking](/docs/api/cost-tracking) - Learn about cost calculation
