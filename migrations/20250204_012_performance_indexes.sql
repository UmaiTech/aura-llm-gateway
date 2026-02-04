-- Performance Indexes Migration
-- Creates indexes for efficient dashboard and insights queries

-- ============================================================================
-- REQUEST LOGS INDEXES
-- Most frequently queried table - needs comprehensive indexing
-- ============================================================================

-- Time-based queries (dashboard stats, recent logs)
CREATE INDEX IF NOT EXISTS idx_request_logs_created_at
    ON request_logs(created_at DESC);

-- Provider health queries
CREATE INDEX IF NOT EXISTS idx_request_logs_provider_created
    ON request_logs(provider_name, created_at DESC);

-- Model usage queries
CREATE INDEX IF NOT EXISTS idx_request_logs_model_created
    ON request_logs(model_id, created_at DESC);

-- Status filtering (success/failure counts)
CREATE INDEX IF NOT EXISTS idx_request_logs_status_created
    ON request_logs(status, created_at DESC);

-- User tracking
CREATE INDEX IF NOT EXISTS idx_request_logs_user_created
    ON request_logs(user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

-- Conversation threading
CREATE INDEX IF NOT EXISTS idx_request_logs_conversation
    ON request_logs(conversation_id, created_at DESC)
    WHERE conversation_id IS NOT NULL;

-- Cost analysis
CREATE INDEX IF NOT EXISTS idx_request_logs_cost_created
    ON request_logs(cost_usd, created_at DESC)
    WHERE cost_usd IS NOT NULL AND cost_usd > 0;

-- Composite index for dashboard overview (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_request_logs_dashboard
    ON request_logs(created_at DESC, provider_name, status);

-- ============================================================================
-- API KEY USAGE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_created
    ON api_key_usage(api_key_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_created
    ON api_key_usage(created_at DESC);

-- ============================================================================
-- API KEYS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_api_keys_status
    ON api_keys(status)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_api_keys_org
    ON api_keys(organization_id);

-- ============================================================================
-- END USERS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_end_users_org
    ON end_users(organization_id);

CREATE INDEX IF NOT EXISTS idx_end_users_external_id
    ON end_users(external_id)
    WHERE external_id IS NOT NULL;

-- ============================================================================
-- PROVIDERS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_providers_enabled
    ON providers(is_enabled)
    WHERE is_enabled = true;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_request_logs_created_at IS 'Time-based dashboard queries';
COMMENT ON INDEX idx_request_logs_provider_created IS 'Provider health and filtering';
COMMENT ON INDEX idx_request_logs_model_created IS 'Model usage statistics';
COMMENT ON INDEX idx_request_logs_status_created IS 'Success/failure rate calculations';
COMMENT ON INDEX idx_request_logs_dashboard IS 'Composite index for dashboard overview';
