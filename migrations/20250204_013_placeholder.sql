-- Placeholder migration to fix numbering gap (012 -> 014)
-- This migration was missing from the sequence and is added
-- to maintain consistent migration ordering.

-- No-op: schema is correct as of migration 012.
SELECT 1;
