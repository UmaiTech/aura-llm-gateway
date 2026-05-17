# Aura LLM Gateway — Helm Chart

Deploy [Aura LLM Gateway](https://github.com/UmaiTech/aura-llm-gateway) to Kubernetes.

## Install

```bash
# From OCI registry (ghcr.io)
helm install aura oci://ghcr.io/umaitech/charts/aura-llm-gateway \
  --version 0.1.0 \
  --namespace aura \
  --create-namespace \
  --set secrets.inline.auraMasterKey="$(openssl rand -hex 32)" \
  --set secrets.inline.openaiApiKey="sk-..."
```

## Quick start with PostgreSQL + Redis subcharts

For a self-contained demo cluster (don't do this in production):

```bash
helm install aura oci://ghcr.io/umaitech/charts/aura-llm-gateway \
  --version 0.1.0 \
  --namespace aura --create-namespace \
  --set postgresql.enabled=true \
  --set redis.enabled=true \
  --set secrets.inline.auraMasterKey="$(openssl rand -hex 32)" \
  --set secrets.inline.openaiApiKey="sk-..." \
  --set secrets.inline.databaseUrl="postgres://aura:aura@aura-postgresql:5432/aura" \
  --set secrets.inline.redisUrl="redis://aura-redis-master:6379"
```

## Production-ready install

1. Create the Secret manually (out of band, e.g. via sealed-secrets, ESO, Vault):

   ```bash
   kubectl create secret generic aura-secrets \
     --namespace aura \
     --from-literal=AURA_MASTER_KEY="$(openssl rand -hex 32)" \
     --from-literal=AURA_ADMIN_KEY="..." \
     --from-literal=OPENAI_API_KEY="sk-..." \
     --from-literal=DATABASE_URL="postgres://..."
   ```

2. Install the chart referencing the existing Secret:

   ```bash
   helm install aura oci://ghcr.io/umaitech/charts/aura-llm-gateway \
     --version 0.1.0 \
     --namespace aura \
     --set secrets.existingSecret=aura-secrets \
     --set ingress.enabled=true \
     --set ingress.className=nginx \
     --set ingress.hosts[0].host=api.example.com \
     --set ingress.hosts[0].paths[0].path=/ \
     --set ingress.hosts[0].paths[0].pathType=Prefix \
     --set autoscaling.enabled=true \
     --set autoscaling.maxReplicas=10
   ```

## Configuration

See [`values.yaml`](./values.yaml) for the full schema. Common knobs:

| Key | Default | Notes |
|---|---|---|
| `replicaCount` | `1` | Set to 2+ for HA. Use `autoscaling.enabled` for HPA instead. |
| `image.tag` | `""` (= `appVersion`) | Override to pin a specific gateway version. |
| `service.type` | `ClusterIP` | Use `LoadBalancer` or `NodePort` to expose without ingress. |
| `ingress.enabled` | `false` | Standard Kubernetes ingress with TLS support. |
| `autoscaling.enabled` | `false` | HPA between `minReplicas` and `maxReplicas`. |
| `postgresql.enabled` | `false` | Bundled PostgreSQL for demo only. |
| `redis.enabled` | `false` | Bundled Redis for demo only. |
| `secrets.existingSecret` | `""` | Use this if Secret is managed out-of-band (recommended). |

## Required secrets

The gateway needs at minimum:

- `AURA_MASTER_KEY` — 32-byte hex string for credential encryption. **Required.**
- At least one provider API key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.).

Optional:

- `AURA_ADMIN_KEY` — for management endpoints
- `DATABASE_URL` — required only if request logging / multi-tenancy is enabled
- `REDIS_URL` — required only if rate limiting / response caching is enabled

## Uninstall

```bash
helm uninstall aura --namespace aura
```

## Source

- Repository: https://github.com/UmaiTech/aura-llm-gateway
- Documentation: https://docs.aura-llm.dev
- Issues: https://github.com/UmaiTech/aura-llm-gateway/issues
