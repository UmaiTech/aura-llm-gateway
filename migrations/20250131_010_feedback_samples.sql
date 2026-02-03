-- Migration: feedback_samples
-- Stores user-reinforced response samples for adaptive few-shot learning

CREATE TABLE IF NOT EXISTS feedback_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Sample content
    input_text TEXT NOT NULL,
    output_text TEXT NOT NULL,
    model_id VARCHAR(100),

    -- Feedback
    feedback VARCHAR(20) NOT NULL CHECK (feedback IN ('approved', 'rejected')),
    feedback_reason TEXT,
    feedback_by VARCHAR(255),

    -- Categorization for retrieval
    tags TEXT[] DEFAULT '{}',
    category VARCHAR(100),

    -- Context about when this sample was created
    response_id VARCHAR(100),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

    -- Quality metrics
    confidence_score REAL,
    use_count INT DEFAULT 0,

    -- Metadata
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient retrieval
CREATE INDEX IF NOT EXISTS idx_feedback_samples_org_id ON feedback_samples(organization_id);
CREATE INDEX IF NOT EXISTS idx_feedback_samples_feedback ON feedback_samples(feedback);
CREATE INDEX IF NOT EXISTS idx_feedback_samples_category ON feedback_samples(category);
CREATE INDEX IF NOT EXISTS idx_feedback_samples_tags ON feedback_samples USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_feedback_samples_created_at ON feedback_samples(created_at);

-- Full-text search index for semantic matching
CREATE INDEX IF NOT EXISTS idx_feedback_samples_input_fts ON feedback_samples
    USING GIN(to_tsvector('english', input_text));

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_feedback_samples_updated_at ON feedback_samples;
CREATE TRIGGER update_feedback_samples_updated_at BEFORE UPDATE ON feedback_samples
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to increment use count
CREATE OR REPLACE FUNCTION increment_sample_use_count(sample_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE feedback_samples
    SET use_count = use_count + 1, updated_at = NOW()
    WHERE id = sample_id;
END;
$$ LANGUAGE plpgsql;
