/**
 * Per-provider scrape configuration for the weekly pricing cron.
 *
 * Each provider is scraped from *its own pricing website* via Firecrawl —
 * no third-party aggregator. The provider's published page is the
 * authoritative source. Ollama is local inference (no cloud price) and
 * emits a static $0.00 row.
 *
 * The set mirrors the providers the gateway actually routes to
 * (crates/aura-core/src/provider/*.rs): OpenAI, Anthropic, Google, Mistral,
 * Together AI (OSS-model host), AWS Bedrock, Hugging Face, Ollama.
 *
 * On the "does this provider expose a pricing API?" question: none of them
 * do — their `/models` endpoints return ids/limits, never prices. AWS
 * Bedrock is the lone exception via the generic AWS Price List Query API
 * (documented in docs/internal/pricing-scraper.md as a future swap). So we
 * scrape the HTML pricing pages they each publish.
 *
 * Adding a provider = one entry here + (if its page shape is unusual) a
 * tweak to the shared extract schema below.
 */

import { z } from 'zod'
import type { ProviderId, SourceKind } from './_types.js'

/**
 * Zod schema for a Firecrawl `extract` result. Firecrawl returns one
 * object shaped like this per page when given the schema; the normalizer
 * maps it onto ScrapedPrice. Kept deliberately loose — pricing pages are
 * messy and we'd rather flag a row `needs_review` than reject the page.
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
  /** The provider's own pricing page (firecrawl) or null (static). */
  url: string | null
  /** For source==='firecrawl': the natural-language extraction prompt. */
  firecrawlPrompt?: string
}

/** Shared instruction appended to every provider prompt for consistency. */
const COMMON_PROMPT =
  'Return a `models` array. For each chat/completion model give: model_name ' +
  '(display name), model_id (the API identifier if shown), ' +
  'input_price_per_million and output_price_per_million in USD per 1,000,000 ' +
  'tokens, cached_input_price_per_million if listed, and context_window and ' +
  'max_output_tokens if shown. Use numbers only — no "$" or "/1M". Skip ' +
  'embedding, image, audio, and fine-tuning rows. Only include models whose ' +
  'price is actually visible on the page; do not infer.'

/**
 * Provider registry. Each cloud provider scrapes its own pricing page;
 * Ollama is static. Order here is the display order in the summary.
 */
export const PROVIDERS: ProviderConfig[] = [
  {
    provider: 'openai',
    displayName: 'OpenAI',
    source: 'firecrawl',
    url: 'https://platform.openai.com/docs/pricing',
    firecrawlPrompt: `Extract OpenAI API model pricing. ${COMMON_PROMPT}`,
  },
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    source: 'firecrawl',
    url: 'https://www.anthropic.com/pricing',
    firecrawlPrompt: `Extract Claude API model pricing (input, output, and prompt-caching prices). ${COMMON_PROMPT}`,
  },
  {
    provider: 'google',
    displayName: 'Google AI',
    source: 'firecrawl',
    url: 'https://ai.google.dev/gemini-api/docs/pricing',
    firecrawlPrompt: `Extract Gemini API model pricing (use the paid-tier prices, not the free tier). ${COMMON_PROMPT}`,
  },
  {
    provider: 'mistral',
    displayName: 'Mistral AI',
    source: 'firecrawl',
    url: 'https://mistral.ai/pricing#api-pricing',
    firecrawlPrompt: `Extract Mistral API model pricing. ${COMMON_PROMPT}`,
  },
  {
    provider: 'together',
    displayName: 'Together AI',
    source: 'firecrawl',
    // OSS-model host: serverless per-token pricing for Llama, Qwen,
    // DeepSeek, Mixtral, etc.
    url: 'https://www.together.ai/pricing',
    firecrawlPrompt: `Extract Together AI serverless inference pricing for hosted open-source chat models (Llama, Qwen, DeepSeek, Mixtral, etc.). ${COMMON_PROMPT}`,
  },
  {
    provider: 'bedrock',
    displayName: 'AWS Bedrock',
    source: 'firecrawl',
    // Bedrock also has a real pricing API (AWS Price List Query API,
    // service-code AmazonBedrock) — documented in the runbook as a future
    // swap. For now we scrape the same pricing page as everyone else.
    url: 'https://aws.amazon.com/bedrock/pricing/',
    firecrawlPrompt: `Extract on-demand AWS Bedrock foundation-model pricing (input and output price per 1M tokens, on-demand throughput). ${COMMON_PROMPT}`,
  },
  {
    provider: 'huggingface',
    displayName: 'Hugging Face',
    source: 'firecrawl',
    url: 'https://huggingface.co/docs/inference-providers/pricing',
    firecrawlPrompt: `Extract Hugging Face Inference pricing per 1M tokens for hosted chat models. ${COMMON_PROMPT}`,
  },
  {
    provider: 'ollama',
    displayName: 'Ollama',
    // Local inference — no cloud pricing page exists. Emit a fixed zero row
    // so the model still appears in the table at $0.00.
    source: 'static',
    url: null,
  },
]
