---
title: "Authentication"
description: "API key authentication and security"
---

# Authentication

Aura uses API key authentication to secure access and track usage per organization.

## API Keys

All API requests must include a valid API key in the `Authorization` header:

```bash
curl -X POST https://api.aura.example/v1/responses \
  -H "Authorization: Bearer aura_live_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4.5", "input": [...]}'
```

## API Key Format

API keys follow a structured format for easy identification:

| Environment | Format | Example |
|-------------|--------|---------|
| Production | `aura_live_<32_chars>` | `aura_live_a1b2c3d4e5f6...` |
| Development | `aura_test_<32_chars>` | `aura_test_x9y8z7w6v5u4...` |

The prefix indicates the environment. Keys are never stored in plaintext—only a SHA-256 hash is kept in the database.

## API Key Scopes

API keys can be scoped to limit their permissions:

| Scope | Description |
|-------|-------------|
| `responses:create` | Create new responses (default) |
| `responses:read` | Read response history |
| `conversations:read` | Read conversation data |
| `conversations:write` | Manage conversations |
| `usage:read` | View usage statistics |
| `*` | Full access (admin keys) |

## Hierarchical API Keys

API keys can be scoped to different levels in the organization:

```
Organization
├── Team A
│   ├── Project 1 → API Key (project-scoped)
│   └── Project 2 → API Key (project-scoped)
└── Team B
    └── API Key (team-scoped)
```

**Scope Types:**

| Type | Description |
|------|-------------|
| `organization` | Access to entire org (default) |
| `team` | Limited to specific team |
| `project` | Limited to specific project |
| `user` | Personal API key |

## Rate Limiting

Each API key can have rate limits configured:

- **`rate_limit_rpm`**: Requests per minute
- **`monthly_token_limit`**: Max tokens per month

When limits are exceeded, the API returns `429 Too Many Requests`.

## End-User Tracking

Include the `user` field in requests to track costs per customer:

```json
{
  "model": "gpt-4.5",
  "input": [...],
  "user": "customer_12345"
}
```

This enables:
- Per-customer billing and cost allocation
- Per-user rate limiting
- Usage reporting by customer
- Blocking abusive users

## Creating API Keys

```http
POST /v1/api-keys
Authorization: Bearer <admin-key>
Content-Type: application/json

{
  "name": "Production Backend",
  "scopes": ["responses:create", "responses:read"],
  "rate_limit_rpm": 100,
  "monthly_token_limit": 1000000
}
```

Response:

```json
{
  "key": "aura_live_a1b2c3d4e5f6...",
  "key_id": "aura_live_a1b2c3",
  "name": "Production Backend",
  "scopes": ["responses:create", "responses:read"]
}
```

**Important:** The full API key is only returned once at creation. Store it securely.

## Error Responses

### 401 Unauthorized

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "Invalid or missing API key"
  }
}
```

### 403 Forbidden

```json
{
  "error": {
    "code": "insufficient_scope",
    "message": "API key does not have required scope: usage:read"
  }
}
```

### 429 Too Many Requests

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Try again in 60 seconds."
  }
}
```

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use environment variables** for API keys in production
3. **Rotate keys regularly** (create new, update apps, revoke old)
4. **Use minimal scopes** - only grant needed permissions
5. **Set expiration dates** when possible
6. **Monitor usage** for unusual patterns
7. **Use separate keys** for dev, staging, and production
