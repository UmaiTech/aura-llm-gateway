/** Display helpers for token counts and dates on the pricing page. */

/** Compact token count: 128K, 1M, 1.5M. Null is unknown. */
export function fmtTokens(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return `${n}`
}

/** Full count with thousands separators: 1,000,000. */
export function fmtCount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function fmtDate(iso: string | null): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function fmtAge(days: number | null): string {
  if (days === null) return 'age unknown'
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}
