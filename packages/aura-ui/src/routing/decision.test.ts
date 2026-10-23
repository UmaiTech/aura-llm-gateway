// Routing decision adapter: the semantics the inspector must never blur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_BOUNDARIES,
  formatMicros,
  formatOffset,
  formatUsd,
  fromResponseDecision,
  fromStoredDecision,
  type ResponseRoutingDecision,
  type StoredRoutingDecision,
} from './decision.ts'

const applied: ResponseRoutingDecision = {
  requested_model: 'auto:cost',
  mode: 'cost',
  classifier: 'heuristic@v1',
  score: 0.27,
  raw_score: 0.37,
  classified_tier: 'medium',
  tier: 'medium',
  boundaries: { simple_medium: 0.2, medium_complex: 0.4, complex_reasoning: 0.7 },
  signals: { tools_present: 0.1, code_block: 0.12, question_short: -0.2 },
  hard_filters: ['tools present: floor medium', 'needs tools', 'max_tier complex', 'allow/deny lists', 'sticky tool loop'],
  candidates: [
    { model: 'gpt-5.4-mini', provider: 'openai', tier: 'medium', cost_per_million: 1.13, eligible: true },
    { model: 'claude-haiku-4-5', provider: 'anthropic', tier: 'medium', cost_per_million: null, eligible: true },
    { model: 'gemini-3.8-flash', tier: 'medium', eligible: false },
  ],
  selected: 'gpt-5.4-mini',
  selected_provider: 'openai',
  reason: 'cheapest eligible in medium ($1.13/1M blended)',
  shadow: false,
  latency_us: 412,
}

test('applied: the response model answers; the pick is not hypothetical', () => {
  const v = fromResponseDecision(applied, { model: 'gpt-5.4-mini', provider: 'openai' })
  assert.equal(v.kind, 'applied')
  assert.equal(v.answeredBy, 'gpt-5.4-mini')
  assert.equal(v.answeredByProvider, 'openai')
  assert.equal(v.hypotheticalModel, null)
  assert.equal(v.requestedModel, 'auto:cost')
  assert.equal(v.answerDiffersFromPick, false)
})

test('applied without a response model falls back to the pick', () => {
  const v = fromResponseDecision(applied)
  assert.equal(v.answeredBy, 'gpt-5.4-mini')
  assert.equal(v.answeredByProvider, 'openai')
})

test('applied: a response model that differs from the pick is flagged', () => {
  const v = fromResponseDecision(applied, { model: 'claude-haiku-4-5' })
  assert.equal(v.answeredBy, 'claude-haiku-4-5')
  assert.equal(v.answerDiffersFromPick, true)
})

test('shadow: the pinned model answers and the pick stays hypothetical', () => {
  const v = fromResponseDecision(
    { ...applied, requested_model: 'claude-sonnet-5', shadow: true, selected: 'gpt-5.4-nano', selected_provider: 'openai' },
    { model: 'claude-sonnet-5', provider: 'anthropic' },
  )
  assert.equal(v.kind, 'shadow')
  assert.equal(v.answeredBy, 'claude-sonnet-5')
  assert.equal(v.answeredByProvider, 'anthropic')
  assert.equal(v.hypotheticalModel, 'gpt-5.4-nano')
  assert.equal(v.hypotheticalProvider, 'openai')
  assert.equal(v.answerDiffersFromPick, false, 'never compare a shadow pick with what answered')
})

test('shadow without response context: answered by the requested (pinned) model, never the pick', () => {
  const v = fromResponseDecision({ ...applied, requested_model: 'claude-sonnet-5', shadow: true, selected: 'gpt-5.4-nano' })
  assert.equal(v.answeredBy, 'claude-sonnet-5')
  assert.equal(v.answeredByProvider, null, "the pick's provider is not the provider that answered")
})

test('score, raw score, classified and final tier stay distinct', () => {
  const v = fromResponseDecision({ ...applied, classified_tier: 'simple', tier: 'medium' })
  assert.equal(v.score, 0.27)
  assert.equal(v.rawScore, 0.37)
  assert.equal(v.scoreOffset, -0.1)
  assert.equal(v.classifiedTier, 'simple')
  assert.equal(v.finalTier, 'medium')
  assert.equal(v.tierMoved, true)
})

test('returned boundaries are used; older gateways fall back to defaults and say so', () => {
  const v = fromResponseDecision(applied)
  assert.deepEqual(v.boundaries, applied.boundaries)
  assert.equal(v.boundariesSource, 'decision')
  assert.deepEqual(v.bands[1], { tier: 'medium', from: 0.2, to: 0.4 })
  const old = fromResponseDecision({ ...applied, boundaries: undefined })
  assert.deepEqual(old.boundaries, DEFAULT_BOUNDARIES)
  assert.equal(old.boundariesSource, 'default')
})

test('hard filters split into options/policy and request shape', () => {
  const v = fromResponseDecision(applied)
  assert.deepEqual(v.optionFilters, ['max_tier complex', 'allow/deny lists', 'sticky tool loop'])
  assert.deepEqual(v.shapeFilters, ['tools present: floor medium', 'needs tools'])
})

test('candidates: nullable prices stay null, eligibility and pick are marked', () => {
  const v = fromResponseDecision(applied)
  assert.equal(v.candidates.length, 3)
  assert.equal(v.candidates[0].picked, true)
  assert.equal(v.candidates[1].costPerMillion, null)
  assert.equal(v.candidates[2].provider, null)
  assert.equal(v.candidates[2].eligible, false)
  assert.equal(v.hasPredictedCosts, false)
  assert.equal(v.predictedCostUsd, null)
})

test('predicted cost: shown when supplied, taken from the pick when the decision omits it', () => {
  const v = fromResponseDecision({
    ...applied,
    candidates: [
      { model: 'gpt-5.4-mini', tier: 'medium', eligible: true, predicted_cost_usd: 0.00042 },
      { model: 'claude-haiku-4-5', tier: 'medium', eligible: true, predicted_cost_usd: null },
    ],
  })
  assert.equal(v.hasPredictedCosts, true)
  assert.equal(v.predictedCostUsd, 0.00042)
  assert.equal(v.candidates[1].predictedCostUsd, null)
  assert.equal(fromResponseDecision({ ...applied, predicted_cost_usd: 0.001 }).predictedCostUsd, 0.001)
})

test('escalations keep order and expose the first model tried', () => {
  const v = fromResponseDecision({
    ...applied,
    selected: 'claude-haiku-4-5',
    escalations: [{ from_model: 'gpt-5.4-mini', from_tier: 'medium', to_model: 'claude-haiku-4-5', to_tier: 'medium', error_code: 'server_error' }],
  })
  assert.equal(v.firstTried, 'gpt-5.4-mini')
  assert.equal(v.escalations.length, 1)
})

test('signals sort by magnitude; malformed fields degrade to empty', () => {
  const v = fromResponseDecision(applied)
  assert.deepEqual(
    v.signals.map((s) => s.name),
    ['question_short', 'code_block', 'tools_present'],
  )
  const broken = fromResponseDecision({
    ...applied,
    signals: null,
    candidates: null,
    hard_filters: null,
    escalations: null,
    score: Number.NaN,
  } as unknown as ResponseRoutingDecision)
  assert.deepEqual(broken.signals, [])
  assert.deepEqual(broken.candidates, [])
  assert.deepEqual(broken.optionFilters, [])
  assert.equal(broken.score, 0)
})

const stored: StoredRoutingDecision = {
  response_id: 'resp_1',
  requested_model: 'auto',
  mode: 'balanced',
  classifier: 'learned@3',
  score: 0.5,
  raw_score: 0.5,
  classified_tier: 'complex',
  tier: 'complex',
  selected_model: 'claude-sonnet-5',
  selected_provider: 'anthropic',
  reason: 'first eligible candidate in complex',
  shadow: false,
  signals: { long_context: 0.3 },
  hard_filters: [],
  candidates: [{ model: 'claude-sonnet-5', provider: 'anthropic', tier: 'complex', eligible: true }],
  decision_latency_us: 1500,
  escalations: null,
  synthetic: false,
}

test('stored decision (current main): selected_model and decision_latency_us map across; defaults for boundaries', () => {
  const v = fromStoredDecision(stored)
  assert.equal(v.selected, 'claude-sonnet-5')
  assert.equal(v.answeredBy, 'claude-sonnet-5')
  assert.equal(v.latencyUs, 1500)
  assert.equal(v.boundariesSource, 'default')
  assert.deepEqual(v.escalations, [])
})

test('stored decision with outcome and boundaries in force (decisions explorer shape)', () => {
  const v = fromStoredDecision({
    ...stored,
    shadow: true,
    requested_model: 'gpt-5.6-sol',
    boundaries: null,
    boundaries_in_force: { simple_medium: 0.1, medium_complex: 0.3, complex_reasoning: 0.55 },
    boundaries_source: 'config',
    outcome: { actual_model: 'gpt-5.6-sol', actual_provider: 'openai' },
  })
  assert.equal(v.kind, 'shadow')
  assert.equal(v.answeredBy, 'gpt-5.6-sol')
  assert.equal(v.answeredByProvider, 'openai')
  assert.equal(v.hypotheticalModel, 'claude-sonnet-5')
  assert.equal(v.boundariesSource, 'config')
  assert.equal(v.boundaries.medium_complex, 0.3)
})

test('formatting keeps tiny costs readable and nulls as a dash', () => {
  assert.equal(formatUsd(null), '—')
  assert.equal(formatUsd(0), '$0')
  assert.equal(formatUsd(0.00004), '$4.0e-5')
  assert.equal(formatUsd(0.0042), '$0.0042')
  assert.equal(formatUsd(12.5), '$12.50')
  assert.equal(formatMicros(412), '412 µs')
  assert.equal(formatMicros(1500), '1.5 ms')
  assert.equal(formatMicros(null), '—')
  assert.equal(formatOffset(-0.1), '−0.10')
  assert.equal(formatOffset(0.15), '+0.15')
})
