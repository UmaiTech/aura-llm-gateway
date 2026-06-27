/**
 * Source fetchers: turn a ProviderConfig into ScrapedPrice[].
 *
 * Two live sources plus one static:
 *   - LiteLLM JSON feed (fetched once, shared across all litellm providers).
 *   - Firecrawl `extract` (dynamic import; only when FIRECRAWL_API_KEY set).
 * Each is wrapped so a single provider's failure is isolated by the caller.
 */

import { LITELLM_FEED_URL, ZFirecrawlExtract } from './_providers.js'
import type { ProviderConfig } from './_providers.js'
import { normalizeFirecrawl, normalizeLiteLLM, staticOllama } from './_normalize.js'
import type { ScrapedPrice } from './_types.js'

/** Fetch + parse the LiteLLM pricing feed once per run. */
export async function fetchLiteLLMFeed(): Promise<Record<string, unknown>> {
  const res = await fetch(LITELLM_FEED_URL, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`litellm feed HTTP ${res.status}`)
  }
  const json = (await res.json()) as Record<string, unknown>
  if (!json || typeof json !== 'object') {
    throw new Error('litellm feed returned non-object JSON')
  }
  return json
}

/**
 * Firecrawl extract for one provider's HTML pricing page. Lazily imports
 * the SDK so the function still loads (and tsc still type-checks the rest)
 * when the dep or key is absent — the import only runs on the firecrawl
 * code path. Throws a clear error the caller records into errors[].
 */
async function scrapeWithFirecrawl(
  cfg: ProviderConfig,
): Promise<ScrapedPrice[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY not set; cannot scrape HTML source')
  }
  if (!cfg.url) {
    throw new Error('firecrawl source requires a url')
  }
  // Dynamic import keeps @mendable/firecrawl-js off the module-load path.
  const mod = (await import('@mendable/firecrawl-js')) as {
    default: new (opts: { apiKey: string }) => {
      extract: (args: {
        urls: string[]
        prompt?: string
        schema?: unknown
      }) => Promise<{ data?: unknown; success?: boolean; error?: string }>
    }
  }
  const Firecrawl = mod.default
  const client = new Firecrawl({ apiKey })
  const result = await client.extract({
    urls: [cfg.url],
    prompt: cfg.firecrawlPrompt,
    schema: ZFirecrawlExtract,
  })
  if (result.success === false) {
    throw new Error(`firecrawl extract failed: ${result.error ?? 'unknown'}`)
  }
  const parsed = ZFirecrawlExtract.safeParse(result.data)
  if (!parsed.success) {
    throw new Error(
      `firecrawl returned unexpected shape: ${parsed.error.message.slice(0, 160)}`,
    )
  }
  return normalizeFirecrawl(cfg, parsed.data.models)
}

/**
 * Resolve one provider to its scraped rows. `sharedFeed` is the already
 * fetched LiteLLM map (passed in so we fetch it once per run, not once per
 * provider). Throws on hard source failure; caller isolates per provider.
 */
export async function scrapeProvider(
  cfg: ProviderConfig,
  sharedFeed: Record<string, unknown> | null,
): Promise<ScrapedPrice[]> {
  switch (cfg.source) {
    case 'static':
      return staticOllama(cfg)
    case 'firecrawl':
      return scrapeWithFirecrawl(cfg)
    case 'litellm': {
      if (!sharedFeed) throw new Error('litellm feed unavailable')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = normalizeLiteLLM(cfg, sharedFeed as Record<string, any>)
      if (rows.length === 0) {
        // A paid provider returning zero rows means the feed changed shape
        // or the prefix no longer matches — a hard signal, not a no-op.
        throw new Error('litellm feed yielded zero models for this provider')
      }
      return rows
    }
    default:
      throw new Error(`unknown source kind: ${cfg.source as string}`)
  }
}
