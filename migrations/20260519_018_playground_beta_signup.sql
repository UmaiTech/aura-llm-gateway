-- Managed-service beta signup list.
--
-- Captures playground users who tap the "Join the beta" CTA shown when
-- they hit the free-tier rate limit (or via the persistent header
-- banner). We pre-fill name/email/github_login from the better-auth
-- session, so the user only ever clicks one button — no form.
--
-- One row per user: a user can only sign up once. Re-clicking returns
-- the existing row idempotently (handled by the API endpoint).
--
-- We track `source` so we can later see which CTA converts best
-- ("rate_limit_429" vs. "header_banner" vs. anywhere new). `use_case`
-- is reserved for a future variant of the flow that asks one short
-- question; nullable for now.

CREATE TABLE IF NOT EXISTS playground_auth.beta_signup (
    user_id       TEXT PRIMARY KEY REFERENCES playground_auth."user"(id) ON DELETE CASCADE,
    email         TEXT NOT NULL,
    name          TEXT,
    github_login  TEXT,
    source        TEXT NOT NULL,
    use_case      TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beta_signup_created_at
    ON playground_auth.beta_signup(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beta_signup_source
    ON playground_auth.beta_signup(source);
