/**
 * Shapes of GET /api/pricing (api/pricing/index.ts) as the landing reads
 * them, plus the flattened row the pricing page works with. Prices are USD
 * per 1M tokens; null means "not published / unknown", never free.
 */

export interface ApiModel {
  model_id: string
  model_name: string
  input_per_million: number | null
  output_per_million: number | null
  cached_input_per_million: number | null
  batch_input_per_million: number | null
  batch_output_per_million: number | null
  context_window: number | null
  max_output_tokens: number | null
  capabilities: string[] | null
  good_at: string | null
  effective_from: string | null
  /** Every model id folded into this row (representative first). */
  model_ids?: string[]
  /** How many price rows were voted on for the numbers shown. */
  price_samples?: number
}

export interface ApiProviderBlock {
  name: string
  display_name: string
  description: string | null
  models_url: string | null
  models: ApiModel[]
}

export interface LastRunProvider {
  provider: string
  /** 'success' | 'needs_review' | 'failed' today; kept open for new values. */
  status: string
  models_upserted: number
  models_unchanged: number
  models_flagged: number
  error: string | null
}

export interface LastRun {
  run_id: string
  at: string
  providers: LastRunProvider[]
}

export interface ExchangeRate {
  currency: string
  /** Riksbank rate: SEK per one unit of `currency`. */
  sek_per_unit: number
  rate_date: string | null
}

export interface PricingResponse {
  updated_at: string | null
  providers: ApiProviderBlock[]
  last_run: LastRun | null
  exchange_rates?: ExchangeRate[]
}

/** Per-row provenance derived from the latest scrape run. */
export type RowFreshness =
  /** Provider succeeded in the latest run. */
  | 'current'
  /** Provider's latest run flagged rows for review; some prices may be held back. */
  | 'review'
  /** Provider failed in (or is absent from) the latest run, or no run is logged. */
  | 'unverified'

/** One model in the cross-provider table. */
export interface PricingRow extends ApiModel {
  /** Stable key: `${provider}:${model_id}`. */
  key: string
  provider: string
  providerDisplay: string
  providerDescription: string | null
  modelsUrl: string | null
  /** Alias ids other than `model_id`. */
  aliases: string[]
  freshness: RowFreshness
}
