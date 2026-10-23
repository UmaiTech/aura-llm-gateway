-- Auto-router decisions explorer (admin app).
--
-- GET /admin/routing/decisions pages through routing_decisions newest
-- first with a (created_at, id) keyset cursor; idx_routing_decisions_created
-- already serves that ordering (the planner adds an incremental sort on
-- the id tiebreak), and tier / organization filters have their own
-- indexes. Filtering by API key gets one here so a rarely used key does
-- not walk the whole time index.
--
-- boundaries records the tier boundaries in force for each decision
-- (operators can change them, and a learned classifier may calibrate its
-- own), so the decision drawer draws the score against the bands that
-- actually applied. Older rows stay NULL and fall back to the current
-- config.

ALTER TABLE routing_decisions
    ADD COLUMN IF NOT EXISTS boundaries JSONB NULL;

COMMENT ON COLUMN routing_decisions.boundaries IS 'Tier boundaries in force for the decision {simple_medium, medium_complex, complex_reasoning}; NULL on rows recorded before 20260711.';

CREATE INDEX IF NOT EXISTS idx_routing_decisions_api_key_created
    ON routing_decisions(api_key_id, created_at DESC);
