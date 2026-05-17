# Deploying with Docker

The gateway ships as a multi-arch Docker image at `ghcr.io/umaitech/aura-llm-gateway`.
The image is built from [`Dockerfile`](../../Dockerfile) — multi-stage with
cargo-chef for cached dependency layers, ending in a `debian:bookworm-slim`
runtime with a non-root user and a stripped binary.

## Run with docker

Minimum viable run (one provider, in-memory only):

```bash
docker run --rm -p 8080:8080 \
  -e AURA_MASTER_KEY="$(openssl rand -hex 32)" \
  -e OPENAI_API_KEY="sk-..." \
  ghcr.io/umaitech/aura-llm-gateway:latest
```

With Postgres + Redis for full feature set:

```bash
docker run --rm -p 8080:8080 \
  -e AURA_MASTER_KEY="$(openssl rand -hex 32)" \
  -e OPENAI_API_KEY="sk-..." \
  -e DATABASE_URL="postgres://aura:aura@postgres:5432/aura" \
  -e REDIS_URL="redis://redis:6379" \
  --network aura-net \
  ghcr.io/umaitech/aura-llm-gateway:latest
```

## docker-compose

The repo includes a [`docker-compose.yml`](../../docker-compose.yml) for local
development. Start everything (gateway + Postgres + Redis):

```bash
docker compose up -d
```

This brings up:

- `aura-proxy` — the gateway on `localhost:8080`
- `postgres` — PostgreSQL 16 on port 5433 (avoids conflicting with system Postgres)
- `redis` — Redis 7 on port 6379

Logs: `docker compose logs -f aura-proxy`. Stop: `docker compose down`.

## Image tags

| Tag | Notes |
|---|---|
| `latest` | Latest released version, multi-arch (linux/amd64, linux/arm64) |
| `v0.4.1` | Specific version pin — recommended for production |
| `sha-<short>` | Specific commit (built by CI on every push to main) |

Pin to a specific version in production. `latest` moves on every release.

## Health check

The image declares a `HEALTHCHECK` against `GET /health`. In Kubernetes the
liveness/readiness probes hit the same endpoint — see [`helm.md`](./helm.md).

## Configuration

Configuration is via environment variables. See:

- [`.env.example`](../../.env.example) — every supported env var
- [`config.example.yaml`](../../config.example.yaml) — YAML alternative for k8s ConfigMaps

Required env vars:

- `AURA_MASTER_KEY` — 32-byte hex, for encrypting provider credentials
- At least one provider API key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.)

Optional but commonly set:

- `DATABASE_URL` — Postgres for request logging, multi-tenancy
- `REDIS_URL` — Redis for rate limiting, response caching
- `AURA_ADMIN_KEY` — for management endpoints
- `RUST_LOG` — log level (default: `info`)
