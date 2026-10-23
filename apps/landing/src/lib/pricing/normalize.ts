/**
 * Defensive adapter for GET /api/pricing. The endpoint's contract is kept
 * as-is; this only makes the page robust to partial data (no scrape log,
 * no exchange rates, null capabilities or limits) and flattens the
 * per-provider blocks into one cross-provider list.
 */
import type {
  ApiModel,
  ApiProviderBlock,
  ExchangeRate,
  LastRun,
  LastRunProvider,
  PricingResponse,
  PricingRow,
  RowFreshness,
} from './types.ts'

/**
 * The scraper runs weekly (vercel.json: Mondays 06:00 UTC). A last run
 * older than 8 days means at least one scheduled run is missing, so the
 * whole catalog is flagged as stale.
 */
export const STALE_AFTER_DAYS = 8

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A finite number, else null. Strings are not coerced: the API sends floats. */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** A finite, non-negative number, else null (a negative price is not a price). */
function price(v: unknown): number | null {
  const n = num(v)
  return n !== null && n >= 0 ? n : null
}

/** A positive token limit, else null (0 or negative means "unknown"). */
function limit(v: unknown): number | null {
  const n = num(v)
  return n !== null && n > 0 ? n : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function strList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const list = v.filter((x): x is string => typeof x === 'string' && x.length > 0)
  return list
}

function normalizeModel(raw: unknown): ApiModel | null {
  if (!isObj(raw)) return null
  const id = str(raw.model_id)
  if (!id) return null
  const ids = strList(raw.model_ids)
  const samples = num(raw.price_samples)
  return {
    model_id: id,
    model_name: str(raw.model_name) ?? id,
    input_per_million: price(raw.input_per_million),
    output_per_million: price(raw.output_per_million),
    cached_input_per_million: price(raw.cached_input_per_million),
    batch_input_per_million: price(raw.batch_input_per_million),
    batch_output_per_million: price(raw.batch_output_per_million),
    context_window: limit(raw.context_window),
    max_output_tokens: limit(raw.max_output_tokens),
    // null stays null: missing capability data is unknown, not "none".
    capabilities: strList(raw.capabilities),
    good_at: str(raw.good_at),
    effective_from: str(raw.effective_from),
    ...(ids ? { model_ids: ids } : {}),
    ...(samples !== null ? { price_samples: samples } : {}),
  }
}

function normalizeProvider(raw: unknown): ApiProviderBlock | null {
  if (!isObj(raw)) return null
  const name = str(raw.name)
  if (!name) return null
  const models = Array.isArray(raw.models)
    ? raw.models.map(normalizeModel).filter((m): m is ApiModel => m !== null)
    : []
  return {
    name,
    display_name: str(raw.display_name) ?? name,
    description: str(raw.description),
    models_url: str(raw.models_url),
    models,
  }
}

function normalizeLastRun(raw: unknown): LastRun | null {
  if (!isObj(raw)) return null
  const at = str(raw.at)
  if (!at) return null
  const providers: LastRunProvider[] = Array.isArray(raw.providers)
    ? raw.providers.filter(isObj).flatMap((p) => {
        const provider = str(p.provider)
        if (!provider) return []
        return [
          {
            provider,
            status: str(p.status) ?? 'unknown',
            models_upserted: num(p.models_upserted) ?? 0,
            models_unchanged: num(p.models_unchanged) ?? 0,
            models_flagged: num(p.models_flagged) ?? 0,
            error: str(p.error),
          },
        ]
      })
    : []
  return { run_id: str(raw.run_id) ?? '', at, providers }
}

function normalizeRates(raw: unknown): ExchangeRate[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isObj).flatMap((r) => {
    const currency = str(r.currency)
    const sek = num(r.sek_per_unit)
    if (!currency || sek === null || sek <= 0) return []
    return [{ currency, sek_per_unit: sek, rate_date: str(r.rate_date) }]
  })
}

/** Validate an /api/pricing body. Throws when it is not a pricing payload at all. */
export function normalizePricing(raw: unknown): PricingResponse {
  if (!isObj(raw) || !Array.isArray(raw.providers)) {
    throw new Error('Unexpected response from /api/pricing')
  }
  return {
    updated_at: str(raw.updated_at),
    providers: raw.providers
      .map(normalizeProvider)
      .filter((p): p is ApiProviderBlock => p !== null),
    last_run: normalizeLastRun(raw.last_run),
    exchange_rates: normalizeRates(raw.exchange_rates),
  }
}

/** Latest-run outcome for one provider, if the run covered it. */
export function providerRun(data: PricingResponse, provider: string): LastRunProvider | null {
  return data.last_run?.providers.find((p) => p.provider === provider) ?? null
}

export function rowFreshness(data: PricingResponse, provider: string): RowFreshness {
  const run = providerRun(data, provider)
  if (!run) return 'unverified'
  if (run.status === 'success') return 'current'
  if (run.status === 'needs_review') return 'review'
  return 'unverified'
}

/** One row per model across all providers, in API order. */
export function flattenRows(data: PricingResponse): PricingRow[] {
  return data.providers.flatMap((p) => {
    const freshness = rowFreshness(data, p.name)
    return p.models.map((m) => ({
      ...m,
      key: `${p.name}:${m.model_id}`,
      provider: p.name,
      providerDisplay: p.display_name,
      providerDescription: p.description,
      modelsUrl: p.models_url,
      aliases: (m.model_ids ?? []).filter((id) => id !== m.model_id),
      freshness,
    }))
  })
}

/** Sorted, de-duplicated capability names present in the data. */
export function capabilityOptions(rows: PricingRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) for (const c of r.capabilities ?? []) set.add(c)
  return [...set].sort((a, b) => a.localeCompare(b))
}

export interface CatalogFreshness {
  /** When the catalog was last refreshed (last run, else newest price change). */
  updatedAt: string | null
  /** Whether `updatedAt` comes from a logged scrape run. */
  fromRun: boolean
  /** Whole days since `updatedAt`; null if unknown. */
  ageDays: number | null
  /** The catalog missed at least one scheduled run (or has no date at all). */
  stale: boolean
  /** Providers whose latest run failed. */
  failed: LastRunProvider[]
  /** Providers whose latest run flagged rows for review. */
  review: LastRunProvider[]
  /** Catalog providers the latest run did not report on. */
  missing: string[]
}

export function assessFreshness(data: PricingResponse, now: Date = new Date()): CatalogFreshness {
  const updatedAt = data.last_run?.at ?? data.updated_at
  const t = updatedAt ? Date.parse(updatedAt) : Number.NaN
  const ageDays = Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / 86_400_000)) : null
  const runProviders = data.last_run?.providers ?? []
  const reported = new Set(runProviders.map((p) => p.provider))
  return {
    updatedAt: updatedAt ?? null,
    fromRun: data.last_run !== null,
    ageDays,
    stale: ageDays === null || ageDays > STALE_AFTER_DAYS,
    failed: runProviders.filter((p) => p.status !== 'success' && p.status !== 'needs_review'),
    review: runProviders.filter((p) => p.status === 'needs_review'),
    missing: data.last_run
      ? data.providers.map((p) => p.name).filter((n) => !reported.has(n))
      : [],
  }
}
