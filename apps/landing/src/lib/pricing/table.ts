/**
 * Filtering, sorting and comparison selection for the cross-provider
 * pricing table. Pure functions so the rules are testable.
 */
import { exceedsLimits, type Estimate } from './estimator.ts'
import type { PricingRow } from './types.ts'

export interface RowFilters {
  query: string
  /** Provider names; empty = all. */
  providers: string[]
  /** Required capabilities (all must be present); empty = no capability filter. */
  capabilities: string[]
  /**
   * Keep rows whose capability data is missing while a capability filter
   * is active. Missing data is unknown, not unsupported, so these rows are
   * reported separately instead of silently treated as non-matching.
   */
  includeUnknownCapabilities: boolean
}

export const EMPTY_FILTERS: RowFilters = {
  query: '',
  providers: [],
  capabilities: [],
  includeUnknownCapabilities: false,
}

export function hasActiveFilters(f: RowFilters): boolean {
  return f.query.trim() !== '' || f.providers.length > 0 || f.capabilities.length > 0
}

function matchesQuery(r: PricingRow, q: string): boolean {
  if (!q) return true
  const hay = [r.model_name, r.model_id, r.providerDisplay, r.provider, ...r.aliases]
  return hay.some((s) => s.toLowerCase().includes(q))
}

export interface FilterResult {
  rows: PricingRow[]
  /** Rows hidden only because their capability data is unknown. */
  hiddenUnknownCapabilities: number
}

export function filterRows(rows: PricingRow[], f: RowFilters): FilterResult {
  const q = f.query.trim().toLowerCase()
  const providers = new Set(f.providers)
  let hiddenUnknownCapabilities = 0
  const out = rows.filter((r) => {
    if (providers.size > 0 && !providers.has(r.provider)) return false
    if (!matchesQuery(r, q)) return false
    if (f.capabilities.length === 0) return true
    if (r.capabilities === null) {
      if (f.includeUnknownCapabilities) return true
      hiddenUnknownCapabilities += 1
      return false
    }
    const caps = new Set(r.capabilities)
    return f.capabilities.every((c) => caps.has(c))
  })
  return { rows: out, hiddenUnknownCapabilities }
}

export const SORT_KEYS = ['estimate', 'input', 'output', 'cached', 'context', 'name'] as const
export type SortKey = (typeof SORT_KEYS)[number]

export const SORT_LABELS: Record<SortKey, string> = {
  estimate: 'Workload estimate',
  input: 'Input price',
  output: 'Output price',
  cached: 'Cached input price',
  context: 'Context window',
  name: 'Model name',
}

export function isSortKey(v: string): v is SortKey {
  return (SORT_KEYS as readonly string[]).includes(v)
}

/**
 * Sort rank groups for the workload sort: models the workload fits come
 * first, then models whose known limits it exceeds, then models with no
 * estimate at all. Within a group, ascending by the sort value.
 */
function estimateGroup(e: Estimate | undefined): number {
  if (!e || e.status !== 'ok') return 2
  return exceedsLimits(e.limits) ? 1 : 0
}

function sortValue(r: PricingRow, key: SortKey, e: Estimate | undefined): number | null {
  switch (key) {
    case 'estimate':
      return e && e.status === 'ok' ? e.usd : null
    case 'input':
      return r.input_per_million
    case 'output':
      return r.output_per_million
    case 'cached':
      return r.cached_input_per_million
    case 'context':
      return r.context_window
    case 'name':
      return null
  }
}

/**
 * Sort rows by `key`. Prices sort cheapest first, context largest first.
 * Unknown values always sort last whatever the key, so a missing price is
 * never ranked as the cheapest. Ties fall back to model name.
 */
export function sortRows(
  rows: PricingRow[],
  key: SortKey,
  estimates: Map<string, Estimate>,
): PricingRow[] {
  const byName = (a: PricingRow, b: PricingRow) =>
    a.model_name.localeCompare(b.model_name) || a.provider.localeCompare(b.provider)
  return [...rows].sort((a, b) => {
    if (key === 'name') return byName(a, b)
    const ea = estimates.get(a.key)
    const eb = estimates.get(b.key)
    if (key === 'estimate') {
      const g = estimateGroup(ea) - estimateGroup(eb)
      if (g !== 0) return g
    }
    const va = sortValue(a, key, ea)
    const vb = sortValue(b, key, eb)
    if (va === null && vb === null) return byName(a, b)
    if (va === null) return 1
    if (vb === null) return -1
    const diff = key === 'context' ? vb - va : va - vb
    return diff !== 0 ? diff : byName(a, b)
  })
}

export const MAX_COMPARE = 3

export interface CompareToggle {
  selected: string[]
  /** 'added' | 'removed', or 'full' when the cap blocked an add. */
  result: 'added' | 'removed' | 'full'
}

/** Add or remove a row key from the comparison, capped at MAX_COMPARE. */
export function toggleCompare(selected: string[], key: string, max: number = MAX_COMPARE): CompareToggle {
  if (selected.includes(key)) {
    return { selected: selected.filter((k) => k !== key), result: 'removed' }
  }
  if (selected.length >= max) return { selected, result: 'full' }
  return { selected: [...selected, key], result: 'added' }
}

/**
 * Resolve selected keys against all rows (not the filtered ones) so a
 * selection survives search and filter changes; unknown keys are dropped.
 */
export function resolveCompare(selected: string[], rows: PricingRow[]): PricingRow[] {
  const byKey = new Map(rows.map((r) => [r.key, r]))
  return selected.flatMap((k) => {
    const r = byKey.get(k)
    return r ? [r] : []
  })
}
