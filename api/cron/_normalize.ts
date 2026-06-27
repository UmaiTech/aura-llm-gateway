/**
 * Raw scrape → canonical ScrapedPrice mappers, plus the conservative trust
 * gate. Per the issue thread: only rows we are confident about get
 * `status: 'success'` and are eligible to be written. Anything ambiguous
 * (missing price, non-numeric, no model id) is downgraded to
 * `needs_review` / `failed` and skipped by the writer.
 */

import { CAPABILITY_TAGS } from './_providers.js'
import type { ProviderConfig } from './_providers.js'
import type { ScrapedPrice, RowStatus } from './_types.js'

const ALLOWED_TAGS = new Set<string>(CAPABILITY_TAGS)

/** Keep only recognized capability tags, deduped; undefined if none. */
function cleanCapabilities(raw: string[] | null | undefined): string[] | undefined {
  if (!raw || !Array.isArray(raw)) return undefined
  const tags = [...new Set(raw.map((t) => t.trim().toLowerCase()))].filter((t) =>
    ALLOWED_TAGS.has(t),
  )
  return tags.length ? tags : undefined
}

/** Title-case a raw model id for display when no name was scraped. */
function prettyName(modelId: string): string {
  return modelId
    .replace(/^anthropic\./, '')
    .replace(/[-_/]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Canonicalize a scraped model id into a stable slug. The LLM extractor
 * returns the same model with cosmetically different ids across runs
 * ("opus_4.8" / "opus_4_8" / "Opus 4.8"); without normalization each
 * variant becomes a new "current" row and the versioning logic never
 * matches an existing row to update. Collapsing to one canonical slug
 * makes re-scrapes idempotent.
 *
 * Rules: lowercase; turn any run of non-alphanumeric chars into a single
 * '-'; trim leading/trailing '-'. Preserves the provider/family prefix
 * (e.g. "anthropic-claude-3-5-sonnet") so cross-provider ids don't collide.
 */
export function canonicalModelId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isUsablePrice(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0
}

/**
 * Implausibility floor for a *paid* per-1M-token price. No real chat model
 * costs less than a tenth of a cent per 1M tokens — a value below this is
 * almost always a unit error (per-1K read as per-1M) or a number lifted
 * from prose (e.g. HuggingFace's "$0.0012 billed" example sentence). We
 * flag rather than write such rows. A literal 0 is allowed only for the
 * static local provider, not for scraped rows.
 */
const MIN_PLAUSIBLE_PRICE = 0.001

/**
 * Upper implausibility bound for a per-1M-token price. The most expensive
 * frontier models top out around $200/1M output; anything above $1000/1M is
 * almost certainly a unit error (a per-1M number multiplied by 1000) or a
 * mis-scraped figure. Flag rather than write — and never let such a value
 * reach the DB, where it can overflow the numeric column.
 */
const MAX_PLAUSIBLE_PRICE = 1000

function round6(n: number): number {
  return Number(n.toFixed(6))
}

/**
 * Firecrawl extract → ScrapedPrice. Each row passes through the trust gate:
 *  - no model id                          → failed (never written)
 *  - missing/non-numeric input or output  → needs_review
 *  - price below the implausibility floor → needs_review (likely a unit
 *    error or a number scraped from prose)
 *  - otherwise                            → success
 * Every row carries `reasoning` explaining the decision and `source_url`
 * for provenance. needs_review / failed rows are surfaced but never written.
 */
export function normalizeFirecrawl(
  cfg: ProviderConfig,
  models: Array<{
    model_name: string
    model_id?: string
    input_price_per_million?: number | null
    output_price_per_million?: number | null
    cached_input_price_per_million?: number | null
    batch_input_price_per_million?: number | null
    batch_output_price_per_million?: number | null
    context_window?: number | null
    max_output_tokens?: number | null
    capabilities?: string[] | null
    good_at?: string | null
  }>,
): ScrapedPrice[] {
  return models.map((m) => {
    const rawId = (m.model_id ?? m.model_name ?? '').trim()
    // Canonical slug keeps re-scrapes idempotent (see canonicalModelId).
    const modelId = canonicalModelId(rawId)
    const input = m.input_price_per_million
    const output = m.output_price_per_million
    const batchIn = m.batch_input_price_per_million
    const batchOut = m.batch_output_price_per_million

    let status: RowStatus = 'success'
    let failure_reason: string | undefined
    let reasoning: string

    if (!modelId) {
      status = 'failed'
      failure_reason = 'no model id on scraped row'
      reasoning = `Dropped: row had no model_id or model_name on ${cfg.url}.`
    } else if (!isUsablePrice(input) || !isUsablePrice(output)) {
      status = 'needs_review'
      failure_reason = 'price missing or non-numeric on the scraped page'
      reasoning =
        `Flagged: input/output token price not found for "${modelId}" on ` +
        `${cfg.url} (the page may not list a per-token price for it).`
    } else if (input < MIN_PLAUSIBLE_PRICE || output < MIN_PLAUSIBLE_PRICE) {
      status = 'needs_review'
      failure_reason = `implausibly low price (< $${MIN_PLAUSIBLE_PRICE}/1M) — likely a unit error or scraped from prose`
      reasoning =
        `Flagged: "${modelId}" came back at $${input}/$${output} per 1M, ` +
        `below the $${MIN_PLAUSIBLE_PRICE} floor. Probably a per-1K value ` +
        `read as per-1M, or a number lifted from page text rather than a ` +
        `pricing table. Not written.`
    } else if (input > MAX_PLAUSIBLE_PRICE || output > MAX_PLAUSIBLE_PRICE) {
      status = 'needs_review'
      failure_reason = `implausibly high price (> $${MAX_PLAUSIBLE_PRICE}/1M) — likely a per-1M value multiplied by 1000`
      reasoning =
        `Flagged: "${modelId}" came back at $${input}/$${output} per 1M, ` +
        `above the $${MAX_PLAUSIBLE_PRICE} ceiling. Almost certainly a ` +
        `per-1M price the extractor multiplied by 1000. Not written (would ` +
        `also overflow the DB column).`
    } else {
      const batchNote =
        isUsablePrice(batchIn) && isUsablePrice(batchOut)
          ? ` Batch tier: $${round6(batchIn)}/$${round6(batchOut)} per 1M.`
          : ''
      reasoning =
        `Accepted from ${cfg.url}: $${round6(input)} in / $${round6(output)} ` +
        `out per 1M tokens.${batchNote}`
    }

    return {
      provider: cfg.provider,
      model_id: modelId,
      model_name: m.model_name?.trim() || prettyName(rawId),
      input_per_million: isUsablePrice(input) ? round6(input) : 0,
      output_per_million: isUsablePrice(output) ? round6(output) : 0,
      cached_input_per_million: isUsablePrice(m.cached_input_price_per_million)
        ? round6(m.cached_input_price_per_million)
        : undefined,
      batch_input_per_million: isUsablePrice(batchIn)
        ? round6(batchIn)
        : undefined,
      batch_output_per_million: isUsablePrice(batchOut)
        ? round6(batchOut)
        : undefined,
      context_window: m.context_window ?? undefined,
      max_output_tokens: m.max_output_tokens ?? undefined,
      capabilities: cleanCapabilities(m.capabilities),
      good_at: m.good_at?.trim() || undefined,
      currency: 'USD',
      source_url: cfg.url ?? '',
      evidence_text: `${cfg.provider}:${cfg.url ?? ''}`,
      reasoning,
      status,
      failure_reason,
    }
  })
}

/**
 * A model that appears in a provider's catalog but has no price on the
 * pricing page. Surfaced as needs_review ("price n/a") so it's visible in
 * the diff/log and the operator knows the model exists, but it is never
 * written to model_pricing (prices are 0 only as a placeholder).
 */
export function catalogOnlyRow(
  cfg: ProviderConfig,
  modelName: string,
  modelId: string,
): ScrapedPrice {
  return {
    provider: cfg.provider,
    model_id: modelId,
    model_name: modelName?.trim() || prettyName(modelId),
    input_per_million: 0,
    output_per_million: 0,
    currency: 'USD',
    source_url: cfg.catalogUrl ?? cfg.url ?? '',
    evidence_text: `${cfg.provider}:catalog`,
    reasoning:
      `Listed in the ${cfg.displayName} model catalog but no per-token ` +
      `price was found on the pricing page. Surfaced for visibility; not ` +
      `written until a price is available.`,
    status: 'needs_review',
    failure_reason: 'in catalog but price n/a on pricing page',
  }
}

/** Ollama (and any local provider): a single fixed zero-cost row. */
export function staticOllama(cfg: ProviderConfig): ScrapedPrice[] {
  return [
    {
      provider: cfg.provider,
      model_id: 'ollama-local',
      model_name: 'Ollama (local inference)',
      input_per_million: 0,
      output_per_million: 0,
      currency: 'USD',
      source_url: 'static',
      evidence_text: 'local inference — no cloud pricing',
      reasoning:
        'Static $0 row: Ollama is local inference with no cloud per-token ' +
        'price. The zero is intentional, not a scrape miss.',
      status: 'success',
    },
  ]
}
