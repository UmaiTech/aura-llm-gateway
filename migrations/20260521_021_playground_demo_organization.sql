-- Wire the playground app into a real `organizations` row so it shows up
-- as its own scope in the admin dashboard's `v_organization_usage` view.
--
-- Background: every playground sign-in mints a per-user gateway API key
-- (via api/_lib/mint-key.ts), but those keys all had `organization_id =
-- NULL`. That meant the admin "Organizations" page (and any future
-- per-org filtering) couldn't roll up playground usage as a single
-- bucket — it just looked like a pile of orphaned keys.
--
-- After this migration:
--   - One `organizations` row with slug='playground' exists.
--   - Every existing playground key is linked to it via
--     api_keys.organization_id (backfill via playground_auth.user_api_key).
--   - New playground keys minted from mint-key.ts will set
--     organization_id at insert time — see that file for the matching
--     code change.
--
-- owner_id is set to my playground_auth.user.id (Marcus Elwin). When
-- per-user admin auth lands, the admin dashboard scopes "my orgs" to
-- rows where owner_id matches the signed-in admin user.
--
-- Idempotent: re-running is a no-op. INSERT uses ON CONFLICT (slug)
-- DO NOTHING, and the backfill UPDATE only touches keys whose
-- organization_id is still NULL.

-- ---------------------------------------------------------------------------
-- 1. Seed the Playground (Demo) organization
-- ---------------------------------------------------------------------------
INSERT INTO organizations (name, slug, owner_id, settings)
VALUES (
    'Playground (Demo)',
    'playground',
    'gFdMMsOBt3NFyakQMmZyqepdJiLVlEE2',
    jsonb_build_object(
        'kind', 'playground',
        'description', 'All keys minted by playground sign-ins (playground.aura-llm.dev). Auto-managed — do not edit members or rate-limit settings directly here.'
    )
)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Backfill organization_id on every existing playground-minted key.
--    Identified by their presence in playground_auth.user_api_key, which
--    is the link table that mint-key.ts populates atomically with the
--    api_keys insert.
-- ---------------------------------------------------------------------------
UPDATE api_keys ak
   SET organization_id = (SELECT id FROM organizations WHERE slug = 'playground')
  FROM playground_auth.user_api_key uak
 WHERE ak.key_id = uak.api_key_id
   AND ak.organization_id IS NULL;
