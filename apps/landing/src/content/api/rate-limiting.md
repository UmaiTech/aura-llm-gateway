---
title: "Rate Limiting"
description: "Per-key rate limiting with token bucket algorithm"
---

# Rate Limiting

Aura includes built-in rate limiting to protect your API keys and ensure fair usage across clients.

## How It Works

Rate limiting uses the **token bucket algorithm** with Redis for distributed state:

- Each API key has a configurable **requests per minute (RPM)** limit
- Requests consume tokens from the bucket
- Tokens replenish over time (1 token per second for 60 RPM)
- When the bucket is empty, requests return `429 Too Many Requests`

## Rate Limit Headers

Every response includes rate limit headers:

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 42
Content-Type: application/json
```

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per minute for this API key |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Seconds until the rate limit window resets |

## Configuring Rate Limits

Rate limits are set per API key. When creating an API key, specify the `rate_limit_rpm`:

```bash
curl -X POST https://api.aura.example/v1/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production-key",
    "rate_limit_rpm": 120,
    "scopes": ["responses:create"]
  }'
```

### Default Limits

| Key Type | Default RPM |
|----------|-------------|
| Test keys (`aura_test_*`) | 60 |
| Live keys (`aura_live_*`) | 60 |
| Custom | Configurable |

## Rate Limit Exceeded

When you exceed the rate limit, you'll receive a `429` response:

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Try again in 42 seconds.",
    "param": null
  }
}
```

### Best Practices

1. **Monitor headers**: Check `X-RateLimit-Remaining` to avoid hitting limits
2. **Implement backoff**: When you get a 429, wait for the `X-RateLimit-Reset` duration
3. **Use exponential backoff**: For retries, use increasing delays (1s, 2s, 4s, 8s...)

```python
import time
from aura import AuraClient

client = AuraClient()

def make_request_with_retry(prompt, max_retries=3):
    for attempt in range(max_retries):
        try:
            return client.responses.create(
                model="gpt-4o",
                input=prompt
            )
        except RateLimitError as e:
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt  # Exponential backoff
                time.sleep(wait_time)
            else:
                raise
```

## Monthly Token Budgets

In addition to RPM limits, API keys can have monthly token budgets:

```json
{
  "name": "budget-limited-key",
  "rate_limit_rpm": 60,
  "monthly_token_limit": 1000000
}
```

When the monthly limit is exceeded, requests will fail until the next billing cycle.

## Redis Configuration

Rate limiting requires Redis. Configure via environment variable:

```bash
export REDIS_URL=redis://localhost:6379
```

### Graceful Degradation

If Redis is unavailable, rate limiting is bypassed (fail-open). This ensures your application continues working, but without rate limit protection.

## Metrics

Rate limit events are tracked via Prometheus metrics:

```
# Rate limit exceeded events
aura_rate_limit_exceeded_total{api_key_id="key_123"} 5

# Current request rate (approximate)
aura_requests_total{api_key_id="key_123"} 150
```

Monitor these metrics to:
- Identify clients hitting rate limits
- Adjust limits based on usage patterns
- Detect potential abuse

## See Also

- [Authentication](/docs/api/authentication) - API key management
- [Error Reference](/docs/api/errors) - Error codes and handling
- [Configuration](/docs/configuration) - Redis setup
