-- Batch-tier pricing columns for model_pricing (issue #123 follow-up).
--
-- Several providers publish a discounted batch-API tier (~50% of on-demand):
-- Bedrock has explicit "Price per 1M input/output tokens (batch)" columns,
-- Anthropic/OpenAI/Mistral advertise a 50% batch discount. The weekly
-- pricing scraper (api/cron/scrape-pricing.ts) now captures these, and the
-- public /pricing page surfaces them.
--
-- Additive + nullable: existing rows and existing readers
-- (crates/aura-db/src/repo.rs get_current_pricing, etc.) are unaffected —
-- they simply don't select these columns. NULL means "no batch tier
-- published for this model".

ALTER TABLE model_pricing
    ADD COLUMN IF NOT EXISTS batch_input_per_million  DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS batch_output_per_million DOUBLE PRECISION;

COMMENT ON COLUMN model_pricing.batch_input_per_million IS
    'Batch-API input price USD per 1M tokens; NULL if provider has no batch tier.';
COMMENT ON COLUMN model_pricing.batch_output_per_million IS
    'Batch-API output price USD per 1M tokens; NULL if provider has no batch tier.';
