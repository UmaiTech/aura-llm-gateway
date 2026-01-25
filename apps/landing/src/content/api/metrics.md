---
title: "Prometheus Metrics"
description: "Observability via /metrics endpoint"
---

# Prometheus Metrics

Aura exposes a `/metrics` endpoint compatible with Prometheus for monitoring and alerting.

## Endpoint

```bash
curl http://localhost:8080/metrics
```

Returns metrics in Prometheus text format:

```
# HELP aura_requests_total Total number of requests
# TYPE aura_requests_total counter
aura_requests_total{provider="openai",model="gpt-4o",stream="false"} 1523
aura_requests_total{provider="anthropic",model="claude-3-opus",stream="true"} 847
```

## Available Metrics

### Request Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `aura_requests_total` | Counter | provider, model, stream | Total requests |
| `aura_request_duration_seconds` | Histogram | provider, model, status | Request latency |

### Token Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `aura_input_tokens_total` | Counter | provider, model | Total input tokens |
| `aura_output_tokens_total` | Counter | provider, model | Total output tokens |
| `aura_cached_tokens_total` | Counter | provider, model | Cached input tokens |
| `aura_reasoning_tokens_total` | Counter | provider, model | Reasoning tokens (Claude) |

### Cost Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `aura_cost_usd_total` | Counter | provider, model | Total cost in USD |

### Cache Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `aura_cache_hits_total` | Counter | provider, model | Cache hits |
| `aura_cache_misses_total` | Counter | provider, model | Cache misses |

### Rate Limit Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `aura_rate_limit_exceeded_total` | Counter | api_key_id | Rate limit 429 responses |

## Example Queries

### Request Rate

```promql
# Requests per second by provider
rate(aura_requests_total[5m])

# Requests per minute
sum(rate(aura_requests_total[1m])) * 60
```

### Latency

```promql
# 95th percentile latency by provider
histogram_quantile(0.95,
  rate(aura_request_duration_seconds_bucket[5m])
) by (provider)

# Average latency
rate(aura_request_duration_seconds_sum[5m])
  / rate(aura_request_duration_seconds_count[5m])
```

### Token Usage

```promql
# Total tokens per hour
sum(increase(aura_input_tokens_total[1h]))
  + sum(increase(aura_output_tokens_total[1h]))

# Tokens by model
sum by (model) (
  rate(aura_input_tokens_total[5m]) + rate(aura_output_tokens_total[5m])
)
```

### Cost

```promql
# Daily cost by provider
sum by (provider) (increase(aura_cost_usd_total[24h]))

# Hourly cost trend
sum(rate(aura_cost_usd_total[1h])) * 3600
```

### Cache Performance

```promql
# Cache hit rate
sum(rate(aura_cache_hits_total[5m]))
  / (sum(rate(aura_cache_hits_total[5m])) + sum(rate(aura_cache_misses_total[5m])))

# Cache savings (estimated)
sum(rate(aura_cache_hits_total[1h])) * avg(aura_cost_usd_per_request)
```

### Error Rate

```promql
# Error rate by provider
sum by (provider) (rate(aura_request_duration_seconds_count{status="error"}[5m]))
  / sum by (provider) (rate(aura_request_duration_seconds_count[5m]))
```

## Grafana Dashboard

Here's a sample Grafana dashboard JSON for Aura:

```json
{
  "title": "Aura LLM Gateway",
  "panels": [
    {
      "title": "Request Rate",
      "type": "timeseries",
      "targets": [{
        "expr": "sum(rate(aura_requests_total[5m])) by (provider)"
      }]
    },
    {
      "title": "Latency P95",
      "type": "timeseries",
      "targets": [{
        "expr": "histogram_quantile(0.95, rate(aura_request_duration_seconds_bucket[5m]))"
      }]
    },
    {
      "title": "Hourly Cost",
      "type": "stat",
      "targets": [{
        "expr": "sum(increase(aura_cost_usd_total[1h]))"
      }]
    },
    {
      "title": "Cache Hit Rate",
      "type": "gauge",
      "targets": [{
        "expr": "sum(rate(aura_cache_hits_total[5m])) / (sum(rate(aura_cache_hits_total[5m])) + sum(rate(aura_cache_misses_total[5m])))"
      }]
    }
  ]
}
```

## Prometheus Configuration

Add Aura to your Prometheus scrape config:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'aura'
    static_configs:
      - targets: ['localhost:8080']
    scrape_interval: 15s
    metrics_path: /metrics
```

## Alerting Rules

Example alerting rules:

```yaml
# alerts.yml
groups:
  - name: aura
    rules:
      # High error rate
      - alert: AuraHighErrorRate
        expr: |
          sum(rate(aura_request_duration_seconds_count{status="error"}[5m]))
          / sum(rate(aura_request_duration_seconds_count[5m])) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on Aura gateway"

      # High latency
      - alert: AuraHighLatency
        expr: |
          histogram_quantile(0.95, rate(aura_request_duration_seconds_bucket[5m])) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency on Aura gateway"

      # Low cache hit rate
      - alert: AuraLowCacheHitRate
        expr: |
          sum(rate(aura_cache_hits_total[5m]))
          / (sum(rate(aura_cache_hits_total[5m])) + sum(rate(aura_cache_misses_total[5m]))) < 0.5
        for: 15m
        labels:
          severity: info
        annotations:
          summary: "Cache hit rate below 50%"
```

## Health Check

The `/health` endpoint provides a quick status check:

```bash
curl http://localhost:8080/health
```

```json
{
  "status": "ok",
  "service": "aura-llm-gateway",
  "version": "0.2.6",
  "timestamp": "2026-01-25T12:00:00Z"
}
```

## See Also

- [Rate Limiting](/docs/api/rate-limiting) - Per-key limits with metrics
- [Caching](/docs/api/caching) - Cache performance metrics
- [Configuration](/docs/configuration) - Server configuration
