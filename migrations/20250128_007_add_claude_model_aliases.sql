-- Add user-friendly Claude model aliases
-- Provides simple model IDs like "claude-opus-4-5" instead of dated versions

-- Add Claude model aliases for easier usage
WITH anthropic AS (SELECT id FROM providers WHERE name = 'anthropic')
INSERT INTO model_pricing (provider_id, model_id, model_name, input_per_million, output_per_million, cached_input_per_million, context_window, max_output_tokens)
SELECT anthropic.id, v.model_id, v.model_name, v.input, v.output, v.cached, v.context, v.max_output
FROM anthropic, (VALUES
    -- Claude 4.5 aliases (simple version without dates)
    ('claude-opus-4-5', 'Claude Opus 4.5', 15.00, 75.00, 1.50, 200000, 8192),
    ('claude-sonnet-4-5', 'Claude Sonnet 4.5', 3.00, 15.00, 0.30, 200000, 8192),
    -- Claude 3.5 aliases (simple version without dates)
    ('claude-sonnet-3-5', 'Claude 3.5 Sonnet', 3.00, 15.00, 0.30, 200000, 8192),
    ('claude-haiku-3-5', 'Claude 3.5 Haiku', 0.80, 4.00, 0.08, 200000, 8192),
    -- Claude 3 aliases (simple version without dates)
    ('claude-opus-3', 'Claude 3 Opus', 15.00, 75.00, 1.50, 200000, 4096),
    ('claude-sonnet-3', 'Claude 3 Sonnet', 3.00, 15.00, 0.30, 200000, 4096),
    ('claude-haiku-3', 'Claude 3 Haiku', 0.25, 1.25, 0.03, 200000, 4096)
) AS v(model_id, model_name, input, output, cached, context, max_output)
ON CONFLICT DO NOTHING;
