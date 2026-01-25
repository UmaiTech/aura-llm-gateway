#!/usr/bin/env bash
#
# Create a complete organization hierarchy using the REST API
# This script demonstrates multi-tenant setup and end-user cost tracking
#
# Usage: ./scripts/setup_organization.sh [org_name] [owner_id] [admin_api_key]
#

set -e

# Configuration
ORG_NAME="${1:-Acme Corp}"
OWNER_ID="${2:-user_admin_001}"
ADMIN_API_KEY="${3}"
API_BASE="${AURA_API_BASE:-http://localhost:8080}"

# Generate slug from name
ORG_SLUG=$(echo "$ORG_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Aura Organization Setup (API-based)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check for admin API key
if [ -z "$ADMIN_API_KEY" ]; then
    echo -e "${RED}Error: Admin API key required${NC}"
    echo "Usage: $0 [org_name] [owner_id] [admin_api_key]"
    echo ""
    echo "Create an admin API key first:"
    echo "  ./scripts/create_api_key.sh \"admin-key\""
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

echo -e "${GREEN}Step 1: Creating Organization${NC}"
echo "  Name: $ORG_NAME"
echo "  Slug: $ORG_SLUG"
echo "  Owner: $OWNER_ID"
echo ""

ORG_RESPONSE=$(api_call POST "/v1/organizations" "{
    \"name\": \"$ORG_NAME\",
    \"slug\": \"$ORG_SLUG\",
    \"owner_id\": \"$OWNER_ID\",
    \"settings\": {\"plan\": \"enterprise\"}
}")

ORG_ID=$(echo "$ORG_RESPONSE" | jq -r '.id')

if [ "$ORG_ID" = "null" ] || [ -z "$ORG_ID" ]; then
    echo -e "${RED}✗ Failed to create organization${NC}"
    echo "$ORG_RESPONSE" | jq .
    exit 1
fi

echo -e "  ${GREEN}✓${NC} Organization created: $ORG_ID"
echo ""

echo -e "${GREEN}Step 2: Creating Teams${NC}"

# Create Engineering team
TEAM_ENG_RESPONSE=$(api_call POST "/v1/organizations/$ORG_ID/teams" "{
    \"name\": \"Engineering\",
    \"slug\": \"engineering\",
    \"description\": \"Engineering team\",
    \"monthly_token_limit\": 50000000
}")

TEAM_ENG_ID=$(echo "$TEAM_ENG_RESPONSE" | jq -r '.id')
echo -e "  ${GREEN}✓${NC} Team created: Engineering ($TEAM_ENG_ID)"

# Create Product team
TEAM_PROD_RESPONSE=$(api_call POST "/v1/organizations/$ORG_ID/teams" "{
    \"name\": \"Product\",
    \"slug\": \"product\",
    \"description\": \"Product team\",
    \"monthly_token_limit\": 10000000
}")

TEAM_PROD_ID=$(echo "$TEAM_PROD_RESPONSE" | jq -r '.id')
echo -e "  ${GREEN}✓${NC} Team created: Product ($TEAM_PROD_ID)"

echo ""
echo -e "${GREEN}Step 3: Creating Projects${NC}"

# Engineering projects
PROJ_API_RESPONSE=$(api_call POST "/v1/teams/$TEAM_ENG_ID/projects" "{
    \"name\": \"API Backend\",
    \"slug\": \"api-backend\",
    \"description\": \"Main production API\"
}")

PROJ_API_ID=$(echo "$PROJ_API_RESPONSE" | jq -r '.id')
echo -e "  ${GREEN}✓${NC} Project created: API Backend ($PROJ_API_ID)"

PROJ_CHAT_RESPONSE=$(api_call POST "/v1/teams/$TEAM_ENG_ID/projects" "{
    \"name\": \"Chat Service\",
    \"slug\": \"chat-service\",
    \"description\": \"Customer chat support\"
}")

PROJ_CHAT_ID=$(echo "$PROJ_CHAT_RESPONSE" | jq -r '.id')
echo -e "  ${GREEN}✓${NC} Project created: Chat Service ($PROJ_CHAT_ID)"

# Product projects
PROJ_PROTO_RESPONSE=$(api_call POST "/v1/teams/$TEAM_PROD_ID/projects" "{
    \"name\": \"Prototypes\",
    \"slug\": \"prototypes\",
    \"description\": \"Experimental features\"
}")

PROJ_PROTO_ID=$(echo "$PROJ_PROTO_RESPONSE" | jq -r '.id')
echo -e "  ${GREEN}✓${NC} Project created: Prototypes ($PROJ_PROTO_ID)"

echo ""
echo -e "${GREEN}Step 4: Creating API Keys${NC}"

# Organization-level API key
ORG_KEY_RESPONSE=$(api_call POST "/v1/api-keys" "{
    \"name\": \"Organization Master Key\",
    \"description\": \"Full access to entire organization\",
    \"environment\": \"live\",
    \"organization_id\": \"$ORG_ID\",
    \"scope_type\": \"organization\",
    \"scopes\": [\"responses:create\", \"conversations:read\", \"usage:read\"],
    \"rate_limit_rpm\": 1000,
    \"monthly_token_limit\": 100000000
}")

ORG_KEY=$(echo "$ORG_KEY_RESPONSE" | jq -r '.key')
echo -e "  ${GREEN}✓${NC} Organization API Key: ${ORG_KEY:0:30}..."

# Team-level API key (Engineering)
TEAM_KEY_RESPONSE=$(api_call POST "/v1/api-keys" "{
    \"name\": \"Engineering Team Key\",
    \"description\": \"Access limited to Engineering team\",
    \"environment\": \"live\",
    \"organization_id\": \"$ORG_ID\",
    \"scope_type\": \"team\",
    \"scope_id\": \"$TEAM_ENG_ID\",
    \"scopes\": [\"responses:create\", \"conversations:read\"],
    \"rate_limit_rpm\": 500,
    \"monthly_token_limit\": 50000000
}")

TEAM_KEY=$(echo "$TEAM_KEY_RESPONSE" | jq -r '.key')
echo -e "  ${GREEN}✓${NC} Engineering Team API Key: ${TEAM_KEY:0:30}..."

# Project-level API key
PROJ_KEY_RESPONSE=$(api_call POST "/v1/api-keys" "{
    \"name\": \"API Backend Project Key\",
    \"description\": \"Limited to API Backend project\",
    \"environment\": \"live\",
    \"organization_id\": \"$ORG_ID\",
    \"scope_type\": \"project\",
    \"scope_id\": \"$PROJ_API_ID\",
    \"scopes\": [\"responses:create\"],
    \"rate_limit_rpm\": 200,
    \"monthly_token_limit\": 20000000
}")

PROJ_KEY=$(echo "$PROJ_KEY_RESPONSE" | jq -r '.key')
echo -e "  ${GREEN}✓${NC} API Backend Project API Key: ${PROJ_KEY:0:30}..."

echo ""
echo -e "${GREEN}Step 5: Creating Test End-Users${NC}"

# Create end-users
api_call POST "/v1/organizations/$ORG_ID/end-users" "{
    \"external_id\": \"customer_alice\",
    \"name\": \"Alice Johnson\",
    \"email\": \"alice@example.com\",
    \"metadata\": {\"plan\": \"pro\"}
}" > /dev/null

echo -e "  ${GREEN}✓${NC} End-user created: customer_alice (pro plan)"

api_call POST "/v1/organizations/$ORG_ID/end-users" "{
    \"external_id\": \"customer_bob\",
    \"name\": \"Bob Smith\",
    \"email\": \"bob@example.com\",
    \"metadata\": {\"plan\": \"free\"}
}" > /dev/null

echo -e "  ${GREEN}✓${NC} End-user created: customer_bob (free plan)"

api_call POST "/v1/organizations/$ORG_ID/end-users" "{
    \"external_id\": \"customer_eve\",
    \"name\": \"Eve Martinez\",
    \"email\": \"eve@example.com\",
    \"metadata\": {\"plan\": \"enterprise\"}
}" > /dev/null

echo -e "  ${GREEN}✓${NC} End-user created: customer_eve (enterprise plan)"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Organization Setup Complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}Organization Structure:${NC}"
echo "  $ORG_NAME ($ORG_ID)"
echo "  ├── Team: Engineering ($TEAM_ENG_ID)"
echo "  │   ├── Project: API Backend ($PROJ_API_ID)"
echo "  │   └── Project: Chat Service ($PROJ_CHAT_ID)"
echo "  └── Team: Product ($TEAM_PROD_ID)"
echo "      └── Project: Prototypes ($PROJ_PROTO_ID)"
echo ""

echo -e "${YELLOW}API Keys Created:${NC}"
echo ""
echo "1. Organization-level (full access):"
echo "   export AURA_ORG_KEY=\"$ORG_KEY\""
echo ""
echo "2. Team-level (Engineering only):"
echo "   export AURA_TEAM_KEY=\"$TEAM_KEY\""
echo ""
echo "3. Project-level (API Backend only):"
echo "   export AURA_PROJECT_KEY=\"$PROJ_KEY\""
echo ""

echo -e "${YELLOW}Test End-User Tracking:${NC}"
echo ""
echo "Make requests with the 'user' field to track per-customer costs:"
echo ""
echo "curl -H \"Authorization: Bearer \$AURA_ORG_KEY\" \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{"
echo "       \"model\": \"gpt-4o-mini\","
echo "       \"user\": \"customer_alice\","
echo "       \"input\": [{\"type\": \"message\", \"role\": \"user\", \"content\": \"Hello!\"}]"
echo "     }' \\"
echo "     $API_BASE/v1/responses"
echo ""

echo -e "${YELLOW}Query End-User Usage:${NC}"
echo ""
echo "curl -H \"Authorization: Bearer \$AURA_ORG_KEY\" \\"
echo "     $API_BASE/v1/organizations/$ORG_ID/end-users | jq ."
echo ""

echo -e "${GREEN}Next Steps:${NC}"
echo "  • Export the API keys above to use in your applications"
echo "  • Test end-user tracking by setting the 'user' field in requests"
echo "  • Monitor costs per user via the API or database"
echo "  • Create additional API keys with specific scopes and limits"
echo ""
