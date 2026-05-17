---
title: "Response Caching"
description: "TTL-based response caching with Redis"
---

# Response Caching

Aura can cache LLM responses to reduce costs and latency for repeated requests.

## How It Works

When caching is enabled:

1. Aura generates a **cache key** from the request (SHA256 hash)
2. Before calling the LLM, Aura checks Redis for a cached response
3. **Cache hit**: Returns the cached response immediately (~1ms)
4. **Cache miss**: Calls the LLM and stores the response with TTL

## Cache Key Generation

The cache key is a SHA256 hash of:
- Model name
- Input messages/content
- Temperature (if specified)
- Other request parameters

This ensures that identical requests return identical cached responses.

## What Gets Cached

| Request Type | Cached? | Reason |
|--------------|---------|--------|
| Non-streaming, temperature=0 | ✅ Yes | Deterministic output |
| Non-streaming, temperature>0 | ❌ No | Non-deterministic |
| Streaming requests | ❌ No | Real-time generation |
| Requests with `X-Cache-Control: no-cache` | ❌ No | Explicit bypass |

### Why Temperature Matters

LLM responses are **deterministic** only when `temperature=0`. With higher temperatures, the same input can produce different outputs, making caching inappropriate.

```json
// Cacheable - deterministic
{
  "model": "gpt-5.4-mini",
  "input": "What is 2+2?",
  "temperature": 0
}

// Not cached - non-deterministic
{
  "model": "gpt-5.4-mini",
  "input": "Write a poem",
  "temperature": 0.7
}
```

## Cache Bypass

To skip the cache and force a fresh LLM call, use the `X-Cache-Control` header:

```bash
curl -X POST https://api.aura.example/v1/responses \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Cache-Control: no-cache" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4-mini",
    "input": "What is the current time?",
    "temperature": 0
  }'
```

Use cache bypass when:
- You need the latest information
- Testing changes to prompts
- Debugging caching behavior

## Cache TTL

The default cache TTL is **1 hour** (3600 seconds). Cached responses expire automatically after this period.

### Configuring TTL

TTL can be configured via environment variable:

```bash
export AURA_CACHE_TTL_SECONDS=7200  # 2 hours
```

## Response Headers

Cached responses include cache status in the metadata:

```json
{
  "id": "resp_abc123",
  "output": [...],
  "metadata": {
    "aura": {
      "cache_hit": true,
      "cache_key": "sha256:a1b2c3...",
      "latency_ms": 2
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `cache_hit` | `true` if response was from cache |
| `cache_key` | The SHA256 cache key (truncated) |
| `latency_ms` | Total response time (very low for cache hits) |

## Metrics

Cache performance is tracked via Prometheus metrics:

```
# Cache statistics
aura_cache_hits_total{provider="openai", model="gpt-5.4-mini"} 1523
aura_cache_misses_total{provider="openai", model="gpt-5.4-mini"} 347

# Cache hit rate = hits / (hits + misses)
# Example: 1523 / (1523 + 347) = 81.4% hit rate
```

## Cost Savings

Cached responses are **free** - no tokens are consumed and no LLM API calls are made:

```json
{
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0,
    "cost_usd": 0.00
  }
}
```

### Estimating Savings

Monitor your cache hit rate to estimate savings:

| Hit Rate | Cost Reduction |
|----------|----------------|
| 50% | ~50% savings |
| 75% | ~75% savings |
| 90% | ~90% savings |

## Best Practices

### 1. Use Temperature 0 for Factual Queries

```python
# Good - will be cached
response = client.responses.create(
    model="gpt-5.4-mini",
    input="What is the capital of France?",
    temperature=0
)
```

### 2. Normalize Inputs

Ensure consistent formatting to maximize cache hits:

```python
# These will have DIFFERENT cache keys:
"What is the capital of France?"
"What is the capital of France? "  # trailing space
"what is the capital of france?"   # different case
```

### 3. Use Streaming for Interactive Use Cases

For chat interfaces where users expect real-time feedback, use streaming (which bypasses cache):

```python
for event in client.responses.create(
    model="gpt-5.4-mini",
    input="Tell me a story",
    stream=True
):
    print(event.delta, end="")
```

## Redis Configuration

Caching requires Redis. Configure via environment variable:

```bash
export REDIS_URL=redis://localhost:6379
```

### Graceful Degradation

If Redis is unavailable, caching is disabled but requests continue to work normally.

## See Also

- [Rate Limiting](/docs/api/rate-limiting) - Per-key request limits
- [Cost Tracking](/docs/api/cost-tracking) - Monitor your spending
- [Configuration](/docs/configuration) - Redis and cache settings
