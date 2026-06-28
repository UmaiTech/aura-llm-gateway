-- Weekly pricing scraper: audit log + ensure all 7 providers exist.
--
-- Companion to api/cron/scrape-pricing.ts (issue #123). The scraper
-- versions rows into the existing `model_pricing` table using the
-- effective_from/effective_until columns already present since the
-- initial schema. This migration adds:
--
--   1. pricing_scrape_log — one row per cron run (and per dry-run),
--      so "which providers broke last Monday" is a SQL query, not a
--      Vercel log archaeology session.
--
--   2. The five providers that were never seeded (mistral, together,
--      bedrock, huggingface, ollama). The scraper writes model_pricing
--      rows keyed by provider_id, so the provider row has to exist first.
--      openai / anthropic / google were seeded in 001_initial_schema.

-- 1. Ensure every provider the scraper knows about has a row. Mirrors the
--    providers the gateway routes to (crates/aura-core/src/provider/*.rs),
--    including the OSS-model host Together AI.
INSERT INTO providers (name, display_name, api_base_url, is_enabled) VALUES
    ('mistral',     'Mistral AI',  'https://api.mistral.ai/v1',        true),
    ('together',    'Together AI', 'https://api.together.xyz/v1',      true),
    ('bedrock',     'AWS Bedrock', NULL,                               true),
    ('huggingface', 'Hugging Face','https://api-inference.huggingface.co', true),
    ('ollama',      'Ollama',      'http://localhost:11434',           true)
ON CONFLICT (name) DO NOTHING;

-- 2. Scrape audit log. One row per provider per run, capturing the
--    outcome so a dashboard can surface drift and breakage without
--    re-scraping. `status` mirrors the per-row contract the scraper
--    emits: success | needs_review | failed (see _types.ts).
CREATE TABLE IF NOT EXISTS pricing_scrape_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Correlates every provider row written by a single cron invocation.
    run_id          UUID NOT NULL,
    provider        VARCHAR(50) NOT NULL,
    -- 'success' | 'needs_review' | 'failed'
    status          VARCHAR(20) NOT NULL,
    source_kind     VARCHAR(20) NOT NULL,          -- litellm | firecrawl | static
    source_url      VARCHAR(500),
    models_found    INT NOT NULL DEFAULT 0,
    models_upserted INT NOT NULL DEFAULT 0,
    models_unchanged INT NOT NULL DEFAULT 0,
    models_flagged  INT NOT NULL DEFAULT 0,        -- needs_review rows skipped
    -- True when this run did not write to model_pricing (?dry_run=1).
    dry_run         BOOLEAN NOT NULL DEFAULT false,
    error           TEXT,                          -- null on success
    duration_ms     INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_scrape_log_run
    ON pricing_scrape_log (run_id);
CREATE INDEX IF NOT EXISTS idx_pricing_scrape_log_provider_time
    ON pricing_scrape_log (provider, created_at DESC);
