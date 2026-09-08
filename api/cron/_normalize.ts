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

/**
 * Tokens that say who sells a model, not which model it is. Dropped from the
 * family key so `claude-haiku-3`, `anthropic.claude-3-haiku-20240307` and a
 * bare `haiku-3` all land in the same family.
 */
const BRAND_TOKENS = new Set([
  'claude',
  'anthropic',
  'openai',
  'google',
  'accounts',
  'models',
  'fireworks',
  'together',
  'mistralai',
  'meta',
  'latest',
])

/**
 * Model *family* key — the identity of a model once every cosmetic
 * difference between the ways providers, migrations and the LLM extractor
 * spell it has been removed. `canonicalModelId` only normalizes separators;
 * this goes further and is what /pricing groups on:
 *
 *  - dated snapshots (`-20240307`, `-2024-11-20`), Bedrock `-v1:0` and
 *    3-digit pins (`-001`) are stripped,
 *  - letters and digits are split (`haiku4-5` → haiku 4 5, `sonnet5` → sonnet 5),
 *  - brand tokens and the provider name are dropped,
 *  - word tokens are sorted so `claude-3-haiku` and `claude-haiku-3` agree,
 *  - numeric tokens keep their order (`gpt-5-4-mini` ≠ `gpt-4-5-mini`).
 *
 * The result is `words|numbers`, e.g. `haiku|3-5`, `flash-gemini|3-8`,
 * `gpt-mini|5-4`. Only rows from the same provider are ever compared.
 */
export function modelFamilyKey(raw: string, provider?: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/-v\d+:\d+$/, '')
    .replace(/(?<![a-z0-9])20\d{2}[-_.]?\d{2}[-_.]?\d{2}(?![a-z0-9])/g, ' ')
    .replace(/-\d{3}$/, '')
  const words = new Set<string>()
  const nums: string[] = []
  for (const chunk of s.split(/[^a-z0-9]+/)) {
    for (const t of chunk.match(/[a-z]+|\d+/g) ?? []) {
      if (/^\d+$/.test(t)) nums.push(String(Number(t)))
      else if (!BRAND_TOKENS.has(t) && t !== provider) words.add(t)
    }
  }
  return `${[...words].sort().join('-')}|${nums.join('-')}`
}

/**
 * The keys a row can be matched on: its id's family, plus its display name's
 * family when the name carries a version number (a versionless name like
 * "Claude Sonnet" must not glue different generations together). Namespaced
 * so ids only match ids and names only match names.
 */
export function familyKeys(
  row: { model_id: string; model_name?: string | null },
  provider?: string,
): string[] {
  const keys = [`id:${modelFamilyKey(row.model_id, provider)}`]
  if (row.model_name && /\d/.test(row.model_name)) {
    keys.push(`name:${modelFamilyKey(row.model_name, provider)}`)
  }
  return keys
}

/**
 * Partition rows into model families (union-find over `familyKeys`). Input
 * order is preserved within each group, so callers that sort newest-first
 * get the newest row first in every group.
 */
export function groupByFamily<T extends { model_id: string; model_name?: string | null }>(
  rows: T[],
  provider?: string,
): T[][] {
  const parent = rows.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const byKey = new Map<string, number>()
  rows.forEach((r, i) => {
    for (const k of familyKeys(r, provider)) {
      const j = byKey.get(k)
      if (j === undefined) byKey.set(k, i)
      else {
        const a = find(i)
        const b = find(j)
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b)
      }
    }
  })
  const groups = new Map<number, T[]>()
  rows.forEach((r, i) => {
    const root = find(i)
    const g = groups.get(root)
    if (g) g.push(r)
    else groups.set(root, [r])
  })
  return [...groups.values()]
}

/**
 * Pick one price from several observations of the same model: the value a
 * strict majority agrees on, else the median (which for two observations is
 * their average and for more resists a single mis-scraped outlier). Nulls
 * are ignored; null if nothing usable.
 */
export function majorityOrMedian(values: Array<number | null | undefined>): number | null {
  const vs = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  )
  if (!vs.length) return null
  const counts = new Map<number, number>()
  for (const v of vs) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = vs[0]
  let bestN = 0
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v
      bestN = n
    }
  }
  if (bestN * 2 > vs.length) return best
  const sorted = [...vs].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : round6((sorted[mid - 1] + sorted[mid]) / 2)
}

/** Majority value, else the largest — for context windows and output caps. */
function majorityOrMax(values: Array<number | null | undefined>): number | null {
  const vs = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  )
  if (!vs.length) return null
  const counts = new Map<number, number>()
  for (const v of vs) counts.set(v, (counts.get(v) ?? 0) + 1)
  for (const [v, n] of counts) if (n * 2 > vs.length) return v
  return Math.max(...vs)
}

export interface CurrentPriceRow {
  provider: string
  model_id: string
  model_name: string
  input_per_million: number
  output_per_million: number
  cached_input_per_million: number | null
  batch_input_per_million: number | null
  batch_output_per_million: number | null
  context_window: number | null
  max_output_tokens: number | null
  capabilities: string[] | null
  good_at: string | null
  effective_from: Date
}

export interface GroupedPriceRow extends CurrentPriceRow {
  /** Every id that was folded into this row, representative first. */
  model_ids: string[]
  /** How many open rows contributed to the prices shown. */
  price_samples: number
}

/**
 * Collapse the "current" rows of one provider into one row per model
 * family. The representative id/name come from the newest row; each price
 * column is a majority vote across the family with a median fallback (see
 * `majorityOrMedian`); context and output caps take the majority else the
 * largest; capabilities are unioned.
 *
 * Why this exists: `model_pricing` has no uniqueness on the open row, and
 * the same model reaches it under several ids — migration seeds
 * (`claude-haiku-3`), dated API ids (`claude-3-haiku-20240307`) and LLM
 * extractor drift (`haiku4-5`, `sonnet5`). Each rendered as its own row
 * on /pricing, sometimes with a different price.
 */
export function groupCurrentRows(
  rows: CurrentPriceRow[],
  provider: string,
): GroupedPriceRow[] {
  const newestFirst = [...rows].sort(
    (a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime(),
  )
  return groupByFamily(newestFirst, provider).map((g) => {
    const rep = g[0]
    const caps = [...new Set(g.flatMap((r) => r.capabilities ?? []))]
    return {
      ...rep,
      input_per_million: majorityOrMedian(g.map((r) => r.input_per_million)) ?? rep.input_per_million,
      output_per_million: majorityOrMedian(g.map((r) => r.output_per_million)) ?? rep.output_per_million,
      cached_input_per_million: majorityOrMedian(g.map((r) => r.cached_input_per_million)),
      batch_input_per_million: majorityOrMedian(g.map((r) => r.batch_input_per_million)),
      batch_output_per_million: majorityOrMedian(g.map((r) => r.batch_output_per_million)),
      context_window: majorityOrMax(g.map((r) => r.context_window)),
      max_output_tokens: majorityOrMax(g.map((r) => r.max_output_tokens)),
      capabilities: caps.length ? caps : null,
      good_at: g.find((r) => r.good_at)?.good_at ?? null,
      model_ids: [...new Set(g.map((r) => r.model_id))],
      price_samples: g.length,
    }
  })
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
