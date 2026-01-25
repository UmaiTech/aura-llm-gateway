-- Update provider_credentials to support global credentials
-- organization_id is already nullable, just add documentation

-- Add comment explaining the system
COMMENT ON TABLE provider_credentials IS
'Provider API credentials. Can be global (organization_id IS NULL) or organization-specific.
Environment variables (OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY) serve as global
fallback credentials. Organizations can add their own encrypted credentials via the API.';
