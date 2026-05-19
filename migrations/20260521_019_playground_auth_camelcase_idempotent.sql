-- Idempotent recovery migration: rename playground_auth.* columns to
-- camelCase if they're still in snake_case.
--
-- Context: an earlier non-idempotent migration (20260519_017) did the
-- same renames but was applied to production manually via `\i` — never
-- recorded in `_sqlx_migrations`. When the gateway then tried to run
-- sqlx migrate, it saw an unrecorded version, then version 20260519
-- got reused by a different migration (018_playground_beta_signup),
-- producing checksum-mismatch failures. The 017 file was removed to
-- unblock that loop.
--
-- This migration replaces 017 in a way that's safe to run anywhere:
--   - On prod: every IF check finds columns already renamed → no-op.
--   - On a fresh dev DB (or test fixture): renames execute normally.
--
-- We can't fold this into 016 because 016 is already applied and any
-- edit there would itself cause a checksum mismatch.
--
-- Better-auth 1.6's Kysely adapter writes unquoted camelCase column
-- references like `INSERT INTO "user" ("emailVerified", ...)`. Without
-- these columns existing in that exact case, every sign-in attempt
-- dies on `Connection terminated unexpectedly` mid-INSERT.

DO $$
DECLARE
    -- Helper: try a rename; swallow "column does not exist" so we
    -- don't trip a fresh-DB run that already used camelCase.
    rename_attempt TEXT;
BEGIN
    -- ---------------------------------------------------------------
    -- user
    -- ---------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'playground_auth'
           AND table_name   = 'user'
           AND column_name  = 'email_verified'
    ) THEN
        ALTER TABLE playground_auth."user" RENAME COLUMN email_verified TO "emailVerified";
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'playground_auth'
           AND table_name   = 'user'
           AND column_name  = 'created_at'
    ) THEN
        ALTER TABLE playground_auth."user" RENAME COLUMN created_at TO "createdAt";
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'playground_auth'
           AND table_name   = 'user'
           AND column_name  = 'updated_at'
    ) THEN
        ALTER TABLE playground_auth."user" RENAME COLUMN updated_at TO "updatedAt";
    END IF;

    -- ---------------------------------------------------------------
    -- session
    -- ---------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='session' AND column_name='user_id') THEN
        ALTER TABLE playground_auth.session RENAME COLUMN user_id TO "userId";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='session' AND column_name='expires_at') THEN
        ALTER TABLE playground_auth.session RENAME COLUMN expires_at TO "expiresAt";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='session' AND column_name='ip_address') THEN
        ALTER TABLE playground_auth.session RENAME COLUMN ip_address TO "ipAddress";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='session' AND column_name='user_agent') THEN
        ALTER TABLE playground_auth.session RENAME COLUMN user_agent TO "userAgent";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='session' AND column_name='created_at') THEN
        ALTER TABLE playground_auth.session RENAME COLUMN created_at TO "createdAt";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='session' AND column_name='updated_at') THEN
        ALTER TABLE playground_auth.session RENAME COLUMN updated_at TO "updatedAt";
    END IF;

    -- ---------------------------------------------------------------
    -- account
    -- ---------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='account' AND column_name='user_id') THEN
        ALTER TABLE playground_auth.account RENAME COLUMN user_id TO "userId";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='account' AND column_name='account_id') THEN
        ALTER TABLE playground_auth.account RENAME COLUMN account_id TO "accountId";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='account' AND column_name='provider_id') THEN
        ALTER TABLE playground_auth.account RENAME COLUMN provider_id TO "providerId";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='account' AND column_name='access_token') THEN
        ALTER TABLE playground_auth.account RENAME COLUMN access_token TO "accessToken";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='account' AND column_name='refresh_token') THEN
        ALTER TABLE playground_auth.account RENAME COLUMN refresh_token TO "refreshToken";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='account' AND column_name='id_token') THEN
        ALTER TABLE playground_auth.account RENAME COLUMN id_token TO "idToken";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='account' AND column_name='access_token_expires_at') THEN
        ALTER TABLE playground_auth.account RENAME COLUMN access_token_expires_at TO "accessTokenExpiresAt";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='account' AND column_name='refresh_token_expires_at') THEN
        ALTER TABLE playground_auth.account RENAME COLUMN refresh_token_expires_at TO "refreshTokenExpiresAt";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='account' AND column_name='created_at') THEN
        ALTER TABLE playground_auth.account RENAME COLUMN created_at TO "createdAt";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='account' AND column_name='updated_at') THEN
        ALTER TABLE playground_auth.account RENAME COLUMN updated_at TO "updatedAt";
    END IF;

    -- ---------------------------------------------------------------
    -- verification
    -- ---------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='verification' AND column_name='expires_at') THEN
        ALTER TABLE playground_auth.verification RENAME COLUMN expires_at TO "expiresAt";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='verification' AND column_name='created_at') THEN
        ALTER TABLE playground_auth.verification RENAME COLUMN created_at TO "createdAt";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='playground_auth' AND table_name='verification' AND column_name='updated_at') THEN
        ALTER TABLE playground_auth.verification RENAME COLUMN updated_at TO "updatedAt";
    END IF;
END;
$$;

-- Rebuild indexes that referenced the renamed columns. Drop any
-- snake_case ones that survived from migration 016, then create
-- camelCase versions if they don't already exist.
DROP INDEX IF EXISTS playground_auth.idx_playground_session_user_id;
DROP INDEX IF EXISTS playground_auth.idx_playground_session_expires;
DROP INDEX IF EXISTS playground_auth.idx_playground_account_user_id;

CREATE INDEX IF NOT EXISTS idx_playground_session_user_id ON playground_auth.session("userId");
CREATE INDEX IF NOT EXISTS idx_playground_session_expires ON playground_auth.session("expiresAt");
CREATE INDEX IF NOT EXISTS idx_playground_account_user_id ON playground_auth.account("userId");

-- playground_auth.user_api_key keeps snake_case columns — it's our own
-- link table, accessed only by /api/_lib/mint-key.ts, not by
-- better-auth. No rename needed.
