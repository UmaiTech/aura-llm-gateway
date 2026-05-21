-- Recreate v_dashboard_stats with explicit FLOAT8 casts on cost columns.
--
-- Background: every cost_* column in the prior view definition was
-- emitted as NUMERIC, not FLOAT8 — because Postgres widens
-- `COALESCE(SUM(double precision), 0)` to NUMERIC (the literal `0` is
-- INTEGER, and the COALESCE result type is the closest common
-- supertype that fits both, which is NUMERIC).
--
-- sqlx can't decode NUMERIC as f64 directly, so the Rust handler at
-- crates/aura-proxy/src/routes/admin.rs:513 panicked with:
--   ColumnDecode { index: "cost_24h",
--     source: "Rust type `f64` (as SQL type `FLOAT8`) is not
--              compatible with SQL type `NUMERIC`" }
-- That panic took the tokio worker down, which failed Fly's health
-- check, which knocked the whole gateway offline until the machine
-- restarted.
--
-- Fix: cast the COALESCE fallback to FLOAT8 so the resulting column
-- type is FLOAT8 end-to-end. SUM(cost_usd) is already DOUBLE
-- PRECISION (request_logs.cost_usd is FLOAT8), so the only change
-- needed is the literal `0` → `0::FLOAT8`.
--
-- Why a DROP + CREATE instead of CREATE OR REPLACE: Postgres rejects
-- CREATE OR REPLACE when any column changes type, even from NUMERIC
-- to a compatible FLOAT8. DROP is safe here — v_dashboard_stats has
-- no dependent views (verified across migrations/ + crates/), and
-- the only consumer is the admin overview endpoint which fetches
-- the view fresh on each request.
--
-- Other views that share the same `COALESCE(SUM(cost_*), 0)` pattern
-- (v_organization_usage, v_api_key_stats, v_end_users, etc.) are NOT
-- touched here — their callers in crates/aura-proxy use try_get
-- with .unwrap_or fallbacks, so the bad type doesn't crash anything,
-- it just produces zeros. They're worth fixing too but as a
-- follow-up; this migration's scope is "stop the panic that took
-- prod down."

DROP VIEW IF EXISTS v_dashboard_stats;

CREATE VIEW v_dashboard_stats AS
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
        COALESCE(SUM(cost_usd), 0::FLOAT8) as cost_24h,
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
        COALESCE(SUM(cost_usd), 0::FLOAT8) as cost_7d
    FROM request_logs, time_ranges
    WHERE created_at >= time_ranges.week_ago
),
monthly_stats AS (
    SELECT
        COUNT(*) as total_requests_30d,
        COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens_30d,
        COALESCE(SUM(cost_usd), 0::FLOAT8) as cost_30d
    FROM request_logs, time_ranges
    WHERE created_at >= time_ranges.month_ago
),
all_time_stats AS (
    SELECT
        COUNT(*) as total_requests_all,
        COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens_all,
        COALESCE(SUM(cost_usd), 0::FLOAT8) as cost_all
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

COMMENT ON VIEW v_dashboard_stats IS
    'Aggregated statistics for the admin dashboard overview. cost_* columns are FLOAT8 (see migration 022).';
