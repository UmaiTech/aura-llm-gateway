# Organizations & End-Users

Aura provides a hierarchical organization model for multi-tenant deployments and end-user tracking for per-customer billing.

## Organization Hierarchy

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

## Hierarchy Levels

### Organizations

Top-level billing entities (your company or product).

- Single billing account for all usage
- Owner and member roles
- Organization-wide settings and limits
- Provider credential storage (encrypted)

### Teams

Departments, products, or business units within an organization.

- Separate token budgets per team
- Team-level usage tracking
- Team-scoped API keys
- Member management

### Projects

Specific initiatives or applications under a team.

- Project-level token limits
- Isolated API keys per project
- Status tracking (active, paused, archived)

## Database Schema

```sql
-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    owner_id VARCHAR(255),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams
CREATE TABLE teams (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    monthly_token_limit BIGINT,
    current_month_tokens BIGINT DEFAULT 0,
    UNIQUE(organization_id, slug)
);

-- Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    team_id UUID REFERENCES teams(id),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    monthly_token_limit BIGINT,
    UNIQUE(team_id, slug)
);

-- End Users
CREATE TABLE end_users (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    external_id VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    email VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    total_input_tokens BIGINT DEFAULT 0,
    total_output_tokens BIGINT DEFAULT 0,
    total_cost_usd DOUBLE PRECISION DEFAULT 0,
    request_count BIGINT DEFAULT 0,
    is_blocked BOOLEAN DEFAULT FALSE,
    last_seen_at TIMESTAMPTZ,
    UNIQUE(organization_id, external_id)
);
```

## API Key Scoping

API keys can be scoped to different levels:

| Scope Type | Access Level | Use Case |
|------------|--------------|----------|
| `organization` | Entire org | Admin dashboards |
| `team` | Single team | Department access |
| `project` | Single project | App-specific keys |
| `user` | Personal | Developer keys |

### Creating Scoped Keys

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

Track costs per customer using the `user` field.

### Request Format

```json
{
  "model": "gpt-5.4-mini",
  "input": [...],
  "user": "customer_123"
}
```

### Automatic Behavior

1. **Upsert**: Creates or updates end-user record
2. **Tracking**: Records tokens and costs per user
3. **Rate Limiting**: Per-user limits (if configured)
4. **Blocking**: Reject requests from blocked users

### Provider Mapping

The `user` field maps to underlying providers:

| Provider | Mapping |
|----------|---------|
| OpenAI | `user` field (native) |
| Anthropic | `metadata.user_id` |
| Google | Custom header |

### Tracked Metrics

| Field | Description |
|-------|-------------|
| `total_input_tokens` | Cumulative input tokens |
| `total_output_tokens` | Cumulative output tokens |
| `total_cost_usd` | Cumulative cost in USD |
| `request_count` | Number of API calls |
| `last_seen_at` | Last request timestamp |

## Token Budgets

### API Key Limits

```json
{
  "rate_limit_rpm": 100,
  "monthly_token_limit": 5000000
}
```

### Team/Project Budgets

```sql
-- Teams
monthly_token_limit: 10000000
current_month_tokens: 2500000

-- Projects
monthly_token_limit: 2000000
```

### Enforcement

When limits are exceeded:
- Returns `429 Too Many Requests`
- Includes reset time in response
- Usage still logged for billing

## Blocking Users

```sql
UPDATE end_users
SET is_blocked = true
WHERE external_id = 'abusive_user';
```

Blocked users receive `403 Forbidden` on all requests.

## Rust Models

```rust
// crates/aura-db/src/models.rs

pub struct Organization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub owner_id: Option<String>,
    pub settings: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

pub struct Team {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub slug: String,
    pub monthly_token_limit: Option<i64>,
    pub current_month_tokens: i64,
}

pub struct Project {
    pub id: Uuid,
    pub team_id: Uuid,
    pub name: String,
    pub slug: String,
    pub status: ProjectStatus,
    pub monthly_token_limit: Option<i64>,
}

pub struct EndUser {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub external_id: String,
    pub name: Option<String>,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cost_usd: f64,
    pub request_count: i64,
    pub is_blocked: bool,
    pub last_seen_at: Option<DateTime<Utc>>,
}
```

## Repository Functions

```rust
// End-user upsert
impl EndUserRepo {
    pub async fn upsert(pool: &DbPool, new: NewEndUser) -> Result<EndUser, DbError> {
        sqlx::query(r#"
            INSERT INTO end_users (organization_id, external_id, name)
            VALUES ($1, $2, $3)
            ON CONFLICT (organization_id, external_id)
            DO UPDATE SET
                name = COALESCE(EXCLUDED.name, end_users.name),
                last_seen_at = NOW()
            RETURNING *
        "#)
        .bind(new.organization_id)
        .bind(&new.external_id)
        .bind(&new.name)
        .fetch_one(pool)
        .await
    }

    pub async fn record_usage(
        pool: &DbPool,
        id: Uuid,
        update: EndUserUsageUpdate,
    ) -> Result<(), DbError> {
        sqlx::query(r#"
            UPDATE end_users SET
                total_input_tokens = total_input_tokens + $2,
                total_output_tokens = total_output_tokens + $3,
                total_cost_usd = total_cost_usd + $4,
                request_count = request_count + 1,
                last_seen_at = NOW()
            WHERE id = $1
        "#)
        .bind(id)
        .bind(update.input_tokens)
        .bind(update.output_tokens)
        .bind(update.cost_usd)
        .execute(pool)
        .await
    }
}
```

## Best Practices

### User ID Selection

**Recommended:**
- Database primary keys: `user_12345`
- Auth system IDs: `auth0|abc123`
- Email hashes: `sha256(email)`

**Avoid:**
- Session IDs (ephemeral)
- IP addresses (shared/dynamic)

### Budget Guidelines

| Environment | Recommended Limit |
|-------------|-------------------|
| Development | 100K tokens/month |
| Staging | 1M tokens/month |
| Production | Usage + 50% buffer |

### Monitoring Alerts

- Keys at 80% of monthly limit
- Usage spikes (3x normal)
- Failed auth attempts
- Blocked user access attempts
