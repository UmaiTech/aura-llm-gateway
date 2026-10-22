// Landing auto-router demo: rule checks (ported from the design pack's
// prototype tests, adjusted to the gateway's real semantics) and drift
// checks against the Rust defaults the demo mirrors.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_BOUNDARIES,
  DEFAULT_MODE_OFFSETS,
  DEFAULT_TIER_MODELS,
  TOOLS_FLOOR,
  simulateAuto,
} from './autoRouterDemo.ts'

test('defaults: rewrite in balanced lands in simple', () => {
  const d = simulateAuto()
  assert.equal(d.tier, 'simple')
  assert.equal(d.selected, 'gemini-3.1-flash-lite')
  assert.equal(d.requested_model, 'auto')
  assert.equal(d.reason, 'first eligible candidate in simple')
})

test('quality mode adds its offset and moves a borderline request up', () => {
  const d = simulateAuto({ mode: 'quality' })
  assert.equal(d.score, 0.23)
  assert.equal(d.classified_tier, 'medium')
  assert.equal(d.requested_model, 'auto:quality')
})

test('cost mode cannot push a tool request below the tools floor', () => {
  const d = simulateAuto({ scenario: 'tools', mode: 'cost' })
  assert.equal(d.classified_tier, 'simple')
  assert.equal(d.tier, 'medium')
  assert.ok(d.hard_filters.includes('tools present: floor medium'))
  assert.ok(d.hard_filters.includes('needs tools'))
})

test('the tools floor overrides max_tier, as in the gateway', () => {
  const d = simulateAuto({ scenario: 'tools', maxTier: 'simple' })
  assert.equal(d.tier, 'medium')
  assert.equal(d.error, null)
  assert.ok(d.hard_filters.includes('tools present: floor medium overrides max_tier simple'))
})

test('reasoning shapes reach reasoning; quality pushes code there too', () => {
  assert.equal(simulateAuto({ scenario: 'proof' }).tier, 'reasoning')
  assert.equal(simulateAuto({ scenario: 'code', mode: 'quality' }).tier, 'reasoning')
})

test('min_tier and max_tier clamp the classified tier', () => {
  const lifted = simulateAuto({ minTier: 'complex' })
  assert.equal(lifted.tier, 'complex')
  assert.ok(lifted.hard_filters.includes('min_tier complex'))
  const capped = simulateAuto({ scenario: 'proof', maxTier: 'medium' })
  assert.equal(capped.tier, 'medium')
  assert.ok(capped.hard_filters.includes('max_tier medium'))
})

test('min_tier above max_tier uses max_tier for both instead of failing', () => {
  const d = simulateAuto({ minTier: 'reasoning', maxTier: 'simple' })
  assert.equal(d.tier, 'simple')
  assert.equal(d.error, null)
  assert.ok(d.hard_filters[0].startsWith('min_tier reasoning > max_tier simple'))
})

test('no enabled provider means no_eligible_model', () => {
  const d = simulateAuto({ providers: { openai: false, anthropic: false, google: false } })
  assert.equal(d.error, 'no_eligible_model')
  assert.equal(d.selected, null)
  assert.ok(d.candidates.every((c) => !c.eligible && c.excluded === 'provider disabled'))
})

test('disabled providers are skipped in config order', () => {
  const d = simulateAuto({ providers: { google: false } })
  assert.equal(d.selected, 'gpt-5.6-luna')
  assert.equal(d.candidates[0].excluded, 'provider disabled')
})

test('with a tier empty, the search escalates before falling back', () => {
  // Only Anthropic: simple has no Anthropic model, medium has haiku.
  const up = simulateAuto({ providers: { openai: false, google: false } })
  assert.equal(up.tier, 'medium')
  assert.equal(up.selected, 'claude-haiku-4-5')
  assert.match(up.reason, /^escalated from simple/)
  // Capped at simple with only Anthropic: nothing to escalate into.
  const none = simulateAuto({ providers: { openai: false, google: false }, maxTier: 'simple' })
  assert.equal(none.error, 'no_eligible_model')
})

test('shadow: the pinned model answers and the pick stays hypothetical', () => {
  const d = simulateAuto({ shadow: true })
  assert.equal(d.shadow, true)
  assert.equal(d.requested_model, 'gpt-5.4-mini')
  assert.equal(d.actual_model, 'gpt-5.4-mini')
  assert.equal(d.selected, 'gemini-3.1-flash-lite')
  assert.match(d.reason, /^shadow: /)
  const empty = simulateAuto({ shadow: true, providers: { openai: false, anthropic: false, google: false } })
  assert.equal(empty.error, null, 'a shadow miss never fails the pinned request')
})

// ---- drift checks against the Rust defaults --------------------------------

const rust = (path: string) => readFileSync(new URL(`../../../../crates/aura-core/src/router/auto/${path}`, import.meta.url), 'utf8')
const config = rust('config.rs')

function rustBlock(marker: string): string {
  const start = config.indexOf(marker)
  assert.ok(start >= 0, `missing ${marker} in config.rs`)
  return config.slice(start, config.indexOf('\n}\n', start))
}

test('tier lists match TierModels::default()', () => {
  const block = rustBlock('impl Default for TierModels')
  for (const [tier, models] of Object.entries(DEFAULT_TIER_MODELS)) {
    const list = block.slice(block.indexOf(`${tier}: vec![`))
    const rustModels = [...list.slice(0, list.indexOf(']')).matchAll(/"([^"]+)"/g)].map((m) => m[1])
    assert.deepEqual(models, rustModels, tier)
  }
})

test('boundaries match TierBoundaries::default()', () => {
  const block = rustBlock('impl Default for TierBoundaries')
  for (const [key, value] of Object.entries(DEFAULT_BOUNDARIES)) {
    const m = block.match(new RegExp(`${key}: ([0-9.]+)`))
    assert.equal(Number(m?.[1]), value, key)
  }
})

test('mode offsets match ModeOffsets::default()', () => {
  const block = rustBlock('impl Default for ModeOffsets')
  for (const [mode, value] of Object.entries(DEFAULT_MODE_OFFSETS)) {
    const m = block.match(new RegExp(`${mode}: (-?[0-9.]+)`))
    assert.equal(Number(m?.[1]), value, mode)
  }
})

test('tools floor matches the default tools_min_tier', () => {
  const tier = TOOLS_FLOOR[0].toUpperCase() + TOOLS_FLOOR.slice(1)
  assert.ok(config.includes(`tools_min_tier: Some(Tier::${tier})`))
})
