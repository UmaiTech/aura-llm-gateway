/**
 * Workload estimator for the public pricing page.
 *
 *   estimate = N * (I*(1-H)*Pi + I*H*Pc + O*Po) / 1_000_000
 *
 * N requests, I input and O output tokens per request, H the cached share
 * of input in [0, 1], Pi/Pc/Po list prices in USD per 1M tokens. A missing
 * required price makes the estimate unavailable (never $0); Pc is only
 * required when H > 0. Rates are used at full precision and only the final
 * amount is formatted.
 *
 * Deliberately excluded (the page lists these next to the result): cache
 * write charges, reasoning/tool fees, batch pricing, regional or
 * long-context price tiers, negotiated rates and taxes.
 */

export interface Workload {
  /** Requests (N). */
  requests: number
  /** Input tokens per request (I). */
  inputTokens: number
  /** Output tokens per request (O). */
  outputTokens: number
  /** Cached share of input tokens, 0..1 (H). */
  cachedShare: number
}

/** Raw form values; the cached share is entered as a percentage (0–100). */
export interface WorkloadForm {
  requests: string
  inputTokens: string
  outputTokens: string
  cachedPercent: string
}

export type WorkloadField = keyof WorkloadForm

export const DEFAULT_WORKLOAD_FORM: WorkloadForm = {
  requests: '10000',
  inputTokens: '1000',
  outputTokens: '300',
  cachedPercent: '0',
}

export type ParsedWorkload =
  | { ok: true; workload: Workload; errors: Partial<Record<WorkloadField, string>> }
  | { ok: false; workload: null; errors: Partial<Record<WorkloadField, string>> }

/**
 * Parse one field. Empty input is an error rather than an implicit zero:
 * a blank field is an unanswered assumption, and a silent 0 would turn into
 * a $0.00 estimate. Thousands separators (",", "_", spaces) are accepted.
 */
export function parseNumber(raw: string): { value: number } | { error: string } {
  const s = raw.trim().replace(/[,_\s]/g, '')
  if (s === '') return { error: 'Enter a number.' }
  // Number('') and Number('0x10') are too lenient; require a plain decimal.
  if (!/^[+]?(\d+\.?\d*|\.\d+)(e[+]?\d+)?$/i.test(s)) {
    return { error: s.startsWith('-') ? 'Must be zero or more.' : 'Enter a plain number, like 1000.' }
  }
  const value = Number(s)
  if (!Number.isFinite(value)) return { error: 'Number is too large.' }
  return { value }
}

export function parseWorkload(form: WorkloadForm): ParsedWorkload {
  const errors: Partial<Record<WorkloadField, string>> = {}
  const values: Partial<Record<WorkloadField, number>> = {}
  for (const field of ['requests', 'inputTokens', 'outputTokens', 'cachedPercent'] as const) {
    const r = parseNumber(form[field])
    if ('error' in r) errors[field] = r.error
    else values[field] = r.value
  }
  if (values.cachedPercent !== undefined && values.cachedPercent > 100) {
    errors.cachedPercent = 'Enter a percentage from 0 to 100.'
  }
  if (Object.keys(errors).length > 0) return { ok: false, workload: null, errors }
  return {
    ok: true,
    errors,
    workload: {
      requests: values.requests as number,
      inputTokens: values.inputTokens as number,
      outputTokens: values.outputTokens as number,
      cachedShare: (values.cachedPercent as number) / 100,
    },
  }
}

/** Is this a usable workload (non-negative finite numbers, H in [0, 1])? */
export function isValidWorkload(w: Workload): boolean {
  const ok = (n: number) => Number.isFinite(n) && n >= 0
  return ok(w.requests) && ok(w.inputTokens) && ok(w.outputTokens) && ok(w.cachedShare) && w.cachedShare <= 1
}

export interface PricedModel {
  input_per_million: number | null
  output_per_million: number | null
  cached_input_per_million: number | null
  context_window: number | null
  max_output_tokens: number | null
}

export type MissingPrice = 'input' | 'output' | 'cached input'

export interface Limits {
  /** I + O exceeds the known context window; null when the window is unknown. */
  exceedsContext: boolean | null
  /** O exceeds the known max output; null when the max output is unknown. */
  exceedsMaxOutput: boolean | null
}

export type Estimate =
  | { status: 'ok'; usd: number; limits: Limits }
  | { status: 'unavailable'; missing: MissingPrice[]; limits: Limits }
  | { status: 'invalid'; limits: Limits }

export function checkLimits(m: PricedModel, w: Workload): Limits {
  return {
    exceedsContext: m.context_window === null ? null : w.inputTokens + w.outputTokens > m.context_window,
    exceedsMaxOutput: m.max_output_tokens === null ? null : w.outputTokens > m.max_output_tokens,
  }
}

export function exceedsLimits(l: Limits): boolean {
  return l.exceedsContext === true || l.exceedsMaxOutput === true
}

export function estimateCost(m: PricedModel, w: Workload | null): Estimate {
  if (!w || !isValidWorkload(w)) {
    return { status: 'invalid', limits: { exceedsContext: null, exceedsMaxOutput: null } }
  }
  const limits = checkLimits(m, w)
  const missing: MissingPrice[] = []
  // Standard input and output prices are always required (even at zero
  // volume, an unknown rate is not a known zero); the cached-input price
  // only when part of the input is cached.
  if (m.input_per_million === null) missing.push('input')
  if (m.output_per_million === null) missing.push('output')
  if (m.cached_input_per_million === null && w.cachedShare > 0) missing.push('cached input')
  if (missing.length > 0) return { status: 'unavailable', missing, limits }

  const pi = m.input_per_million as number
  const po = m.output_per_million as number
  const H = w.cachedShare
  // H = 0 here when the cached price is null, so that term is dropped
  // rather than priced at an assumed zero.
  const cachedTerm = H > 0 ? w.inputTokens * H * (m.cached_input_per_million as number) : 0
  const perRequest = w.inputTokens * (1 - H) * pi + cachedTerm + w.outputTokens * po
  return { status: 'ok', usd: (w.requests * perRequest) / 1_000_000, limits }
}
