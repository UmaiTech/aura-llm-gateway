-- Hierarchical Organization Model and End-User Cost Tracking
-- Adds teams, projects, and end-user tracking for cost allocation

-- ============================================================================
-- TEAMS TABLE
-- Teams are subdivisions within an organization (departments, products, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- Team name (unique within org)
    name VARCHAR(200) NOT NULL,
    -- URL-friendly slug
    slug VARCHAR(100) NOT NULL,
    -- Optional description
    description TEXT,
    -- Monthly token budget for the team (null = inherit from org/unlimited)
    monthly_token_limit BIGINT,
    -- Current month token usage
    current_month_tokens BIGINT NOT NULL DEFAULT 0,
    -- Month/year for usage tracking reset
    usage_reset_month VARCHAR(7),
    -- Settings/metadata
    settings JSONB DEFAULT '{}',
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Constraints
    UNIQUE(organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_teams_organization_id ON teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    -- Role: lead, member
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
    -- Timestamps
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Constraints
    UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

-- ============================================================================
-- PROJECTS TABLE
-- Projects are specific initiatives/products within a team
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    -- Project name (unique within team)
    name VARCHAR(200) NOT NULL,
    -- URL-friendly slug
    slug VARCHAR(100) NOT NULL,
    -- Optional description
    description TEXT,
    -- Monthly token budget for the project (null = inherit from team/unlimited)
    monthly_token_limit BIGINT,
    -- Current month token usage
    current_month_tokens BIGINT NOT NULL DEFAULT 0,
    -- Month/year for usage tracking reset
    usage_reset_month VARCHAR(7),
    -- Project status
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    -- Settings/metadata
    settings JSONB DEFAULT '{}',
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Constraints
    UNIQUE(team_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_projects_team_id ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- ============================================================================
-- END USERS TABLE
-- Tracks consumer/client users for cost allocation
-- These are the end users of applications built with Aura
-- ============================================================================

CREATE TABLE IF NOT EXISTS end_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- The organization this end user belongs to
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- External user identifier (provided by the API client)
    external_id VARCHAR(255) NOT NULL,
    -- Optional display name
    name VARCHAR(255),
    -- Optional email
    email VARCHAR(255),
    -- Total tokens consumed
    total_input_tokens BIGINT NOT NULL DEFAULT 0,
    total_output_tokens BIGINT NOT NULL DEFAULT 0,
    -- Total cost
    total_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- Request count
    request_count BIGINT NOT NULL DEFAULT 0,
    -- Per-user rate limit (null = use API key limit)
    rate_limit_rpm INT,
    -- Per-user monthly token limit (null = unlimited)
    monthly_token_limit BIGINT,
    -- Current month usage
    current_month_tokens BIGINT NOT NULL DEFAULT 0,
    usage_reset_month VARCHAR(7),
    -- Whether this user is blocked
    is_blocked BOOLEAN NOT NULL DEFAULT false,
    -- Optional metadata (custom attributes from client)
    metadata JSONB,
    -- First seen / last seen
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Constraints: external_id must be unique per organization
    UNIQUE(organization_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_end_users_organization_id ON end_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_end_users_external_id ON end_users(external_id);
CREATE INDEX IF NOT EXISTS idx_end_users_email ON end_users(email);

-- ============================================================================
-- ENHANCE API KEYS WITH SCOPE TYPE
-- Allows keys to be scoped to org, team, project, or user level
-- ============================================================================

-- Add scope_type and scope_id columns to api_keys
ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20) DEFAULT 'organization'
        CHECK (scope_type IN ('organization', 'team', 'project', 'user')),
    ADD COLUMN IF NOT EXISTS scope_id UUID;

-- Add index for scope lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_scope ON api_keys(scope_type, scope_id);

-- ============================================================================
-- ENHANCE API KEY USAGE WITH END USER TRACKING
-- ============================================================================

-- Add end_user_id to api_key_usage
ALTER TABLE api_key_usage
    ADD COLUMN IF NOT EXISTS end_user_id UUID REFERENCES end_users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS end_user_external_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_end_user_id ON api_key_usage(end_user_id);

-- ============================================================================
-- FUNCTIONS FOR END USER UPSERT AND USAGE TRACKING
-- ============================================================================

-- Function to upsert an end user and return their ID
-- Used when processing requests with a user identifier
CREATE OR REPLACE FUNCTION upsert_end_user(
    p_organization_id UUID,
    p_external_id VARCHAR(255),
    p_name VARCHAR(255) DEFAULT NULL,
    p_email VARCHAR(255) DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    INSERT INTO end_users (organization_id, external_id, name, email, metadata)
    VALUES (p_organization_id, p_external_id, p_name, p_email, p_metadata)
    ON CONFLICT (organization_id, external_id)
    DO UPDATE SET
        name = COALESCE(EXCLUDED.name, end_users.name),
        email = COALESCE(EXCLUDED.email, end_users.email),
        metadata = COALESCE(EXCLUDED.metadata, end_users.metadata),
        last_seen_at = NOW(),
        updated_at = NOW()
    RETURNING id INTO v_user_id;

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to record end user usage
CREATE OR REPLACE FUNCTION record_end_user_usage(
    p_end_user_id UUID,
    p_input_tokens INT,
    p_output_tokens INT,
    p_cost_usd DOUBLE PRECISION DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    current_month VARCHAR(7);
BEGIN
    current_month := TO_CHAR(NOW(), 'YYYY-MM');

    UPDATE end_users
    SET
        total_input_tokens = total_input_tokens + p_input_tokens,
        total_output_tokens = total_output_tokens + p_output_tokens,
        total_cost_usd = total_cost_usd + COALESCE(p_cost_usd, 0),
        request_count = request_count + 1,
        current_month_tokens = CASE
            WHEN usage_reset_month = current_month
            THEN current_month_tokens + p_input_tokens + p_output_tokens
            ELSE p_input_tokens + p_output_tokens
        END,
        usage_reset_month = current_month,
        last_seen_at = NOW(),
        updated_at = NOW()
    WHERE id = p_end_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment team usage
CREATE OR REPLACE FUNCTION increment_team_usage(
    p_team_id UUID,
    p_input_tokens INT,
    p_output_tokens INT
)
RETURNS VOID AS $$
DECLARE
    current_month VARCHAR(7);
BEGIN
    current_month := TO_CHAR(NOW(), 'YYYY-MM');

    UPDATE teams
    SET
        current_month_tokens = CASE
            WHEN usage_reset_month = current_month
            THEN current_month_tokens + p_input_tokens + p_output_tokens
            ELSE p_input_tokens + p_output_tokens
        END,
        usage_reset_month = current_month
    WHERE id = p_team_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment project usage
CREATE OR REPLACE FUNCTION increment_project_usage(
    p_project_id UUID,
    p_input_tokens INT,
    p_output_tokens INT
)
RETURNS VOID AS $$
DECLARE
    current_month VARCHAR(7);
BEGIN
    current_month := TO_CHAR(NOW(), 'YYYY-MM');

    UPDATE projects
    SET
        current_month_tokens = CASE
            WHEN usage_reset_month = current_month
            THEN current_month_tokens + p_input_tokens + p_output_tokens
            ELSE p_input_tokens + p_output_tokens
        END,
        usage_reset_month = current_month
    WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_end_users_updated_at ON end_users;
CREATE TRIGGER update_end_users_updated_at BEFORE UPDATE ON end_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS FOR REPORTING
-- ============================================================================

-- End user usage summary view
CREATE OR REPLACE VIEW end_user_usage_summary AS
SELECT
    eu.id,
    eu.organization_id,
    o.name as organization_name,
    eu.external_id,
    eu.name as user_name,
    eu.email,
    eu.total_input_tokens,
    eu.total_output_tokens,
    eu.total_input_tokens + eu.total_output_tokens as total_tokens,
    eu.total_cost_usd,
    eu.request_count,
    eu.current_month_tokens,
    eu.is_blocked,
    eu.first_seen_at,
    eu.last_seen_at
FROM end_users eu
JOIN organizations o ON o.id = eu.organization_id;

-- Organization hierarchy view
CREATE OR REPLACE VIEW organization_hierarchy AS
SELECT
    o.id as organization_id,
    o.name as organization_name,
    o.slug as organization_slug,
    t.id as team_id,
    t.name as team_name,
    t.slug as team_slug,
    p.id as project_id,
    p.name as project_name,
    p.slug as project_slug,
    p.status as project_status
FROM organizations o
LEFT JOIN teams t ON t.organization_id = o.id
LEFT JOIN projects p ON p.team_id = t.id;
