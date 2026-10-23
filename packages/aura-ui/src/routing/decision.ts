/**
 * Auto-router decision → inspector view model.
 *
 * One adapter for every place a decision is shown: the playground (the
 * decision returned in `metadata.aura.routing` next to the response), the
 * admin app (a row from `GET /admin/routing/decisions/{response_id}`), and
 * the landing demo. It normalises field names and missing data, and keeps
 * the semantics from AUTO_ROUTER_CONTRACT.md explicit:
 *
 *  - the model that answered is the response's `model`, never assumed;
 *  - under shadow the pinned model answered and `selected` is only what
 *    auto *would* have picked — it is reported as hypothetical;
 *  - score, raw score, classified tier and final tier stay distinct;
 *  - costs are nullable and never become 0.
 *
 * Mirrors `AutoDecision` in crates/aura-core/src/router/auto/mod.rs and the
 * `routing_decisions` row in crates/aura-db/src/models.rs. Pure TypeScript
 * with no dependencies (tested with node:test).
 */

export type Tier = 'simple' | 'medium' | 'complex' | 'reasoning'

export const TIERS: readonly Tier[] = ['simple', 'medium', 'complex', 'reasoning']

export interface TierBoundaries {
  simple_medium: number
  medium_complex: number
  complex_reasoning: number
}

/** `TierBoundaries::default()` — only used when a decision carries none. */
export const DEFAULT_BOUNDARIES: TierBoundaries = { simple_medium: 0.15, medium_complex: 0.35, complex_reasoning: 0.6 }

/** One candidate as serialised by the gateway (`CandidateInfo`). */
export interface RawCandidate {
  model: string
  provider?: string | null
  tier: string
  cost_per_million?: number | null
  predicted_cost_usd?: number | null
  eligible: boolean
}

export interface RawEscalation {
  from_model: string
  from_tier: string
  to_model: string
  to_tier: string
  error_code: string
}

/** `metadata.aura.routing` on a response (`AutoDecision`). */
export interface ResponseRoutingDecision {
  requested_model: string
  mode: string
  classifier: string
  score: number
  raw_score: number
  classified_tier: string
  tier: string
  boundaries?: TierBoundaries | null
  signals?: Record<string, number> | null
  features?: Record<string, unknown> | null
  hard_filters?: string[] | null
  candidates?: RawCandidate[] | null
  selected: string
  selected_provider?: string | null
  reason: string
  shadow: boolean
  latency_us?: number | null
  escalations?: RawEscalation[] | null
  predicted_cost_usd?: number | null
  synthetic?: boolean
  /** Routing options the gateway applied: the request's `routing` merged with any org override. */
  options?: object | null
}

/**
 * A stored decision (`GET /admin/routing/decisions/{response_id}`). Newer
 * gateways add recorded boundaries and the outcome; older rows have
 * neither.
 */
export interface StoredRoutingDecision {
  response_id: string
  requested_model: string
  mode: string
  classifier: string
  score: number
  raw_score?: number | null
  classified_tier: string
  tier: string
  selected_model: string
  selected_provider?: string | null
  reason: string
  shadow: boolean
  features?: unknown
  signals?: unknown
  hard_filters?: string[] | null
  candidates?: unknown
  decision_latency_us?: number | null
  escalations?: unknown
  synthetic?: boolean
  created_at?: string
  boundaries?: TierBoundaries | null
  boundaries_in_force?: TierBoundaries | null
  boundaries_source?: 'recorded' | 'config' | 'default'
  outcome?: { actual_model?: string | null; actual_provider?: string | null } | null
}

/** What actually happened to the request, from outside the decision. */
export interface AnswerContext {
  /** Response `model` (playground) or outcome `actual_model` (admin). */
  model?: string | null
  /** Provider that served it (`metadata.aura.provider`). */
  provider?: string | null
}

export interface CandidateView {
  model: string
  provider: string | null
  tier: string
  eligible: boolean
  costPerMillion: number | null
  predictedCostUsd: number | null
  /** The router's pick (hypothetical under shadow). */
  picked: boolean
}

export interface RoutingView {
  /** Applied: the pick served the request. Shadow: scored only. */
  kind: 'applied' | 'shadow'
  /** Model that produced the answer, if known. */
  answeredBy: string | null
  answeredByProvider: string | null
  /** Shadow only: what auto would have picked. Null when applied. */
  hypotheticalModel: string | null
  hypotheticalProvider: string | null
  /** Router's pick (applied) — kept for comparisons and labels. */
  selected: string
  requestedModel: string
  mode: string
  classifier: string
  score: number
  rawScore: number | null
  /** score − raw_score: the mode offset (plus any calibration). */
  scoreOffset: number | null
  classifiedTier: string
  finalTier: string
  /** A constraint or fallback moved the request off its classified tier. */
  tierMoved: boolean
  boundaries: TierBoundaries
  boundariesSource: 'decision' | 'recorded' | 'config' | 'default'
  bands: Array<{ tier: Tier; from: number; to: number }>
  reason: string
  /** Constraints from request/org options (tier bounds, lists, budget, sticky). */
  optionFilters: string[]
  /** Constraints from the request's shape (tools, vision, context...). */
  shapeFilters: string[]
  /** Routing options the gateway echoed back as applied (response decisions only). */
  appliedOptions: Array<{ key: string; value: string }>
  candidates: CandidateView[]
  hasPredictedCosts: boolean
  predictedCostUsd: number | null
  escalations: RawEscalation[]
  /** Model first tried, when escalation moved the request on. */
  firstTried: string | null
  signals: Array<{ name: string; value: number }>
  latencyUs: number | null
  synthetic: boolean
  /** Applied decision whose answering model differs from the pick. */
  answerDiffersFromPick: boolean
}

// Hard filters that come from request options or org policy rather than
// from the request's shape (see `hard_filters` in router/auto/mod.rs).
const OPTION_PREFIXES = ['min_tier', 'max_tier', 'allow/deny', 'max_cost_usd', 'budget', 'sticky']

function isOptionFilter(filter: string): boolean {
  return OPTION_PREFIXES.some((p) => filter.startsWith(p))
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function validBoundaries(b: unknown): b is TierBoundaries {
  if (!b || typeof b !== 'object') return false
  const o = b as Record<string, unknown>
  return num(o.simple_medium) !== null && num(o.medium_complex) !== null && num(o.complex_reasoning) !== null
}

export function tierBands(b: TierBoundaries): RoutingView['bands'] {
  return [
    { tier: 'simple', from: 0, to: b.simple_medium },
    { tier: 'medium', from: b.simple_medium, to: b.medium_complex },
    { tier: 'complex', from: b.medium_complex, to: b.complex_reasoning },
    { tier: 'reasoning', from: b.complex_reasoning, to: 1 },
  ]
}

function candidatesOf(raw: unknown, pick: string): CandidateView[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c): c is RawCandidate => !!c && typeof c === 'object' && typeof (c as RawCandidate).model === 'string')
    .map((c) => ({
      model: c.model,
      provider: str(c.provider),
      tier: typeof c.tier === 'string' ? c.tier : 'unknown',
      eligible: c.eligible === true,
      costPerMillion: num(c.cost_per_million),
      predictedCostUsd: num(c.predicted_cost_usd),
      picked: c.model === pick,
    }))
}

function escalationsOf(raw: unknown): RawEscalation[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (e): e is RawEscalation => !!e && typeof e === 'object' && typeof (e as RawEscalation).from_model === 'string',
  )
}

function signalsOf(raw: unknown): RoutingView['signals'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  return Object.entries(raw as Record<string, unknown>)
    .filter((e): e is [string, number] => num(e[1]) !== null)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
}

interface Common {
  requestedModel: string
  mode: string
  classifier: string
  score: unknown
  rawScore: unknown
  classifiedTier: string
  finalTier: string
  selected: string
  selectedProvider: unknown
  reason: string
  shadow: boolean
  hardFilters: unknown
  candidates: unknown
  escalations: unknown
  signals: unknown
  latencyUs: unknown
  predictedCostUsd: unknown
  synthetic: unknown
  boundaries: TierBoundaries | null
  boundariesSource: RoutingView['boundariesSource']
  appliedOptions: unknown
}

function optionsOf(v: unknown): Array<{ key: string; value: string }> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return []
  return Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== null && x !== undefined)
    .map(([key, x]) => ({ key, value: Array.isArray(x) ? x.join(', ') : String(x) }))
}

function build(c: Common, answer: AnswerContext): RoutingView {
  const shadow = c.shadow === true
  const score = num(c.score) ?? 0
  const rawScore = num(c.rawScore)
  const boundaries = c.boundaries ?? DEFAULT_BOUNDARIES
  const filters = Array.isArray(c.hardFilters) ? c.hardFilters.filter((f): f is string => typeof f === 'string') : []
  const candidates = candidatesOf(c.candidates, c.selected)
  const escalations = escalationsOf(c.escalations)
  const pickedPrediction = candidates.find((x) => x.picked)?.predictedCostUsd ?? null
  const answeredModel = str(answer.model)

  // Under shadow the client's pinned model answered. Without a response
  // model we fall back to the requested model, which is the pinned id.
  const answeredBy = shadow ? (answeredModel ?? str(c.requestedModel)) : (answeredModel ?? str(c.selected))
  const answeredByProvider = str(answer.provider) ?? (shadow ? null : str(c.selectedProvider))

  return {
    kind: shadow ? 'shadow' : 'applied',
    answeredBy,
    answeredByProvider,
    hypotheticalModel: shadow ? str(c.selected) : null,
    hypotheticalProvider: shadow ? str(c.selectedProvider) : null,
    selected: c.selected,
    requestedModel: c.requestedModel,
    mode: c.mode,
    classifier: c.classifier,
    score,
    rawScore,
    scoreOffset: rawScore === null ? null : Math.round((score - rawScore) * 1000) / 1000,
    classifiedTier: c.classifiedTier,
    finalTier: c.finalTier,
    tierMoved: c.classifiedTier !== c.finalTier,
    boundaries,
    boundariesSource: c.boundariesSource,
    bands: tierBands(boundaries),
    reason: c.reason,
    optionFilters: filters.filter(isOptionFilter),
    shapeFilters: filters.filter((f) => !isOptionFilter(f)),
    appliedOptions: optionsOf(c.appliedOptions),
    candidates,
    hasPredictedCosts: candidates.some((x) => x.predictedCostUsd !== null),
    predictedCostUsd: num(c.predictedCostUsd) ?? pickedPrediction,
    escalations,
    firstTried: escalations.length > 0 ? escalations[0].from_model : null,
    signals: signalsOf(c.signals),
    latencyUs: num(c.latencyUs),
    synthetic: c.synthetic === true,
    answerDiffersFromPick: !shadow && answeredModel !== null && answeredModel !== c.selected,
  }
}

/** Decision returned with a response (`metadata.aura.routing`). */
export function fromResponseDecision(d: ResponseRoutingDecision, answer: AnswerContext = {}): RoutingView {
  const recorded = validBoundaries(d.boundaries)
  return build(
    {
      requestedModel: d.requested_model,
      mode: d.mode,
      classifier: d.classifier,
      score: d.score,
      rawScore: d.raw_score,
      classifiedTier: d.classified_tier,
      finalTier: d.tier,
      selected: d.selected,
      selectedProvider: d.selected_provider,
      reason: d.reason,
      shadow: d.shadow,
      hardFilters: d.hard_filters,
      candidates: d.candidates,
      escalations: d.escalations,
      signals: d.signals,
      latencyUs: d.latency_us,
      predictedCostUsd: d.predicted_cost_usd,
      synthetic: d.synthetic,
      boundaries: recorded ? (d.boundaries as TierBoundaries) : null,
      // Gateways before boundaries were reported: show the defaults, and say so.
      boundariesSource: recorded ? 'decision' : 'default',
      appliedOptions: d.options,
    },
    answer,
  )
}

/** Decision stored by the gateway (admin decision detail). */
export function fromStoredDecision(d: StoredRoutingDecision, answer: AnswerContext = {}): RoutingView {
  const inForce = validBoundaries(d.boundaries_in_force) ? d.boundaries_in_force : null
  const recorded = validBoundaries(d.boundaries) ? d.boundaries : null
  return build(
    {
      requestedModel: d.requested_model,
      mode: d.mode,
      classifier: d.classifier,
      score: d.score,
      rawScore: d.raw_score,
      classifiedTier: d.classified_tier,
      finalTier: d.tier,
      selected: d.selected_model,
      selectedProvider: d.selected_provider,
      reason: d.reason,
      shadow: d.shadow,
      hardFilters: d.hard_filters,
      candidates: d.candidates,
      escalations: d.escalations,
      signals: d.signals,
      latencyUs: d.decision_latency_us,
      predictedCostUsd: null,
      synthetic: d.synthetic,
      boundaries: inForce ?? recorded,
      boundariesSource: inForce ? (d.boundaries_source ?? 'recorded') : recorded ? 'recorded' : 'default',
      appliedOptions: null,
    },
    {
      model: answer.model ?? d.outcome?.actual_model ?? null,
      provider: answer.provider ?? d.outcome?.actual_provider ?? null,
    },
  )
}

// ---- formatting -------------------------------------------------------------

/** Request costs are often fractions of a cent: keep them readable. */
export function formatUsd(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (v === 0) return '$0'
  const abs = Math.abs(v)
  if (abs < 0.0001) return `$${v.toExponential(1)}`
  if (abs < 1) return `$${v.toFixed(4)}`
  return `$${v.toFixed(2)}`
}

export function formatPerMillion(v: number | null): string {
  return v === null ? '—' : `$${v.toFixed(2)}`
}

export function formatMicros(us: number | null): string {
  if (us === null) return '—'
  return us >= 1000 ? `${(us / 1000).toFixed(1)} ms` : `${Math.round(us)} µs`
}

export function formatOffset(v: number): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(2)}`
}
