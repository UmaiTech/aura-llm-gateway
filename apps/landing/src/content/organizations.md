---
title: "Organizations & End-Users"
description: "Multi-tenant organization model and per-customer cost tracking"
---

# Organizations & End-Users

Aura provides a hierarchical organization model for multi-tenant deployments and end-user tracking for per-customer billing.

## Organization Hierarchy

Aura organizes access and billing in a hierarchy:

```
Organization (your company)
├── Team A (e.g., Product Team)
│   ├── Project 1 (e.g., Customer Chatbot)
│   │   └── API Key (project-scoped)
│   └── Project 2 (e.g., Internal Tools)
│       └── API Key (project-scoped)
├── Team B (e.g., Research Team)
│   └── API Key (team-scoped)
└── End Users (your customers)
    ├── customer_123
    ├── customer_456
    └── ...
```

### Organizations

Organizations are top-level billing entities—typically your company or product.

**Features:**
- Single billing account for all usage
- Owner and member roles
- Organization-wide settings and limits
- Provider credential storage (encrypted)

### Teams

Teams represent departments, products, or business units within your organization.

**Features:**
- Separate token budgets per team
- Team-level usage tracking
- Team-scoped API keys
- Member management

**Example:** A company might have teams for "Customer Support Bot", "Sales Assistant", and "Internal Tools".

### Projects

Projects are specific initiatives or applications under a team.

**Features:**
- Project-level token limits
- Isolated API keys per project
- Status tracking (active, paused, archived)
- Fine-grained usage analytics

**Example:** Under "Customer Support Bot" team, you might have projects for "Web Widget", "Mobile App", and "Slack Integration".

## API Key Scoping

API keys can be scoped to different levels:

| Scope Type | Access Level | Use Case |
|------------|--------------|----------|
| `organization` | Entire org | Admin dashboards, billing systems |
| `team` | Single team | Department-level access |
| `project` | Single project | Application-specific keys |
| `user` | Personal | Individual developer keys |

**Creating a project-scoped key:**

```http
POST /v1/api-keys
Authorization: Bearer <admin-key>
Content-Type: application/json

{
  "name": "Web Widget Production",
  "scope_type": "project",
  "scope_id": "proj_abc123",
  "scopes": ["responses:create"],
  "monthly_token_limit": 1000000
}
```

## End-User Tracking

Track costs and usage per customer by including the `user` field in your API requests.

### Basic Usage

```javascript
const response = await fetch('https://api.aura.example/v1/responses', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer aura_live_...',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4.5',
    input: [
      { type: 'message', role: 'user', content: 'Hello!' }
    ],
    user: 'customer_123'  // Your customer's ID
  })
});
```

### How It Works

When you include the `user` field:

1. **Automatic upsert**: Aura creates or updates the end-user record
2. **Usage tracking**: Tokens and costs are recorded per user
3. **Rate limiting**: Per-user limits can be enforced (if configured)
4. **Abuse prevention**: Users can be blocked if needed

### What Gets Tracked

For each end-user, Aura tracks:

| Field | Description |
|-------|-------------|
| `external_id` | Your customer ID (the `user` field value) |
| `total_input_tokens` | Cumulative input tokens |
| `total_output_tokens` | Cumulative output tokens |
| `total_cost_usd` | Cumulative cost in USD |
| `request_count` | Number of API calls |
| `last_seen_at` | Last request timestamp |

### Use Cases

**Per-customer billing:**
```sql
-- Monthly costs per customer
SELECT external_id, SUM(cost_usd) as monthly_cost
FROM api_key_usage
WHERE end_user_external_id IS NOT NULL
  AND created_at >= date_trunc('month', now())
GROUP BY external_id
ORDER BY monthly_cost DESC;
```

**Usage analytics:**
```sql
-- Top users by token usage
SELECT external_id,
       total_input_tokens + total_output_tokens as total_tokens,
       total_cost_usd
FROM end_users
ORDER BY total_tokens DESC
LIMIT 10;
```

**Abuse detection:**
```sql
-- Users with unusual activity
SELECT external_id, request_count, total_cost_usd
FROM end_users
WHERE request_count > 10000
  OR total_cost_usd > 100;
```

## Token Budgets

Set spending limits at every level of the hierarchy.

### API Key Limits

```json
{
  "name": "Production API Key",
  "rate_limit_rpm": 100,
  "monthly_token_limit": 5000000
}
```

- `rate_limit_rpm`: Max requests per minute
- `monthly_token_limit`: Max tokens per calendar month

### Team Budgets

Teams can have their own monthly token budgets:

```sql
-- Teams table
monthly_token_limit: 10000000  -- 10M tokens/month
current_month_tokens: 2500000  -- Usage so far
```

### Project Budgets

Projects inherit team limits but can have their own caps:

```sql
-- Projects table
monthly_token_limit: 2000000  -- 2M tokens/month
```

### Enforcement

When limits are exceeded:
- API returns `429 Too Many Requests`
- Error includes reset time
- Usage is still logged (for billing)

## Blocking Users

Block abusive end-users to prevent further API access:

```sql
-- Block a user
UPDATE end_users
SET is_blocked = true
WHERE external_id = 'abusive_user_123';
```

When a blocked user makes a request:
- Request is rejected with `403 Forbidden`
- No tokens are consumed
- Attempt is logged for audit

## Best Practices

### Choosing User IDs

Use stable, unique identifiers for the `user` field:

**Good:**
- Database primary keys: `user_12345`
- Auth system IDs: `auth0|abc123`
- Email hashes: `sha256(email)`

**Avoid:**
- Session IDs (change per session)
- IP addresses (shared/dynamic)
- Empty strings

### Setting Budgets

Start conservative and increase as needed:

1. **Development**: Low limits (100K tokens/month)
2. **Staging**: Medium limits (1M tokens/month)
3. **Production**: Based on expected usage + 50% buffer

### Monitoring

Set up alerts for:
- Keys approaching monthly limits (80% threshold)
- Unusual usage spikes (3x normal)
- Failed authentication attempts
- Blocked user access attempts

## API Reference

### List End-Users

```http
GET /v1/end-users
Authorization: Bearer <admin-key>
```

Response:
```json
{
  "users": [
    {
      "id": "uuid",
      "external_id": "customer_123",
      "total_input_tokens": 50000,
      "total_output_tokens": 25000,
      "total_cost_usd": 0.75,
      "is_blocked": false,
      "last_seen_at": "2026-01-27T12:00:00Z"
    }
  ]
}
```

### Get End-User Usage

```http
GET /v1/end-users/{external_id}/usage
Authorization: Bearer <admin-key>
```

Response:
```json
{
  "external_id": "customer_123",
  "period": "2026-01",
  "input_tokens": 50000,
  "output_tokens": 25000,
  "cost_usd": 0.75,
  "request_count": 150
}
```

### Block/Unblock End-User

```http
POST /v1/end-users/{external_id}/block
Authorization: Bearer <admin-key>
```

```http
DELETE /v1/end-users/{external_id}/block
Authorization: Bearer <admin-key>
```

## Next Steps

- [Authentication](/docs/api/authentication) - API key management
- [Cost Tracking](/docs/api/cost-tracking) - Understanding costs
- [Architecture](/docs/architecture) - System design details
