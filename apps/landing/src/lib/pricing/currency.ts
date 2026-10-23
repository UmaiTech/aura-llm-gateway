/**
 * Display-currency conversion for USD list prices, using the Riksbank
 * SEK-per-unit rates /api/pricing returns:
 *
 *   price_T = price_usd * sek_per_unit[USD] / sek_per_unit[T]
 *
 * When either rate is missing the converter falls back to USD and says so
 * (`fallback: true`), so the page never shows a USD number with a foreign
 * currency label.
 */
import type { ExchangeRate } from './types.ts'

export const CURRENCIES = ['USD', 'SEK', 'EUR', 'GBP', 'NOK', 'DKK'] as const
export type Currency = (typeof CURRENCIES)[number]

const SYMBOLS: Record<Currency, { prefix: string; suffix: string }> = {
  USD: { prefix: '$', suffix: '' },
  SEK: { prefix: '', suffix: ' kr' },
  EUR: { prefix: '€', suffix: '' },
  GBP: { prefix: '£', suffix: '' },
  NOK: { prefix: '', suffix: ' kr' },
  DKK: { prefix: '', suffix: ' kr' },
}

export function isCurrency(v: string): v is Currency {
  return (CURRENCIES as readonly string[]).includes(v)
}

export interface Converter {
  /** What the visitor asked for. */
  requested: Currency
  /** What numbers are actually shown in (USD on fallback). */
  display: Currency
  /** Multiply a USD amount by this to get `display`. */
  factor: number
  /** True when `requested` could not be honoured and USD is shown instead. */
  fallback: boolean
  /** Riksbank date of the rates used; null for plain USD or unknown. */
  rateDate: string | null
}

/** Currencies the selector offers: USD plus any we can actually convert to. */
export function availableCurrencies(rates: ExchangeRate[]): Currency[] {
  const have = new Set(rates.map((r) => r.currency))
  return CURRENCIES.filter((c) => c === 'USD' || (have.has('USD') && have.has(c)))
}

export function makeConverter(requested: Currency, rates: ExchangeRate[]): Converter {
  if (requested === 'USD') {
    return { requested, display: 'USD', factor: 1, fallback: false, rateDate: null }
  }
  const usd = rates.find((r) => r.currency === 'USD')
  const target = rates.find((r) => r.currency === requested)
  if (!usd || !target || !(usd.sek_per_unit > 0) || !(target.sek_per_unit > 0)) {
    return { requested, display: 'USD', factor: 1, fallback: true, rateDate: null }
  }
  // Report the older of the two dates: the conversion is only as current as that.
  const dates = [usd.rate_date, target.rate_date].filter((d): d is string => !!d).sort()
  return {
    requested,
    display: requested,
    factor: usd.sek_per_unit / target.sek_per_unit,
    fallback: false,
    rateDate: dates[0] ?? null,
  }
}

const grouped = (v: number, digits: number) =>
  v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/**
 * Format a non-negative amount. Two decimals from 0.01 up; below that two
 * significant digits (at least four decimals), so tiny per-request costs
 * stay readable instead of collapsing to 0.00.
 */
export function formatAmount(v: number, maxDecimals: number = 2): string {
  if (!Number.isFinite(v)) return '—'
  if (v === 0) return '0.00'
  if (v >= 0.01) {
    if (maxDecimals <= 2) return grouped(v, 2)
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals })
  }
  if (v < 1e-8) return '< 0.00000001'
  const decimals = Math.max(4, Math.ceil(-Math.log10(v)) + 1)
  return v.toFixed(Math.min(decimals, 8))
}

/**
 * Convert a USD amount and format it with the display currency's symbol.
 * `maxDecimals` > 2 keeps list rates such as 0.025 from being shown as 0.03.
 */
export function formatMoney(usd: number, conv: Converter, maxDecimals: number = 2): string {
  const s = SYMBOLS[conv.display]
  const body = formatAmount(usd * conv.factor, maxDecimals)
  if (body.startsWith('< ')) return `< ${s.prefix}${body.slice(2)}${s.suffix}`
  return `${s.prefix}${body}${s.suffix}`
}

/**
 * Formats a nullable per-1M rate (up to four decimals, never rounded up to
 * the next cent); null is unknown and renders as an em dash.
 */
export function formatPrice(usd: number | null, conv: Converter): string {
  return usd === null ? '—' : formatMoney(usd, conv, 4)
}
