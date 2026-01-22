-- Add latest models from all providers (January 2025)
-- Includes OpenAI GPT-5 models, Claude Sonnet 4, Claude Opus 4.5, Gemini 2.0 Flash, and Gemini 3 Pro

-- Add OpenAI GPT-5 models
WITH openai AS (SELECT id FROM providers WHERE name = 'openai')
INSERT INTO model_pricing (provider_id, model_id, model_name, input_per_million, output_per_million, cached_input_per_million, context_window, max_output_tokens)
SELECT openai.id, v.model_id, v.model_name, v.input, v.output, v.cached, v.context, v.max_output
FROM openai, (VALUES
    ('gpt-5', 'GPT-5', 5.00, 20.00, 2.50, 256000, 32768),
    ('gpt-5.2', 'GPT-5.2', 6.00, 24.00, 3.00, 256000, 32768),
    ('gpt-5-mini', 'GPT-5 Mini', 0.30, 1.20, 0.15, 256000, 32768)
) AS v(model_id, model_name, input, output, cached, context, max_output)
ON CONFLICT DO NOTHING;

-- Add Claude Sonnet 4 and Opus 4.5
WITH anthropic AS (SELECT id FROM providers WHERE name = 'anthropic')
INSERT INTO model_pricing (provider_id, model_id, model_name, input_per_million, output_per_million, cached_input_per_million, context_window, max_output_tokens)
SELECT anthropic.id, v.model_id, v.model_name, v.input, v.output, v.cached, v.context, v.max_output
FROM anthropic, (VALUES
    ('claude-sonnet-4-20250514', 'Claude Sonnet 4', 3.00, 15.00, 0.30, 200000, 8192),
    ('claude-opus-4-5-20251101', 'Claude Opus 4.5', 15.00, 75.00, 1.50, 200000, 8192)
) AS v(model_id, model_name, input, output, cached, context, max_output)
ON CONFLICT DO NOTHING;

-- Add Gemini 2.0 Flash (stable) and Gemini 3 Pro
WITH google AS (SELECT id FROM providers WHERE name = 'google')
INSERT INTO model_pricing (provider_id, model_id, model_name, input_per_million, output_per_million, cached_input_per_million, context_window, max_output_tokens)
SELECT google.id, v.model_id, v.model_name, v.input, v.output, v.cached, v.context, v.max_output
FROM google, (VALUES
    ('gemini-2.0-flash', 'Gemini 2.0 Flash', 0.075, 0.30, 0.01875, 1048576, 8192),
    ('gemini-3-pro', 'Gemini 3 Pro', 1.50, 6.00, 0.375, 2097152, 8192)
) AS v(model_id, model_name, input, output, cached, context, max_output)
ON CONFLICT DO NOTHING;
