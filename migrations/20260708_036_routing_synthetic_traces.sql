-- Synthetic training traces for the auto router.
--
-- routing_gold_pairs gains provenance and richer labels so rows produced
-- by scripts/router/synth.py (cheap-model generated requests, labelled
-- with the tier ladder) can live next to live gold pairs without being
-- confused with them. tier_a/tier_b/verdict stay populated for synthetic
-- rows (best cheap tier vs reference) so existing readers keep working.
--
-- routing_decisions gains a synthetic flag: requests sent with the
-- x-aura-synthetic header are recorded but excluded from everything that
-- reflects real traffic (auto-router stats, outcome rollup, Thompson arm
-- statistics, savings, live gold sampling).

ALTER TABLE routing_gold_pairs
    ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'live',
    ADD COLUMN IF NOT EXISTS batch_id VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS split VARCHAR(16) NOT NULL DEFAULT 'train',
    ADD COLUMN IF NOT EXISTS intended_tier VARCHAR(16) NULL,
    ADD COLUMN IF NOT EXISTS label_tier VARCHAR(16) NULL,
    ADD COLUMN IF NOT EXISTS family VARCHAR(64) NULL,
    ADD COLUMN IF NOT EXISTS shape VARCHAR(64) NULL,
    ADD COLUMN IF NOT EXISTS weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS generator_model VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS ladder JSONB NULL;

COMMENT ON COLUMN routing_gold_pairs.source IS 'live (sampled from traffic) or synthetic (scripts/router/synth.py).';
COMMENT ON COLUMN routing_gold_pairs.split IS 'train or holdout; synthetic holdout rows are never trained on.';
COMMENT ON COLUMN routing_gold_pairs.intended_tier IS 'Synthetic rows: the difficulty level the generator was asked for.';
COMMENT ON COLUMN routing_gold_pairs.label_tier IS 'Training label. Synthetic rows: lowest tier whose ladder answer tied the reference. Live rows: derived from verdict when NULL.';
COMMENT ON COLUMN routing_gold_pairs.weight IS 'Sample weight for training (synthetic rows default to the trainer''s --synthetic-weight when NULL-equivalent 1.0).';
COMMENT ON COLUMN routing_gold_pairs.ladder IS 'Synthetic rows: per-tier ladder results [{tier, model, verdict, confidence, cost_usd, latency_ms, output_tokens}].';

-- One synthetic row per prompt hash so re-ingesting a batch is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_routing_gold_pairs_synthetic_hash
    ON routing_gold_pairs(prompt_hash) WHERE source = 'synthetic';
CREATE INDEX IF NOT EXISTS idx_routing_gold_pairs_source
    ON routing_gold_pairs(source, split, created_at DESC);

ALTER TABLE routing_decisions
    ADD COLUMN IF NOT EXISTS synthetic BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN routing_decisions.synthetic IS 'Request carried x-aura-synthetic; excluded from stats, outcome rollup, arm statistics and live gold sampling.';

CREATE INDEX IF NOT EXISTS idx_routing_decisions_synthetic
    ON routing_decisions(created_at DESC) WHERE synthetic;

-- Rebuild the outcomes view so readers can filter synthetic rows. New
-- column appended at the end (CREATE OR REPLACE VIEW requires it).
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
    o.computed_at AS outcome_computed_at,
    d.synthetic
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

COMMENT ON VIEW v_routing_outcomes IS 'Auto-router decisions joined with request outcome (status, tokens, cost, latency, feedback), the computed next-turn signal and reward, the estimated saving for shadow rows, and the synthetic flag.';
