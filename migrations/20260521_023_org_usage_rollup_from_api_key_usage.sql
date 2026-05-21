-- Recreate v_organization_usage to roll up usage from `api_key_usage`
-- (which the gateway populates on every request) instead of `end_users`.
--
-- Background: the previous view summed eu.total_input_tokens /
-- eu.total_output_tokens / eu.total_cost_usd / eu.request_count from
-- the `end_users` table, but the playground proxy doesn't pass a
-- `user` field on requests, so end_users has no rows for playground
-- traffic. Result: the Playground (Demo) org page showed 0 requests
-- / 0 tokens / $0.00 cost even though api_key_usage held real data.
--
-- New rollup:
--   - api_key_count  → DISTINCT active api_keys per org (unchanged)
--   - team_count     → DISTINCT teams per org (unchanged)
--   - end_user_count → DISTINCT end_users per org (kept; may be 0 for
--                     playground orgs)
--   - total_*        → sum directly from api_key_usage joined via
--                     api_keys.organization_id. This is the source of
--                     truth — gateway writes one api_key_usage row per
--                     completed /v1/responses call.
--
-- Why we don't sum from end_users any more: it was a derived
-- aggregate, but only populated when the gateway received `user="..."`
-- in the request body. The playground flow never sets that, so end-
-- user-derived totals are systematically zero for hosted playground
-- traffic. api_key_usage is the canonical per-request log and exists
-- for every successful call.
--
-- cost_usd is FLOAT8 in api_key_usage; COALESCE fallback uses 0::FLOAT8
-- (same idiom as migration 022) so the resulting column is FLOAT8 and
-- sqlx can decode it without a NUMERIC/f64 panic.
--
-- DROP + CREATE because changing column types in a view requires it
-- (CREATE OR REPLACE rejects type changes). v_organization_usage has
-- no dependents in this codebase — only direct callers are the admin
-- handlers, which fetch the view fresh per request.

DROP VIEW IF EXISTS v_organization_usage;

CREATE VIEW v_organization_usage AS
WITH usage_rollup AS (
    -- Sum tokens/cost/requests per org by joining api_key_usage to
    -- api_keys. LEFT JOIN so orgs with zero usage still show up.
    SELECT
        ak.organization_id,
        COUNT(aku.id) as request_count,
        COALESCE(SUM(aku.input_tokens), 0) as input_tokens,
        COALESCE(SUM(aku.output_tokens), 0) as output_tokens,
        COALESCE(SUM(aku.cost_usd), 0::FLOAT8) as cost_usd
    FROM api_keys ak
    LEFT JOIN api_key_usage aku ON aku.api_key_id = ak.id
    WHERE ak.organization_id IS NOT NULL
    GROUP BY ak.organization_id
)
SELECT
    o.id as organization_id,
    o.name as organization_name,
    o.slug,
    COUNT(DISTINCT ak.id) as api_key_count,
    COUNT(DISTINCT t.id) as team_count,
    COUNT(DISTINCT eu.id) as end_user_count,
    COALESCE(ur.input_tokens + ur.output_tokens, 0) as total_tokens,
    COALESCE(ur.cost_usd, 0::FLOAT8) as total_cost,
    COALESCE(ur.request_count, 0) as total_requests
FROM organizations o
LEFT JOIN api_keys ak ON ak.organization_id = o.id AND ak.status = 'active'
LEFT JOIN teams t ON t.organization_id = o.id
LEFT JOIN end_users eu ON eu.organization_id = o.id
LEFT JOIN usage_rollup ur ON ur.organization_id = o.id
GROUP BY
    o.id, o.name, o.slug,
    ur.input_tokens, ur.output_tokens, ur.cost_usd, ur.request_count
ORDER BY total_cost DESC;

COMMENT ON VIEW v_organization_usage IS
    'Per-organization rollup. Tokens/cost/requests sourced from api_key_usage (canonical request log), NOT end_users — see migration 023.';
