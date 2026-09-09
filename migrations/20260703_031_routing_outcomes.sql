-- Auto-router outcome signals and learned arm statistics.
--
-- routing_outcomes: one row per scored decision, computed by the gateway's
-- rollup job (or POST /admin/routing/rollup) from request_logs, feedback
-- and the next turn in the conversation. routing_arm_stats: Beta(alpha,
-- beta) per (tier, model) recomputed from recent rewards, read by the
-- Thompson within-tier strategy.

CREATE TABLE IF NOT EXISTS routing_outcomes (
    -- Gateway request id = routing_decisions.response_id
    response_id VARCHAR(100) PRIMARY KEY,
    tier VARCHAR(16) NOT NULL,
    selected_model VARCHAR(100) NOT NULL,
    shadow BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NULL,
    feedback VARCHAR(20) NULL,
    -- none | move_on | retry | correction | escalation
    next_turn VARCHAR(16) NOT NULL DEFAULT 'none',
    next_model VARCHAR(100) NULL,
    reward DOUBLE PRECISION NOT NULL DEFAULT 0,
    decided_at TIMESTAMPTZ NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_outcomes_tier_model
    ON routing_outcomes(tier, selected_model, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_outcomes_decided
    ON routing_outcomes(decided_at DESC);

COMMENT ON TABLE routing_outcomes IS 'Auto-router decisions scored after the fact: next-turn signal (move_on / retry / correction / escalation) and reward in [-1, 1].';

CREATE TABLE IF NOT EXISTS routing_arm_stats (
    tier VARCHAR(16) NOT NULL,
    model VARCHAR(100) NOT NULL,
    -- Beta distribution parameters: 1 + sum(positive rewards), 1 + sum(|negative rewards|)
    alpha DOUBLE PRECISION NOT NULL DEFAULT 1,
    beta DOUBLE PRECISION NOT NULL DEFAULT 1,
    observations INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tier, model)
);

COMMENT ON TABLE routing_arm_stats IS 'Per-(tier, model) Beta parameters for Thompson sampling, recomputed by the outcome rollup over a trailing window. Applied decisions only.';

-- Rebuild v_routing_outcomes with the computed signal alongside the raw joins.
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
    END AS estimated_savings_usd,
    o.next_turn,
    o.next_model,
    o.reward,
    o.computed_at AS outcome_computed_at
FROM routing_decisions d
LEFT JOIN request_logs rl ON rl.response_id = d.response_id
LEFT JOIN LATERAL (
    SELECT f.feedback
    FROM feedback_samples f
    WHERE d.provider_response_id IS NOT NULL
      AND f.response_id = d.provider_response_id
    ORDER BY f.created_at DESC
    LIMIT 1
) fb ON TRUE
LEFT JOIN routing_outcomes o ON o.response_id = d.response_id;

COMMENT ON VIEW v_routing_outcomes IS 'Auto-router decisions joined with request outcome (status, tokens, cost, latency, feedback), the computed next-turn signal and reward, and the estimated saving for shadow rows.';
