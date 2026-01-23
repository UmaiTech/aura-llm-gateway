-- Add responses table for storing complete Open Responses API response objects

CREATE TABLE IF NOT EXISTS responses (
    id VARCHAR(100) PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    model_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed', 'incomplete', 'cancelled')),
    previous_response_id VARCHAR(100),
    input_items JSONB NOT NULL,
    output_items JSONB NOT NULL,
    usage_input_tokens INT,
    usage_output_tokens INT,
    usage_cached_tokens INT,
    usage_reasoning_tokens INT,
    usage_cost_usd DOUBLE PRECISION,
    error_code VARCHAR(50),
    error_message TEXT,
    incomplete_reason VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_responses_conversation_id ON responses(conversation_id);
CREATE INDEX idx_responses_previous_id ON responses(previous_response_id);
CREATE INDEX idx_responses_created_at ON responses(created_at);
CREATE INDEX idx_responses_status ON responses(status);

CREATE TRIGGER update_responses_updated_at BEFORE UPDATE ON responses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
