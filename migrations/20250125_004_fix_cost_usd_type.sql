-- Fix cost_usd type mismatch: PostgreSQL DECIMAL is not compatible with Rust f64
-- Change DECIMAL(10,6) to DOUBLE PRECISION which maps correctly to f64

ALTER TABLE model_pricing
    ALTER COLUMN input_per_million TYPE DOUBLE PRECISION,
    ALTER COLUMN output_per_million TYPE DOUBLE PRECISION,
    ALTER COLUMN cached_per_million TYPE DOUBLE PRECISION;

ALTER TABLE request_logs
    ALTER COLUMN cost_usd TYPE DOUBLE PRECISION;

ALTER TABLE responses
    ALTER COLUMN usage_cost_usd TYPE DOUBLE PRECISION;
