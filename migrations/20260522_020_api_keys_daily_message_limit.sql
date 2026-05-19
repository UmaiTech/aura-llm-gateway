-- Add per-key daily message cap.
--
-- Background: the existing `rate_limit_rpm` cap (5 req/min) doesn't bite
-- organic chat usage — each turn is ~10-15s of streaming + thinking
-- time, so 5 turns easily span >60s and never trip the limit. The
-- monthly token cap is a hard wall but only meaningful for power users.
-- Daily message count is the constraint that actually shapes free-tier
-- behavior: ~20 chat turns per UTC day, then 429 until midnight.
--
-- The column is nullable: NULL means no daily cap (pro tier, internal
-- keys, etc.). Default null preserves existing key behavior.

ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS daily_message_limit INTEGER;

COMMENT ON COLUMN api_keys.daily_message_limit IS
    'Maximum messages (requests) per UTC day. NULL = no cap. Counter resets at 00:00 UTC.';
