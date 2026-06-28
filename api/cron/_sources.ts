/**
 * Source fetchers: turn a ProviderConfig into ScrapedPrice[].
 *
 * Every cloud provider is scraped from its own pricing page via Firecrawl
 * `scrape` with a structured `json` format; Ollama is static. Each call is
 * wrapped so a single provider's failure is isolated by the caller.
 *
 * NB: this uses the v2 scrape+json path (firecrawl SDK v4), NOT the legacy
 * `extract` endpoint — extract is in maintenance mode and the v1 SDK's
 * async /v1/extract flow returns 400 against the current API.
 */

import { ZFirecrawlExtract } from './_providers.js'
import type { ProviderConfig } from './_providers.js'
import {
  canonicalModelId,
  catalogOnlyRow,
  normalizeFirecrawl,
  staticOllama,
} from './_normalize.js'
import type { ScrapedPrice } from './_types.js'

interface FirecrawlClient {
  scrape: (
    url: string,
    options: {
      formats: Array<{ type: 'json'; prompt?: string; schema?: unknown }>
      onlyMainContent?: boolean
      timeout?: number
      waitFor?: number
      maxAge?: number
    },
  ) => Promise<{ json?: unknown }>
}

// Serve a Firecrawl-cached render up to 24h old instead of re-rendering the
// page live. Prices change weekly at most, so a day-old cache is fine — and
// it avoids the live-render timeouts that broke heavy pages (Fireworks, HF)
// in prod, while being faster and cheaper for every provider.
const SCRAPE_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Lazily construct a Firecrawl v4 client (keeps the SDK off module load). */
async function firecrawlClient(apiKey: string): Promise<FirecrawlClient> {
  const mod = (await import('@mendable/firecrawl-js')) as {
    Firecrawl: new (opts: { apiKey: string }) => FirecrawlClient
  }
  return new mod.Firecrawl({ apiKey })
}

/** One scrape+json call → validated model array. Throws on bad shape. */
async function firecrawlExtract(
  client: FirecrawlClient,
  url: string,
  prompt: string | undefined,
  cfg: ProviderConfig,
): Promise<FirecrawlModel[]> {
  const result = await client.scrape(url, {
    formats: [{ type: 'json', prompt, schema: ZFirecrawlExtract }],
    onlyMainContent: true,
    maxAge: SCRAPE_MAX_AGE_MS,
    ...(cfg.firecrawlOptions?.timeout
      ? { timeout: cfg.firecrawlOptions.timeout }
      : {}),
    ...(cfg.firecrawlOptions?.waitFor
      ? { waitFor: cfg.firecrawlOptions.waitFor }
      : {}),
  })
  const parsed = ZFirecrawlExtract.safeParse(result.json)
  if (!parsed.success) {
    throw new Error(
      `firecrawl returned unexpected shape: ${parsed.error.message.slice(0, 160)}`,
    )
  }
  return parsed.data.models
}

type FirecrawlModel = ReturnType<
  typeof ZFirecrawlExtract.parse
>['models'][number]

/**
 * Firecrawl scrape (json format) for one provider's HTML pricing page.
 * When the provider also has a catalogUrl (e.g. Bedrock's model-cards),
 * scrape that too and merge: catalog models with no price from the pricing
 * page are added as needs_review "price n/a" rows (visible, never written).
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
  const client = await firecrawlClient(apiKey)

  // Pricing page (authoritative for prices) — scrape both pages
  // concurrently when a catalog exists.
  const [priceModels, catalogModels] = await Promise.all([
    firecrawlExtract(client, cfg.url, cfg.firecrawlPrompt, cfg),
    cfg.catalogUrl
      ? firecrawlExtract(client, cfg.catalogUrl, cfg.catalogPrompt, cfg).catch(
          // Catalog is supplementary: its failure must not sink the prices.
          (err) => {
            console.error(
              `[scrape-pricing]   (catalog scrape failed for ${cfg.provider}: ${
                err instanceof Error ? err.message : String(err)
              })`,
            )
            return [] as FirecrawlModel[]
          },
        )
      : Promise.resolve([] as FirecrawlModel[]),
  ])

  const rows = normalizeFirecrawl(cfg, priceModels)
  if (rows.length === 0) {
    // A paid provider's page yielding zero models means it changed shape or
    // moved — a hard signal, not a quiet no-op.
    throw new Error('scrape yielded zero models for this provider')
  }

  // Merge in catalog-only models (those the pricing page didn't list).
  if (catalogModels.length) {
    const priced = new Set(rows.map((r) => r.model_id))
    for (const cm of catalogModels) {
      const id = canonicalModelId((cm.model_id ?? cm.model_name ?? '').trim())
      if (!id || priced.has(id)) continue
      priced.add(id)
      rows.push(catalogOnlyRow(cfg, cm.model_name, id))
    }
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
