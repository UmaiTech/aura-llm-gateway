-- Gold labels for the auto router.
--
-- For a sampled fraction of requests the gateway answers the same prompt
-- with the cheap tier (A) and the strong tier (B) in the background and
-- has a judge model grade the pair. verdict = 'a' or 'tie' means the
-- cheap tier would have sufficed: the label the learned classifier is
-- trained on. Texts are truncated (routing.auto.gold_max_text_chars) and
-- collection is off unless routing.auto.gold_sample_rate > 0.

CREATE TABLE IF NOT EXISTS routing_gold_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Gateway request id of the request that was sampled
    response_id VARCHAR(100) NOT NULL,
    organization_id UUID NULL,
    -- Decision made for the live request (applied or shadow)
    decided_tier VARCHAR(16) NOT NULL,
    heuristic_score DOUBLE PRECISION NOT NULL,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    prompt_hash VARCHAR(64) NOT NULL,
    user_text TEXT NULL,

    tier_a VARCHAR(16) NOT NULL,
    model_a VARCHAR(100) NOT NULL,
    text_a TEXT NULL,
    cost_a DOUBLE PRECISION NULL,
    latency_a_ms INTEGER NULL,

    tier_b VARCHAR(16) NOT NULL,
    model_b VARCHAR(100) NOT NULL,
    text_b TEXT NULL,
    cost_b DOUBLE PRECISION NULL,
    latency_b_ms INTEGER NULL,

    judge_model VARCHAR(100) NOT NULL,
    -- a | b | tie ; NULL when the judge failed
    verdict VARCHAR(8) NULL,
    judge_confidence DOUBLE PRECISION NULL,
    judge_rationale TEXT NULL,
    error TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_gold_pairs_created
    ON routing_gold_pairs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_gold_pairs_verdict
    ON routing_gold_pairs(verdict, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_gold_pairs_response
    ON routing_gold_pairs(response_id);

COMMENT ON TABLE routing_gold_pairs IS 'Sampled prompts answered by the cheap and strong auto-router tiers and graded by a judge model. verdict a/tie = cheap tier sufficed.';
