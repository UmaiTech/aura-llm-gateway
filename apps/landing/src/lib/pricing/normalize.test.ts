import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessFreshness, capabilityOptions, flattenRows, normalizePricing } from './normalize.ts'

const model = (over: Record<string, unknown> = {}) => ({
  model_id: 'm-1',
  model_name: 'Model One',
  input_per_million: 1,
  output_per_million: 2,
  cached_input_per_million: null,
  batch_input_per_million: null,
  batch_output_per_million: null,
  context_window: 128000,
  max_output_tokens: null,
  capabilities: null,
  good_at: null,
  effective_from: '2026-09-01T00:00:00Z',
  model_ids: ['m-1', 'm-1-2026'],
  price_samples: 2,
  ...over,
})

const payload = (over: Record<string, unknown> = {}) => ({
  updated_at: '2026-10-20T06:00:00Z',
  providers: [
    { name: 'alpha', display_name: 'Alpha', description: null, models_url: 'https://example.test/models', models: [model()] },
    { name: 'beta', display_name: 'Beta', description: 'B', models_url: null, models: [model({ model_id: 'b-1', capabilities: ['tools', 'vision'] })] },
  ],
  last_run: {
    run_id: 'r1',
    at: '2026-10-20T06:00:00Z',
    providers: [
      { provider: 'alpha', status: 'success', models_upserted: 1, models_unchanged: 0, models_flagged: 0, error: null },
      { provider: 'beta', status: 'failed', models_upserted: 0, models_unchanged: 0, models_flagged: 0, error: 'timeout' },
    ],
  },
  exchange_rates: [{ currency: 'USD', sek_per_unit: 10, rate_date: '2026-10-21' }],
  ...over,
})

test('keeps nulls as unknown: capabilities, context, cached price', () => {
  const rows = flattenRows(normalizePricing(payload()))
  assert.equal(rows.length, 2)
  const a = rows[0]
  assert.equal(a.capabilities, null)
  assert.equal(a.cached_input_per_million, null)
  assert.equal(a.max_output_tokens, null)
  assert.equal(a.key, 'alpha:m-1')
  assert.deepEqual(a.aliases, ['m-1-2026'])
  assert.equal(a.modelsUrl, 'https://example.test/models')
  assert.equal(a.price_samples, 2)
})

test('missing exchange_rates and last_run are tolerated', () => {
  const p = payload()
  delete (p as Record<string, unknown>).exchange_rates
  const data = normalizePricing({ ...p, last_run: null })
  assert.deepEqual(data.exchange_rates, [])
  assert.equal(data.last_run, null)
  const rows = flattenRows(data)
  assert.ok(rows.every((r) => r.freshness === 'unverified'), 'no run log: nothing is verified')
})

test('garbage values become null instead of numbers', () => {
  const data = normalizePricing(
    payload({
      providers: [
        {
          name: 'x',
          display_name: 'X',
          models: [
            model({ input_per_million: '1.5', output_per_million: -2, context_window: 0, capabilities: 'tools' }),
            { model_name: 'no id' },
          ],
        },
      ],
    }),
  )
  const [r] = flattenRows(data)
  assert.equal(data.providers[0].models.length, 1, 'rows without an id are dropped')
  assert.equal(r.input_per_million, null)
  assert.equal(r.output_per_million, null)
  assert.equal(r.context_window, null)
  assert.equal(r.capabilities, null)
  assert.equal(data.providers[0].models_url, null)
})

test('rejects a body that is not a pricing payload', () => {
  assert.throws(() => normalizePricing({ error: 'pricing_error' }))
  assert.throws(() => normalizePricing(null))
})

test('row freshness follows the provider status in the latest run', () => {
  const rows = flattenRows(normalizePricing(payload()))
  assert.equal(rows.find((r) => r.provider === 'alpha')?.freshness, 'current')
  assert.equal(rows.find((r) => r.provider === 'beta')?.freshness, 'unverified')

  const review = payload()
  review.last_run.providers[1].status = 'needs_review'
  assert.equal(flattenRows(normalizePricing(review))[1].freshness, 'review')
})

test('catalog freshness: age, staleness, failed and missing providers', () => {
  const now = new Date('2026-10-22T12:00:00Z')
  const f = assessFreshness(normalizePricing(payload()), now)
  assert.equal(f.ageDays, 2)
  assert.equal(f.stale, false)
  assert.deepEqual(f.failed.map((p) => p.provider), ['beta'])
  assert.deepEqual(f.missing, [])

  const old = assessFreshness(normalizePricing(payload()), new Date('2026-11-05T00:00:00Z'))
  assert.equal(old.stale, true)

  const partial = payload()
  partial.last_run.providers = partial.last_run.providers.slice(0, 1)
  assert.deepEqual(assessFreshness(normalizePricing(partial), now).missing, ['beta'])

  const noRun = assessFreshness(normalizePricing(payload({ last_run: null })), now)
  assert.equal(noRun.fromRun, false)
  assert.equal(noRun.updatedAt, '2026-10-20T06:00:00Z')

  const nothing = assessFreshness(normalizePricing(payload({ last_run: null, updated_at: null })), now)
  assert.equal(nothing.ageDays, null)
  assert.equal(nothing.stale, true)
})

test('capability options come from the data', () => {
  assert.deepEqual(capabilityOptions(flattenRows(normalizePricing(payload()))), ['tools', 'vision'])
})
