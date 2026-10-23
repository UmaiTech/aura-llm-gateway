import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_VIEW, readViewState, writeViewState } from './urlState.ts'

test('defaults write an empty query', () => {
  assert.equal(writeViewState(DEFAULT_VIEW).toString(), '')
  assert.deepEqual(readViewState(new URLSearchParams()), DEFAULT_VIEW)
})

test('round-trips filters, workload, currency, sort and comparison', () => {
  const state = {
    ...DEFAULT_VIEW,
    filters: { query: 'mini', providers: ['openai', 'google'], capabilities: ['tools'], includeUnknownCapabilities: true },
    sort: 'context' as const,
    currency: 'SEK' as const,
    workload: { requests: '500', inputTokens: '2000', outputTokens: '100', cachedPercent: '50' },
    compare: ['openai:a', 'google:b'],
  }
  assert.deepEqual(readViewState(writeViewState(state)), state)
})

test('unknown values fall back to defaults; comparison is capped', () => {
  const s = readViewState(new URLSearchParams('sort=best&currency=xyz&compare=a,b,c,d,a'))
  assert.equal(s.sort, 'estimate')
  assert.equal(s.currency, 'USD')
  assert.deepEqual(s.compare, ['a', 'b', 'c'])
  assert.equal(readViewState(new URLSearchParams('currency=nok')).currency, 'NOK')
})

test('invalid workload values are kept so the form can explain them', () => {
  assert.equal(readViewState(new URLSearchParams('n=-3')).workload.requests, '-3')
})
