// Auto-router admin API: decisions explorer, decision detail, timeline,
// arm statistics, learned models and gold labels. Kept apart from api.ts
// so the routing views evolve without touching the shared client.

import { fetchApi } from './api'

export type RoutingTier = 'simple' | 'medium' | 'complex' | 'reasoning'

export const ROUTING_TIERS: RoutingTier[] = ['simple', 'medium', 'complex', 'reasoning']

export interface TierBoundaries {
  simple_medium: number
  medium_complex: number
  complex_reasoning: number
}

/** One row of GET /admin/routing/decisions. */
export interface RoutingDecisionRow {
  id: string
  response_id: string
  provider_response_id: string | null
  organization_id: string | null
  api_key_id: string | null
  conversation_id: string | null
  created_at: string
  requested_model: string
  mode: string
  classifier: string
  score: number
  classified_tier: string
  tier: string
  selected_model: string
  selected_provider: string | null
  reason: string
  shadow: boolean
  synthetic: boolean
  escalated: boolean
  sticky: boolean
  candidates_count: number
  eligible_count: number
  predicted_cost_usd: number | null
  decision_latency_us: number
  status: string | null
  actual_model: string | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  latency_ms: number | null
  feedback: string | null
  next_turn: string | null
  reward: number | null
  estimated_savings_usd: number | null
}

export interface RoutingDecisionPage {
  decisions: RoutingDecisionRow[]
  next_cursor: string | null
  limit: number
}

/**
 * Query parameters accepted by the list endpoint. Values are passed
 * through as strings; empty values are dropped.
 */
export interface RoutingDecisionFilters {
  period?: string
  from?: string
  to?: string
  mode?: string
  tier?: string
  classified_tier?: string
  tier_changed?: string
  model?: string
  shadow?: string
  synthetic?: string
  escalated?: string
  sticky?: string
  status?: string
  outcome?: string
  feedback?: string
  min_reward?: string
  max_reward?: string
  organization_id?: string
  api_key_id?: string
  min_cost?: string
  max_cost?: string
}

export const DECISION_FILTER_KEYS: (keyof RoutingDecisionFilters)[] = [
  'period',
  'from',
  'to',
  'mode',
  'tier',
  'classified_tier',
  'tier_changed',
  'model',
  'shadow',
  'synthetic',
  'escalated',
  'sticky',
  'status',
  'outcome',
  'feedback',
  'min_reward',
  'max_reward',
  'organization_id',
  'api_key_id',
  'min_cost',
  'max_cost',
]

export interface RoutingCandidate {
  model: string
  provider?: string | null
  tier: string
  cost_per_million?: number | null
  predicted_cost_usd?: number | null
  eligible: boolean
}

export interface RoutingEscalation {
  from_model: string
  from_tier: string
  to_model: string
  to_tier: string
  error_code: string
}

export interface RoutingDecisionOutcome {
  status: string | null
  actual_model: string | null
  actual_provider: string | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  latency_ms: number | null
  tool_calls_count: number
  incomplete_reason: string | null
  feedback: string | null
  estimated_savings_usd: number | null
  next_turn: string | null
  next_model: string | null
  reward: number | null
  outcome_computed_at: string | null
}

/** GET /admin/routing/decisions/{response_id} */
export interface RoutingDecisionDetail {
  id: string
  response_id: string
  provider_response_id: string | null
  organization_id: string | null
  api_key_id: string | null
  conversation_id: string | null
  requested_model: string
  mode: string
  classifier: string
  score: number
  raw_score: number
  classified_tier: string
  tier: string
  selected_model: string
  selected_provider: string | null
  reason: string
  shadow: boolean
  features: Record<string, unknown>
  signals: Record<string, number>
  hard_filters: string[]
  candidates: RoutingCandidate[]
  requested_blended_per_million: number | null
  selected_blended_per_million: number | null
  decision_latency_us: number
  escalations: RoutingEscalation[] | null
  synthetic: boolean
  created_at: string
  boundaries: TierBoundaries | null
  outcome: RoutingDecisionOutcome | null
  boundaries_in_force: TierBoundaries
  boundaries_source: 'recorded' | 'config' | 'default'
}

export interface RoutingTimelinePoint {
  bucket: string
  applied: number
  shadow: number
  escalated: number
  applied_cost: number
  estimated_savings: number
  scored: number
  avg_reward: number | null
  move_on: number
  retry: number
  correction: number
  escalation: number
}

export interface RoutingTimeline {
  period: string
  bucket: 'hour' | 'day'
  points: RoutingTimelinePoint[]
}

export interface RoutingArmStat {
  tier: string
  model: string
  alpha: number
  beta: number
  observations: number
  updated_at: string
}

export interface RouterModelSummary {
  id: string
  name: string
  version: string
  /** `learned_lr` (tier classifier) or `cost_lr` (cost model). */
  kind: string
  metrics: Record<string, unknown>
  is_active: boolean
  created_at: string
}

export interface RouterModelsResponse {
  loaded: string | null
  loaded_cost_model: string | null
  models: RouterModelSummary[]
}

export interface RoutingGoldSummary {
  total: number
  cheap_sufficed: number
  strong_better: number
  ties: number
  failed: number
  live: number
  synthetic: number
  synthetic_train: number
  synthetic_holdout: number
  synthetic_agreed: number
}

export interface RoutingGoldResponse {
  summary: RoutingGoldSummary
  recent: unknown[]
}

export async function listRoutingDecisions(
  filters: RoutingDecisionFilters,
  cursor?: string | null,
  limit = 50,
): Promise<RoutingDecisionPage> {
  const params = new URLSearchParams()
  for (const key of DECISION_FILTER_KEYS) {
    const value = filters[key]?.trim()
    if (value) params.set(key, value)
  }
  if (cursor) params.set('cursor', cursor)
  params.set('limit', String(limit))
  return fetchApi<RoutingDecisionPage>(`/admin/routing/decisions?${params.toString()}`)
}

export async function getRoutingDecision(responseId: string): Promise<RoutingDecisionDetail> {
  return fetchApi<RoutingDecisionDetail>(
    `/admin/routing/decisions/${encodeURIComponent(responseId)}`,
  )
}

export async function getRoutingTimeline(period: string): Promise<RoutingTimeline> {
  return fetchApi<RoutingTimeline>(
    `/admin/stats/routing/auto/timeline?period=${encodeURIComponent(period)}`,
  )
}

export async function getRoutingArms(): Promise<RoutingArmStat[]> {
  return fetchApi<RoutingArmStat[]>('/admin/routing/arms')
}

export async function getRouterModels(): Promise<RouterModelsResponse> {
  return fetchApi<RouterModelsResponse>('/admin/routing/models')
}

export async function activateRouterModel(id: string): Promise<unknown> {
  return fetchApi(`/admin/routing/models/${encodeURIComponent(id)}/activate`, { method: 'POST' })
}

export async function deactivateRouterModels(kind?: string): Promise<unknown> {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : ''
  return fetchApi(`/admin/routing/models/deactivate${query}`, { method: 'POST' })
}

export async function reloadRouterModels(): Promise<unknown> {
  return fetchApi('/admin/routing/models/reload', { method: 'POST' })
}

export async function getRoutingGold(limit = 1): Promise<RoutingGoldResponse> {
  return fetchApi<RoutingGoldResponse>(`/admin/routing/gold?limit=${limit}`)
}
