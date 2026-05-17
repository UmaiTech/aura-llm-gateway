# Team Member Management

This guide explains how to add team members and create scoped API keys for individuals within your organization.

## Overview

Team members are users who belong to a team within your organization. Each member can have their own API key that is scoped to their team's resources and usage limits.

## Creating Team Members

### Using the Script

The easiest way to add a team member is using the provided script:

```bash
./scripts/add_team_member.sh [team_slug] [member_name] [member_email] [admin_api_key]
```

**Example:**

```bash
# Add Alice to the engineering team
./scripts/add_team_member.sh engineering "Alice Smith" "alice@acme.com" "$AURA_ADMIN_KEY"

# Add Bob to the product team
./scripts/add_team_member.sh product "Bob Jones" "bob@acme.com" "$AURA_ADMIN_KEY"
```

The script will:
1. Look up the team by slug
2. Create a team-scoped API key for the member
3. Return the API key to share with the team member

### Manual API Key Creation

You can also create team member keys manually via the API:

```bash
curl -X POST http://localhost:8080/v1/api-keys \
  -H "Authorization: Bearer $AURA_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice Smith - Engineering Key",
    "description": "Personal API key for Alice on Engineering team",
    "environment": "live",
    "organization_id": "org-uuid-here",
    "scope_type": "team",
    "scope_id": "team-uuid-here",
    "scopes": ["responses:create", "conversations:read"],
    "rate_limit_rpm": 100,
    "monthly_token_limit": 10000000
  }'
```

## API Key Scopes

Team members can have keys scoped at different levels:

### Organization-Level Keys
- Full access to all teams and projects within the organization
- Suitable for admins and executives

```json
{
  "organization_id": "org-uuid",
  "scope_type": "organization"
}
```

### Team-Level Keys
- Access limited to a specific team's resources
- Suitable for team leads and members

```json
{
  "organization_id": "org-uuid",
  "scope_type": "team",
  "scope_id": "team-uuid"
}
```

### Project-Level Keys
- Access limited to a specific project
- Suitable for contractors or specific applications

```json
{
  "organization_id": "org-uuid",
  "scope_type": "project",
  "scope_id": "project-uuid"
}
```

## Key Permissions

Control what team members can do with their API keys using scopes:

- `responses:create` - Create LLM responses
- `conversations:read` - Read conversation history
- `conversations:write` - Modify conversations
- `usage:read` - View usage statistics
- `*` - All permissions (admin only)

## Rate Limits and Quotas

Set appropriate limits for team member keys:

```json
{
  "rate_limit_rpm": 100,           // 100 requests per minute
  "monthly_token_limit": 10000000  // 10M tokens per month
}
```

## Usage Tracking

All requests made with team member keys are tracked with:
- Team attribution (automatically captured from key scope)
- Individual user tracking (if `user` field is provided)
- Cost breakdown by team and project

View team usage:

```bash
curl -H "Authorization: Bearer $AURA_ADMIN_KEY" \
  http://localhost:8080/v1/teams/{team_id}/usage
```

## Response Metadata

Requests made with team-scoped keys include full tenant context:

```json
{
  "metadata": {
    "aura": {
      "tenant": {
        "api_key_id": "aura_live_...",
        "organization_id": "uuid",
        "organization_name": "Acme Corp",
        "team_id": "uuid",
        "team_name": "Engineering",
        "project_id": "uuid",
        "project_name": "API Backend"
      }
    }
  }
}
```

## Best Practices

1. **One key per person**: Create individual keys for each team member rather than sharing keys
2. **Appropriate scopes**: Grant minimum necessary permissions
3. **Set limits**: Use rate limits and token quotas to prevent runaway costs
4. **Regular rotation**: Rotate API keys periodically (set `expires_in_days`)
5. **Track usage**: Monitor per-member usage via the `user` field in requests
6. **Revoke when needed**: Deactivate keys when team members leave

## Example: Complete Team Setup

```bash
# 1. Create organization and teams (one-time setup)
./scripts/setup_organization.sh "Acme Corp" "admin@acme.com" "$AURA_ADMIN_KEY"

# 2. Add engineering team members
./scripts/add_team_member.sh engineering "Alice Smith" "alice@acme.com" "$AURA_ADMIN_KEY"
./scripts/add_team_member.sh engineering "Bob Chen" "bob@acme.com" "$AURA_ADMIN_KEY"

# 3. Add product team members
./scripts/add_team_member.sh product "Carol Davis" "carol@acme.com" "$AURA_ADMIN_KEY"

# 4. Share keys with team members
# Send each person their unique API key via secure channel
```

## Managing Existing Members

### List team members' keys

```bash
curl -H "Authorization: Bearer $AURA_ADMIN_KEY" \
  "http://localhost:8080/v1/teams/{team_id}/api-keys"
```

### Revoke a member's key

```bash
curl -X DELETE \
  -H "Authorization: Bearer $AURA_ADMIN_KEY" \
  "http://localhost:8080/v1/api-keys/{key_id}"
```

### View member's usage

```bash
# Check end_user_usage_summary for per-user costs
psql $DATABASE_URL -c "
  SELECT * FROM end_user_usage_summary
  WHERE external_id = 'user_alice'
"
```
