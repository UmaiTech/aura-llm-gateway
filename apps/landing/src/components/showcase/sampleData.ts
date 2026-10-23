/**
 * Sample data for the landing's product previews. Everything here is
 * illustrative and labelled as such wherever it renders: no visitor or
 * production workspace data, no measured performance. The landing never
 * calls the gateway, the admin API or a provider.
 *
 * The featured request's routing comes from the deterministic demo router
 * (lib/autoRouterDemo.ts), so the hero, the playground preview, the admin
 * drawer and the auto-router section all tell the same story.
 */
import { SCENARIOS, simulateAuto, type DemoDecision } from '../../lib/autoRouterDemo'

export const SAMPLE_LABEL = 'Sample data'

export interface SampleMetric {
  label: string
  value: string
  caption?: string
}

export const SAMPLE_METRICS: SampleMetric[] = [
  { label: 'Requests', value: '18,420', caption: 'last 24 h' },
  { label: 'Spend', value: '$12.37', caption: 'provider list prices' },
  { label: 'Success rate', value: '99.4%', caption: 'completed / total' },
  { label: 'Avg duration', value: '910 ms', caption: 'end to end' },
]

/** Requests per hour over a sample day; fixed values, never animated. */
export const SAMPLE_HOURLY = [
  310, 260, 240, 220, 260, 340, 480, 690, 860, 980, 1040, 1010, 960, 1090, 1180, 1120, 1020, 940, 820, 700, 610, 520,
  430, 360,
]

export type HealthStatus = 'healthy' | 'degraded' | 'down'

export interface SampleProviderHealth {
  provider: string
  status: HealthStatus
  successRate: string
  p50: string
  note: string
}

export const SAMPLE_HEALTH: SampleProviderHealth[] = [
  { provider: 'OpenAI', status: 'healthy', successRate: '99.8%', p50: '780 ms', note: 'Circuit closed' },
  { provider: 'Anthropic', status: 'healthy', successRate: '99.6%', p50: '1.1 s', note: 'Circuit closed' },
  { provider: 'Google', status: 'degraded', successRate: '96.9%', p50: '1.6 s', note: 'Elevated 5xx; auto routing escalates past failures' },
]

export interface SampleRequest {
  id: string
  /** What the client sent as `model`. */
  requestedModel: string
  /** What actually answered (response `model`). */
  model: string
  provider: string
  status: 'completed' | 'failed'
  duration: string
  inputTokens: number
  outputTokens: number
  cost: string
  at: string
  prompt?: string
  answer?: string
  routing?: DemoDecision
}

const toolScenario = SCENARIOS.find((s) => s.id === 'tools')!
const featuredRouting = simulateAuto({ scenario: 'tools', mode: 'balanced' })

/**
 * The request the playground preview shows and the admin preview lists
 * first: same id, same model, same routing.
 */
export const FEATURED_REQUEST: SampleRequest = {
  id: 'resp_sample_delivery',
  requestedModel: featuredRouting.requested_model,
  model: featuredRouting.actual_model ?? 'gemini-3.8-flash',
  provider: 'Google',
  status: 'completed',
  duration: '1.24 s',
  inputTokens: 1240,
  outputTokens: 212,
  cost: '$0.0009',
  at: '14:02:11',
  prompt: toolScenario.prompt,
  answer:
    'Order 4417 left the Gothenburg depot at 09:40 and is on schedule for delivery tomorrow before noon. ' +
    'The carrier reports no exceptions on the route.',
  routing: featuredRouting,
}

export const SAMPLE_REQUESTS: SampleRequest[] = [
  FEATURED_REQUEST,
  {
    id: 'resp_sample_review',
    requestedModel: 'claude-sonnet-5',
    model: 'claude-sonnet-5',
    provider: 'Anthropic',
    status: 'completed',
    duration: '3.80 s',
    inputTokens: 6120,
    outputTokens: 940,
    cost: '$0.0325',
    at: '14:01:47',
  },
  {
    id: 'resp_sample_summary',
    requestedModel: 'gpt-5.4-mini',
    model: 'gpt-5.4-mini',
    provider: 'OpenAI',
    status: 'completed',
    duration: '0.86 s',
    inputTokens: 830,
    outputTokens: 120,
    cost: '$0.0004',
    at: '14:01:30',
  },
  {
    id: 'resp_sample_timeout',
    requestedModel: 'gemini-3.5-flash',
    model: 'gemini-3.5-flash',
    provider: 'Google',
    status: 'failed',
    duration: '30.0 s',
    inputTokens: 410,
    outputTokens: 0,
    cost: '$0.0000',
    at: '14:00:58',
  },
]

/** Illustrative `POST /v1/responses` body + response for the raw view. */
export function rawExchange(req: SampleRequest) {
  return {
    request: {
      model: req.requestedModel,
      input: [{ type: 'message', role: 'user', content: req.prompt ?? '…' }],
      tools: [{ type: 'function', name: 'delivery_status' }],
    },
    response: {
      id: req.id,
      object: 'response',
      status: req.status,
      model: req.model,
      usage: { input_tokens: req.inputTokens, output_tokens: req.outputTokens, cost_usd: Number(req.cost.slice(1)) },
      metadata: {
        aura: {
          provider: req.provider.toLowerCase(),
          routing: req.routing
            ? {
                requested_model: req.routing.requested_model,
                mode: req.routing.mode,
                score: req.routing.score,
                classified_tier: req.routing.classified_tier,
                tier: req.routing.tier,
                selected: req.routing.selected,
                reason: req.routing.reason,
                shadow: req.routing.shadow,
              }
            : undefined,
        },
      },
    },
  }
}
