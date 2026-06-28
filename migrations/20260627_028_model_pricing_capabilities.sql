-- Capability metadata for model_pricing (issue #123 follow-up).
--
-- The pricing scraper now also captures, for each model, a set of inferred
-- capability tags (reasoning, tool-calling, long-context, agentic, coding,
-- vision, etc.) and a one-line "good at" summary. These power the expandable
-- model cards on the public /pricing page.
--
-- NB: unlike prices, these are best-effort LLM inference about model
-- strengths (see api/cron/_providers.ts CAPABILITY_PROMPT), not page-sourced
-- facts. Additive + nullable; existing readers are unaffected.

ALTER TABLE model_pricing
    ADD COLUMN IF NOT EXISTS capabilities TEXT[],
    ADD COLUMN IF NOT EXISTS good_at      TEXT;

COMMENT ON COLUMN model_pricing.capabilities IS
    'Inferred capability tags (reasoning, tool-calling, long-context, agentic, coding, vision, …). LLM-inferred, not authoritative.';
COMMENT ON COLUMN model_pricing.good_at IS
    'One-line inferred summary of what the model is best used for. LLM-inferred.';
