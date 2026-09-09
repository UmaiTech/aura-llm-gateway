-- Allow one active router model per kind (learned_lr classifier and
-- cost_lr cost model) instead of one active row overall.

DROP INDEX IF EXISTS idx_router_models_one_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_router_models_one_active_per_kind
    ON router_models(kind) WHERE is_active;

COMMENT ON COLUMN router_models.kind IS 'learned_lr = tier classifier (scripts/router/train.py); cost_lr = per-model output-length / cost model (scripts/router/train_cost.py). One active row per kind.';
