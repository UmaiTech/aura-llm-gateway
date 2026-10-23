import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCompletedResponse } from './responseMetadata.ts'

const routing = {
  requested_model: 'auto:cost',
  mode: 'cost',
  classifier: 'heuristic@v1',
  score: 0.27,
  raw_score: 0.37,
  classified_tier: 'medium',
  tier: 'medium',
  selected: 'gpt-5.4-mini',
  reason: 'cheapest eligible in medium',
  shadow: false,
}

const completed = {
  id: 'resp_1',
  object: 'response',
  status: 'completed',
  model: 'gpt-5.4-mini',
  usage: { input_tokens: 812, output_tokens: 96, cached_tokens: 512, cost_usd: 0.000338 },
  metadata: {
    aura: { provider: 'openai', gateway_version: '0.20.0', latency_ms: 1840, routing_strategy: 'auto:medium', routing },
  },
}

const noFallback = () => undefined

test('reads id, the answering model, usage and aura metadata', () => {
  const r = parseCompletedResponse(completed, noFallback)
  assert.equal(r.responseId, 'resp_1')
  assert.equal(r.model, 'gpt-5.4-mini')
  assert.deepEqual(r.usage, { inputTokens: 812, outputTokens: 96, totalTokens: 908, cachedTokens: 512, cost: 0.000338 })
  assert.equal(r.aura?.provider, 'openai')
  assert.equal(r.aura?.latencyMs, 1840)
  assert.equal(r.aura?.routingStrategy, 'auto:medium')
  assert.equal(r.aura?.routing?.selected, 'gpt-5.4-mini')
})

test('gateway cost wins; the list-price fallback is only used when cost_usd is missing', () => {
  const calls: number[][] = []
  const fallback = (i: number, o: number) => {
    calls.push([i, o])
    return 0.5
  }
  assert.equal(parseCompletedResponse(completed, fallback).usage?.cost, 0.000338)
  assert.equal(calls.length, 0)
  const noCost = { ...completed, usage: { input_tokens: 10, output_tokens: 5 } }
  assert.equal(parseCompletedResponse(noCost, fallback).usage?.cost, 0.5)
  assert.deepEqual(calls, [[10, 5]])
})

test('incomplete usage is dropped rather than reported as zero', () => {
  const r = parseCompletedResponse({ ...completed, usage: { input_tokens: 10 } }, noFallback)
  assert.equal(r.usage, undefined)
})

test('a malformed routing object is ignored, the rest of the metadata kept', () => {
  const r = parseCompletedResponse(
    { ...completed, metadata: { aura: { provider: 'openai', routing: { tier: 'medium' } } } },
    noFallback,
  )
  assert.equal(r.aura?.provider, 'openai')
  assert.equal(r.aura?.routing, undefined)
})

test('shadow decisions come through unchanged (the answering model is the response model)', () => {
  const shadow = { ...routing, requested_model: 'claude-sonnet-5', shadow: true, selected: 'gpt-5.4-nano' }
  const r = parseCompletedResponse(
    { ...completed, model: 'claude-sonnet-5', metadata: { aura: { provider: 'anthropic', routing: shadow } } },
    noFallback,
  )
  assert.equal(r.model, 'claude-sonnet-5')
  assert.equal(r.aura?.routing?.shadow, true)
  assert.equal(r.aura?.routing?.selected, 'gpt-5.4-nano')
})

test('missing metadata and non-objects are handled', () => {
  assert.deepEqual(parseCompletedResponse({ id: 'x' }, noFallback), { responseId: 'x' })
  assert.deepEqual(parseCompletedResponse(undefined, noFallback), {})
  assert.equal(parseCompletedResponse({ ...completed, metadata: null }, noFallback).aura, undefined)
})
