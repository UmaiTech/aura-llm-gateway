/**
 * Weekly pricing scraper — Vercel Cron entry point (issue #123).
 *
 *   GET|POST /api/cron/scrape-pricing            → scrape + version into DB
 *   GET|POST /api/cron/scrape-pricing?dry_run=1  → scrape, return diff, no writes
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Vercel sets this
 * header automatically on cron invocations when CRON_SECRET is configured;
 * manual re-runs send the same bearer. Anything else gets 401.
 *
 * Scheduled Mondays 06:00 UTC via the `crons` block in vercel.json.
 *
 * Design stance (from the issue thread): bad pricing data is worse than
 * stale pricing data. Each provider is scraped independently; one failure
 * never aborts the others; only rows we trust (`status: success`) are ever
 * written; everything else is flagged into pricing_scrape_log for review.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { PROVIDERS } from './_providers.js'
import { scrapeProvider } from './_sources.js'
import {
  persistProvider,
  writeScrapeLog,
  rollupStatus,
} from './_db.js'
import type {
  ProviderResult,
  ScrapeSummary,
} from './_types.js'

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed' })
  }
  if (!isAuthorized(req)) {
    return json(res, 401, {
      error: 'unauthorized',
      message: 'Valid Authorization: Bearer ${CRON_SECRET} required.',
    })
  }

  const url = new URL(req.url ?? '/', 'http://localhost')
  const dryRun = url.searchParams.get('dry_run') === '1'
  const runId = globalThis.crypto.randomUUID()

  // Scrape every provider's own pricing page concurrently; isolate
  // failures so one broken page never aborts the others.
  const results = await Promise.all(
    PROVIDERS.map((cfg) => runProvider(cfg, dryRun, runId)),
  )

  const summary: ScrapeSummary = {
    ok: results.every((r) => r.status !== 'failed'),
    run_id: runId,
    dry_run: dryRun,
    providers_scraped: results.filter((r) => r.status !== 'failed').length,
    models_upserted: results.reduce((a, r) => a + r.models_upserted, 0),
    models_unchanged: results.reduce((a, r) => a + r.models_unchanged, 0),
    models_flagged: results.reduce((a, r) => a + r.models_flagged, 0),
    errors: results
      .filter((r) => r.error)
      .map((r) => ({ provider: r.provider, error: r.error as string })),
    providers: results,
  }

  return json(res, 200, summary)
}

async function runProvider(
  cfg: (typeof PROVIDERS)[number],
  dryRun: boolean,
  runId: string,
): Promise<ProviderResult> {
  const startedAt = perfNow()
  let error: string | null = null
  let found = 0
  let upserted = 0
  let unchanged = 0
  let flagged = 0
  let changes: ProviderResult['changes'] = []

  try {
    const rows = await scrapeProvider(cfg)
    found = rows.length
    const applied = await persistProvider(cfg.provider, rows, dryRun)
    upserted = applied.upserted
    unchanged = applied.unchanged
    flagged = applied.flagged
    changes = applied.changes
  } catch (err) {
    error = errMsg(err)
  }

  const result: ProviderResult = {
    provider: cfg.provider,
    source_kind: cfg.source,
    source_url: cfg.url,
    status: rollupStatus(error, found, flagged),
    models_found: found,
    models_upserted: upserted,
    models_unchanged: unchanged,
    models_flagged: flagged,
    error,
    duration_ms: Math.round(perfNow() - startedAt),
    changes,
  }

  // Audit log is best-effort: never let a logging failure fail the run.
  try {
    await writeScrapeLog(runId, result, dryRun)
  } catch (logErr) {
    console.error('[scrape-pricing] log write failed:', errMsg(logErr))
  }

  return result
}

/**
 * Constant-time-ish bearer check against CRON_SECRET. If CRON_SECRET is
 * unset we fail closed (401) rather than allowing unauthenticated scrapes.
 */
function isAuthorized(req: IncomingMessage): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers['authorization']
  if (typeof header !== 'string') return false
  const expected = `Bearer ${secret}`
  if (header.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}

function perfNow(): number {
  return globalThis.performance?.now?.() ?? 0
}

function errMsg(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300)
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}
