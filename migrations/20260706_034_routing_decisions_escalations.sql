-- Escalation steps taken after provider failures for an auto-routed
-- request. selected_model already reflects the model that finally
-- answered (the completion path re-records the decision); the original
-- choice is escalations[0].from_model. selected_model_final mirrors
-- selected_model for readability in ad-hoc queries.

ALTER TABLE routing_decisions
    ADD COLUMN IF NOT EXISTS escalations JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS selected_model_final VARCHAR(100) NULL;

COMMENT ON COLUMN routing_decisions.escalations IS 'Escalation steps [{from_model, from_tier, to_model, to_tier, error_code}] taken after provider failures; empty when the first choice answered.';
