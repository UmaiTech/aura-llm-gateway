/**
 * Pricing page state <-> URL query, so a filtered view, workload and
 * comparison can be shared. Only non-default values are written.
 */
import { isCurrency, type Currency } from './currency.ts'
import { DEFAULT_WORKLOAD_FORM, type WorkloadForm } from './estimator.ts'
import { EMPTY_FILTERS, MAX_COMPARE, isSortKey, type RowFilters, type SortKey } from './table.ts'

export interface PricingViewState {
  filters: RowFilters
  sort: SortKey
  currency: Currency
  workload: WorkloadForm
  compare: string[]
}

export const DEFAULT_VIEW: PricingViewState = {
  filters: EMPTY_FILTERS,
  sort: 'estimate',
  currency: 'USD',
  workload: DEFAULT_WORKLOAD_FORM,
  compare: [],
}

const WORKLOAD_PARAMS: Record<keyof WorkloadForm, string> = {
  requests: 'n',
  inputTokens: 'in',
  outputTokens: 'out',
  cachedPercent: 'cache',
}

const list = (v: string | null) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])
const unique = (xs: string[]) => [...new Set(xs)]

export function readViewState(params: URLSearchParams): PricingViewState {
  const sort = params.get('sort') ?? ''
  const cur = (params.get('currency') ?? '').toUpperCase()
  const workload = { ...DEFAULT_WORKLOAD_FORM }
  for (const [field, name] of Object.entries(WORKLOAD_PARAMS) as [keyof WorkloadForm, string][]) {
    const v = params.get(name)
    // Kept verbatim: invalid values surface as inline validation errors.
    if (v !== null) workload[field] = v.slice(0, 32)
  }
  return {
    filters: {
      query: (params.get('q') ?? '').slice(0, 100),
      providers: unique(list(params.get('provider'))),
      capabilities: unique(list(params.get('capability'))),
      includeUnknownCapabilities: params.get('unknown') === '1',
    },
    sort: isSortKey(sort) ? sort : DEFAULT_VIEW.sort,
    currency: isCurrency(cur) ? cur : DEFAULT_VIEW.currency,
    workload,
    compare: unique(list(params.get('compare'))).slice(0, MAX_COMPARE),
  }
}

export function writeViewState(s: PricingViewState): URLSearchParams {
  const p = new URLSearchParams()
  if (s.filters.query.trim()) p.set('q', s.filters.query)
  if (s.filters.providers.length) p.set('provider', s.filters.providers.join(','))
  if (s.filters.capabilities.length) p.set('capability', s.filters.capabilities.join(','))
  if (s.filters.includeUnknownCapabilities) p.set('unknown', '1')
  if (s.sort !== DEFAULT_VIEW.sort) p.set('sort', s.sort)
  if (s.currency !== DEFAULT_VIEW.currency) p.set('currency', s.currency)
  for (const [field, name] of Object.entries(WORKLOAD_PARAMS) as [keyof WorkloadForm, string][]) {
    if (s.workload[field] !== DEFAULT_WORKLOAD_FORM[field]) p.set(name, s.workload[field])
  }
  if (s.compare.length) p.set('compare', s.compare.join(','))
  return p
}
