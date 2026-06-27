/**
 * Per-provider scrape configuration for the weekly pricing cron.
 *
 * Each provider declares a `source` (see SourceKind in _types.ts) and the
 * inputs that source needs. Adding a provider = adding one entry here plus
 * a mapper in _normalize.ts.
 *
 * Why the source split is what it is — the "which provider has a pricing
 * API?" question from the issue, answered concretely:
 *
 *   provider    first-party pricing API?   how we get prices
 *   ---------   ------------------------   ---------------------------------
 *   openai      NO  (/v1/models = ids)     litellm feed  (firecrawl fallback)
 *   anthropic   NO  (/v1/models = ids)     litellm feed  (firecrawl fallback)
 *   google      NO  (models.list = limits) litellm feed  (firecrawl fallback)
 *   mistral     NO  (/v1/models = ids)     litellm feed  (firecrawl fallback)
 *   bedrock     YES (AWS Price List API)   litellm feed  (AWS API documented)
 *   huggingface NO  (per-endpoint, varies) litellm feed  (firecrawl fallback)
 *   ollama      N/A (local inference)      static 0.0 rows
 *
 * The LiteLLM JSON (BerriAI/litellm) is a community-maintained structured
 * feed covering every provider above; treating it as the primary source
 * means we are reading JSON, not parsing HTML, for six of seven providers.
 * Firecrawl stays wired up per the issue as the HTML fallback. Full matrix
 * and the AWS Price List query live in docs/internal/PRICING-SCRAPER.md.
 */

import { z } from 'zod'
import type { ProviderId, SourceKind } from './_types.js'

/** Canonical LiteLLM pricing feed (raw GitHub, no auth, ~weekly fresh). */
export const LITELLM_FEED_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

/**
 * Zod schema for a Firecrawl `extract` result. Firecrawl returns one
 * object shaped like this per page when given the schema; the per-provider
 * normalizer maps it onto ScrapedPrice. Kept deliberately loose (strings
 * coerced to numbers downstream) because pricing pages are messy.
 */
export const ZFirecrawlModel = z.object({
  model_name: z.string(),
  model_id: z.string().optional(),
  input_price_per_million: z.number().nullable().optional(),
  output_price_per_million: z.number().nullable().optional(),
  cached_input_price_per_million: z.number().nullable().optional(),
  context_window: z.number().nullable().optional(),
  max_output_tokens: z.number().nullable().optional(),
})
export const ZFirecrawlExtract = z.object({
  models: z.array(ZFirecrawlModel),
})
export type FirecrawlExtract = z.infer<typeof ZFirecrawlExtract>

export interface ProviderConfig {
  provider: ProviderId
  /** Human-facing name, matches providers.display_name. */
  displayName: string
  source: SourceKind
  /** Pricing page (firecrawl) or canonical reference (litellm/static). */
  url: string | null
  /**
   * For source==='litellm': the prefix(es) used to select this provider's
   * rows out of the flat LiteLLM map (keys look like 'gpt-5', 'claude-...',
   * 'gemini/...', 'mistral/...', 'bedrock/...', 'huggingface/...').
   */
  litellmPrefixes?: string[]
  /** For source==='firecrawl': the natural-language extraction prompt. */
  firecrawlPrompt?: string
}

/**
 * The 7-provider registry. Order is the order they are scraped (concurrent,
 * but this is the display order in the summary).
 */
export const PROVIDERS: ProviderConfig[] = [
  {
    provider: 'openai',
    displayName: 'OpenAI',
    source: 'litellm',
    url: 'https://platform.openai.com/docs/pricing',
    litellmPrefixes: ['gpt-', 'o1', 'o3', 'o4', 'chatgpt-'],
    firecrawlPrompt:
      'Extract every OpenAI model with its input, output and cached-input ' +
      'price per 1M tokens (USD), context window and max output tokens.',
  },
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    source: 'litellm',
    url: 'https://www.anthropic.com/pricing',
    litellmPrefixes: ['claude-'],
    firecrawlPrompt:
      'Extract every Claude model with input, output and prompt-caching ' +
      'price per 1M tokens (USD), context window and max output tokens.',
  },
  {
    provider: 'google',
    displayName: 'Google AI',
    source: 'litellm',
    url: 'https://ai.google.dev/pricing',
    litellmPrefixes: ['gemini/', 'gemini-'],
    firecrawlPrompt:
      'Extract every Gemini model with input and output price per 1M ' +
      'tokens (USD), context window and max output tokens.',
  },
  {
    provider: 'mistral',
    displayName: 'Mistral AI',
    source: 'litellm',
    url: 'https://mistral.ai/technology/#pricing',
    litellmPrefixes: ['mistral/'],
    firecrawlPrompt:
      'Extract every Mistral model with input and output price per 1M ' +
      'tokens (USD) and context window.',
  },
  {
    provider: 'bedrock',
    displayName: 'AWS Bedrock',
    source: 'litellm',
    // Bedrock is the one provider with a real pricing API (AWS Price List
    // Query API, service-code AmazonBedrock). We still prefer the LiteLLM
    // feed for uniformity; the AWS query is documented in the runbook.
    url: 'https://aws.amazon.com/bedrock/pricing/',
    litellmPrefixes: ['bedrock/'],
    firecrawlPrompt:
      'Extract on-demand Bedrock model pricing: input and output price per ' +
      '1M tokens (USD) for each foundation model.',
  },
  {
    provider: 'huggingface',
    displayName: 'Hugging Face',
    // HF has no unified pricing in the LiteLLM feed (pricing is per-
    // Inference-Endpoint and instance-based), so HTML scraping is the only
    // option. Requires FIRECRAWL_API_KEY; without it this provider reports
    // a clean isolated error rather than silently emitting nothing.
    source: 'firecrawl',
    url: 'https://huggingface.co/pricing',
    litellmPrefixes: ['huggingface/'],
    firecrawlPrompt:
      'Extract Hugging Face inference pricing per 1M tokens (USD) for hosted models.',
  },
  {
    provider: 'ollama',
    displayName: 'Ollama',
    // Local inference — no cloud pricing page exists. Emit a fixed zero row
    // so the model still appears in the table at $0.00 (issue: out of scope
    // to price local providers).
    source: 'static',
    url: null,
  },
]
