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
  // Discounted batch-API tier, where the page publishes one.
  batch_input_price_per_million: z.number().nullable().optional(),
  batch_output_price_per_million: z.number().nullable().optional(),
  context_window: z.number().nullable().optional(),
  max_output_tokens: z.number().nullable().optional(),
  // Inferred capability tags + a one-line "good at" summary. These are
  // the model's strengths, not page-sourced facts — see CAPABILITY_PROMPT.
  capabilities: z.array(z.string()).nullable().optional(),
  good_at: z.string().nullable().optional(),
})
export const ZFirecrawlExtract = z.object({
  models: z.array(ZFirecrawlModel),
})
export type FirecrawlExtract = z.infer<typeof ZFirecrawlExtract>

export interface ProviderConfig {
  provider: ProviderId
  /** Human-facing name, matches providers.display_name. */
  displayName: string
  /** One-line description shown under the provider title on /pricing. */
  description: string
  /** Link to the provider's models / docs page (shown on /pricing). */
  modelsUrl: string
  source: SourceKind
  /** The provider's own pricing page (firecrawl) or null (static). */
  url: string | null
  /** For source==='firecrawl': the natural-language extraction prompt. */
  firecrawlPrompt?: string
  /**
   * Optional secondary "catalog" page that lists MORE models than the
   * pricing page (e.g. Bedrock's model-cards page covers ~116 models across
   * 18 underlying providers; the pricing page lists far fewer). Catalog
   * models are merged in by name; those without a price from the pricing
   * page are surfaced as needs_review "price n/a" rows (visible, not
   * written). Only used when set.
   */
  catalogUrl?: string
  catalogPrompt?: string
  /**
   * Per-provider Firecrawl scrape overrides. Defaults are fine for most
   * pages; heavy/JS-rendered pages (Google, Bedrock) need a longer timeout
   * and a render wait or they time out at the 60s default.
   */
  firecrawlOptions?: {
    /** Scrape timeout in ms (Firecrawl default ~60000). */
    timeout?: number
    /** Extra ms to wait for client-side rendering before extracting. */
    waitFor?: number
  }
}

/**
 * Allowed capability tags. Constrained to a fixed vocabulary so the tags
 * are consistent across providers and usable as UI filters later.
 */
export const CAPABILITY_TAGS = [
  'reasoning',
  'tool-calling',
  'long-context',
  'agentic',
  'coding',
  'vision',
  'multimodal',
  'fast',
  'cost-efficient',
  'domain-specialized',
] as const

/**
 * Capability-enrichment instruction. NB: unlike prices (which must be
 * page-sourced), these are the extractor's inference about each model's
 * strengths from its general knowledge — they are best-effort hints for
 * the UI, not authoritative facts. Kept to a fixed tag vocabulary.
 */
const CAPABILITY_PROMPT =
  'Additionally, for each model infer a `capabilities` array using ONLY ' +
  'these tags where they genuinely apply: ' +
  CAPABILITY_TAGS.join(', ') +
  '. Also give a `good_at` one-sentence (max ~12 words) summary of what the ' +
  'model is best used for (e.g. "Agentic coding and long-context reasoning"). ' +
  'These describe the model\'s strengths from general knowledge — omit ' +
  'either field if you are not reasonably confident.'

/** Shared instruction appended to every provider prompt for consistency. */
const COMMON_PROMPT =
  'Return a `models` array. For each chat/completion model give: model_name ' +
  '(display name), model_id (the API identifier if shown), ' +
  'input_price_per_million and output_price_per_million in USD per 1,000,000 ' +
  'tokens, cached_input_price_per_million if listed, and (whenever the page ' +
  'or a linked model spec shows them) the context_window and ' +
  'max_output_tokens as integer token counts. If the page also lists a ' +
  'discounted BATCH-API ' +
  'tier, give batch_input_price_per_million and batch_output_price_per_million ' +
  'too (omit if no batch tier is shown). ' +
  'IMPORTANT — units: report the price PER 1,000,000 (1M) TOKENS exactly as ' +
  'the page states it. Most pages already quote per-1M — if so, copy the ' +
  'number verbatim, do NOT multiply it. Only when the page explicitly labels ' +
  'a column "per 1K tokens" / "per 1,000 tokens" should you convert (×1000). ' +
  'When unsure, copy the number as shown rather than guessing a conversion. ' +
  'Use numbers only — no "$" or "/1M". Skip embedding, image, audio, video, ' +
  'and fine-tuning rows. Only include models whose per-token price is ' +
  'actually visible in a pricing table on the page; do NOT infer prices from ' +
  'prose, examples, or GPU/hourly rates. ' +
  CAPABILITY_PROMPT

/**
 * Provider registry. Each cloud provider scrapes its own pricing page;
 * Ollama is static. Order here is the display order in the summary.
 */
export const PROVIDERS: ProviderConfig[] = [
  {
    provider: 'openai',
    displayName: 'OpenAI',
    description: 'GPT and o-series models — frontier reasoning and chat.',
    modelsUrl: 'https://platform.openai.com/docs/models',
    source: 'firecrawl',
    url: 'https://platform.openai.com/docs/pricing',
    firecrawlPrompt: `Extract OpenAI API model pricing. ${COMMON_PROMPT}`,
  },
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    description: 'Claude models — strong reasoning, long context, tool use.',
    modelsUrl: 'https://docs.claude.com/en/docs/about-claude/models',
    source: 'firecrawl',
    url: 'https://www.anthropic.com/pricing',
    firecrawlPrompt: `Extract Claude API model pricing (input, output, and prompt-caching prices). ${COMMON_PROMPT}`,
  },
  {
    provider: 'google',
    displayName: 'Google AI',
    description: 'Gemini models — multimodal, large context windows.',
    modelsUrl: 'https://ai.google.dev/gemini-api/docs/models',
    source: 'firecrawl',
    url: 'https://ai.google.dev/gemini-api/docs/pricing',
    firecrawlPrompt: `Extract Gemini API model pricing (use the paid-tier prices, not the free tier). ${COMMON_PROMPT}`,
    // JS-heavy docs page — times out at the 60s default; give it room + a
    // render wait.
    firecrawlOptions: { timeout: 120000, waitFor: 4000 },
  },
  {
    provider: 'mistral',
    displayName: 'Mistral AI',
    description: 'Mistral and Magistral models — efficient open-weight chat.',
    modelsUrl: 'https://docs.mistral.ai/getting-started/models/models_overview/',
    source: 'firecrawl',
    url: 'https://mistral.ai/pricing#api-pricing',
    firecrawlPrompt: `Extract Mistral API model pricing. ${COMMON_PROMPT}`,
  },
  {
    provider: 'together',
    displayName: 'Together AI',
    description: 'Serverless inference for open-source models (Llama, Qwen, DeepSeek).',
    modelsUrl: 'https://www.together.ai/models',
    source: 'firecrawl',
    // OSS-model host: serverless per-token pricing for Llama, Qwen,
    // DeepSeek, Mixtral, etc.
    url: 'https://www.together.ai/pricing',
    firecrawlPrompt: `Extract Together AI serverless inference pricing for hosted open-source chat models (Llama, Qwen, DeepSeek, Mixtral, etc.). ${COMMON_PROMPT}`,
  },
  {
    provider: 'fireworks',
    displayName: 'Fireworks AI',
    description: 'Fast serverless inference for open-source models (Llama, Qwen, DeepSeek, Mixtral).',
    modelsUrl: 'https://fireworks.ai/models',
    source: 'firecrawl',
    url: 'https://fireworks.ai/pricing',
    firecrawlPrompt: `Extract Fireworks AI serverless inference pricing for hosted open-source chat/LLM models (Llama, Qwen, DeepSeek, Mixtral, etc.). Prices are per 1M tokens. ${COMMON_PROMPT}`,
    // Fireworks pricing page is JS-rendered; give it room.
    firecrawlOptions: { timeout: 90000, waitFor: 3000 },
  },
  {
    provider: 'bedrock',
    displayName: 'AWS Bedrock',
    description: 'Managed access to foundation models from many providers on AWS.',
    modelsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html',
    source: 'firecrawl',
    // Bedrock also has a real pricing API (AWS Price List Query API,
    // service-code AmazonBedrock) — documented in the runbook as a future
    // swap. For now we scrape the same pricing page as everyone else.
    url: 'https://aws.amazon.com/bedrock/pricing/',
    // The Bedrock page groups models by provider; without an explicit
    // instruction to always fill model_name, Firecrawl returns rows with
    // empty ids that all get flagged. Be specific.
    firecrawlPrompt:
      'Extract AWS Bedrock on-demand foundation-model token pricing. The ' +
      'page groups models by provider (Anthropic, Meta, Amazon, Mistral, ' +
      'Cohere, AI21, DeepSeek, etc.). For EACH chat/text model, ALWAYS set ' +
      'model_name to the full human model name exactly as shown (e.g. ' +
      '"Claude 3.5 Sonnet", "Llama 3.1 70B Instruct", "Amazon Nova Pro") — ' +
      'never leave it blank. Give input_price_per_million and ' +
      'output_price_per_million in USD per 1,000,000 tokens (on-demand). ' +
      'Numbers only — no "$" or "/1M". Skip image, embedding, and video rows.',
    // Fuller catalog: the pricing page lists only a subset; model-cards
    // covers ~116 models across 18 underlying providers. We merge them in
    // (price n/a where the pricing page has no price for a model).
    catalogUrl:
      'https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html',
    catalogPrompt:
      'Extract every foundation model available on AWS Bedrock. For each ' +
      'give model_name (full name, e.g. "Claude Sonnet 4.5", "Command R+", ' +
      '"Jamba 1.5 Large") and put the underlying company in model_id as a ' +
      'slug prefix is not needed — just return model_name. Include ALL ' +
      'providers (Anthropic, Meta, Amazon, Cohere, AI21, Mistral, Stability ' +
      'AI, Writer, DeepSeek, xAI, Qwen, etc.) and every model listed. Do not ' +
      'invent prices.',
    // Large multi-section page; needs more than the 60s default.
    firecrawlOptions: { timeout: 90000 },
  },
  {
    provider: 'huggingface',
    displayName: 'Hugging Face',
    description: 'Inference Providers — routed access to community-hosted models.',
    modelsUrl: 'https://huggingface.co/models?inference=warm',
    source: 'firecrawl',
    url: 'https://huggingface.co/docs/inference-providers/pricing',
    firecrawlPrompt: `Extract Hugging Face Inference pricing per 1M tokens for hosted chat models. ${COMMON_PROMPT}`,
  },
  {
    provider: 'ollama',
    displayName: 'Ollama',
    description: 'Local inference — run open models on your own hardware, $0 per token.',
    modelsUrl: 'https://ollama.com/library',
    // Local inference — no cloud pricing page exists. Emit a fixed zero row
    // so the model still appears in the table at $0.00.
    source: 'static',
    url: null,
  },
]
