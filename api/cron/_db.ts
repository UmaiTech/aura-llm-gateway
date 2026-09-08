/**
 * Postgres writer for the pricing scraper. Thin pg layer (no sqlx) that
 * implements the effective_from / effective_until versioning the issue
 * specifies, plus the scrape audit log.
 *
 * The pricing tables (providers, model_pricing, pricing_scrape_log) live
 * in the `public` schema — unlike api/_lib/auth.ts which pins
 * search_path to playground_auth. So this module owns its own Pool with
 * the default search_path.
 */

import { Pool } from 'pg'
import type { PoolClient } from 'pg'
import { CANONICAL_MODEL_ID_SQL } from './_normalize.js'
import type {
  PriceChange,
  ProviderId,
  ProviderResult,
  RowStatus,
  ScrapedPrice,
} from './_types.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for the pricing scraper.')
}

// Local dev uses `?sslmode=disable`; Fly Postgres requires TLS with a
// self-signed cert. Mirror api/_lib/auth.ts: TLS on unless explicitly
// disabled in the connection string.
const sslDisabled = /sslmode=disable/.test(databaseUrl)

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslDisabled ? undefined : { rejectUnauthorized: false },
  max: 4,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 15000,
})

/** Resolve provider name → uuid. Returns null if the provider row is absent. */
async function providerId(name: ProviderId): Promise<string | null> {
  const r = await pool.query<{ id: string }>(
    'SELECT id FROM providers WHERE name = $1',
    [name],
  )
  return r.rowCount ? r.rows[0].id : null
}

interface CurrentRow {
  id: string
  model_id: string
  input_per_million: number
  output_per_million: number
  cached_input_per_million: number | null
}

/**
 * Drop repeat `success` rows for the same model within one scrape. Pricing
 * pages often list a model more than once (standard vs long-context tier,
 * introductory vs next-year price); the first occurrence wins, and the
 * duplicates are reported as `unchanged` with a note rather than written —
 * writing both would version the row twice per run and flip-flop the price.
 */
export function dedupeScrapedRows(rows: ScrapedPrice[]): {
  rows: ScrapedPrice[]
  dropped: PriceChange[]
} {
  const seen = new Set<string>()
  const kept: ScrapedPrice[] = []
  const dropped: PriceChange[] = []
  for (const row of rows) {
    if (row.status !== 'success' || !seen.has(row.model_id)) {
      if (row.status === 'success') seen.add(row.model_id)
      kept.push(row)
      continue
    }
    dropped.push({
      model_id: row.model_id,
      kind: 'unchanged',
      note: 'duplicate row for this model on the pricing page; first occurrence kept',
      source_url: row.source_url,
      reasoning: row.reasoning,
    })
  }
  return { rows: kept, dropped }
}

/** A price is "changed" if input, output, or cached input moved. */
function pricesDiffer(cur: CurrentRow, next: ScrapedPrice): boolean {
  const num = (x: number | null | undefined) =>
    x === null || x === undefined ? null : Number(Number(x).toFixed(6))
  return (
    num(cur.input_per_million) !== num(next.input_per_million) ||
    num(cur.output_per_million) !== num(next.output_per_million) ||
    num(cur.cached_input_per_million) !== num(next.cached_input_per_million)
  )
}

/**
 * Apply one provider's scraped rows with versioning. Only `success` rows
 * are written; `needs_review` / `failed` rows are counted as flagged and
 * recorded in the diff but never touch model_pricing.
 *
 * dryRun=true computes the exact same diff but performs no writes.
 */
export async function persistProvider(
  provider: ProviderId,
  rows: ScrapedPrice[],
  dryRun: boolean,
): Promise<{
  upserted: number
  unchanged: number
  flagged: number
  changes: PriceChange[]
}> {
  const changes: PriceChange[] = []
  let upserted = 0
  let unchanged = 0
  let flagged = 0

  const pid = await providerId(provider)
  if (!pid) {
    throw new Error(`provider '${provider}' missing from providers table`)
  }

  const deduped = dedupeScrapedRows(rows)
  changes.push(...deduped.dropped)
  unchanged += deduped.dropped.length

  for (const row of deduped.rows) {
    if (row.status !== 'success') {
      flagged++
      changes.push({
        model_id: row.model_id,
        kind: 'flagged',
        note: row.failure_reason ?? row.status,
        source_url: row.source_url,
        reasoning: row.reasoning,
      })
      continue
    }

    // Match the open row by *canonical* id so a seed row keyed by the
    // provider's API id (`gpt-3.5-turbo`) is versioned in place instead of
    // gaining a `gpt-3-5-turbo` sibling. Newest first; any extra open rows
    // for the same model are legacy duplicates and get closed below.
    const curRes = await pool.query<CurrentRow>(
      `SELECT id, model_id, input_per_million::float8, output_per_million::float8,
              cached_input_per_million::float8
         FROM model_pricing
        WHERE provider_id = $1 AND effective_until IS NULL
          AND ${CANONICAL_MODEL_ID_SQL} = $2
        ORDER BY effective_from DESC, created_at DESC`,
      [pid, row.model_id],
    )
    const [current = null, ...stale] = curRes.rows
    if (stale.length && !dryRun) {
      await pool.query(
        `UPDATE model_pricing
            SET effective_until = NOW(), updated_at = NOW()
          WHERE id = ANY($1::uuid[])`,
        [stale.map((s) => s.id)],
      )
    }
    const staleNote = stale.length
      ? ` Closed ${stale.length} duplicate open row(s) for the same model.`
      : ''

    if (!current) {
      changes.push({
        model_id: row.model_id,
        kind: 'insert',
        before: null,
        after: {
          input_per_million: row.input_per_million,
          output_per_million: row.output_per_million,
          batch_input_per_million: row.batch_input_per_million,
          batch_output_per_million: row.batch_output_per_million,
        },
        source_url: row.source_url,
        reasoning: row.reasoning,
      })
      upserted++
      if (!dryRun) await insertRow(pool, pid, row)
      continue
    }

    if (!pricesDiffer(current, row)) {
      unchanged++
      changes.push({
        model_id: current.model_id,
        kind: 'unchanged',
        source_url: row.source_url,
        reasoning: row.reasoning,
        note: staleNote || undefined,
      })
      continue
    }

    // Price changed → close the old row and open a new one atomically. The
    // new row keeps the existing model_id (the id the gateway routes and
    // the CostCalculator seeds with), not the scraper's canonical slug.
    changes.push({
      model_id: current.model_id,
      kind: 'version',
      before: {
        input_per_million: current.input_per_million,
        output_per_million: current.output_per_million,
      },
      after: {
        input_per_million: row.input_per_million,
        output_per_million: row.output_per_million,
        batch_input_per_million: row.batch_input_per_million,
        batch_output_per_million: row.batch_output_per_million,
      },
      source_url: row.source_url,
      reasoning: row.reasoning,
      note: staleNote || undefined,
    })
    upserted++
    if (!dryRun) await versionRow(pool, pid, current, row)
  }

  return { upserted, unchanged, flagged, changes }
}

async function insertRow(
  p: Pool,
  providerUuid: string,
  row: ScrapedPrice,
): Promise<void> {
  await p.query(
    `INSERT INTO model_pricing
       (provider_id, model_id, model_name, input_per_million, output_per_million,
        cached_input_per_million, reasoning_per_million,
        batch_input_per_million, batch_output_per_million,
        context_window, max_output_tokens, capabilities, good_at,
        effective_from, effective_until)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, NOW(), NULL)`,
    [
      providerUuid,
      row.model_id,
      row.model_name,
      row.input_per_million,
      row.output_per_million,
      row.cached_input_per_million ?? null,
      row.reasoning_per_million ?? null,
      row.batch_input_per_million ?? null,
      row.batch_output_per_million ?? null,
      row.context_window ?? null,
      row.max_output_tokens ?? null,
      row.capabilities ?? null,
      row.good_at ?? null,
    ],
  )
}

/**
 * Close the current row and insert the new price, in one transaction. The
 * replacement row reuses `current.model_id` so the model keeps one stable id
 * across versions (see the canonical-id lookup in persistProvider).
 */
async function versionRow(
  p: Pool,
  providerUuid: string,
  current: CurrentRow,
  row: ScrapedPrice,
): Promise<void> {
  const client: PoolClient = await p.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      'UPDATE model_pricing SET effective_until = NOW(), updated_at = NOW() WHERE id = $1',
      [current.id],
    )
    await client.query(
      `INSERT INTO model_pricing
         (provider_id, model_id, model_name, input_per_million, output_per_million,
          cached_input_per_million, reasoning_per_million,
          batch_input_per_million, batch_output_per_million,
          context_window, max_output_tokens, capabilities, good_at,
          effective_from, effective_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, NOW(), NULL)`,
      [
        providerUuid,
        current.model_id,
        row.model_name,
        row.input_per_million,
        row.output_per_million,
        row.cached_input_per_million ?? null,
        row.reasoning_per_million ?? null,
        row.batch_input_per_million ?? null,
        row.batch_output_per_million ?? null,
        row.context_window ?? null,
        row.max_output_tokens ?? null,
        row.capabilities ?? null,
        row.good_at ?? null,
      ],
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** Append one provider's outcome to the audit log. Best-effort. */
export async function writeScrapeLog(
  runId: string,
  result: ProviderResult,
  dryRun: boolean,
): Promise<void> {
  await pool.query(
    `INSERT INTO pricing_scrape_log
       (run_id, provider, status, source_kind, source_url, models_found,
        models_upserted, models_unchanged, models_flagged, dry_run,
        error, duration_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      runId,
      result.provider,
      result.status,
      result.source_kind,
      result.source_url,
      result.models_found,
      result.models_upserted,
      result.models_unchanged,
      result.models_flagged,
      dryRun,
      result.error,
      result.duration_ms,
    ],
  )
}

/** Roll up a per-provider status from its outcome. */
export function rollupStatus(
  error: string | null,
  found: number,
  flagged: number,
): RowStatus {
  if (error) return 'failed'
  if (found === 0) return 'failed'
  if (flagged > 0) return 'needs_review'
  return 'success'
}

export { pool as pricingPool }
