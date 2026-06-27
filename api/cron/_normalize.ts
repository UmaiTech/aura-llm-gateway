/**
 * Raw scrape → canonical ScrapedPrice mappers, plus the conservative trust
 * gate. Per the issue thread: only rows we are confident about get
 * `status: 'success'` and are eligible to be written. Anything ambiguous
 * (missing price, non-numeric, no model id) is downgraded to
 * `needs_review` / `failed` and skipped by the writer.
 */

import type { ProviderConfig } from './_providers.js'
import type { ScrapedPrice, RowStatus } from './_types.js'

/** Title-case a raw model id for display when no name was scraped. */
function prettyName(modelId: string): string {
  return modelId
    .replace(/^anthropic\./, '')
    .replace(/[-_/]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function isUsablePrice(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0
}

/**
 * Firecrawl extract → ScrapedPrice. Each row passes through the trust gate:
 * a missing/non-numeric price → needs_review; a missing id → failed. Such
 * rows are reported in the diff and log but never written to model_pricing.
 */
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
    const modelId = (m.model_id ?? m.model_name ?? '').trim()
    const input = m.input_price_per_million
    const output = m.output_price_per_million

    let status: RowStatus = 'success'
    let failure_reason: string | undefined
    if (!modelId) {
      status = 'failed'
      failure_reason = 'no model id on scraped row'
    } else if (!isUsablePrice(input) || !isUsablePrice(output)) {
      status = 'needs_review'
      failure_reason = 'price missing or non-numeric on the scraped page'
    }

    return {
      provider: cfg.provider,
      model_id: modelId,
      model_name: m.model_name?.trim() || prettyName(modelId),
      input_per_million: isUsablePrice(input) ? Number(input.toFixed(6)) : 0,
      output_per_million: isUsablePrice(output) ? Number(output.toFixed(6)) : 0,
      cached_input_per_million: isUsablePrice(m.cached_input_price_per_million)
        ? Number(m.cached_input_price_per_million.toFixed(6))
        : undefined,
      context_window: m.context_window ?? undefined,
      max_output_tokens: m.max_output_tokens ?? undefined,
      currency: 'USD',
      source_url: cfg.url ?? '',
      evidence_text: `${cfg.provider}:${cfg.url ?? ''}`,
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
