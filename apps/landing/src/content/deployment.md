---
title: "Deployment"
description: "Deploy Aura LLM Gateway to production"
---

# Deployment

This guide covers deploying Aura LLM Gateway to production environments.

## Docker Compose (Recommended for Small Deployments)

The easiest way to deploy Aura with all dependencies.

### 1. Create docker-compose.yml

```yaml
version: '3.8'

services:
  aura-proxy:
    image: ghcr.io/umaitech/aura-llm-gateway:latest
    ports:
      - "8080:8080"
    environment:
      AURA_HOST: "0.0.0.0"
      AURA_PORT: "8080"
      DATABASE_URL: postgresql://aura:password@postgres:5432/aura
      REDIS_URL: redis://redis:6379
      RUST_LOG: info,aura_proxy=debug
      # Provider API Keys
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      GOOGLE_API_KEY: ${GOOGLE_API_KEY}
      # Security
      AURA_ADMIN_KEY: ${AURA_ADMIN_KEY}
      AURA_MASTER_KEY: ${AURA_MASTER_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: aura
      POSTGRES_PASSWORD: password
      POSTGRES_DB: aura
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aura"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

volumes:
  postgres_data:
  redis_data:
```

### 2. Create .env file

```bash
# Provider API Keys (at least one required)
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...

# Security
AURA_ADMIN_KEY=your-secure-admin-key
AURA_MASTER_KEY=$(openssl rand -base64 32)
```

### 3. Deploy

```bash
docker-compose up -d
```

## Kubernetes

For production-scale deployments.

### Helm Chart (Recommended for Kubernetes)

Aura ships an official Helm chart published to GitHub Container Registry as an OCI artifact. One command gets a working deployment:

```bash
helm install aura oci://ghcr.io/umaitech/charts/aura-llm-gateway \
  --version 0.1.0 \
  --namespace aura --create-namespace \
  --set secrets.inline.auraMasterKey="$(openssl rand -hex 32)" \
  --set secrets.inline.openaiApiKey="sk-..."
```

#### Production-grade install

Real deployments should manage secrets out-of-band (sealed-secrets, External Secrets Operator, or Vault) instead of putting them in `--set`:

```bash
# 1. Create the Secret with a real secret manager
kubectl create secret generic aura-secrets \
  --namespace aura \
  --from-literal=AURA_MASTER_KEY="$(openssl rand -hex 32)" \
  --from-literal=AURA_ADMIN_KEY="..." \
  --from-literal=OPENAI_API_KEY="sk-..." \
  --from-literal=DATABASE_URL="postgres://..."

# 2. Install the chart, referencing the Secret
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

#### Quick demo with bundled Postgres + Redis

For kind / k3d / minikube — **don't do this in production**:

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

#### What the chart installs

| Resource | Purpose |
|---|---|
| Deployment | Gateway pod with non-root securityContext, read-only rootfs |
| Service | ClusterIP on port 8080 |
| ConfigMap | Non-secret config (host, port, log level) |
| Secret | Master key, admin key, all 7 provider credentials |
| Ingress *(optional, off)* | Standard k8s Ingress with TLS |
| HPA *(optional, off)* | Horizontal pod autoscaling on CPU/memory |
| ServiceAccount | Dedicated SA with dropped capabilities |
| PostgreSQL subchart *(optional, off)* | Bitnami chart for demos |
| Redis subchart *(optional, off)* | Bitnami chart for demos |

#### Configuration

See the [chart README on GitHub](https://github.com/UmaiTech/aura-llm-gateway/blob/main/deploy/charts/aura-llm-gateway/README.md) for the full `values.yaml` schema. Common knobs:

| Key | Default | Notes |
|---|---|---|
| `replicaCount` | `1` | Use `autoscaling.enabled` instead for prod traffic |
| `image.tag` | `""` (chart appVersion) | Pin to a specific gateway version in prod |
| `service.type` | `ClusterIP` | `LoadBalancer` if you don't use Ingress |
| `ingress.enabled` | `false` | TLS via cert-manager or your LB |
| `secrets.existingSecret` | `""` | Strongly preferred in production |

### Manual Kubernetes Manifests

#### Namespace and Secrets

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: aura

---
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: aura-secrets
  namespace: aura
type: Opaque
stringData:
  OPENAI_API_KEY: "sk-proj-..."
  ANTHROPIC_API_KEY: "sk-ant-..."
  AURA_ADMIN_KEY: "your-admin-key"
  AURA_MASTER_KEY: "your-master-key"
  DATABASE_URL: "postgresql://aura:password@postgres:5432/aura"
```

#### Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aura-proxy
  namespace: aura
spec:
  replicas: 3
  selector:
    matchLabels:
      app: aura-proxy
  template:
    metadata:
      labels:
        app: aura-proxy
    spec:
      containers:
        - name: aura-proxy
          image: ghcr.io/umaitech/aura-llm-gateway:latest
          ports:
            - containerPort: 8080
          envFrom:
            - secretRef:
                name: aura-secrets
          env:
            - name: AURA_HOST
              value: "0.0.0.0"
            - name: AURA_PORT
              value: "8080"
            - name: RUST_LOG
              value: "info"
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "1000m"
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
```

#### Service and Ingress

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: aura-proxy
  namespace: aura
spec:
  selector:
    app: aura-proxy
  ports:
    - port: 80
      targetPort: 8080

---
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: aura-proxy
  namespace: aura
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - api.aura.example.com
      secretName: aura-tls
  rules:
    - host: api.aura.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: aura-proxy
                port:
                  number: 80
```

## Building from Source

### Prerequisites

- Rust 1.75+
- PostgreSQL 14+
- Redis 7+ (optional)

### Build

```bash
# Clone repository
git clone https://github.com/UmaiTech/aura-llm-gateway.git
cd aura-llm-gateway

# Build release binary
cargo build --release

# Binary location
./target/release/aura-proxy
```

### Run

```bash
# Set environment variables
export DATABASE_URL=postgresql://user:pass@localhost/aura
export OPENAI_API_KEY=sk-...

# Run migrations
sqlx migrate run

# Start server
./target/release/aura-proxy
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AURA_HOST` | No | Bind address (default: `0.0.0.0`) |
| `AURA_PORT` | No | Port (default: `8080`) |
| `DATABASE_URL` | Yes* | PostgreSQL connection string |
| `REDIS_URL` | No | Redis connection string |
| `OPENAI_API_KEY` | Yes** | OpenAI API key |
| `ANTHROPIC_API_KEY` | Yes** | Anthropic API key |
| `GOOGLE_API_KEY` | Yes** | Google API key |
| `AURA_ADMIN_KEY` | Recommended | Admin API key |
| `AURA_MASTER_KEY` | Recommended | Credential encryption key |
| `RUST_LOG` | No | Log level (default: `info`) |

*Required for persistence features
**At least one provider key required

### YAML Configuration

```yaml
# config.yaml
server:
  host: "0.0.0.0"
  port: 8080
  request_timeout_ms: 300000

database:
  url: ${DATABASE_URL}
  max_connections: 20

redis:
  url: ${REDIS_URL}

logging:
  level: "info"
  format: "json"  # or "pretty" for development

security:
  admin_key: ${AURA_ADMIN_KEY}
  master_key: ${AURA_MASTER_KEY}
  allowed_origins:
    - "https://app.example.com"
```

Run with config file:

```bash
./aura-proxy --config config.yaml
```

## Health Checks

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Basic health check |
| `GET /health/ready` | Readiness (DB connected) |
| `GET /health/live` | Liveness (process running) |

### Response

```json
{
  "status": "healthy",
  "version": "0.1.7",
  "database": "connected",
  "redis": "connected"
}
```

## Monitoring

### Prometheus Metrics

Metrics available at `/metrics`:

```
# Request latency
aura_request_duration_seconds{provider="openai",model="gpt-4.5"}

# Request count
aura_requests_total{provider="openai",status="success"}

# Token usage
aura_tokens_total{provider="openai",type="input"}
aura_tokens_total{provider="openai",type="output"}

# Cost
aura_cost_usd_total{provider="openai"}
```

### Structured Logging

Logs are JSON formatted for easy parsing:

```json
{
  "timestamp": "2026-01-27T12:00:00Z",
  "level": "info",
  "target": "aura_proxy::routes::responses",
  "message": "Request completed",
  "request_id": "req_abc123",
  "provider": "openai",
  "model": "gpt-4.5",
  "latency_ms": 342,
  "tokens": 150,
  "cost_usd": 0.0045
}
```

## Production Checklist

- [ ] **TLS/HTTPS** - Use a reverse proxy (nginx, Traefik) or cloud load balancer
- [ ] **Database backups** - Configure PostgreSQL backups
- [ ] **Secrets management** - Use Vault, AWS Secrets Manager, etc.
- [ ] **Rate limiting** - Configure per-key rate limits
- [ ] **Monitoring** - Set up Prometheus + Grafana
- [ ] **Alerting** - Alert on error rates, latency spikes
- [ ] **Log aggregation** - Ship logs to centralized system
- [ ] **Resource limits** - Set memory/CPU limits in containers
- [ ] **Horizontal scaling** - Run multiple replicas behind load balancer
- [ ] **Health checks** - Configure liveness/readiness probes
