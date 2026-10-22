import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'

/**
 * GitHub star count for the landing page, served by GET /api/github/stars
 * (edge-cached for an hour, so visitors never hit api.github.com directly).
 *
 * Renders nothing until a count arrives and nothing at all if the fetch
 * fails (including `vite dev`, where /api isn't served) — callers keep
 * their plain GitHub link, so failure never reserves space or shifts layout.
 * The last count is remembered per browser so repeat visits paint it
 * immediately instead of popping it in after the fetch.
 */

const CACHE_KEY = 'aura:github-stars'

let request: Promise<number | null> | null = null

function fetchStars(): Promise<number | null> {
  request ??= fetch('/api/github/stars', { headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((body: { stars?: unknown } | null) =>
      typeof body?.stars === 'number' ? body.stars : null,
    )
    .catch(() => null)
  return request
}

function readCached(): number | null {
  try {
    const n = Number(localStorage.getItem(CACHE_KEY))
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

function useGithubStars(): number | null {
  const [stars, setStars] = useState<number | null>(readCached)
  useEffect(() => {
    let cancelled = false
    fetchStars().then((n) => {
      if (cancelled || n === null) return
      setStars(n)
      try {
        localStorage.setItem(CACHE_KEY, String(n))
      } catch {
        // storage blocked (private mode etc.) — the live count still shows
      }
    })
    return () => {
      cancelled = true
    }
  }, [])
  return stars
}

const compact = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** 987 → "987", 1234 → "1.2k", 12_345 → "12.3k", 1_250_000 → "1.3M" */
export function formatStars(n: number): string {
  return compact.format(n).replace('K', 'k')
}

/** "★ 1.2k" — meant to sit inside an existing GitHub link. */
export function GithubStars({ className = '' }: { className?: string }) {
  const stars = useGithubStars()
  if (stars === null) return null
  return (
    <span
      data-github-stars
      className={`inline-flex items-center gap-1 tabular-nums ${className}`}
      title={`${stars.toLocaleString('en')} GitHub stars`}
    >
      <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
      {formatStars(stars)}
    </span>
  )
}
