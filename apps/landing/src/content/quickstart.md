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

## 2. Set Up Database

Aura requires PostgreSQL for persistence:

```bash
# Start PostgreSQL with Docker
docker-compose up -d postgres

# Run migrations
make db-migrate

# Or manually with sqlx
sqlx migrate run
```

## 3. Configure Environment

```bash
# Database (required)
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/aura

# Master encryption key for provider credentials (required)
export AURA_MASTER_KEY=$(openssl rand -hex 32)

# Provider API keys (at least one required)
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_API_KEY=...

# Server configuration
export AURA_HOST=0.0.0.0
export AURA_PORT=8080
```

Alternatively, create a `.env` file:

```env
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/aura
AURA_MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
AURA_HOST=0.0.0.0
AURA_PORT=8080
```

## 4. Create an API Key

Before making requests, create an API key:

```bash
./scripts/create_api_key.sh "my-first-key"
```

Save the generated API key - you'll need it for authentication.

## 5. Run the Gateway

```bash
cargo run -p aura-proxy

# Or with debug logging
RUST_LOG=debug cargo run -p aura-proxy
```

The gateway will start on `http://localhost:8080`.

## 6. Make a Request

Use the API key from step 4:

```bash
curl -X POST http://localhost:8080/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer aura_live_your_api_key_here" \
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
# Configure the chat app with your API key
cd apps/chat
echo "VITE_API_BASE_URL=http://localhost:8080" > .env
echo "VITE_AURA_API_KEY=aura_live_your_api_key_here" >> .env

# Install and start
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

## Next Steps

- [Authentication](/docs/api/authentication) - Learn about API keys and scopes
- [Organizations](/docs/organizations) - Set up multi-tenant architecture
- [API Reference](/docs/api) - Explore all API endpoints
- [Configuration](/docs/configuration) - Configure providers and settings
- [Cost Tracking](/docs/api/cost-tracking) - Learn about cost calculation
