-- Agentic Harness tables
-- Supports prompt library, guardrails configuration, and trace metadata

-- ============================================================================
-- HARNESS PROMPTS
-- Versioned system prompt library for agent tuning
-- ============================================================================

CREATE TABLE IF NOT EXISTS harness_prompts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    content     TEXT NOT NULL,
    -- Versioning
    version     INTEGER NOT NULL DEFAULT 1,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    -- Categorization
    tags        TEXT[] NOT NULL DEFAULT '{}',
    category    VARCHAR(100),
    -- Usage tracking
    use_count   BIGINT NOT NULL DEFAULT 0,
    -- Ownership
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_by  VARCHAR(255),
    -- Timestamps
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_harness_prompts_org
    ON harness_prompts(organization_id);
CREATE INDEX IF NOT EXISTS idx_harness_prompts_active
    ON harness_prompts(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_harness_prompts_category
    ON harness_prompts(category) WHERE category IS NOT NULL;

-- ============================================================================
-- HARNESS PROMPT VERSIONS
-- History of prompt edits for diffing and rollback
-- ============================================================================

CREATE TABLE IF NOT EXISTS harness_prompt_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id   UUID NOT NULL REFERENCES harness_prompts(id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    content     TEXT NOT NULL,
    change_note TEXT,
    created_by  VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_harness_prompt_versions_prompt
    ON harness_prompt_versions(prompt_id, version DESC);

-- ============================================================================
-- HARNESS GUARDRAILS
-- Per-org guardrail configurations for agent execution limits
-- ============================================================================

CREATE TABLE IF NOT EXISTS harness_guardrails (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    -- Execution limits
    max_tool_calls          INTEGER NOT NULL DEFAULT 10,
    max_execution_time_secs INTEGER NOT NULL DEFAULT 60,
    max_tokens              INTEGER NOT NULL DEFAULT 8000,
    max_cost_usd            DOUBLE PRECISION NOT NULL DEFAULT 1.00,
    -- Loop detection
    detect_repeated_calls   BOOLEAN NOT NULL DEFAULT true,
    auto_terminate_loops    BOOLEAN NOT NULL DEFAULT true,
    max_identical_calls     INTEGER NOT NULL DEFAULT 3,
    log_suspected_loops     BOOLEAN NOT NULL DEFAULT true,
    -- Content safety
    enable_content_moderation   BOOLEAN NOT NULL DEFAULT true,
    block_sensitive_data        BOOLEAN NOT NULL DEFAULT false,
    require_human_approval      BOOLEAN NOT NULL DEFAULT false,
    -- Timestamps
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE harness_prompts IS 'Versioned system prompt library for agent tuning';
COMMENT ON TABLE harness_prompt_versions IS 'Audit trail of prompt edits';
COMMENT ON TABLE harness_guardrails IS 'Per-org agent execution guardrail config';
