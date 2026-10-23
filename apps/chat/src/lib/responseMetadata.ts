/**
 * Read what the gateway reports on a completed response: id, the model
 * that actually answered, usage and the `metadata.aura` enrichment
 * (provider, latency, strategy outcomes and the auto-routing decision).
 *
 * Shared by the standard and agent send paths in App.tsx. Pure and
 * dependency-free so it is unit-tested (responseMetadata.test.ts); the
 * list-price cost fallback is passed in.
 */
import type {
  AuraMetadata,
  CompressionMetadata,
  ConsistencyMetadataResponse,
  MessageUsage,
  RoutingDecisionMetadata,
  ValidationMetadataResponse,
} from './types.ts'

interface RawAura {
  provider?: string
  gateway_version?: string
  latency_ms?: number
  request_id?: string
  compression?: CompressionMetadata
  consistency?: ConsistencyMetadataResponse
  validation?: ValidationMetadataResponse
  routing_strategy?: string
  routing?: RoutingDecisionMetadata
}

interface RawResponse {
  id?: unknown
  model?: unknown
  usage?: {
    input_tokens?: unknown
    output_tokens?: unknown
    cached_tokens?: unknown
    cost_usd?: unknown
  }
  metadata?: { aura?: RawAura } | null
}

export interface CompletedResponse {
  responseId?: string
  /** The model that answered (response `model`); may differ from the request. */
  model?: string
  usage?: MessageUsage
  aura?: AuraMetadata
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** True when `metadata.aura.routing` looks like an auto-router decision. */
function isRoutingDecision(v: unknown): v is RoutingDecisionMetadata {
  if (!v || typeof v !== 'object') return false
  const d = v as Record<string, unknown>
  return typeof d.selected === 'string' && typeof d.tier === 'string' && typeof d.shadow === 'boolean'
}

export function parseCompletedResponse(
  response: unknown,
  fallbackCost: (inputTokens: number, outputTokens: number) => number | undefined,
): CompletedResponse {
  if (!response || typeof response !== 'object') return {}
  const r = response as RawResponse
  const out: CompletedResponse = {}

  if (typeof r.id === 'string') out.responseId = r.id
  if (typeof r.model === 'string' && r.model) out.model = r.model

  const u = r.usage
  if (u && isNum(u.input_tokens) && isNum(u.output_tokens)) {
    out.usage = {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      totalTokens: u.input_tokens + u.output_tokens,
      cachedTokens: isNum(u.cached_tokens) ? u.cached_tokens : undefined,
      // The gateway prices the model that actually answered; the local
      // list-price estimate is only a fallback for gateways that don't.
      cost: isNum(u.cost_usd) ? u.cost_usd : fallbackCost(u.input_tokens, u.output_tokens),
    }
  }

  const a = r.metadata?.aura
  if (a && typeof a === 'object') {
    out.aura = {
      provider: a.provider || 'unknown',
      gatewayVersion: a.gateway_version || '',
      latencyMs: a.latency_ms,
      requestId: a.request_id,
      compression: a.compression,
      consistency: a.consistency,
      validation: a.validation,
      routingStrategy: a.routing_strategy,
      routing: isRoutingDecision(a.routing) ? a.routing : undefined,
    }
  }

  return out
}
