---
title: "Configuration"
description: "Configure Aura LLM Gateway"
---

# Configuration

Aura is configured through environment variables.

## Required Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AURA_HOST` | Server bind address | `0.0.0.0` |
| `AURA_PORT` | Server port | `8080` |

## Provider API Keys

At least one provider API key is required:

| Variable | Provider | Format |
|----------|----------|--------|
| `OPENAI_API_KEY` | OpenAI (GPT models) | `sk-proj-...` |
| `ANTHROPIC_API_KEY` | Anthropic (Claude models) | `sk-ant-...` |
| `GOOGLE_API_KEY` | Google (Gemini models) | `AIza...` |

## Optional Variables

### Database

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | None |
| `DATABASE_MAX_CONNECTIONS` | Connection pool size | `10` |

Example:
```bash
export DATABASE_URL=postgresql://user:password@localhost:5432/aura
```

### Redis (Rate Limiting & Caching)

Redis is required for rate limiting and response caching features.

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string | None |
| `REDIS_MAX_CONNECTIONS` | Connection pool size | `10` |

Example:
```bash
export REDIS_URL=redis://localhost:6379
```

### Rate Limiting

| Variable | Description | Default |
|----------|-------------|---------|
| `AURA_DEFAULT_RATE_LIMIT_RPM` | Default requests per minute per API key | `60` |

Rate limits are also configurable per API key via the admin API.

### Caching

| Variable | Description | Default |
|----------|-------------|---------|
| `AURA_CACHE_TTL_SECONDS` | Default cache TTL | `3600` (1 hour) |
| `AURA_CACHE_ENABLED` | Enable/disable caching | `true` |

**Note:** Caching is automatically disabled for:
- Streaming requests
- Requests with temperature > 0
- Requests with `X-Cache-Control: no-cache` header

### Logging

| Variable | Description | Default |
|----------|-------------|---------|
| `RUST_LOG` | Log level and filters | `info` |

Examples:
```bash
# Info level for all modules
export RUST_LOG=info

# Debug level for aura modules only
export RUST_LOG=info,aura_proxy=debug,aura_core=debug

# Trace level for everything
export RUST_LOG=trace
```

### Security & Authentication

| Variable | Description | Default |
|----------|-------------|---------|
| `AURA_ADMIN_KEY` | Admin API key for management endpoints | None |
| `AURA_MASTER_KEY` | Master key for credential encryption (32 bytes, base64) | None |
| `AURA_ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | `*` |

Example:
```bash
export AURA_ADMIN_KEY=super-secret-admin-key
export AURA_ALLOWED_ORIGINS=https://myapp.com,https://admin.myapp.com

# Generate a master key for credential encryption
export AURA_MASTER_KEY=$(openssl rand -base64 32)
```

**Note:** The master key is required for storing encrypted provider credentials. Without it, organizations cannot store their own API keys in the database.

### Performance

| Variable | Description | Default |
|----------|-------------|---------|
| `AURA_REQUEST_TIMEOUT_MS` | Request timeout in milliseconds | `300000` (5 min) |
| `AURA_MAX_REQUEST_SIZE_MB` | Max request body size | `10` |

## Configuration File (Optional)

You can also use a `aura.yaml` configuration file:

```yaml
server:
  host: "0.0.0.0"
  port: 8080
  request_timeout_ms: 300000
  max_request_size_mb: 10

providers:
  openai:
    api_key: ${OPENAI_API_KEY}
  anthropic:
    api_key: ${ANTHROPIC_API_KEY}
  google:
    api_key: ${GOOGLE_API_KEY}

database:
  url: ${DATABASE_URL}
  max_connections: 10

redis:
  url: ${REDIS_URL}
  max_connections: 10

security:
  admin_key: ${AURA_ADMIN_KEY}
  allowed_origins:
    - "https://myapp.com"
    - "https://admin.myapp.com"

logging:
  level: "info"
  filters:
    - "aura_proxy=debug"
    - "aura_core=debug"
```

To use the config file:

```bash
cargo run -p aura-proxy -- --config aura.yaml
```

## .env File

Create a `.env` file in the project root:

```env
# Server
AURA_HOST=0.0.0.0
AURA_PORT=8080

# Providers (at least one required)
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...

# Database (optional)
DATABASE_URL=postgresql://aura:password@localhost:5432/aura
DATABASE_MAX_CONNECTIONS=10

# Redis (optional)
REDIS_URL=redis://localhost:6379
REDIS_MAX_CONNECTIONS=10

# Security (optional)
AURA_ADMIN_KEY=your-admin-key-here
AURA_ALLOWED_ORIGINS=*

# Logging
RUST_LOG=info,aura_proxy=debug

# Performance (optional)
AURA_REQUEST_TIMEOUT_MS=300000
AURA_MAX_REQUEST_SIZE_MB=10
```

## Docker Configuration

When using Docker Compose, configure via `docker-compose.yml`:

```yaml
version: '3.8'

services:
  aura-proxy:
    build: .
    ports:
      - "8080:8080"
    environment:
      AURA_HOST: "0.0.0.0"
      AURA_PORT: "8080"
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      GOOGLE_API_KEY: ${GOOGLE_API_KEY}
      DATABASE_URL: postgresql://aura:password@postgres:5432/aura
      REDIS_URL: redis://redis:6379
      RUST_LOG: info,aura_proxy=debug
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: aura
      POSTGRES_PASSWORD: password
      POSTGRES_DB: aura
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## Environment-Specific Configs

### Development

```bash
export RUST_LOG=debug
export AURA_ALLOWED_ORIGINS=*
# No database required for dev
```

### Production

```bash
export RUST_LOG=info,aura_proxy=warn
export AURA_ALLOWED_ORIGINS=https://yourdomain.com
export DATABASE_URL=postgresql://...
export REDIS_URL=redis://...
export AURA_ADMIN_KEY=<strong-secret-key>
export AURA_REQUEST_TIMEOUT_MS=120000
```

## Verifying Configuration

After starting the gateway, verify configuration:

```bash
# Health check
curl http://localhost:8080/health

# Check which providers are available
curl http://localhost:8080/v1/models
```

## Troubleshooting

### Gateway won't start

1. Check that at least one provider API key is set
2. Verify port 8080 is not already in use
3. Check logs with `RUST_LOG=debug`

### Provider not working

1. Verify API key format is correct
2. Check API key has sufficient quota
3. Test API key directly with provider

### Database connection fails

1. Verify PostgreSQL is running
2. Check DATABASE_URL format
3. Ensure database exists: `createdb aura`
4. Run migrations: `sqlx migrate run`
