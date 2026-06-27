/**
 * Shared types for the weekly pricing scraper (issue #123).
 *
 * The scraper's job is to keep the server-side `model_pricing` table
 * honest without a human re-typing seven providers' price pages every
 * few weeks. The hard constraint, per the issue thread, is that *bad*
 * pricing data is worse than *stale* pricing data — so every scraped
 * row carries a `status` and we only ever version a row into the DB
 * when it is unambiguously `success`. `needs_review` rows are logged
 * and surfaced, never written.
 */

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'together'
  | 'bedrock'
  | 'huggingface'
  | 'ollama'

/**
 * How a provider's prices are obtained. We scrape each provider's own
 * pricing website directly (no third-party aggregator), because the page
 * the provider publishes is the authoritative source of truth:
 *
 *  - 'firecrawl' → Firecrawl `extract` against the provider's own pricing
 *                  page with a schema. The source for every cloud provider,
 *                  including OSS-model hosts (Together AI).
 *  - 'static'    → fixed rows (Ollama is local inference: price is 0.0).
 */
export type SourceKind = 'firecrawl' | 'static'

/** Per-row trust level. Only `success` rows are ever written to the DB. */
export type RowStatus = 'success' | 'needs_review' | 'failed'

/**
 * Canonical shape every provider mapper must produce. Mirrors the
 * `model_pricing` columns (crates/aura-db/src/models.rs:20-69) plus the
 * provenance fields the issue comment asked for (source_url / evidence).
 */
export interface ScrapedPrice {
  provider: ProviderId
  model_id: string
  model_name: string
  input_per_million: number
  output_per_million: number
  cached_input_per_million?: number
  reasoning_per_million?: number
  context_window?: number
  max_output_tokens?: number
  currency: string // always 'USD' for now; flagged needs_review otherwise
  source_url: string
  /** Visible snippet / provenance, e.g. the source JSON key. */
  evidence_text?: string
  status: RowStatus
  /** Populated when status !== 'success'. */
  failure_reason?: string
}

/** Per-provider result returned by the scrape pipeline. */
export interface ProviderResult {
  provider: ProviderId
  source_kind: SourceKind
  source_url: string | null
  status: RowStatus
  models_found: number
  models_upserted: number
  models_unchanged: number
  models_flagged: number
  error: string | null
  duration_ms: number
  /** The diff that was (or, in dry-run, would have been) applied. */
  changes: PriceChange[]
}

/** A single price-history transition the writer made (or would make). */
export interface PriceChange {
  model_id: string
  kind: 'insert' | 'version' | 'unchanged' | 'flagged'
  before?: { input_per_million: number; output_per_million: number } | null
  after?: { input_per_million: number; output_per_million: number } | null
  note?: string
}

/** Top-level response payload for the endpoint. */
export interface ScrapeSummary {
  ok: boolean
  run_id: string
  dry_run: boolean
  providers_scraped: number
  models_upserted: number
  models_unchanged: number
  models_flagged: number
  errors: { provider: ProviderId; error: string }[]
  providers: ProviderResult[]
}
