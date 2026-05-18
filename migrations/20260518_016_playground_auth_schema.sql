-- Playground authentication schema for the hosted playground app.
--
-- This schema is consumed by better-auth (running in Vercel serverless
-- functions in apps/chat/api/auth/) to manage GitHub OAuth sessions for
-- playground.aura-llm.dev users. It lives in a separate `playground_auth`
-- schema so its tables don't collide with the gateway's core tables.
--
-- Why a separate schema and not a separate database?
--   - Reuses the existing Fly Postgres (aura-llm-pg) — no new vendor
--   - Logically isolated from gateway tables (api_keys, conversations, etc.)
--   - The Vercel serverless functions and the gateway share one DB so the
--     `playground_auth` → `api_keys` link (per-user gateway keys) works
--     without cross-database joins.
--
-- The table shape matches better-auth's default Postgres adapter as of
-- better-auth ~1.3 (early 2026). If better-auth's schema changes, update
-- this migration before bumping the dep.

CREATE SCHEMA IF NOT EXISTS playground_auth;

-- ---------------------------------------------------------------------------
-- Users: one row per authenticated GitHub user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playground_auth.user (
    id          TEXT PRIMARY KEY,                        -- better-auth uuid
    email       TEXT NOT NULL UNIQUE,                    -- from GitHub profile
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    name        TEXT,                                    -- display name
    image       TEXT,                                    -- avatar URL
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playground_user_email ON playground_auth.user(email);

-- ---------------------------------------------------------------------------
-- Sessions: one row per active login (cookie-backed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playground_auth.session (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES playground_auth.user(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,                    -- session cookie value
    expires_at  TIMESTAMPTZ NOT NULL,
    ip_address  TEXT,                                    -- nullable, for audit
    user_agent  TEXT,                                    -- nullable, for audit
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playground_session_user_id ON playground_auth.session(user_id);
CREATE INDEX IF NOT EXISTS idx_playground_session_expires ON playground_auth.session(expires_at);

-- ---------------------------------------------------------------------------
-- Accounts: OAuth provider linkage (one user can have multiple providers
-- eventually — GitHub for now, Google later)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playground_auth.account (
    id                        TEXT PRIMARY KEY,
    user_id                   TEXT NOT NULL REFERENCES playground_auth.user(id) ON DELETE CASCADE,
    account_id                TEXT NOT NULL,             -- provider-side user id (e.g. github user id)
    provider_id               TEXT NOT NULL,             -- "github" | "google" | etc.
    access_token              TEXT,                      -- OAuth access token (encrypted at rest by better-auth)
    refresh_token             TEXT,
    id_token                  TEXT,
    access_token_expires_at   TIMESTAMPTZ,
    refresh_token_expires_at  TIMESTAMPTZ,
    scope                     TEXT,
    password                  TEXT,                      -- not used for OAuth, here for schema compatibility
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_playground_account_user_id ON playground_auth.account(user_id);

-- ---------------------------------------------------------------------------
-- Verification tokens: email-verification / magic-link / password-reset flows.
-- We don't currently use any of these (GitHub-only OAuth) but better-auth's
-- adapter expects the table to exist or it errors on startup.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playground_auth.verification (
    id          TEXT PRIMARY KEY,
    identifier  TEXT NOT NULL,                           -- usually an email
    value       TEXT NOT NULL,                           -- the token/code
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playground_verification_identifier ON playground_auth.verification(identifier);

-- ---------------------------------------------------------------------------
-- Link table: maps a playground user to the Aura gateway API key they were
-- minted on first sign-in. Stays in the playground schema so we don't pollute
-- the gateway's tables with playground concerns.
--
-- The gateway API key itself lives in public.api_keys; this table just
-- remembers the user → key_id mapping so the proxy can look it up on every
-- request without doing a JOIN-by-metadata.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playground_auth.user_api_key (
    user_id         TEXT PRIMARY KEY REFERENCES playground_auth.user(id) ON DELETE CASCADE,
    api_key_id      TEXT NOT NULL,                       -- matches public.api_keys.key_id
    api_key_secret  TEXT NOT NULL,                       -- the bare aura_live_... bearer (server-side only)
    tier            TEXT NOT NULL DEFAULT 'free',        -- 'free' | 'pro' | 'enterprise'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playground_user_api_key_api_key_id ON playground_auth.user_api_key(api_key_id);

-- Note: api_key_secret is stored here because the Aura gateway hashes the
-- secret on insert (only the hash lives in public.api_keys). The proxy
-- function needs the bare secret to forward as a Bearer token on every
-- LLM request. Storing it in this server-side-only table is safe — it's
-- never returned to the client, never logged, never put in a JWT.
