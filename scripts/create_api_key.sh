#!/usr/bin/env bash
#
# Bootstrap script to create an initial API key for Aura LLM Gateway
# This creates the key directly in the database to solve the chicken-and-egg problem
#
# Usage: ./scripts/create_api_key.sh [key_name]
#

set -e

# Load .env file if it exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

KEY_NAME="${1:-dev-key}"
ENV_TYPE="live"

echo "Creating API key: $KEY_NAME"

# Generate a random API key (simulating aura_live_<random>)
# Format: prefix (10 chars) + identifier (24 chars) + secret (24+ chars)
# Total: ~58+ characters
API_KEY="aura_${ENV_TYPE}_$(openssl rand -hex 32)"
# Key ID is prefix + first 24 chars of random part
# For "aura_live_", that's 10 + 24 = 34 chars
KEY_ID="${API_KEY:0:34}"

# Hash the key with SHA-256 (use shasum for macOS compatibility)
if command -v sha256sum >/dev/null 2>&1; then
    KEY_HASH=$(echo -n "$API_KEY" | sha256sum | cut -d' ' -f1)
else
    KEY_HASH=$(echo -n "$API_KEY" | shasum -a 256 | cut -d' ' -f1)
fi

# Get database URL from environment
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL not set"
    echo "Please set it in your .env file or export it"
    exit 1
fi

# Insert into database
psql "$DATABASE_URL" <<EOF
INSERT INTO api_keys (
    key_id,
    key_hash,
    name,
    description,
    scopes,
    status
) VALUES (
    '$KEY_ID',
    '$KEY_HASH',
    '$KEY_NAME',
    'Bootstrap API key created via script',
    '["responses:create", "conversations:read", "usage:read"]'::jsonb,
    'active'
);
EOF

echo ""
echo "✅ API key created successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔑 IMPORTANT: Save this key - it won't be shown again!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "API Key:  $API_KEY"
echo "Key ID:   $KEY_ID"
echo "Name:     $KEY_NAME"
echo "Scopes:   responses:create, conversations:read, usage:read"
echo ""
echo "Add this to your .env file:"
echo "AURA_API_KEY=$API_KEY"
echo ""
echo "Or use it in your requests:"
echo "curl -H \"Authorization: Bearer $API_KEY\" http://localhost:8080/v1/responses"
echo ""
