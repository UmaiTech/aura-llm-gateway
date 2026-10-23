/**
 * Deterministic auto-router demo for the public landing page.
 *
 * This is NOT the gateway's router and never calls it. It replays the
 * decision *rules* of crates/aura-core/src/router/auto (mode offsets, tier
 * boundaries, min/max clamps, tools floor, outward tier search, config-order
 * pick) over four fixed request shapes, so a visitor can see how the knobs
 * interact. The complexity scores below are illustrative inputs, not
 * classifier output, and no prices are involved: the demo picks the first
 * eligible model in config order, one of the gateway's real within-tier
 * strategies. Defaults mirror the Rust config and are drift-tested in
 * autoRouterDemo.test.ts.
 */

export type Tier = 'simple' | 'medium' | 'complex' | 'reasoning'
export type Mode = 'cost' | 'balanced' | 'quality'
export type DemoProvider = 'openai' | 'anthropic' | 'google'

export const TIERS: Tier[] = ['simple', 'medium', 'complex', 'reasoning']
export const MODES: Mode[] = ['cost', 'balanced', 'quality']

/** `TierBoundaries::default()` — inclusive lower bound of each upper tier. */
export const DEFAULT_BOUNDARIES = { simple_medium: 0.15, medium_complex: 0.35, complex_reasoning: 0.6 }

/** `ModeOffsets::default()` — added to the score before tiering. */
export const DEFAULT_MODE_OFFSETS: Record<Mode, number> = { cost: -0.1, balanced: 0, quality: 0.15 }

/** `AutoRoutingConfig::default().tools_min_tier`. */
export const TOOLS_FLOOR: Tier = 'medium'

/** `TierModels::default()` — the gateway's shipped tier lists, in config order. */
export const DEFAULT_TIER_MODELS: Record<Tier, string[]> = {
  simple: ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gpt-5.6-luna'],
  medium: ['gemini-3.8-flash', 'gpt-5.4-mini', 'claude-haiku-4-5'],
  complex: ['claude-sonnet-5', 'gemini-3-pro-preview', 'gpt-5.6-terra'],
  reasoning: ['claude-opus-5', 'gpt-5.6-sol', 'claude-fable-5-1'],
}

export const DEMO_PROVIDERS: DemoProvider[] = ['openai', 'anthropic', 'google']

export const PROVIDER_LABEL: Record<DemoProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
}

export function providerOf(model: string): DemoProvider {
  if (model.startsWith('gemini')) return 'google'
  if (model.startsWith('claude')) return 'anthropic'
  return 'openai'
}

export interface DemoScenario {
  id: 'rewrite' | 'tools' | 'code' | 'proof'
  name: string
  hint: string
  prompt: string
  /** Illustrative complexity score before the mode offset. */
  rawScore: number
  tools: boolean
}

export const SCENARIOS: DemoScenario[] = [
  {
    id: 'rewrite',
    name: 'Everyday rewrite',
    hint: 'Short rewrite, low complexity',
    prompt: 'Rewrite this sentence more clearly: our deployment is ready for review.',
    rawScore: 0.08,
    tools: false,
  },
  {
    id: 'tools',
    name: 'Tool-assisted task',
    hint: 'Carries tools, so medium is the floor',
    prompt: 'Use the available tools to look up the delivery status and summarise it.',
    rawScore: 0.22,
    tools: true,
  },
  {
    id: 'code',
    name: 'Engineering analysis',
    hint: 'Code and multi-step analysis',
    prompt: 'Debug this distributed service and explain the concurrency trade-offs.',
    rawScore: 0.48,
    tools: false,
  },
  {
    id: 'proof',
    name: 'Deep reasoning',
    hint: 'Proof and derivation markers',
    prompt: 'Prove that this iterative algorithm converges and derive its error bound.',
    rawScore: 0.71,
    tools: false,
  },
]

export interface DemoInput {
  scenario?: DemoScenario['id']
  mode?: Mode
  minTier?: Tier
  maxTier?: Tier
  providers?: Partial<Record<DemoProvider, boolean>>
  /** Score a pinned-model request instead of routing it (shadow). */
  shadow?: boolean
  pinned?: string
}

export interface DemoCandidate {
  model: string
  provider: DemoProvider
  tier: Tier
  eligible: boolean
  /** Why an ineligible candidate was skipped. */
  excluded?: string
}

/** Shaped like `metadata.aura.routing` so the same inspector can show it. */
export interface DemoDecision {
  requested_model: string
  mode: Mode
  classifier: 'landing-demo'
  score: number
  raw_score: number
  classified_tier: Tier
  tier: Tier
  boundaries: typeof DEFAULT_BOUNDARIES
  hard_filters: string[]
  candidates: DemoCandidate[]
  /** Model the router picked; null when nothing was eligible. */
  selected: string | null
  selected_provider: DemoProvider | null
  reason: string
  shadow: boolean
  /** The model that answers: the pick, or the pinned model under shadow. */
  actual_model: string | null
  /** `no_eligible_model` (HTTP 503 on the gateway) when nothing fits. */
  error: 'no_eligible_model' | null
}

const rank = (t: Tier) => TIERS.indexOf(t)
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
// Offsets are tenths; keep demo scores free of float noise (0.08 + 0.15).
const round3 = (n: number) => Math.round(n * 1000) / 1000

function classify(score: number, b = DEFAULT_BOUNDARIES): Tier {
  if (score >= b.complex_reasoning) return 'reasoning'
  if (score >= b.medium_complex) return 'complex'
  if (score >= b.simple_medium) return 'medium'
  return 'simple'
}

export function simulateAuto(input: DemoInput = {}): DemoDecision {
  const scenario = SCENARIOS.find((s) => s.id === input.scenario) ?? SCENARIOS[0]
  const mode = input.mode ?? 'balanced'
  const providers = { openai: true, anthropic: true, google: true, ...input.providers }
  const shadow = input.shadow ?? false
  const pinned = input.pinned ?? 'gpt-5.4-mini'

  const score = round3(clamp01(scenario.rawScore + DEFAULT_MODE_OFFSETS[mode]))
  const classified = classify(score)
  const hardFilters: string[] = []

  let minTier = input.minTier ?? 'simple'
  let maxTier = input.maxTier ?? 'reasoning'
  if (rank(minTier) > rank(maxTier)) {
    hardFilters.push(`min_tier ${minTier} > max_tier ${maxTier}: using max_tier for both`)
    minTier = maxTier
  }

  let tier = classified
  if (rank(tier) < rank(minTier)) {
    hardFilters.push(`min_tier ${minTier}`)
    tier = minTier
  }
  if (rank(tier) > rank(maxTier)) {
    hardFilters.push(`max_tier ${maxTier}`)
    tier = maxTier
  }
  // Tools floor last: it overrides max_tier, as in the gateway.
  if (scenario.tools && rank(tier) < rank(TOOLS_FLOOR)) {
    hardFilters.push(
      rank(TOOLS_FLOOR) > rank(maxTier)
        ? `tools present: floor ${TOOLS_FLOOR} overrides max_tier ${maxTier}`
        : `tools present: floor ${TOOLS_FLOOR}`,
    )
    tier = TOOLS_FLOOR
  }
  if (scenario.tools) hardFilters.push('needs tools')
  if (DEMO_PROVIDERS.some((p) => !providers[p])) hardFilters.push('provider filter (demo)')

  // Search: requested tier, then stronger tiers up to max, then weaker
  // tiers down to min.
  const order: Tier[] = [tier]
  for (let i = rank(tier) + 1; i < TIERS.length; i++) if (i <= rank(maxTier)) order.push(TIERS[i])
  for (let i = rank(tier) - 1; i >= 0; i--) if (i >= rank(minTier)) order.push(TIERS[i])

  const candidates: DemoCandidate[] = []
  let selected: string | null = null
  let selectedTier: Tier = tier
  for (const t of order) {
    for (const model of DEFAULT_TIER_MODELS[t]) {
      const provider = providerOf(model)
      const eligible = providers[provider]
      candidates.push({ model, provider, tier: t, eligible, ...(eligible ? {} : { excluded: 'provider disabled' }) })
    }
    const pick = DEFAULT_TIER_MODELS[t].find((m) => providers[providerOf(m)])
    if (pick) {
      selected = pick
      selectedTier = t
      break
    }
  }

  let reason: string
  if (!selected) reason = 'no eligible model within the tier bounds'
  else if (selectedTier === tier) reason = `first eligible candidate in ${tier}`
  else if (rank(selectedTier) > rank(tier))
    reason = `escalated from ${tier} (no eligible candidate); first eligible candidate in ${selectedTier}`
  else reason = `fell back to ${selectedTier} (no eligible candidate at or above ${tier}); first eligible candidate in ${selectedTier}`

  return {
    requested_model: shadow ? pinned : mode === 'balanced' ? 'auto' : `auto:${mode}`,
    mode,
    classifier: 'landing-demo',
    score,
    raw_score: scenario.rawScore,
    classified_tier: classified,
    tier: selected ? selectedTier : tier,
    boundaries: DEFAULT_BOUNDARIES,
    hard_filters: hardFilters,
    candidates,
    selected,
    selected_provider: selected ? providerOf(selected) : null,
    reason: shadow ? `shadow: ${reason}` : reason,
    shadow,
    actual_model: shadow ? pinned : selected,
    // Shadow never fails the request: the pinned model answers regardless.
    error: selected || shadow ? null : 'no_eligible_model',
  }
}
