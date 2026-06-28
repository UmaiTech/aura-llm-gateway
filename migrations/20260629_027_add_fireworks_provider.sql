-- Add Fireworks AI as a routable/priced provider (issue #123 follow-up).
--
-- Fireworks is a fast serverless inference host for open-source models
-- (Llama, Qwen, DeepSeek, Mixtral). The weekly pricing scraper
-- (api/cron/scrape-pricing.ts) now scrapes its pricing page; the provider
-- row must exist first because model_pricing is keyed by provider_id.
-- Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO providers (name, display_name, api_base_url, is_enabled) VALUES
    ('fireworks', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1', true)
ON CONFLICT (name) DO NOTHING;
