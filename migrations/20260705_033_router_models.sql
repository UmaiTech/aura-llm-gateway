-- Trained auto-router classifiers.
--
-- Weights are the JSON produced by scripts/router/train.py (multinomial
-- logistic regression over the gateway's numeric feature vector, plus
-- calibrated tier boundaries). At most one row is active; the gateway
-- loads it at startup and on POST /admin/routing/models/reload.

CREATE TABLE IF NOT EXISTS router_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    version VARCHAR(100) NOT NULL,
    kind VARCHAR(32) NOT NULL DEFAULT 'learned_lr',
    weights JSONB NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_router_models_one_active
    ON router_models(is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_router_models_created
    ON router_models(created_at DESC);

COMMENT ON TABLE router_models IS 'Trained auto-router classifiers (weights JSON from scripts/router/train.py). One row may be active.';
