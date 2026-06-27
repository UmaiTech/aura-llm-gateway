/**
 * Public pricing API — read side of the scraper (issue #123).
 *
 *   GET /api/pricing  → {
 *     updated_at,                       // most recent scrape run time
 *     providers: [{ name, display_name, models: [...] }],
 *     last_run: { run_id, at, providers: [{ provider, status, ... }] } | null
 *   }
 *
 * Serves the current (`effective_until IS NULL`) rows of model_pricing so
 * the public pricing webapp (apps/landing /pricing) and any external
 * consumer can read live prices without DB access. Read-only, unauthenticated,
 * CORS-open — it only exposes published list prices.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { pricingPool } from '../cron/_db.js'
import { PROVIDERS } from '../cron/_providers.js'

/** provider name → { description, models_url } from the scraper config. */
const PROVIDER_META = new Map(
  PROVIDERS.map((p) => [
    p.provider as string,
    { description: p.description, models_url: p.modelsUrl },
  ]),
)

interface PriceRow {
  provider: string
  display_name: string
  model_id: string
  model_name: string
  input_per_million: number
  output_per_million: number
  cached_input_per_million: number | null
  batch_input_per_million: number | null
  batch_output_per_million: number | null
  context_window: number | null
  max_output_tokens: number | null
  capabilities: string[] | null
  good_at: string | null
  effective_from: Date
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'method_not_allowed' })
  }

  try {
    const rows = await fetchCurrentPrices()
    const lastRun = await fetchLastRun()

    // Group by provider, preserving a stable provider order.
    const byProvider = new Map<
      string,
      {
        name: string
        display_name: string
        description: string | null
        models_url: string | null
        models: unknown[]
      }
    >()
    let newest: Date | null = null
    for (const r of rows) {
      if (!byProvider.has(r.provider)) {
        const meta = PROVIDER_META.get(r.provider)
        byProvider.set(r.provider, {
          name: r.provider,
          display_name: r.display_name,
          description: meta?.description ?? null,
          models_url: meta?.models_url ?? null,
          models: [],
        })
      }
      byProvider.get(r.provider)!.models.push({
        model_id: r.model_id,
        model_name: r.model_name,
        input_per_million: r.input_per_million,
        output_per_million: r.output_per_million,
        cached_input_per_million: r.cached_input_per_million,
        batch_input_per_million: r.batch_input_per_million,
        batch_output_per_million: r.batch_output_per_million,
        context_window: r.context_window,
        max_output_tokens: r.max_output_tokens,
        capabilities: r.capabilities,
        good_at: r.good_at,
        effective_from: r.effective_from.toISOString(),
      })
      if (!newest || r.effective_from > newest) newest = r.effective_from
    }

    // Cache at the edge for an hour — prices change weekly at most.
    res.setHeader(
      'cache-control',
      'public, s-maxage=3600, stale-while-revalidate=86400',
    )
    return json(res, 200, {
      updated_at: lastRun?.at ?? newest?.toISOString() ?? null,
      providers: [...byProvider.values()],
      last_run: lastRun,
    })
  } catch (err) {
    console.error('[pricing] handler crashed:', err)
    return json(res, 500, {
      error: 'pricing_error',
      message: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    })
  }
}

async function fetchCurrentPrices(): Promise<PriceRow[]> {
  const result = await pricingPool.query<PriceRow>(
    `SELECT p.name AS provider, p.display_name,
            mp.model_id, mp.model_name,
            mp.input_per_million::float8,
            mp.output_per_million::float8,
            mp.cached_input_per_million::float8,
            mp.batch_input_per_million::float8,
            mp.batch_output_per_million::float8,
            mp.context_window, mp.max_output_tokens,
            mp.capabilities, mp.good_at,
            mp.effective_from
       FROM model_pricing mp
       JOIN providers p ON p.id = mp.provider_id
      WHERE mp.is_enabled = true
        AND p.is_enabled = true
        AND mp.effective_until IS NULL
      ORDER BY p.display_name, mp.input_per_million`,
  )
  return result.rows
}

interface LastRun {
  run_id: string
  at: string
  providers: {
    provider: string
    status: string
    models_upserted: number
    models_unchanged: number
    models_flagged: number
    error: string | null
  }[]
}

/** Most recent non-dry-run scrape and its per-provider outcomes. */
async function fetchLastRun(): Promise<LastRun | null> {
  const latest = await pricingPool.query<{ run_id: string; created_at: Date }>(
    `SELECT run_id, MAX(created_at) AS created_at
       FROM pricing_scrape_log
      WHERE dry_run = false
      GROUP BY run_id
      ORDER BY MAX(created_at) DESC
      LIMIT 1`,
  )
  if (!latest.rowCount) return null
  const runId = latest.rows[0].run_id
  const detail = await pricingPool.query(
    `SELECT provider, status, models_upserted, models_unchanged,
            models_flagged, error
       FROM pricing_scrape_log
      WHERE run_id = $1
      ORDER BY provider`,
    [runId],
  )
  return {
    run_id: runId,
    at: latest.rows[0].created_at.toISOString(),
    providers: detail.rows as LastRun['providers'],
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}
