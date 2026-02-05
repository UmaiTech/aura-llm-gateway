-- Update admin views and assign admin key to organization
-- 1. Assign test-admin-key to Umai-Tech organization
-- 2. Update v_api_key_stats to include organization info
-- 3. Create v_end_users view for admin dashboard

-- Assign the test-admin-key to Umai-Tech organization
UPDATE api_keys
SET organization_id = '0cd164b0-f73e-44cc-a901-c1f8091e3642'
WHERE key_id LIKE 'aura_live_9a6de7f72ed1%' AND organization_id IS NULL;

-- Also assign any other orphan keys to Umai-Tech
UPDATE api_keys
SET organization_id = '0cd164b0-f73e-44cc-a901-c1f8091e3642'
WHERE organization_id IS NULL;

-- Drop and recreate v_api_key_stats with organization info
DROP VIEW IF EXISTS v_api_key_stats;

CREATE VIEW v_api_key_stats AS
SELECT
    ak.id,
    ak.key_id,
    ak.name,
    ak.description,
    ak.status,
    ak.organization_id,
    o.name as organization_name,
    o.slug as organization_slug,
    ak.scope_type,
    ak.rate_limit_rpm,
    ak.monthly_token_limit,
    ak.current_month_tokens,
    ak.last_used_at,
    ak.created_at,
    COUNT(aku.id) as total_requests,
    COALESCE(SUM(aku.input_tokens), 0) as total_input_tokens,
    COALESCE(SUM(aku.output_tokens), 0) as total_output_tokens,
    COALESCE(SUM(aku.cost_usd), 0) as total_cost,
    CASE WHEN ak.monthly_token_limit IS NOT NULL AND ak.monthly_token_limit > 0
        THEN (ak.current_month_tokens::FLOAT / ak.monthly_token_limit * 100)::FLOAT8
        ELSE NULL
    END as usage_percentage
FROM api_keys ak
LEFT JOIN organizations o ON o.id = ak.organization_id
LEFT JOIN api_key_usage aku ON aku.api_key_id = ak.id
    AND aku.created_at >= DATE_TRUNC('month', NOW())
GROUP BY ak.id, ak.key_id, ak.name, ak.description, ak.status,
    ak.organization_id, o.name, o.slug, ak.scope_type,
    ak.rate_limit_rpm, ak.monthly_token_limit, ak.current_month_tokens,
    ak.last_used_at, ak.created_at
ORDER BY ak.created_at DESC;

-- Create v_end_users view for admin dashboard
DROP VIEW IF EXISTS v_end_users;

CREATE VIEW v_end_users AS
SELECT
    eu.id,
    eu.organization_id,
    o.name as organization_name,
    o.slug as organization_slug,
    eu.external_id,
    eu.name,
    eu.email,
    eu.total_input_tokens,
    eu.total_output_tokens,
    eu.total_input_tokens + eu.total_output_tokens as total_tokens,
    eu.total_cost_usd,
    eu.request_count,
    eu.current_month_tokens,
    eu.monthly_token_limit,
    eu.rate_limit_rpm,
    eu.is_blocked,
    eu.metadata,
    eu.first_seen_at,
    eu.last_seen_at,
    eu.created_at
FROM end_users eu
JOIN organizations o ON o.id = eu.organization_id
ORDER BY eu.last_seen_at DESC NULLS LAST;

-- Create v_providers view for admin dashboard (extends v_provider_health)
DROP VIEW IF EXISTS v_providers;

CREATE VIEW v_providers AS
WITH provider_stats AS (
    SELECT
        provider_name,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_requests,
        COUNT(*) FILTER (WHERE status != 'completed') as failed_requests,
        AVG(latency_ms) FILTER (WHERE status = 'completed') as avg_latency_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE status = 'completed') as p95_latency_ms,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE status = 'completed') as p99_latency_ms,
        MIN(latency_ms) FILTER (WHERE status = 'completed') as min_latency_ms,
        MAX(latency_ms) FILTER (WHERE status = 'completed') as max_latency_ms,
        MAX(created_at) as last_request_at,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(cost_usd) as total_cost
    FROM request_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY provider_name
),
all_time_stats AS (
    SELECT
        provider_name,
        COUNT(*) as all_time_requests,
        SUM(cost_usd) as all_time_cost
    FROM request_logs
    GROUP BY provider_name
)
SELECT
    p.name as provider_name,
    p.display_name,
    p.is_enabled,
    p.api_base_url,
    COALESCE(ps.total_requests, 0) as requests_24h,
    COALESCE(ps.successful_requests, 0) as successful_24h,
    COALESCE(ps.failed_requests, 0) as failed_24h,
    CASE WHEN ps.total_requests > 0
        THEN (ps.successful_requests::FLOAT / ps.total_requests * 100)::FLOAT8
        ELSE 100
    END as success_rate,
    COALESCE(ps.avg_latency_ms, 0)::INT as avg_latency_ms,
    COALESCE(ps.p95_latency_ms, 0)::INT as p95_latency_ms,
    COALESCE(ps.p99_latency_ms, 0)::INT as p99_latency_ms,
    COALESCE(ps.min_latency_ms, 0)::INT as min_latency_ms,
    COALESCE(ps.max_latency_ms, 0)::INT as max_latency_ms,
    ps.last_request_at,
    COALESCE(ps.total_input_tokens, 0) as input_tokens_24h,
    COALESCE(ps.total_output_tokens, 0) as output_tokens_24h,
    COALESCE(ps.total_tokens, 0) as tokens_24h,
    COALESCE(ps.total_cost, 0) as cost_24h,
    COALESCE(ats.all_time_requests, 0) as all_time_requests,
    COALESCE(ats.all_time_cost, 0) as all_time_cost,
    CASE
        WHEN NOT p.is_enabled THEN 'disabled'
        WHEN ps.last_request_at IS NULL THEN 'no_data'
        WHEN ps.last_request_at < NOW() - INTERVAL '5 minutes' THEN 'inactive'
        WHEN ps.successful_requests::FLOAT / NULLIF(ps.total_requests, 0) < 0.9 THEN 'degraded'
        ELSE 'healthy'
    END as health_status,
    p.created_at,
    p.updated_at
FROM providers p
LEFT JOIN provider_stats ps ON ps.provider_name = p.name
LEFT JOIN all_time_stats ats ON ats.provider_name = p.name
ORDER BY ps.total_requests DESC NULLS LAST, p.name;

COMMENT ON VIEW v_api_key_stats IS 'API key statistics with organization info';
COMMENT ON VIEW v_end_users IS 'End users with organization info for admin dashboard';
COMMENT ON VIEW v_providers IS 'Provider statistics and health for admin dashboard';
