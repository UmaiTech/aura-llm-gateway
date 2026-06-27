/**
 * Raw source → canonical ScrapedPrice mappers, plus the conservative
 * trust gate. Per the issue thread: only rows we are confident about get
 * `status: 'success'` and are eligible to be written. Anything ambiguous
 * (missing price, non-USD, zero models on a paid provider) is downgraded
 * to `needs_review` / `failed` and skipped by the writer.
 */

import type { ProviderConfig } from './_providers.js'
import type { ProviderId, ScrapedPrice, RowStatus } from './_types.js'

/** Shape of one entry in the LiteLLM model_prices JSON (the fields we use). */
interface LiteLLMEntry {
  litellm_provider?: string
  mode?: string
  input_cost_per_token?: number
  output_cost_per_token?: number
  cache_read_input_token_cost?: number
  max_input_tokens?: number
  max_tokens?: number
  max_output_tokens?: number
}

// LiteLLM tags Google models under several provider strings; accept any.
const GOOGLE_LITELLM_PROVIDERS = new Set([
  'gemini',
  'vertex_ai',
  'vertex_ai-language-models',
  'google',
])

const PER_TOKEN_TO_PER_MILLION = 1_000_000

/** A non-finite or negative price is never trustworthy. */
function cleanPrice(perToken: number | undefined): number | null {
  if (perToken === undefined || perToken === null) return null
  if (!Number.isFinite(perToken) || perToken < 0) return null
  return Number((perToken * PER_TOKEN_TO_PER_MILLION).toFixed(6))
}

function matchesProvider(
  cfg: ProviderConfig,
  key: string,
  entry: LiteLLMEntry,
): boolean {
  const lp = entry.litellm_provider ?? ''
  if (cfg.provider === 'google') {
    if (GOOGLE_LITELLM_PROVIDERS.has(lp)) return true
  } else if (lp === cfg.provider) {
    return true
  }
  // Fall back to key prefix matching (handles rows missing litellm_provider).
  return (cfg.litellmPrefixes ?? []).some((p) => key.startsWith(p))
}

/** Strip a leading `provider/` segment so model_id stays canonical. */
function canonicalModelId(provider: ProviderId, key: string): string {
  const slash = key.indexOf('/')
  if (slash === -1) return key
  const head = key.slice(0, slash)
  // Only strip when the head is the provider tag, e.g. 'gemini/gemini-...'
  // or 'bedrock/anthropic.claude-...'. Leave 'ft:gpt-4o:...' style intact.
  const tags = [provider, 'gemini', 'vertex_ai', 'bedrock', 'huggingface']
  return tags.includes(head) ? key.slice(slash + 1) : key
}

function prettyName(modelId: string): string {
  return modelId
    .replace(/^anthropic\./, '')
    .replace(/[-_/]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Map the full LiteLLM map down to this provider's chat models.
 * Rows with no usable input/output price are emitted as `needs_review`
 * so they surface in the log but are not written.
 */
export function normalizeLiteLLM(
  cfg: ProviderConfig,
  raw: Record<string, LiteLLMEntry>,
): ScrapedPrice[] {
  const out: ScrapedPrice[] = []
  for (const [key, entry] of Object.entries(raw)) {
    if (key === 'sample_spec') continue
    if (!entry || typeof entry !== 'object') continue
    if (!matchesProvider(cfg, key, entry)) continue
    // Only price chat/completion models; skip embeddings, rerank, tts, etc.
    if (entry.mode && entry.mode !== 'chat' && entry.mode !== 'responses') {
      continue
    }

    const input = cleanPrice(entry.input_cost_per_token)
    const output = cleanPrice(entry.output_cost_per_token)
    const cached = cleanPrice(entry.cache_read_input_token_cost)
    const modelId = canonicalModelId(cfg.provider, key)

    let status: RowStatus = 'success'
    let failure_reason: string | undefined
    if (input === null || output === null) {
      status = 'needs_review'
      failure_reason = 'missing input or output price in source feed'
    }

    out.push({
      provider: cfg.provider,
      model_id: modelId,
      model_name: prettyName(modelId),
      input_per_million: input ?? 0,
      output_per_million: output ?? 0,
      cached_input_per_million: cached ?? undefined,
      context_window: entry.max_input_tokens ?? entry.max_tokens ?? undefined,
      max_output_tokens: entry.max_output_tokens ?? undefined,
      currency: 'USD',
      source_url: cfg.url ?? 'litellm',
      evidence_text: `litellm:${key}`,
      status,
      failure_reason,
    })
  }
  return out
}

/** Firecrawl extract → ScrapedPrice. Same conservative gate. */
export function normalizeFirecrawl(
  cfg: ProviderConfig,
  models: Array<{
    model_name: string
    model_id?: string
    input_price_per_million?: number | null
    output_price_per_million?: number | null
    cached_input_price_per_million?: number | null
    context_window?: number | null
    max_output_tokens?: number | null
  }>,
): ScrapedPrice[] {
  return models.map((m) => {
    const modelId = (m.model_id ?? m.model_name).trim()
    const input = m.input_price_per_million
    const output = m.output_price_per_million
    let status: RowStatus = 'success'
    let failure_reason: string | undefined
    if (
      input === null ||
      input === undefined ||
      output === null ||
      output === undefined ||
      !Number.isFinite(input) ||
      !Number.isFinite(output) ||
      input < 0 ||
      output < 0
    ) {
      status = 'needs_review'
      failure_reason = 'price missing or non-numeric in scraped page'
    }
    if (!modelId) {
      status = 'failed'
      failure_reason = 'no model id on scraped row'
    }
    return {
      provider: cfg.provider,
      model_id: modelId,
      model_name: m.model_name?.trim() || prettyName(modelId),
      input_per_million: input ?? 0,
      output_per_million: output ?? 0,
      cached_input_per_million: m.cached_input_price_per_million ?? undefined,
      context_window: m.context_window ?? undefined,
      max_output_tokens: m.max_output_tokens ?? undefined,
      currency: 'USD',
      source_url: cfg.url ?? '',
      evidence_text: `firecrawl:${cfg.url ?? ''}`,
      status,
      failure_reason,
    }
  })
}

/** Ollama (and any local provider): a single fixed zero-cost row. */
export function staticOllama(cfg: ProviderConfig): ScrapedPrice[] {
  return [
    {
      provider: cfg.provider,
      model_id: 'ollama-local',
      model_name: 'Ollama (local inference)',
      input_per_million: 0,
      output_per_million: 0,
      currency: 'USD',
      source_url: 'static',
      evidence_text: 'local inference — no cloud pricing',
      status: 'success',
    },
  ]
}
