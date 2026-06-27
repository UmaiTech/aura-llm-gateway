/**
 * Source fetchers: turn a ProviderConfig into ScrapedPrice[].
 *
 * Every cloud provider is scraped from its own pricing page via Firecrawl
 * `extract`; Ollama is static. Each call is wrapped so a single provider's
 * failure is isolated by the caller.
 */

import { ZFirecrawlExtract } from './_providers.js'
import type { ProviderConfig } from './_providers.js'
import { normalizeFirecrawl, staticOllama } from './_normalize.js'
import type { ScrapedPrice } from './_types.js'

/**
 * Firecrawl extract for one provider's HTML pricing page. Lazily imports
 * the SDK so the function still loads (and tsc still type-checks the rest)
 * when the dep or key is absent — the import only runs on this code path.
 * Throws a clear error the caller records into errors[].
 */
async function scrapeWithFirecrawl(
  cfg: ProviderConfig,
): Promise<ScrapedPrice[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY not set; cannot scrape pricing page')
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
  const rows = normalizeFirecrawl(cfg, parsed.data.models)
  if (rows.length === 0) {
    // A paid provider's page yielding zero models means it changed shape or
    // moved — a hard signal, not a quiet no-op.
    throw new Error('scrape yielded zero models for this provider')
  }
  return rows
}

/**
 * Resolve one provider to its scraped rows. Throws on hard source failure;
 * the caller isolates failures per provider.
 */
export async function scrapeProvider(
  cfg: ProviderConfig,
): Promise<ScrapedPrice[]> {
  switch (cfg.source) {
    case 'static':
      return staticOllama(cfg)
    case 'firecrawl':
      return scrapeWithFirecrawl(cfg)
    default:
      throw new Error(`unknown source kind: ${cfg.source as string}`)
  }
}
