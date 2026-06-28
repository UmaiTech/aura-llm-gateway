/**
 * FX rate fetcher for local-currency pricing (issue #123 follow-up).
 *
 * Pulls the latest exchange-rate observations from the Sveriges Riksbank
 * SWEA API and upserts them into exchange_rates. Each value is "SEK per 1
 * unit of <currency>" (the SEK<CUR>PMI series). SEK itself is stored as 1.0.
 *
 * The frontend converts a USD price to a target currency T with:
 *   price_T = price_usd * sek_per_unit['USD'] / sek_per_unit[T]
 *
 * Riksbank rates are indicative only (not transactional) and update on
 * Swedish bank days — fine for approximate local-price display. No API key.
 */

import { pricingPool } from './_db.js'

const RIKSBANK_BASE = 'https://api.riksbank.se/swea/v1'

/** Currencies we surface, mapped to their Riksbank SEK-pair series id. */
const SERIES: Record<string, string> = {
  USD: 'SEKUSDPMI',
  EUR: 'SEKEURPMI',
  GBP: 'SEKGBPPMI',
  NOK: 'SEKNOKPMI',
  DKK: 'SEKDKKPMI',
}

interface RiksbankObservation {
  date: string
  value: number
}

export interface FxResult {
  ok: boolean
  updated: string[]
  errors: { currency: string; error: string }[]
}

/** Fetch one series' latest observation. Throws on non-200 / bad shape. */
async function latestRate(seriesId: string): Promise<RiksbankObservation> {
  // Riksbank's API Management gateway accepts a subscription key via the
  // Ocp-Apim-Subscription-Key header. Limits (200/min, 10k/week) are far
  // above our 5-calls-per-run usage. Sent only when configured.
  const headers: Record<string, string> = { accept: 'application/json' }
  const key = process.env.RIKSBANK_API_KEY
  if (key) headers['Ocp-Apim-Subscription-Key'] = key

  const res = await fetch(`${RIKSBANK_BASE}/Observations/Latest/${seriesId}`, {
    headers,
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) {
    throw new Error(`Riksbank ${seriesId} returned HTTP ${res.status}`)
  }
  const body = (await res.json()) as RiksbankObservation
  if (typeof body?.value !== 'number' || !Number.isFinite(body.value)) {
    throw new Error(`Riksbank ${seriesId} returned no numeric value`)
  }
  return body
}

/**
 * Refresh all FX rates. Per-currency failures are isolated; SEK is always
 * written (it's the base, rate 1.0). dryRun computes without writing.
 */
export async function refreshFxRates(dryRun: boolean): Promise<FxResult> {
  const updated: string[] = []
  const errors: { currency: string; error: string }[] = []

  // SEK base row — always 1.0, no external call.
  if (!dryRun) await upsertRate('SEK', 1, null, null)
  updated.push('SEK')

  for (const [currency, seriesId] of Object.entries(SERIES)) {
    try {
      const obs = await latestRate(seriesId)
      const sekPerUnit = Number(obs.value.toFixed(6))
      if (!dryRun) await upsertRate(currency, sekPerUnit, obs.date, seriesId)
      updated.push(currency)
    } catch (err) {
      errors.push({
        currency,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      })
    }
  }

  return { ok: errors.length === 0, updated, errors }
}

async function upsertRate(
  currency: string,
  sekPerUnit: number,
  rateDate: string | null,
  seriesId: string | null,
): Promise<void> {
  await pricingPool.query(
    `INSERT INTO exchange_rates (currency, sek_per_unit, rate_date, source_series, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (currency) DO UPDATE
       SET sek_per_unit = EXCLUDED.sek_per_unit,
           rate_date = EXCLUDED.rate_date,
           source_series = EXCLUDED.source_series,
           updated_at = NOW()`,
    [currency, sekPerUnit, rateDate, seriesId],
  )
}
