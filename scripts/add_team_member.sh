#!/usr/bin/env bash
#
# Add a team member with their own scoped API key
#
# Usage: ./scripts/add_team_member.sh [team_slug] [member_name] [member_email] [admin_api_key]
#
# Examples:
#   ./scripts/add_team_member.sh engineering "Alice Smith" "alice@acme.com" "$AURA_ADMIN_KEY"
#   ./scripts/add_team_member.sh product "Bob Jones" "bob@acme.com" "$AURA_ADMIN_KEY"

set -e

# Configuration
TEAM_SLUG="${1}"
MEMBER_NAME="${2}"
MEMBER_EMAIL="${3}"
ADMIN_API_KEY="${4}"
API_BASE="${AURA_API_BASE:-http://localhost:8080}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Add Team Member${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Validate inputs
if [ -z "$TEAM_SLUG" ] || [ -z "$MEMBER_NAME" ] || [ -z "$MEMBER_EMAIL" ] || [ -z "$ADMIN_API_KEY" ]; then
    echo -e "${RED}Error: Missing required arguments${NC}"
    echo "Usage: $0 [team_slug] [member_name] [member_email] [admin_api_key]"
    echo ""
    echo "Example:"
    echo "  $0 engineering \"Alice Smith\" \"alice@acme.com\" \"\$AURA_ADMIN_KEY\""
    exit 1
fi

# Helper function to make API calls
api_call() {
    local method="$1"
    local endpoint="$2"
    local data="$3"

    if [ -z "$data" ]; then
        curl -s -X "$method" "$API_BASE$endpoint" \
            -H "Authorization: Bearer $ADMIN_API_KEY" \
            -H "Content-Type: application/json"
    else
        curl -s -X "$method" "$API_BASE$endpoint" \
            -H "Authorization: Bearer $ADMIN_API_KEY" \
            -H "Content-Type: application/json" \
            -d "$data"
    fi
}

echo -e "${YELLOW}Looking up team...${NC}"
TEAMS_RESPONSE=$(api_call GET "/v1/teams?slug=$TEAM_SLUG")
TEAM_ID=$(echo "$TEAMS_RESPONSE" | jq -r '.[0].id // empty')
TEAM_NAME=$(echo "$TEAMS_RESPONSE" | jq -r '.[0].name // empty')
ORG_ID=$(echo "$TEAMS_RESPONSE" | jq -r '.[0].organization_id // empty')

if [ -z "$TEAM_ID" ] || [ "$TEAM_ID" = "null" ]; then
    echo -e "${RED}✗ Team not found: $TEAM_SLUG${NC}"
    echo ""
    echo "Available teams:"
    api_call GET "/v1/teams" | jq -r '.[] | "  - \(.slug) (\(.name))"'
    exit 1
fi

echo -e "${GREEN}✓ Found team: $TEAM_NAME ($TEAM_ID)${NC}"
echo ""

# Generate user ID from email
MEMBER_USER_ID="user_$(echo "$MEMBER_EMAIL" | sed 's/@.*//' | tr '[:upper:]' '[:lower:]')"

echo -e "${YELLOW}Creating API key for team member...${NC}"
echo "  Name: $MEMBER_NAME"
echo "  Email: $MEMBER_EMAIL"
echo "  User ID: $MEMBER_USER_ID"
echo ""

# Create team-scoped API key for the member
KEY_RESPONSE=$(api_call POST "/v1/api-keys" "{
    \"name\": \"$MEMBER_NAME - Team Key\",
    \"description\": \"Personal API key for $MEMBER_NAME on $TEAM_NAME team\",
    \"environment\": \"live\",
    \"organization_id\": \"$ORG_ID\",
    \"scope_type\": \"team\",
    \"scope_id\": \"$TEAM_ID\",
    \"scopes\": [\"responses:create\", \"conversations:read\"],
    \"rate_limit_rpm\": 100,
    \"monthly_token_limit\": 10000000
}")

API_KEY=$(echo "$KEY_RESPONSE" | jq -r '.key // empty')
KEY_ID=$(echo "$KEY_RESPONSE" | jq -r '.key_id // empty')

if [ -z "$API_KEY" ] || [ "$API_KEY" = "null" ]; then
    echo -e "${RED}✗ Failed to create API key${NC}"
    echo "$KEY_RESPONSE" | jq .
    exit 1
fi

echo -e "${GREEN}✓ API key created${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Team Member Added!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Member Details:${NC}"
echo "  Name:    $MEMBER_NAME"
echo "  Email:   $MEMBER_EMAIL"
echo "  User ID: $MEMBER_USER_ID"
echo "  Team:    $TEAM_NAME ($TEAM_SLUG)"
echo ""
echo -e "${YELLOW}API Key:${NC}"
echo "  Key ID:  $KEY_ID"
echo "  Key:     $API_KEY"
echo ""
echo -e "${GREEN}Share this API key with $MEMBER_NAME:${NC}"
echo ""
echo "  export AURA_API_KEY=\"$API_KEY\""
echo ""
echo -e "${YELLOW}Key Details:${NC}"
echo "  • Scoped to: $TEAM_NAME team"
echo "  • Rate limit: 100 requests/minute"
echo "  • Monthly token limit: 10M tokens"
echo "  • Can create responses and read conversations"
echo ""
echo -e "${YELLOW}Usage in code:${NC}"
echo ""
echo "  curl -H \"Authorization: Bearer $API_KEY\" \\\\"
echo "       -H \"Content-Type: application/json\" \\\\"
echo "       -d '{\"model\": \"gpt-4o-mini\", \"input\": [...]}' \\\\"
echo "       $API_BASE/v1/responses"
echo ""
