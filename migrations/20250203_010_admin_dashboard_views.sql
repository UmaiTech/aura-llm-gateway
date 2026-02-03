-- Admin Dashboard Views
-- Creates materialized and regular views for efficient dashboard statistics

-- ============================================================================
-- DASHBOARD OVERVIEW STATS VIEW
-- Aggregated stats for the main dashboard
-- ============================================================================

CREATE OR REPLACE VIEW v_dashboard_stats AS
WITH time_ranges AS (
    SELECT
        NOW() - INTERVAL '24 hours' as day_ago,
        NOW() - INTERVAL '7 days' as week_ago,
        NOW() - INTERVAL '30 days' as month_ago,
        DATE_TRUNC('month', NOW()) as current_month_start
),
daily_stats AS (
    SELECT
        COUNT(*) as total_requests_24h,
        COALESCE(SUM(input_tokens), 0) as input_tokens_24h,
        COALESCE(SUM(output_tokens), 0) as output_tokens_24h,
        COALESCE(SUM(cached_tokens), 0) as cached_tokens_24h,
        COALESCE(SUM(cost_usd), 0) as cost_24h,
        COALESCE(AVG(latency_ms), 0) as avg_latency_24h,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_24h,
        COUNT(*) FILTER (WHERE status != 'completed') as failed_24h
    FROM request_logs, time_ranges
    WHERE created_at >= time_ranges.day_ago
),
weekly_stats AS (
    SELECT
        COUNT(*) as total_requests_7d,
        COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens_7d,
        COALESCE(SUM(cost_usd), 0) as cost_7d
    FROM request_logs, time_ranges
    WHERE created_at >= time_ranges.week_ago
),
monthly_stats AS (
    SELECT
        COUNT(*) as total_requests_30d,
        COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens_30d,
        COALESCE(SUM(cost_usd), 0) as cost_30d
    FROM request_logs, time_ranges
    WHERE created_at >= time_ranges.month_ago
),
all_time_stats AS (
    SELECT
        COUNT(*) as total_requests_all,
        COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens_all,
        COALESCE(SUM(cost_usd), 0) as cost_all
    FROM request_logs
)
SELECT
    -- 24h metrics
    d.total_requests_24h,
    d.input_tokens_24h,
    d.output_tokens_24h,
    d.cached_tokens_24h,
    d.cost_24h,
    d.avg_latency_24h::INT,
    d.successful_24h,
    d.failed_24h,
    CASE WHEN d.total_requests_24h > 0
        THEN (d.successful_24h::FLOAT / d.total_requests_24h * 100)::FLOAT8
        ELSE 100.0
    END as success_rate_24h,
    -- 7d metrics
    w.total_requests_7d,
    w.total_tokens_7d,
    w.cost_7d,
    -- 30d metrics
    m.total_requests_30d,
    m.total_tokens_30d,
    m.cost_30d,
    -- all time
    a.total_requests_all,
    a.total_tokens_all,
    a.cost_all,
    -- current timestamp
    NOW() as computed_at
FROM daily_stats d, weekly_stats w, monthly_stats m, all_time_stats a;

-- ============================================================================
-- PROVIDER HEALTH VIEW
-- Provider status and performance metrics
-- ============================================================================

CREATE OR REPLACE VIEW v_provider_health AS
WITH provider_stats AS (
    SELECT
        provider_name,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_requests,
        COUNT(*) FILTER (WHERE status != 'completed') as failed_requests,
        AVG(latency_ms) FILTER (WHERE status = 'completed') as avg_latency_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE status = 'completed') as p95_latency_ms,
        MAX(created_at) as last_request_at,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(cost_usd) as total_cost
    FROM request_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY provider_name
)
SELECT
    ps.provider_name,
    p.display_name,
    p.is_enabled,
    ps.total_requests,
    ps.successful_requests,
    ps.failed_requests,
    CASE WHEN ps.total_requests > 0
        THEN (ps.successful_requests::FLOAT / ps.total_requests * 100)::FLOAT8
        ELSE 100
    END as success_rate,
    COALESCE(ps.avg_latency_ms, 0)::INT as avg_latency_ms,
    COALESCE(ps.p95_latency_ms, 0)::INT as p95_latency_ms,
    ps.last_request_at,
    COALESCE(ps.total_tokens, 0) as total_tokens,
    COALESCE(ps.total_cost, 0) as total_cost,
    -- Health status based on success rate and recent activity
    CASE
        WHEN NOT p.is_enabled THEN 'disabled'
        WHEN ps.last_request_at IS NULL THEN 'no_data'
        WHEN ps.last_request_at < NOW() - INTERVAL '5 minutes' THEN 'inactive'
        WHEN ps.successful_requests::FLOAT / NULLIF(ps.total_requests, 0) < 0.9 THEN 'degraded'
        ELSE 'healthy'
    END as health_status
FROM providers p
LEFT JOIN provider_stats ps ON ps.provider_name = p.name
ORDER BY ps.total_requests DESC NULLS LAST;

-- ============================================================================
-- MODEL USAGE VIEW
-- Usage statistics by model
-- ============================================================================

CREATE OR REPLACE VIEW v_model_usage AS
SELECT
    rl.model_id,
    mp.model_name,
    rl.provider_name,
    COUNT(*) as request_count,
    SUM(rl.input_tokens) as total_input_tokens,
    SUM(rl.output_tokens) as total_output_tokens,
    SUM(rl.cached_tokens) as total_cached_tokens,
    SUM(rl.reasoning_tokens) as total_reasoning_tokens,
    SUM(rl.cost_usd) as total_cost,
    AVG(rl.latency_ms)::INT as avg_latency_ms,
    COUNT(*) FILTER (WHERE rl.status = 'completed') as successful_requests,
    COUNT(*) FILTER (WHERE rl.status != 'completed') as failed_requests
FROM request_logs rl
LEFT JOIN model_pricing mp ON mp.model_id = rl.model_id
WHERE rl.created_at >= NOW() - INTERVAL '30 days'
GROUP BY rl.model_id, mp.model_name, rl.provider_name
ORDER BY request_count DESC;

-- ============================================================================
-- ROUTING STATS VIEW
-- Statistics by routing strategy (extracted from metadata)
-- ============================================================================

CREATE OR REPLACE VIEW v_routing_stats AS
SELECT
    COALESCE(metadata->>'routing_strategy', 'default') as routing_strategy,
    COUNT(*) as request_count,
    SUM(input_tokens + output_tokens) as total_tokens,
    SUM(cost_usd) as total_cost,
    AVG(latency_ms)::INT as avg_latency_ms,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_requests,
    COUNT(*) FILTER (WHERE status != 'completed') as failed_requests
FROM request_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY COALESCE(metadata->>'routing_strategy', 'default')
ORDER BY request_count DESC;

-- ============================================================================
-- CACHE STATS VIEW
-- Cache hit/miss statistics
-- ============================================================================

CREATE OR REPLACE VIEW v_cache_stats AS
WITH cache_data AS (
    SELECT
        CASE
            WHEN cached_tokens > 0 THEN 'hit'
            ELSE 'miss'
        END as cache_status,
        input_tokens,
        output_tokens,
        cached_tokens,
        cost_usd
    FROM request_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
)
SELECT
    COUNT(*) FILTER (WHERE cache_status = 'hit') as cache_hits,
    COUNT(*) FILTER (WHERE cache_status = 'miss') as cache_misses,
    COUNT(*) as total_requests,
    CASE WHEN COUNT(*) > 0
        THEN (COUNT(*) FILTER (WHERE cache_status = 'hit')::FLOAT / COUNT(*) * 100)::FLOAT8
        ELSE 0
    END as hit_rate,
    COALESCE(SUM(cached_tokens), 0) as total_cached_tokens,
    -- Estimated savings (cached tokens * avg cost per token)
    COALESCE(SUM(cached_tokens) * 0.000001, 0) as estimated_savings
FROM cache_data;

-- ============================================================================
-- RECENT REQUESTS VIEW (for Dev Logs page)
-- Detailed request information with gateway metadata
-- ============================================================================

CREATE OR REPLACE VIEW v_recent_requests AS
SELECT
    rl.id,
    rl.response_id,
    rl.conversation_id,
    rl.provider_name,
    rl.model_id,
    rl.user_id,
    rl.input_tokens,
    rl.output_tokens,
    rl.cached_tokens,
    rl.reasoning_tokens,
    rl.cost_usd,
    rl.latency_ms,
    rl.status,
    rl.error_code,
    rl.error_message,
    -- Gateway metadata
    rl.metadata->>'routing_strategy' as routing_strategy,
    CASE WHEN rl.cached_tokens > 0 THEN true ELSE false END as cache_hit,
    rl.reasoning_tokens > 0 as has_reasoning,
    (rl.metadata->>'compressed')::BOOLEAN as compressed,
    rl.metadata as full_metadata,
    rl.created_at
FROM request_logs rl
ORDER BY rl.created_at DESC;

-- ============================================================================
-- API KEY STATS VIEW
-- API key usage statistics
-- ============================================================================

CREATE OR REPLACE VIEW v_api_key_stats AS
SELECT
    ak.id,
    ak.key_id,
    ak.name,
    ak.status,
    ak.rate_limit_rpm,
    ak.monthly_token_limit,
    ak.current_month_tokens,
    ak.last_used_at,
    ak.created_at,
    COUNT(aku.id) as total_requests,
    COALESCE(SUM(aku.input_tokens), 0) as total_input_tokens,
    COALESCE(SUM(aku.output_tokens), 0) as total_output_tokens,
    COALESCE(SUM(aku.cost_usd), 0) as total_cost,
    -- Usage percentage if limit is set
    CASE WHEN ak.monthly_token_limit IS NOT NULL AND ak.monthly_token_limit > 0
        THEN (ak.current_month_tokens::FLOAT / ak.monthly_token_limit * 100)::FLOAT8
        ELSE NULL
    END as usage_percentage
FROM api_keys ak
LEFT JOIN api_key_usage aku ON aku.api_key_id = ak.id
    AND aku.created_at >= DATE_TRUNC('month', NOW())
GROUP BY ak.id, ak.key_id, ak.name, ak.status, ak.rate_limit_rpm,
    ak.monthly_token_limit, ak.current_month_tokens, ak.last_used_at, ak.created_at
ORDER BY ak.created_at DESC;

-- ============================================================================
-- USAGE TIMELINE VIEW (for charts)
-- Hourly aggregated usage for the last 24 hours
-- ============================================================================

CREATE OR REPLACE VIEW v_usage_timeline AS
WITH hours AS (
    SELECT generate_series(
        DATE_TRUNC('hour', NOW() - INTERVAL '23 hours'),
        DATE_TRUNC('hour', NOW()),
        INTERVAL '1 hour'
    ) as hour
)
SELECT
    h.hour,
    COALESCE(COUNT(rl.id), 0) as request_count,
    COALESCE(SUM(rl.input_tokens + rl.output_tokens), 0) as total_tokens,
    COALESCE(SUM(rl.cost_usd), 0) as total_cost,
    COALESCE(AVG(rl.latency_ms), 0)::INT as avg_latency_ms,
    COALESCE(COUNT(rl.id) FILTER (WHERE rl.status != 'completed'), 0) as error_count
FROM hours h
LEFT JOIN request_logs rl ON DATE_TRUNC('hour', rl.created_at) = h.hour
GROUP BY h.hour
ORDER BY h.hour;

-- ============================================================================
-- DAILY USAGE VIEW (for charts - last 30 days)
-- ============================================================================

CREATE OR REPLACE VIEW v_daily_usage AS
WITH days AS (
    SELECT generate_series(
        DATE_TRUNC('day', NOW() - INTERVAL '29 days'),
        DATE_TRUNC('day', NOW()),
        INTERVAL '1 day'
    ) as day
)
SELECT
    d.day::DATE as date,
    COALESCE(COUNT(rl.id), 0) as request_count,
    COALESCE(SUM(rl.input_tokens + rl.output_tokens), 0) as total_tokens,
    COALESCE(SUM(rl.cost_usd), 0) as total_cost,
    COALESCE(AVG(rl.latency_ms), 0)::INT as avg_latency_ms,
    COALESCE(COUNT(rl.id) FILTER (WHERE rl.status != 'completed'), 0) as error_count
FROM days d
LEFT JOIN request_logs rl ON DATE_TRUNC('day', rl.created_at) = d.day
GROUP BY d.day
ORDER BY d.day;

-- ============================================================================
-- ORGANIZATION USAGE VIEW
-- Usage statistics per organization
-- ============================================================================

CREATE OR REPLACE VIEW v_organization_usage AS
SELECT
    o.id as organization_id,
    o.name as organization_name,
    o.slug,
    COUNT(DISTINCT ak.id) as api_key_count,
    COUNT(DISTINCT t.id) as team_count,
    COUNT(DISTINCT eu.id) as end_user_count,
    COALESCE(SUM(eu.total_input_tokens + eu.total_output_tokens), 0) as total_tokens,
    COALESCE(SUM(eu.total_cost_usd), 0) as total_cost,
    COALESCE(SUM(eu.request_count), 0) as total_requests
FROM organizations o
LEFT JOIN api_keys ak ON ak.organization_id = o.id AND ak.status = 'active'
LEFT JOIN teams t ON t.organization_id = o.id
LEFT JOIN end_users eu ON eu.organization_id = o.id
GROUP BY o.id, o.name, o.slug
ORDER BY total_cost DESC;

-- Add comment for documentation
COMMENT ON VIEW v_dashboard_stats IS 'Aggregated statistics for the admin dashboard overview';
COMMENT ON VIEW v_provider_health IS 'Provider health status and performance metrics (24h)';
COMMENT ON VIEW v_model_usage IS 'Usage statistics by model (30d)';
COMMENT ON VIEW v_routing_stats IS 'Request distribution by routing strategy (24h)';
COMMENT ON VIEW v_cache_stats IS 'Cache hit/miss statistics (24h)';
COMMENT ON VIEW v_recent_requests IS 'Recent requests with full metadata for dev logs';
COMMENT ON VIEW v_api_key_stats IS 'API key usage statistics';
COMMENT ON VIEW v_usage_timeline IS 'Hourly usage timeline for charts (24h)';
COMMENT ON VIEW v_daily_usage IS 'Daily usage for charts (30d)';
COMMENT ON VIEW v_organization_usage IS 'Usage statistics per organization';
