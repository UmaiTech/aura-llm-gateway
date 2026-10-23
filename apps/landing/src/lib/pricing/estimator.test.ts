import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_WORKLOAD_FORM,
  estimateCost,
  exceedsLimits,
  parseNumber,
  parseWorkload,
  type PricedModel,
  type Workload,
} from './estimator.ts'

const model = (over: Partial<PricedModel> = {}): PricedModel => ({
  input_per_million: 3,
  output_per_million: 15,
  cached_input_per_million: 0.3,
  context_window: 200_000,
  max_output_tokens: 8_000,
  ...over,
})

const W = (over: Partial<Workload> = {}): Workload => ({
  requests: 10_000,
  inputTokens: 1_000,
  outputTokens: 300,
  cachedShare: 0,
  ...over,
})

test('estimate follows N * (I*(1-H)*Pi + I*H*Pc + O*Po) / 1M', () => {
  const e = estimateCost(model(), W({ cachedShare: 0.5 }))
  assert.equal(e.status, 'ok')
  // 10k * (500*3 + 500*0.3 + 300*15) / 1M = 10k * 6150 / 1M
  assert.equal(e.status === 'ok' && e.usd, 61.5)
})

test('rates are not rounded before multiplying', () => {
  // A sub-cent rate that 2-decimal rounding would turn into 0.01.
  const e = estimateCost(
    model({ input_per_million: 0.0075, output_per_million: 0.0375, cached_input_per_million: null }),
    W({ requests: 1_000_000, inputTokens: 1_000, outputTokens: 1_000 }),
  )
  assert.equal(e.status, 'ok')
  if (e.status === 'ok') assert.ok(Math.abs(e.usd - 45) < 1e-9, `got ${e.usd}`)
})

test('tiny workloads keep full precision', () => {
  const e = estimateCost(model({ input_per_million: 0.05, output_per_million: 0.4 }), W({ requests: 1, inputTokens: 10, outputTokens: 1 }))
  assert.equal(e.status === 'ok' && e.usd, (10 * 0.05 + 1 * 0.4) / 1_000_000)
})

test('H = 0 does not need a cached price', () => {
  const e = estimateCost(model({ cached_input_per_million: null }), W({ cachedShare: 0 }))
  assert.equal(e.status, 'ok')
  assert.equal(e.status === 'ok' && e.usd, (10_000 * (1_000 * 3 + 300 * 15)) / 1_000_000)
})

test('H > 0 with a null cached price is unavailable, not a discount', () => {
  const e = estimateCost(model({ cached_input_per_million: null }), W({ cachedShare: 0.25 }))
  assert.equal(e.status, 'unavailable')
  assert.deepEqual(e.status === 'unavailable' && e.missing, ['cached input'])
})

test('a null standard price is never treated as $0', () => {
  for (const over of [{ input_per_million: null }, { output_per_million: null }]) {
    const e = estimateCost(model(over), W())
    assert.equal(e.status, 'unavailable')
  }
  // Even at full caching or zero volume the input/output rates stay required.
  assert.equal(estimateCost(model({ input_per_million: null }), W({ cachedShare: 1 })).status, 'unavailable')
  assert.equal(estimateCost(model({ output_per_million: null }), W({ requests: 0 })).status, 'unavailable')
  const both = estimateCost(model({ input_per_million: null, output_per_million: null }), W())
  assert.deepEqual(both.status === 'unavailable' && both.missing, ['input', 'output'])
})

test('a genuine $0 list price (local models) estimates to zero', () => {
  const e = estimateCost(model({ input_per_million: 0, output_per_million: 0 }), W())
  assert.equal(e.status === 'ok' && e.usd, 0)
})

test('zero volume is a known zero when prices are known', () => {
  assert.equal(estimateCost(model(), W({ requests: 0 })).status, 'ok')
  const e = estimateCost(model(), W({ inputTokens: 0, outputTokens: 0 }))
  assert.equal(e.status === 'ok' && e.usd, 0)
})

test('invalid workloads produce no estimate', () => {
  assert.equal(estimateCost(model(), null).status, 'invalid')
  assert.equal(estimateCost(model(), W({ requests: -1 })).status, 'invalid')
  assert.equal(estimateCost(model(), W({ cachedShare: 1.2 })).status, 'invalid')
  assert.equal(estimateCost(model(), W({ inputTokens: Number.NaN })).status, 'invalid')
  assert.equal(estimateCost(model(), W({ outputTokens: Number.POSITIVE_INFINITY })).status, 'invalid')
})

test('context and max-output limits are flagged when known', () => {
  const fits = estimateCost(model(), W())
  assert.deepEqual(fits.limits, { exceedsContext: false, exceedsMaxOutput: false })
  assert.equal(exceedsLimits(fits.limits), false)

  const tooLong = estimateCost(model(), W({ inputTokens: 199_000, outputTokens: 2_000 }))
  assert.equal(tooLong.limits.exceedsContext, true)
  assert.equal(tooLong.status, 'ok', 'the price is still shown, flagged')
  assert.equal(exceedsLimits(tooLong.limits), true)

  const tooMuchOut = estimateCost(model(), W({ outputTokens: 9_000 }))
  assert.equal(tooMuchOut.limits.exceedsMaxOutput, true)

  // Exactly at the window is allowed.
  assert.equal(estimateCost(model(), W({ inputTokens: 192_000, outputTokens: 8_000 })).limits.exceedsContext, false)
})

test('unknown limits are reported as unknown, not as fitting', () => {
  const e = estimateCost(model({ context_window: null, max_output_tokens: null }), W())
  assert.deepEqual(e.limits, { exceedsContext: null, exceedsMaxOutput: null })
  assert.equal(exceedsLimits(e.limits), false)
})

test('parseNumber accepts plain and grouped numbers', () => {
  assert.deepEqual(parseNumber('1000'), { value: 1000 })
  assert.deepEqual(parseNumber(' 1,000,000 '), { value: 1_000_000 })
  assert.deepEqual(parseNumber('1_000'), { value: 1000 })
  assert.deepEqual(parseNumber('2.5'), { value: 2.5 })
  assert.deepEqual(parseNumber('1e3'), { value: 1000 })
  assert.deepEqual(parseNumber('0'), { value: 0 })
})

test('parseNumber rejects empty, negative and non-numeric input with a message', () => {
  for (const bad of ['', '   ', '-5', 'abc', '0x10', '1..2', 'Infinity', 'NaN']) {
    const r = parseNumber(bad)
    assert.ok('error' in r, `expected an error for ${JSON.stringify(bad)}`)
  }
  assert.ok('error' in parseNumber('9e999'))
})

test('parseWorkload converts the cached percentage into H and validates its range', () => {
  const ok = parseWorkload({ ...DEFAULT_WORKLOAD_FORM, cachedPercent: '40' })
  assert.equal(ok.ok, true)
  assert.equal(ok.workload?.cachedShare, 0.4)

  const over = parseWorkload({ ...DEFAULT_WORKLOAD_FORM, cachedPercent: '120' })
  assert.equal(over.ok, false)
  assert.match(over.errors.cachedPercent ?? '', /0 to 100/)
})

test('an empty field is a validation error, not an implicit zero', () => {
  const r = parseWorkload({ ...DEFAULT_WORKLOAD_FORM, requests: '' })
  assert.equal(r.ok, false)
  assert.ok(r.errors.requests)
  assert.equal(r.errors.inputTokens, undefined, 'other fields are not blamed')
})
