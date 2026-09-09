-- Auto-router decision log.
--
-- One row per request the complexity router looked at, both applied
-- (`model: "auto"`) and shadow (a pinned model was requested; the row
-- records what `auto` would have picked). Keyed on the gateway request id
-- so it joins request_logs.response_id; provider_response_id joins
-- responses.id / feedback_samples.response_id.
--
-- Feature vectors are numeric only; no prompt text is stored here.

CREATE TABLE IF NOT EXISTS routing_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Gateway request id (aura_<uuid>) = request_logs.response_id
    response_id VARCHAR(100) NOT NULL,
    -- Provider/response id (resp_...) = responses.id, set once the response completed
    provider_response_id VARCHAR(100) NULL,
    organization_id UUID NULL,
    api_key_id UUID NULL,
    conversation_id UUID NULL,

    requested_model VARCHAR(100) NOT NULL,
    mode VARCHAR(16) NOT NULL,
    classifier VARCHAR(64) NOT NULL,
    score DOUBLE PRECISION NOT NULL,
    raw_score DOUBLE PRECISION NOT NULL,
    classified_tier VARCHAR(16) NOT NULL,
    tier VARCHAR(16) NOT NULL,
    selected_model VARCHAR(100) NOT NULL,
    selected_provider VARCHAR(50) NULL,
    reason TEXT NOT NULL,
    shadow BOOLEAN NOT NULL DEFAULT FALSE,

    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    signals JSONB NOT NULL DEFAULT '{}'::jsonb,
    hard_filters TEXT[] NOT NULL DEFAULT '{}',
    candidates JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Blended $/1M tokens (70% input, 30% output) at decision time, for
    -- estimating what a shadow decision would have cost / saved.
    requested_blended_per_million DOUBLE PRECISION NULL,
    selected_blended_per_million DOUBLE PRECISION NULL,

    decision_latency_us INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_routing_decisions_response
    ON routing_decisions(response_id);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_created
    ON routing_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_tier_created
    ON routing_decisions(tier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_org_created
    ON routing_decisions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_provider_response
    ON routing_decisions(provider_response_id);

COMMENT ON TABLE routing_decisions IS 'Auto-router decisions (applied and shadow), one per request scored. Numeric features only.';
COMMENT ON COLUMN routing_decisions.shadow IS 'TRUE when the request pinned a model and the row records what auto would have chosen.';

-- ============================================================================
-- ROUTING OUTCOMES VIEW
-- Each decision joined with what actually happened: request_logs for
-- status / tokens / cost / latency, feedback_samples for explicit
-- feedback. estimated_savings_usd is only defined for shadow rows (the
-- cost difference between the pinned model and the model auto would have
-- used, at this request's token counts).
-- ============================================================================

CREATE OR REPLACE VIEW v_routing_outcomes AS
SELECT
    d.id,
    d.response_id,
    d.provider_response_id,
    d.organization_id,
    d.api_key_id,
    d.conversation_id,
    d.requested_model,
    d.mode,
    d.classifier,
    d.score,
    d.raw_score,
    d.classified_tier,
    d.tier,
    d.selected_model,
    d.selected_provider,
    d.reason,
    d.shadow,
    d.features,
    d.signals,
    d.hard_filters,
    d.candidates,
    d.requested_blended_per_million,
    d.selected_blended_per_million,
    d.decision_latency_us,
    d.created_at,
    rl.status,
    rl.model_id AS actual_model,
    rl.provider_name AS actual_provider,
    rl.input_tokens,
    rl.output_tokens,
    rl.cost_usd,
    rl.latency_ms,
    COALESCE((rl.metadata->'aura'->'agentic'->>'tool_calls_count')::INT, 0) AS tool_calls_count,
    (rl.metadata->'aura'->'agentic'->>'incomplete_reason') AS incomplete_reason,
    fb.feedback,
    CASE
        WHEN d.shadow
         AND d.requested_blended_per_million IS NOT NULL
         AND d.selected_blended_per_million IS NOT NULL
        THEN (COALESCE(rl.input_tokens, 0) + COALESCE(rl.output_tokens, 0))::DOUBLE PRECISION
             * (d.requested_blended_per_million - d.selected_blended_per_million) / 1000000.0
        ELSE NULL
    END AS estimated_savings_usd
FROM routing_decisions d
LEFT JOIN request_logs rl ON rl.response_id = d.response_id
LEFT JOIN LATERAL (
    SELECT f.feedback
    FROM feedback_samples f
    WHERE d.provider_response_id IS NOT NULL
      AND f.response_id = d.provider_response_id
    ORDER BY f.created_at DESC
    LIMIT 1
) fb ON TRUE;

COMMENT ON VIEW v_routing_outcomes IS 'Auto-router decisions joined with request outcome (status, tokens, cost, latency, feedback) and, for shadow rows, the estimated saving auto would have produced.';
