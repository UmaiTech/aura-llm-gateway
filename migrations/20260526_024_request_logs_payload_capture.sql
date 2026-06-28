-- Add optional payload capture columns to request_logs
-- request_body and response_body are NULL by default (capture is off).
-- They are populated only when AURA_PAYLOAD_CAPTURE=on (env) AND
-- organizations.settings->>'capture_payloads' = 'true' for the key's org.

ALTER TABLE request_logs
    ADD COLUMN IF NOT EXISTS request_body  JSONB NULL,
    ADD COLUMN IF NOT EXISTS response_body JSONB NULL;

-- Drop and recreate v_recent_requests to surface the two new columns
DROP VIEW IF EXISTS v_recent_requests;

CREATE VIEW v_recent_requests AS
SELECT
    rl.id,
    rl.response_id,
    rl.conversation_id,
    rl.provider_name,
    rl.model_id,
    rl.user_id,
    rl.input_tokens,
    rl.output_tokens,
    rl.cached_tokens,
    rl.reasoning_tokens,
    rl.cost_usd,
    rl.latency_ms,
    rl.status,
    rl.error_code,
    rl.error_message,
    -- Gateway metadata
    rl.metadata->>'routing_strategy' as routing_strategy,
    COALESCE(rl.cached_tokens, 0) > 0 as cache_hit,
    COALESCE(rl.reasoning_tokens, 0) > 0 as has_reasoning,
    COALESCE((rl.metadata->>'compressed')::BOOLEAN, false) as compressed,
    -- Tool call metadata (from aura.agentic)
    COALESCE((rl.metadata->'aura'->'agentic'->>'has_tool_calls')::BOOLEAN, false) as has_tool_calls,
    COALESCE((rl.metadata->'aura'->'agentic'->>'tool_calls_count')::INT, 0) as tool_calls_count,
    rl.metadata->'aura'->'agentic'->'tools_used' as tools_used,
    rl.metadata->'aura'->'agentic'->'tool_calls_data' as tool_calls_data,
    rl.metadata as full_metadata,
    -- Payload capture (NULL when capture was off for this request)
    rl.request_body,
    rl.response_body,
    rl.created_at
FROM request_logs rl
ORDER BY rl.created_at DESC;

COMMENT ON VIEW v_recent_requests IS 'Recent requests with full metadata including tool call info and optional payload capture for dev logs';
COMMENT ON COLUMN request_logs.request_body  IS 'Full request JSON captured when AURA_PAYLOAD_CAPTURE=on and org.settings.capture_payloads=true. NULL otherwise.';
COMMENT ON COLUMN request_logs.response_body IS 'Full response JSON captured when AURA_PAYLOAD_CAPTURE=on and org.settings.capture_payloads=true. NULL otherwise.';
