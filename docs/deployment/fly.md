# Deploying Aura LLM Gateway to Fly.io

End-to-end recipe for running the gateway at `api.aura-llm.dev` on
[Fly.io](https://fly.io). Cost: ~$5/mo for a shared-CPU machine + ~$2/mo for a
small Postgres + a free Upstash Redis. Total: <$10/mo for a low-traffic
production gateway.

This is what `aura-llm.dev` itself uses.

## Prerequisites

- A Fly.io account with the Hobby plan (or any paid plan that allows custom domains + TLS)
- `flyctl` installed locally: `brew install flyctl` (macOS) or [other platforms](https://fly.io/docs/hands-on/install-flyctl/)
- `fly auth login` complete
- Domain DNS managed somewhere (we use Namecheap; instructions apply to any registrar)

## 1. Create the app shell

From the repo root:

```bash
fly launch --no-deploy --copy-config --name aura-gateway --region arn
```

`--copy-config` tells Fly to use the existing [`fly.toml`](../../fly.toml) at the
repo root — don't let Fly overwrite it. The `arn` region is Stockholm (lowest
latency to Anthropic/OpenAI for European users); pick something closer to your
provider edges if your audience is elsewhere.

You'll get an app named `aura-gateway` with no machines running yet.

## 2. Create the Postgres database

```bash
fly postgres create \
  --name aura-pg \
  --region arn \
  --vm-size shared-cpu-1x \
  --initial-cluster-size 1 \
  --volume-size 3
```

Then attach it to the gateway app — this auto-injects `DATABASE_URL` as a secret:

```bash
fly postgres attach aura-pg --app aura-gateway
```

## 3. Create the Redis (Upstash)

```bash
fly redis create --name aura-redis --region arn --no-replicas
```

Copy the connection URL it prints, then:

```bash
fly secrets set REDIS_URL='redis://default:...@<host>.upstash.io:6379' --app aura-gateway
```

## 4. Set the rest of the required secrets

```bash
# Master key for credential encryption. STORE THIS SOMEWHERE SAFE —
# losing it means losing every encrypted provider credential.
fly secrets set AURA_MASTER_KEY=$(openssl rand -hex 32) --app aura-gateway

# Admin key for /v1/api-keys and other management endpoints.
fly secrets set AURA_ADMIN_KEY=$(openssl rand -hex 32) --app aura-gateway

# At least one provider API key — repeat for each provider you want enabled.
fly secrets set OPENAI_API_KEY=sk-... --app aura-gateway
fly secrets set ANTHROPIC_API_KEY=sk-ant-... --app aura-gateway
# ... GOOGLE_API_KEY, MISTRAL_API_KEY, HUGGINGFACE_API_KEY, AWS creds, etc.
```

## 5. Deploy

```bash
fly deploy --app aura-gateway
```

The deploy uses `fly.toml`'s `release_command = "/app/aura-proxy migrate"`, so
migrations run before the new pod takes traffic. First deploy will:

1. Build the image from `Dockerfile` (multi-stage, cargo-chef cached)
2. Push to Fly's registry
3. Run migrations via `/app/aura-proxy migrate`
4. Start the gateway pod
5. Health-check it on `/health`
6. Route traffic

## 6. Attach the custom domain

```bash
fly certs add api.aura-llm.dev --app aura-gateway
```

Fly prints DNS instructions — typically:

| Type | Host | Value |
|---|---|---|
| CNAME | `api` | `<your-app>.fly.dev` |
| AAAA | `api` | (Fly's IPv6 address) |
| A | `api` | (Fly's IPv4 address — only if your DNS provider doesn't support apex CNAME flattening for subdomains) |

Add the records at your DNS provider. Wait ~5 min for verification + TLS cert
provisioning. Check status:

```bash
fly certs show api.aura-llm.dev --app aura-gateway
```

## 7. Smoke test

```bash
# Health check (no auth)
curl https://api.aura-llm.dev/health
# Expect: 200 OK, {"status": "ok", ...}

# Create a test API key (requires AURA_ADMIN_KEY)
curl -X POST https://api.aura-llm.dev/v1/api-keys \
  -H "Authorization: Bearer $AURA_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "smoke-test", "scopes": ["responses:create"]}'

# Use the returned key to make a real request
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Authorization: Bearer aura_..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4-mini",
    "input": [{"type": "message", "role": "user", "content": "Hi"}]
  }'
```

## Maintenance

| Action | Command |
|---|---|
| Update to a new gateway version | `fly deploy --app aura-gateway` |
| Inspect logs | `fly logs --app aura-gateway` |
| Connect to Postgres | `fly postgres connect --app aura-pg` |
| Scale memory | `fly scale memory 1024 --app aura-gateway` |
| Add another region | `fly regions add iad --app aura-gateway` |
| Restart | `fly machine restart --app aura-gateway` |

## Cost expectations

- **Gateway:** 1× `shared-cpu-1x` (256MB-2GB) — `$0`/mo on Hobby plan up to 3 machines × 256MB; ~$5-10/mo at 512MB-1GB
- **Postgres:** 1× `shared-cpu-1x` with 3GB volume — ~$2/mo
- **Redis (Upstash via Fly):** Free tier (10K commands/day) is plenty for rate-limit token bucket; ~$0
- **Bandwidth:** First 160GB/mo free

Total for a low-traffic demo gateway: **<$10/mo**.

## Common gotchas

1. **First deploy fails on migrations.** If you forgot to attach Postgres, the
   release_command exits non-zero and Fly aborts. `fly postgres attach` and
   redeploy.
2. **CORS errors from the playground.** Check `AURA_CORS_ALLOWED_ORIGINS` in
   `fly.toml` matches your actual frontend domain(s).
3. **`AURA_MASTER_KEY` lost.** All encrypted provider credentials are now
   unrecoverable. Restore from your secret manager. Always back this up.
4. **Cold starts.** `auto_stop_machines = false` in `fly.toml` keeps the pod
   warm. Don't change this — LLM gateway latency demos die on cold start.
5. **Helm chart vs Fly.** This repo also ships a Helm chart at
   `deploy/charts/aura-llm-gateway/` for Kubernetes clusters. Fly is simpler
   for solo OSS deployments; Helm is right for serious enterprise self-hosters.
