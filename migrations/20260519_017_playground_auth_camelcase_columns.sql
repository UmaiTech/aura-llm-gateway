-- Rename every snake_case column in playground_auth.* to camelCase so
-- better-auth's Kysely adapter (1.6) can insert into them without
-- field-name remapping.
--
-- Why this is needed: better-auth's default model definitions use
-- camelCase field names (emailVerified, createdAt, userId, etc.). The
-- kysely adapter writes `INSERT INTO "user" ("emailVerified", ...)`.
-- Migration 016 created the tables with snake_case columns
-- (email_verified, created_at, user_id) following the rest of the
-- gateway's convention — but the gateway's tables aren't accessed via
-- better-auth, so the convention only applies to public.*.
--
-- The mismatch caused `Connection terminated unexpectedly` 500s on
-- every sign-in because Postgres rejected the unknown column names
-- and Fly's PG killed the connection mid-statement.
--
-- Zero rows in production playground_auth.* when this migration runs
-- (the auth flow has never completed), so renames are safe and
-- non-destructive. Identity quoting (double-quotes) preserves the
-- camelCase exactly — without quotes, Postgres would fold to
-- lowercase and we'd still mismatch.

-- ---------------------------------------------------------------------
-- user
-- ---------------------------------------------------------------------
ALTER TABLE playground_auth."user" RENAME COLUMN email_verified TO "emailVerified";
ALTER TABLE playground_auth."user" RENAME COLUMN created_at    TO "createdAt";
ALTER TABLE playground_auth."user" RENAME COLUMN updated_at    TO "updatedAt";

-- ---------------------------------------------------------------------
-- session
-- ---------------------------------------------------------------------
ALTER TABLE playground_auth.session RENAME COLUMN user_id    TO "userId";
ALTER TABLE playground_auth.session RENAME COLUMN expires_at TO "expiresAt";
ALTER TABLE playground_auth.session RENAME COLUMN ip_address TO "ipAddress";
ALTER TABLE playground_auth.session RENAME COLUMN user_agent TO "userAgent";
ALTER TABLE playground_auth.session RENAME COLUMN created_at TO "createdAt";
ALTER TABLE playground_auth.session RENAME COLUMN updated_at TO "updatedAt";

-- ---------------------------------------------------------------------
-- account
-- ---------------------------------------------------------------------
ALTER TABLE playground_auth.account RENAME COLUMN user_id                  TO "userId";
ALTER TABLE playground_auth.account RENAME COLUMN account_id               TO "accountId";
ALTER TABLE playground_auth.account RENAME COLUMN provider_id              TO "providerId";
ALTER TABLE playground_auth.account RENAME COLUMN access_token             TO "accessToken";
ALTER TABLE playground_auth.account RENAME COLUMN refresh_token            TO "refreshToken";
ALTER TABLE playground_auth.account RENAME COLUMN id_token                 TO "idToken";
ALTER TABLE playground_auth.account RENAME COLUMN access_token_expires_at  TO "accessTokenExpiresAt";
ALTER TABLE playground_auth.account RENAME COLUMN refresh_token_expires_at TO "refreshTokenExpiresAt";
ALTER TABLE playground_auth.account RENAME COLUMN created_at               TO "createdAt";
ALTER TABLE playground_auth.account RENAME COLUMN updated_at               TO "updatedAt";

-- ---------------------------------------------------------------------
-- verification
-- ---------------------------------------------------------------------
ALTER TABLE playground_auth.verification RENAME COLUMN expires_at TO "expiresAt";
ALTER TABLE playground_auth.verification RENAME COLUMN created_at TO "createdAt";
ALTER TABLE playground_auth.verification RENAME COLUMN updated_at TO "updatedAt";

-- ---------------------------------------------------------------------
-- user_api_key (our own table — used by the proxy, not better-auth.
-- Keep snake_case here; better-auth never touches it.)
-- ---------------------------------------------------------------------
-- (no changes)

-- Rebuild indexes that referenced the renamed columns so explain plans
-- and pg_stat views show the new names. Index name preserved.
DROP INDEX IF EXISTS playground_auth.idx_playground_session_user_id;
DROP INDEX IF EXISTS playground_auth.idx_playground_session_expires;
DROP INDEX IF EXISTS playground_auth.idx_playground_account_user_id;

CREATE INDEX idx_playground_session_user_id ON playground_auth.session("userId");
CREATE INDEX idx_playground_session_expires ON playground_auth.session("expiresAt");
CREATE INDEX idx_playground_account_user_id ON playground_auth.account("userId");
