# Deploying with Helm

Aura ships an official Helm chart for Kubernetes deployments. Full chart
documentation lives at **[`deploy/charts/aura-llm-gateway/README.md`](../../deploy/charts/aura-llm-gateway/README.md)**.

## Quick install

```bash
helm install aura oci://ghcr.io/umaitech/charts/aura-llm-gateway \
  --version 0.1.0 \
  --namespace aura --create-namespace \
  --set secrets.inline.auraMasterKey="$(openssl rand -hex 32)" \
  --set secrets.inline.openaiApiKey="sk-..."
```

## What's in the chart

| Resource | Purpose |
|---|---|
| Deployment | The gateway pod |
| Service | ClusterIP on port 8080 |
| ConfigMap | Non-secret config (host, port, log level) |
| Secret | Master key, admin key, provider API keys |
| Ingress *(optional)* | Standard k8s ingress with TLS support |
| HPA *(optional)* | Horizontal pod autoscaling |
| ServiceAccount | Non-root, read-only rootfs, dropped capabilities |
| PostgreSQL subchart *(optional)* | Bitnami chart for demo clusters |
| Redis subchart *(optional)* | Bitnami chart for demo clusters |

## Production checklist

1. **Use `existingSecret`** — create the Secret out-of-band (sealed-secrets,
   External Secrets Operator, Vault). Don't put real credentials in values.yaml.
2. **Generate AURA_MASTER_KEY** with `openssl rand -hex 32`, store in your
   secret manager. Losing it means losing all encrypted provider credentials.
3. **Disable bundled PG/Redis** for production. Use managed services.
4. **Enable Ingress with TLS** via cert-manager or your cloud provider's load balancer.
5. **Enable HPA** for traffic-aware scaling.

See [`deploy/charts/aura-llm-gateway/README.md`](../../deploy/charts/aura-llm-gateway/README.md) for full configuration reference.
