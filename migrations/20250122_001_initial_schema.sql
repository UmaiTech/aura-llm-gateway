-- Initial schema for Aura LLM Gateway
-- Creates tables for providers, model pricing, conversations, and request logging

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Provider registry
CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    api_base_url VARCHAR(500),
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Model pricing (per 1M tokens in USD)
CREATE TABLE IF NOT EXISTS model_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    model_id VARCHAR(100) NOT NULL,
    model_name VARCHAR(200) NOT NULL,
    input_per_million DECIMAL(10, 6) NOT NULL,
    output_per_million DECIMAL(10, 6) NOT NULL,
    cached_input_per_million DECIMAL(10, 6),
    reasoning_per_million DECIMAL(10, 6),
    context_window INT,
    max_output_tokens INT,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, model_id, effective_from)
);

-- Create index for model lookups
CREATE INDEX idx_model_pricing_model_id ON model_pricing(model_id);
CREATE INDEX idx_model_pricing_provider_id ON model_pricing(provider_id);

-- Conversations (optional - for stateful chat)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(100),
    title VARCHAR(500),
    model_id VARCHAR(100) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);

-- Messages within conversations
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Request logs for analytics and debugging
CREATE TABLE IF NOT EXISTS request_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    response_id VARCHAR(100) NOT NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    provider_name VARCHAR(50) NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(100),
    input_tokens INT,
    output_tokens INT,
    cached_tokens INT,
    reasoning_tokens INT,
    cost_usd DECIMAL(10, 6),
    latency_ms INT,
    status VARCHAR(20) NOT NULL,
    error_code VARCHAR(50),
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_request_logs_response_id ON request_logs(response_id);
CREATE INDEX idx_request_logs_user_id ON request_logs(user_id);
CREATE INDEX idx_request_logs_provider_name ON request_logs(provider_name);
CREATE INDEX idx_request_logs_created_at ON request_logs(created_at);

-- Insert default providers
INSERT INTO providers (name, display_name, api_base_url, is_enabled) VALUES
    ('openai', 'OpenAI', 'https://api.openai.com/v1', true),
    ('anthropic', 'Anthropic', 'https://api.anthropic.com/v1', true),
    ('google', 'Google AI', 'https://generativelanguage.googleapis.com/v1beta', true)
ON CONFLICT (name) DO NOTHING;

-- Insert default OpenAI pricing (as of January 2025)
WITH openai AS (SELECT id FROM providers WHERE name = 'openai')
INSERT INTO model_pricing (provider_id, model_id, model_name, input_per_million, output_per_million, cached_input_per_million, context_window, max_output_tokens)
SELECT openai.id, v.model_id, v.model_name, v.input, v.output, v.cached, v.context, v.max_output
FROM openai, (VALUES
    ('gpt-4o', 'GPT-4o', 2.50, 10.00, 1.25, 128000, 16384),
    ('gpt-4o-mini', 'GPT-4o Mini', 0.15, 0.60, 0.075, 128000, 16384),
    ('gpt-4-turbo', 'GPT-4 Turbo', 10.00, 30.00, NULL, 128000, 4096),
    ('gpt-4', 'GPT-4', 30.00, 60.00, NULL, 8192, 8192),
    ('gpt-3.5-turbo', 'GPT-3.5 Turbo', 0.50, 1.50, NULL, 16385, 4096),
    ('o1', 'o1', 15.00, 60.00, 7.50, 200000, 100000),
    ('o1-mini', 'o1 Mini', 3.00, 12.00, 1.50, 128000, 65536),
    ('o1-preview', 'o1 Preview', 15.00, 60.00, NULL, 128000, 32768),
    ('o3-mini', 'o3 Mini', 1.10, 4.40, 0.55, 200000, 100000)
) AS v(model_id, model_name, input, output, cached, context, max_output)
ON CONFLICT DO NOTHING;

-- Insert default Anthropic pricing (as of January 2025)
WITH anthropic AS (SELECT id FROM providers WHERE name = 'anthropic')
INSERT INTO model_pricing (provider_id, model_id, model_name, input_per_million, output_per_million, cached_input_per_million, context_window, max_output_tokens)
SELECT anthropic.id, v.model_id, v.model_name, v.input, v.output, v.cached, v.context, v.max_output
FROM anthropic, (VALUES
    ('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 3.00, 15.00, 0.30, 200000, 8192),
    ('claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', 0.80, 4.00, 0.08, 200000, 8192),
    ('claude-3-opus-20240229', 'Claude 3 Opus', 15.00, 75.00, 1.50, 200000, 4096),
    ('claude-3-sonnet-20240229', 'Claude 3 Sonnet', 3.00, 15.00, 0.30, 200000, 4096),
    ('claude-3-haiku-20240307', 'Claude 3 Haiku', 0.25, 1.25, 0.03, 200000, 4096)
) AS v(model_id, model_name, input, output, cached, context, max_output)
ON CONFLICT DO NOTHING;

-- Insert default Google pricing (as of January 2025)
WITH google AS (SELECT id FROM providers WHERE name = 'google')
INSERT INTO model_pricing (provider_id, model_id, model_name, input_per_million, output_per_million, cached_input_per_million, context_window, max_output_tokens)
SELECT google.id, v.model_id, v.model_name, v.input, v.output, v.cached, v.context, v.max_output
FROM google, (VALUES
    ('gemini-2.0-flash-exp', 'Gemini 2.0 Flash', 0.00, 0.00, NULL, 1048576, 8192),
    ('gemini-1.5-pro', 'Gemini 1.5 Pro', 1.25, 5.00, 0.3125, 2097152, 8192),
    ('gemini-1.5-flash', 'Gemini 1.5 Flash', 0.075, 0.30, 0.01875, 1048576, 8192),
    ('gemini-1.5-flash-8b', 'Gemini 1.5 Flash 8B', 0.0375, 0.15, 0.01, 1048576, 8192)
) AS v(model_id, model_name, input, output, cached, context, max_output)
ON CONFLICT DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_model_pricing_updated_at BEFORE UPDATE ON model_pricing
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
