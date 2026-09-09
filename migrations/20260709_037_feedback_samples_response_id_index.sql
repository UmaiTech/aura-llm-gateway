-- The auto-router outcome view and the rollup's pending scan look up the
-- latest feedback per decision by provider response id; without an index
-- each lookup is a sequential scan of feedback_samples.

CREATE INDEX IF NOT EXISTS idx_feedback_samples_response_id
    ON feedback_samples(response_id, created_at DESC);
