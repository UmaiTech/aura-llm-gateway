-- One-shot operator setup: create the Playground (Demo) organization
-- and link every existing playground-minted key to it.
--
-- This is NOT a sqlx migration. It's an idempotent setup script you
-- run by hand against the prod (or dev) database before deploying
-- the changes from PR #152. The reason it's not a migration: it
-- couples the schema layout to a specific operator's GitHub user id
-- (the eventual owner_id), which we don't want baked into the
-- committed history.
--
-- ============================================================================
-- WHEN TO RUN
-- ============================================================================
--
-- Before deploying the gateway with the updated mint-key.ts that
-- expects this org row to exist. If you flip the order (deploy
-- first, run this later), every new playground sign-in will fail
-- because getPlaygroundOrgId() throws when the slug='playground'
-- row is missing.
--
-- ============================================================================
-- HOW TO RUN (prod)
-- ============================================================================
--
--   # Get a psql connection to Fly Postgres:
--   flyctl postgres connect -a aura-llm-pg
--
--   # Then paste this whole file, OR:
--   \i scripts/setup_playground_org.sql
--
-- ============================================================================
-- WHAT IT DOES
-- ============================================================================
--
-- 1. Inserts one row into `organizations` with slug='playground'.
--    owner_id is left as 'system:playground' (a sentinel — distinct
--    from any real better-auth user id, which are 32-char base64).
-- 2. Backfills `api_keys.organization_id` for every existing key
--    that was minted by the playground (identified by its presence
--    in playground_auth.user_api_key).
-- 3. Idempotent — re-running is a no-op.
--
-- ============================================================================
-- AFTER RUNNING: claim ownership (optional, but enables future per-
-- user admin features that scope "my orgs" to rows where owner_id
-- matches the signed-in admin user)
-- ============================================================================
--
--   UPDATE organizations
--      SET owner_id = (
--          SELECT id FROM playground_auth."user"
--           WHERE email = '<your-github-email>'
--           LIMIT 1
--      )
--    WHERE slug = 'playground'
--      AND owner_id = 'system:playground';
--
-- The `owner_id = 'system:playground'` guard makes this safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Seed the Playground (Demo) organization
-- ---------------------------------------------------------------------------
INSERT INTO organizations (name, slug, owner_id, settings)
VALUES (
    'Playground (Demo)',
    'playground',
    'system:playground',
    jsonb_build_object(
        'kind', 'playground',
        'description', 'All keys minted by playground sign-ins (playground.aura-llm.dev). Auto-managed — do not edit members or rate-limit settings directly here.'
    )
)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Backfill organization_id on every existing playground-minted key
-- ---------------------------------------------------------------------------
UPDATE api_keys ak
   SET organization_id = (SELECT id FROM organizations WHERE slug = 'playground')
  FROM playground_auth.user_api_key uak
 WHERE ak.key_id = uak.api_key_id
   AND ak.organization_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Show the result so you can sanity-check
-- ---------------------------------------------------------------------------
SELECT
    o.slug,
    o.name,
    o.owner_id,
    COUNT(ak.id) AS backfilled_keys
FROM organizations o
LEFT JOIN api_keys ak ON ak.organization_id = o.id
WHERE o.slug = 'playground'
GROUP BY o.slug, o.name, o.owner_id;
