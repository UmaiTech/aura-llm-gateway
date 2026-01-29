---
title: "Error Reference"
description: "Complete list of error codes and troubleshooting"
---

# Error Reference

All Aura API errors follow the Open Responses API format with a consistent structure.

## Error Format

```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable description",
    "param": "field_name"  // Optional: which field caused the error
  }
}
```

## HTTP Status Codes

| Status | Meaning |
|--------|---------|
| `400` | Bad Request - Invalid request format or parameters |
| `401` | Unauthorized - Invalid or missing API key |
| `403` | Forbidden - Valid key but insufficient permissions |
| `404` | Not Found - Resource doesn't exist |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error - Something went wrong |
| `502` | Bad Gateway - Provider API error |
| `503` | Service Unavailable - Provider temporarily down |

## Error Codes

### Authentication Errors (401)

#### `invalid_api_key`

The API key is missing, malformed, or doesn't exist.

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "Invalid or missing API key"
  }
}
```

**Solutions:**
- Check the `Authorization` header format: `Bearer aura_live_...`
- Verify the API key hasn't been revoked
- Ensure the key prefix matches (`aura_live_` or `aura_test_`)

#### `expired_api_key`

The API key has passed its expiration date.

```json
{
  "error": {
    "code": "expired_api_key",
    "message": "API key has expired"
  }
}
```

**Solution:** Create a new API key via the admin API.

### Authorization Errors (403)

#### `insufficient_scope`

The API key doesn't have the required scope for this operation.

```json
{
  "error": {
    "code": "insufficient_scope",
    "message": "API key does not have required scope: usage:read"
  }
}
```

**Solution:** Create a new API key with the required scopes.

#### `user_blocked`

The end-user (specified in `user` field) has been blocked.

```json
{
  "error": {
    "code": "user_blocked",
    "message": "End-user is blocked from making requests"
  }
}
```

**Solution:** Unblock the user via admin API or database.

### Request Errors (400)

#### `invalid_request`

The request body is malformed or missing required fields.

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Missing required field: model",
    "param": "model"
  }
}
```

**Solution:** Check the request format against the API documentation.

#### `invalid_model`

The specified model doesn't exist or isn't supported.

```json
{
  "error": {
    "code": "invalid_model",
    "message": "Model 'gpt-5-ultra' is not available",
    "param": "model"
  }
}
```

**Solution:** Use a supported model. Check `/v1/models` for available models.

#### `invalid_input`

The input format is incorrect.

```json
{
  "error": {
    "code": "invalid_input",
    "message": "Input must be a string or array of items",
    "param": "input"
  }
}
```

**Solution:** Ensure input is either a string or array of message items.

#### `context_length_exceeded`

The total tokens (input + expected output) exceed the model's context window.

```json
{
  "error": {
    "code": "context_length_exceeded",
    "message": "Request exceeds model's context window of 128000 tokens"
  }
}
```

**Solutions:**
- Reduce the input length
- Use a model with larger context window
- Use `truncation_strategy` to auto-truncate

### Rate Limit Errors (429)

#### `rate_limit_exceeded`

Too many requests in the time window.

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Try again in 60 seconds.",
    "retry_after": 60
  }
}
```

**Solutions:**
- Wait for the `retry_after` period
- Implement exponential backoff
- Request higher rate limits

#### `token_limit_exceeded`

Monthly token budget exhausted.

```json
{
  "error": {
    "code": "token_limit_exceeded",
    "message": "Monthly token limit of 1000000 exceeded"
  }
}
```

**Solutions:**
- Wait for the monthly reset
- Request higher token limits
- Use a different API key

### Provider Errors (502/503)

#### `provider_error`

The upstream LLM provider returned an error.

```json
{
  "error": {
    "code": "provider_error",
    "message": "OpenAI API error: The model is currently overloaded"
  }
}
```

**Solution:** Retry the request or use a different provider/model.

#### `provider_unavailable`

The provider is temporarily unavailable.

```json
{
  "error": {
    "code": "provider_unavailable",
    "message": "Anthropic API is temporarily unavailable"
  }
}
```

**Solution:** Retry with exponential backoff or failover to another provider.

#### `provider_rate_limit`

Rate limited by the upstream provider (not Aura).

```json
{
  "error": {
    "code": "provider_rate_limit",
    "message": "OpenAI rate limit exceeded",
    "retry_after": 20
  }
}
```

**Solutions:**
- Wait for the `retry_after` period
- Use a different API key
- Contact provider to increase limits

#### `provider_auth_error`

Invalid or expired provider API key.

```json
{
  "error": {
    "code": "provider_auth_error",
    "message": "Invalid OpenAI API key"
  }
}
```

**Solution:** Update the provider API key in Aura's configuration.

### Server Errors (500)

#### `internal_error`

An unexpected error occurred.

```json
{
  "error": {
    "code": "internal_error",
    "message": "An internal error occurred"
  }
}
```

**Solution:** Retry the request. If persistent, check server logs.

#### `database_error`

Database operation failed.

```json
{
  "error": {
    "code": "database_error",
    "message": "Failed to save response"
  }
}
```

**Solution:** Check database connectivity and logs.

## Provider-Specific Errors

### OpenAI

| Provider Code | Aura Code | Description |
|---------------|-----------|-------------|
| `invalid_api_key` | `provider_auth_error` | Invalid API key |
| `rate_limit_exceeded` | `provider_rate_limit` | Too many requests |
| `context_length_exceeded` | `context_length_exceeded` | Input too long |
| `server_error` | `provider_error` | OpenAI server error |

### Anthropic

| Provider Code | Aura Code | Description |
|---------------|-----------|-------------|
| `authentication_error` | `provider_auth_error` | Invalid API key |
| `rate_limit_error` | `provider_rate_limit` | Too many requests |
| `overloaded_error` | `provider_unavailable` | Service overloaded |
| `invalid_request_error` | `invalid_request` | Bad request format |

### Google

| Provider Code | Aura Code | Description |
|---------------|-----------|-------------|
| `UNAUTHENTICATED` | `provider_auth_error` | Invalid API key |
| `RESOURCE_EXHAUSTED` | `provider_rate_limit` | Quota exceeded |
| `UNAVAILABLE` | `provider_unavailable` | Service unavailable |

## Handling Errors

### Retry Strategy

```python
import time
from aura import AuraClient, AuraError

client = AuraClient()

def make_request_with_retry(input_text, max_retries=3):
    for attempt in range(max_retries):
        try:
            return client.responses.create(
                model="gpt-4.5",
                input=input_text
            )
        except AuraError as e:
            if e.code in ["rate_limit_exceeded", "provider_rate_limit"]:
                wait_time = e.retry_after or (2 ** attempt)
                time.sleep(wait_time)
                continue
            elif e.code == "provider_unavailable":
                time.sleep(2 ** attempt)
                continue
            else:
                raise
    raise Exception("Max retries exceeded")
```

### Error Logging

```python
import logging

try:
    response = client.responses.create(...)
except AuraError as e:
    logging.error(
        "Aura API error",
        extra={
            "code": e.code,
            "message": e.message,
            "param": e.param,
            "status": e.status_code
        }
    )
```

## Getting Help

If you encounter persistent errors:

1. **Check status page** - Provider outages affect Aura
2. **Review logs** - Enable `RUST_LOG=debug` for details
3. **Search issues** - Check GitHub for similar problems
4. **Open issue** - Report bugs with full error details
