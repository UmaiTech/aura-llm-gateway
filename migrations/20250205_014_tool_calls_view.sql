-- Add tool call fields to recent requests view
-- Extracts agentic metadata for tool usage display

-- Drop and recreate view to add new columns
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
    rl.created_at
FROM request_logs rl
ORDER BY rl.created_at DESC;

COMMENT ON VIEW v_recent_requests IS 'Recent requests with full metadata including tool call info for dev logs';
