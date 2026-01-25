-- Add trigger to aggregate end user usage from api_key_usage table
-- This ensures end_users.total_cost_usd and other metrics stay up-to-date

-- Function to update end user aggregated usage
CREATE OR REPLACE FUNCTION update_end_user_aggregated_usage()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if end_user_id is set
    IF NEW.end_user_id IS NOT NULL THEN
        UPDATE end_users
        SET
            total_input_tokens = total_input_tokens + NEW.input_tokens,
            total_output_tokens = total_output_tokens + NEW.output_tokens,
            total_cost_usd = total_cost_usd + COALESCE(NEW.cost_usd, 0),
            request_count = request_count + 1,
            current_month_tokens = current_month_tokens + NEW.input_tokens + NEW.output_tokens,
            last_seen_at = NOW(),
            updated_at = NOW()
        WHERE id = NEW.end_user_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on api_key_usage INSERT
CREATE TRIGGER aggregate_end_user_usage
    AFTER INSERT ON api_key_usage
    FOR EACH ROW
    EXECUTE FUNCTION update_end_user_aggregated_usage();

-- Backfill existing api_key_usage data into end_users
-- This updates end_users with historical usage data
UPDATE end_users eu
SET
    total_input_tokens = COALESCE(usage_agg.total_input, 0),
    total_output_tokens = COALESCE(usage_agg.total_output, 0),
    total_cost_usd = COALESCE(usage_agg.total_cost, 0),
    request_count = COALESCE(usage_agg.req_count, 0),
    current_month_tokens = COALESCE(usage_agg.month_tokens, 0)
FROM (
    SELECT
        end_user_id,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        SUM(COALESCE(cost_usd, 0)) as total_cost,
        COUNT(*) as req_count,
        SUM(input_tokens + output_tokens) FILTER (
            WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        ) as month_tokens
    FROM api_key_usage
    WHERE end_user_id IS NOT NULL
    GROUP BY end_user_id
) usage_agg
WHERE eu.id = usage_agg.end_user_id;
