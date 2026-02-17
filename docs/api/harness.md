# Agentic Harness API

The Agentic Harness provides endpoints for tracing agent execution, managing system prompts, and configuring guardrails for agent behavior.

All endpoints require admin authentication via `Authorization: Bearer <AURA_ADMIN_KEY>`.

## Traces

View agent execution traces derived from request logs. Each trace captures the provider, model, latency, cost, and tool call metadata for a single request.

### List Traces

```
GET /admin/harness/traces
```

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Max results (capped at 200) |
| `offset` | integer | 0 | Pagination offset |
| `has_tool_calls` | boolean | — | Filter by tool usage |
| `status` | string | — | Filter by status (`completed`, `failed`) |

**Response:** `200 OK`

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "session_id": "resp_abc123",
    "status": "completed",
    "provider": "openai",
    "model": "gpt-4o",
    "total_latency_ms": 523,
    "total_cost": 0.0012,
    "input_tokens": 150,
    "output_tokens": 80,
    "has_tool_calls": true,
    "tool_calls_count": 2,
    "tools_used": ["web_search", "calculate"],
    "has_reasoning": false,
    "created_at": "2026-02-17T00:00:00Z"
  }
]
```

### Get Trace Detail

```
GET /admin/harness/traces/{id}
```

Returns the trace plus `tool_calls_data` (array of tool call arguments) and `full_metadata` (the complete request log metadata JSONB).

**Response:** `200 OK` or `404 Not Found`

---

## Prompts

CRUD operations for a versioned system prompt library. Each prompt has a version counter that increments when content changes, and all versions are preserved for diffing and rollback.

### List Prompts

```
GET /admin/harness/prompts?limit=50&offset=0
```

**Response:** `200 OK` — array of `HarnessPrompt` objects.

### Get Prompt

```
GET /admin/harness/prompts/{id}
```

**Response:** `200 OK` or `404 Not Found`

### Create Prompt

```
POST /admin/harness/prompts
Content-Type: application/json
```

```json
{
  "name": "Customer Support Agent",
  "description": "Production support prompt for Acme Co.",
  "content": "You are a helpful customer support agent for Acme Co. Always be polite and professional.",
  "tags": ["support", "production"],
  "category": "support"
}
```

**Required fields:** `name`, `content`

**Response:** `201 Created`

```json
{
  "id": "...",
  "name": "Customer Support Agent",
  "content": "You are a helpful customer support agent...",
  "version": 1,
  "is_active": true,
  "tags": ["support", "production"],
  "category": "support",
  "use_count": 0,
  "created_at": "...",
  "updated_at": "..."
}
```

### Update Prompt

```
PUT /admin/harness/prompts/{id}
Content-Type: application/json
```

```json
{
  "content": "Updated prompt text...",
  "change_note": "Improved tone for billing inquiries"
}
```

All fields are optional. If `content` changes, `version` auto-increments and a version record is created.

**Response:** `200 OK` or `404 Not Found`

### Delete Prompt

```
DELETE /admin/harness/prompts/{id}
```

**Response:** `204 No Content` or `404 Not Found`

### Get Prompt Version History

```
GET /admin/harness/prompts/{id}/history
```

**Response:** `200 OK`

```json
[
  {
    "id": "...",
    "prompt_id": "...",
    "version": 2,
    "content": "Updated prompt text...",
    "change_note": "Improved tone for billing inquiries",
    "created_at": "..."
  },
  {
    "id": "...",
    "prompt_id": "...",
    "version": 1,
    "content": "Original prompt text...",
    "change_note": "Initial version",
    "created_at": "..."
  }
]
```

---

## Guardrails

Get and update agent execution limits, loop detection, and content safety configuration.

### Get Guardrails

```
GET /admin/harness/guardrails
```

Returns the current configuration. If none has been saved yet, returns defaults.

**Response:** `200 OK`

```json
{
  "id": "...",
  "max_tool_calls": 10,
  "max_execution_time_secs": 60,
  "max_tokens": 8000,
  "max_cost_usd": 1.0,
  "detect_repeated_calls": true,
  "auto_terminate_loops": true,
  "max_identical_calls": 3,
  "log_suspected_loops": true,
  "enable_content_moderation": true,
  "block_sensitive_data": false,
  "require_human_approval": false,
  "created_at": "...",
  "updated_at": "..."
}
```

### Update Guardrails

```
PUT /admin/harness/guardrails
Content-Type: application/json
```

All fields are optional. Only the fields you include will be updated (upsert).

```json
{
  "max_tool_calls": 5,
  "max_cost_usd": 0.50,
  "enable_content_moderation": false
}
```

**Response:** `200 OK`

---

## Testing

### Prerequisites

```bash
# Start dependencies
docker compose up postgres redis -d

# Run migrations
sqlx migrate run
```

### Running Tests

```bash
# Unit tests (no database required)
cargo test -p aura-proxy

# Full workspace tests
cargo test --workspace

# Just the admin/harness tests
cargo test -p aura-proxy -- admin::tests
```

### Manual API Testing

Start the server:

```bash
# Without admin key (open access for dev)
cargo run -p aura-proxy

# With admin key
AURA_ADMIN_KEY=my-secret cargo run -p aura-proxy
```

#### Test Prompts CRUD

```bash
BASE=http://localhost:8080
AUTH="Authorization: Bearer my-secret"

# Create a prompt
curl -s -X POST "$BASE/admin/harness/prompts" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Test Prompt","content":"You are a helpful assistant.","tags":["test"]}' | jq .

# List prompts
curl -s "$BASE/admin/harness/prompts" -H "$AUTH" | jq .

# Get single prompt (replace ID)
curl -s "$BASE/admin/harness/prompts/<ID>" -H "$AUTH" | jq .

# Update prompt content (creates version 2)
curl -s -X PUT "$BASE/admin/harness/prompts/<ID>" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"content":"Updated: You are a concise assistant.","change_note":"Made more concise"}' | jq .

# View version history
curl -s "$BASE/admin/harness/prompts/<ID>/history" -H "$AUTH" | jq .

# Delete prompt
curl -s -X DELETE "$BASE/admin/harness/prompts/<ID>" -H "$AUTH" -w "\n%{http_code}\n"
```

#### Test Guardrails

```bash
# Get current guardrails (returns defaults if none saved)
curl -s "$BASE/admin/harness/guardrails" -H "$AUTH" | jq .

# Save custom guardrails
curl -s -X PUT "$BASE/admin/harness/guardrails" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"max_tool_calls":5,"max_cost_usd":0.50,"enable_content_moderation":false}' | jq .

# Verify the save persisted
curl -s "$BASE/admin/harness/guardrails" -H "$AUTH" | jq .
```

#### Test Traces

```bash
# List all traces
curl -s "$BASE/admin/harness/traces" -H "$AUTH" | jq .

# Filter to traces with tool calls
curl -s "$BASE/admin/harness/traces?has_tool_calls=true" -H "$AUTH" | jq .

# Filter by status
curl -s "$BASE/admin/harness/traces?status=failed&limit=10" -H "$AUTH" | jq .

# Get single trace detail (replace ID)
curl -s "$BASE/admin/harness/traces/<ID>" -H "$AUTH" | jq .
```

### Health Probes

```bash
# Basic health
curl -s http://localhost:8080/health | jq .

# Liveness (always 200)
curl -s http://localhost:8080/health/live | jq .

# Readiness (checks DB + Redis)
curl -s http://localhost:8080/health/ready | jq .
```
