-- Migration: fix_cost_usd_type
-- Change usage_cost_usd from DECIMAL to DOUBLE PRECISION for better precision handling

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'responses'
        AND column_name = 'usage_cost_usd'
        AND data_type = 'numeric'
    ) THEN
        ALTER TABLE responses ALTER COLUMN usage_cost_usd TYPE DOUBLE PRECISION;
    END IF;
END $$;
