-- Gateway-wide runtime settings edited from the admin app.
--
-- A single JSONB document of overrides layered on top of the boot
-- configuration (YAML file + environment). Only settings the gateway can
-- apply without a restart live here: auto-routing switches and tier
-- lists, payload capture, tool-context replay, response cache and
-- rate-limit defaults. Secrets and listen addresses stay in the
-- environment.
--
-- The `id = 1` check keeps the table to one row; readers `SELECT` by id
-- and writers upsert it.

CREATE TABLE IF NOT EXISTS gateway_settings (
    id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO gateway_settings (id, settings)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
