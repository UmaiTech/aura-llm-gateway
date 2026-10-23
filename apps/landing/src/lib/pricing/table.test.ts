import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateCost, type Estimate, type Workload } from './estimator.ts'
import {
  EMPTY_FILTERS,
  MAX_COMPARE,
  filterRows,
  hasActiveFilters,
  resolveCompare,
  sortRows,
  toggleCompare,
} from './table.ts'
import type { PricingRow } from './types.ts'

function row(id: string, over: Partial<PricingRow> = {}): PricingRow {
  return {
    model_id: id,
    model_name: id.toUpperCase(),
    input_per_million: 1,
    output_per_million: 2,
    cached_input_per_million: null,
    batch_input_per_million: null,
    batch_output_per_million: null,
    context_window: 100_000,
    max_output_tokens: null,
    capabilities: ['tools'],
    good_at: null,
    effective_from: null,
    key: `p:${id}`,
    provider: 'p',
    providerDisplay: 'P',
    providerDescription: null,
    modelsUrl: null,
    aliases: [],
    freshness: 'current',
    ...over,
  }
}

const W: Workload = { requests: 100, inputTokens: 1000, outputTokens: 100, cachedShare: 0 }
const estimates = (rows: PricingRow[], w: Workload | null = W) =>
  new Map<string, Estimate>(rows.map((r) => [r.key, estimateCost(r, w)]))

test('default workload sort: cheapest first, unknown estimates last', () => {
  const rows = [
    row('unknown', { input_per_million: null }),
    row('pricey', { input_per_million: 10 }),
    row('cheap', { input_per_million: 0.1 }),
  ]
  const sorted = sortRows(rows, 'estimate', estimates(rows)).map((r) => r.model_id)
  assert.deepEqual(sorted, ['cheap', 'pricey', 'unknown'])
})

test('models the workload exceeds rank after the ones it fits', () => {
  const rows = [row('small', { input_per_million: 0.01, context_window: 500 }), row('big', { input_per_million: 5 })]
  const sorted = sortRows(rows, 'estimate', estimates(rows)).map((r) => r.model_id)
  assert.deepEqual(sorted, ['big', 'small'])
})

test('price sorts keep unknown values last, context sorts largest first', () => {
  const rows = [
    row('a', { cached_input_per_million: null, context_window: null }),
    row('b', { cached_input_per_million: 0.5, context_window: 1_000_000 }),
    row('c', { cached_input_per_million: 0.1, context_window: 8_000 }),
  ]
  const e = estimates(rows)
  assert.deepEqual(sortRows(rows, 'cached', e).map((r) => r.model_id), ['c', 'b', 'a'])
  assert.deepEqual(sortRows(rows, 'context', e).map((r) => r.model_id), ['b', 'c', 'a'])
  assert.deepEqual(sortRows(rows, 'name', e).map((r) => r.model_id), ['a', 'b', 'c'])
})

test('an invalid workload leaves every estimate unknown and order stable by name', () => {
  const rows = [row('b'), row('a')]
  assert.deepEqual(sortRows(rows, 'estimate', estimates(rows, null)).map((r) => r.model_id), ['a', 'b'])
})

test('search matches name, id, alias and provider', () => {
  const rows = [row('x-1', { aliases: ['x-legacy'] }), row('y-1', { providerDisplay: 'Yonder', provider: 'yonder' })]
  assert.equal(filterRows(rows, { ...EMPTY_FILTERS, query: 'legacy' }).rows.length, 1)
  assert.equal(filterRows(rows, { ...EMPTY_FILTERS, query: 'YONDER' }).rows[0].model_id, 'y-1')
  assert.equal(filterRows(rows, { ...EMPTY_FILTERS, query: 'nomatch' }).rows.length, 0)
})

test('provider filter', () => {
  const rows = [row('a'), row('b', { provider: 'q', key: 'q:b' })]
  assert.deepEqual(filterRows(rows, { ...EMPTY_FILTERS, providers: ['q'] }).rows.map((r) => r.model_id), ['b'])
})

test('capability filter treats missing data as unknown, not unsupported', () => {
  const rows = [
    row('both', { capabilities: ['tools', 'vision'] }),
    row('tools', { capabilities: ['tools'] }),
    row('unknown', { capabilities: null }),
    row('none', { capabilities: [] }),
  ]
  const f = { ...EMPTY_FILTERS, capabilities: ['vision'] }
  const hidden = filterRows(rows, f)
  assert.deepEqual(hidden.rows.map((r) => r.model_id), ['both'])
  assert.equal(hidden.hiddenUnknownCapabilities, 1, 'unknown rows are counted, not silently dropped')

  const shown = filterRows(rows, { ...f, includeUnknownCapabilities: true })
  assert.deepEqual(shown.rows.map((r) => r.model_id), ['both', 'unknown'])

  // Without a capability filter nothing is hidden.
  assert.equal(filterRows(rows, EMPTY_FILTERS).rows.length, 4)
})

test('clear/reset: empty filters are inactive', () => {
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false)
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, query: '  ' }), false)
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, capabilities: ['tools'] }), true)
})

test('compare is capped at three', () => {
  assert.equal(MAX_COMPARE, 3)
  let s: string[] = []
  for (const k of ['a', 'b', 'c']) s = toggleCompare(s, k).selected
  assert.deepEqual(s, ['a', 'b', 'c'])
  const full = toggleCompare(s, 'd')
  assert.equal(full.result, 'full')
  assert.deepEqual(full.selected, ['a', 'b', 'c'])
  const removed = toggleCompare(s, 'b')
  assert.equal(removed.result, 'removed')
  assert.deepEqual(removed.selected, ['a', 'c'])
  assert.equal(toggleCompare(removed.selected, 'd').result, 'added')
})

test('comparison selection survives filtering', () => {
  const rows = [row('a'), row('b'), row('c')]
  const visible = filterRows(rows, { ...EMPTY_FILTERS, query: 'a' }).rows
  assert.equal(visible.length, 1)
  const picked = resolveCompare(['p:b', 'p:c', 'p:gone'], rows)
  assert.deepEqual(picked.map((r) => r.model_id), ['b', 'c'], 'resolved from all rows; stale keys dropped')
})
