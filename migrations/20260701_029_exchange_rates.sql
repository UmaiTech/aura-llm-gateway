-- Daily FX rates for showing LLM prices in local currency (issue #123 follow-up).
--
-- Prices in model_pricing are stored in USD. The public pricing page lets a
-- visitor pick a currency; conversion is done client-side using these rates.
--
-- Source: Sveriges Riksbank SWEA API (https://api.riksbank.se/swea/v1),
-- updated on Swedish bank days. Each row is "SEK per 1 unit of <currency>"
-- (the Riksbank's SEK<CUR>PMI series). USD itself is stored too (SEK per USD)
-- so the frontend can do: price_local = price_usd * sek_per_usd / sek_per_unit.
-- SEK is stored as sek_per_unit = 1.
--
-- NB: the Riksbank states these rates are indicative only, not for
-- transactional use — fine for displaying approximate local pricing.

CREATE TABLE IF NOT EXISTS exchange_rates (
    currency      VARCHAR(3) PRIMARY KEY,   -- ISO 4217: USD, SEK, EUR, GBP, NOK, DKK
    -- SEK per 1 unit of `currency` (Riksbank SEK<CUR>PMI). SEK itself = 1.
    sek_per_unit  DOUBLE PRECISION NOT NULL,
    -- Riksbank observation date (ISO 8601) the rate is from.
    rate_date     DATE,
    -- Riksbank series id the value came from (provenance); NULL for SEK.
    source_series VARCHAR(20),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE exchange_rates IS
    'Daily FX rates (SEK per unit) from the Riksbank SWEA API, for local-currency display of USD model prices.';
