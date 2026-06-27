/**
 * Public pricing webapp (issue #123).
 *
 * Renders the live, scraped `model_pricing` data served by GET /api/pricing
 * — the read side of the weekly Firecrawl/LiteLLM scraper. One table per
 * provider, sorted cheapest-first, with the last-scrape freshness banner so
 * visitors can see how current the numbers are. Matches the editorial dark
 * theme of RoadmapPage.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, DollarSign, RefreshCw } from 'lucide-react'

interface Model {
  model_id: string
  model_name: string
  input_per_million: number
  output_per_million: number
  cached_input_per_million: number | null
  context_window: number | null
  max_output_tokens: number | null
  effective_from: string
}

interface ProviderBlock {
  name: string
  display_name: string
  models: Model[]
}

interface LastRunProvider {
  provider: string
  status: string
  models_upserted: number
  models_unchanged: number
  models_flagged: number
  error: string | null
}

interface PricingResponse {
  updated_at: string | null
  providers: ProviderBlock[]
  last_run: {
    run_id: string
    at: string
    providers: LastRunProvider[]
  } | null
}

function fmtUsd(n: number): string {
  if (n === 0) return '$0.00'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

function fmtTokens(n: number | null): string {
  if (n === null || n === undefined) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return `${n}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function PricingPage() {
  const [data, setData] = useState<PricingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/pricing', { headers: { accept: 'application/json' } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json: PricingResponse) => {
        if (!cancelled) {
          setData(json)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const totalModels =
    data?.providers.reduce((a, p) => a + p.models.length, 0) ?? 0

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="border-b border-gray-800 bg-gray-950 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Home
          </Link>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <DollarSign className="h-3.5 w-3.5" />
            <span>Pricing</span>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-16">
        <header className="mb-12">
          <div className="font-mono text-xs uppercase tracking-wider text-gray-500 mb-6 inline-flex items-center gap-2">
            <RefreshCw className="h-3 w-3" />
            <span>
              Auto-updated weekly · last refresh{' '}
              <span className="text-green-400">
                {fmtDate(data?.updated_at ?? null)}
              </span>
            </span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold mb-4 tracking-tight">
            <span className="text-gray-100">Model pricing.</span>{' '}
            <span className="text-gray-500">Scraped, versioned, honest.</span>
          </h1>
          <p className="text-gray-400 text-base max-w-2xl leading-relaxed">
            Live list prices across every provider Aura routes to, refreshed
            by a weekly scraper and versioned with full price history. USD per
            1M tokens. {totalModels > 0 && `${totalModels} models tracked.`}
          </p>
        </header>

        {loading && (
          <p className="font-mono text-sm text-gray-500">Loading prices…</p>
        )}

        {error && !loading && (
          <div className="border border-red-900/60 bg-red-950/30 rounded-lg p-4 text-sm text-red-300">
            Couldn&apos;t load pricing ({error}). The scraper may not have run
            yet — check back shortly.
          </div>
        )}

        {!loading && !error && data && (
          <>
            {data.last_run && (
              <ScrapeBanner lastRun={data.last_run} />
            )}
            <div className="space-y-12">
              {data.providers.map((p) => (
                <ProviderTable key={p.name} provider={p} />
              ))}
              {data.providers.length === 0 && (
                <p className="text-gray-500 text-sm">
                  No pricing data yet. The first weekly scrape will populate
                  this table.
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function ScrapeBanner({
  lastRun,
}: {
  lastRun: NonNullable<PricingResponse['last_run']>
}) {
  const flagged = lastRun.providers.filter(
    (p) => p.status === 'needs_review' || p.status === 'failed',
  )
  return (
    <div className="mb-10 border border-gray-800 rounded-lg px-4 py-3 text-xs font-mono text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span>
        last run{' '}
        <span className="text-gray-300">{fmtDate(lastRun.at)}</span>
      </span>
      {lastRun.providers.map((p) => (
        <span key={p.provider} className="inline-flex items-center gap-1">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              p.status === 'success'
                ? 'bg-green-500'
                : p.status === 'needs_review'
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
            }`}
          />
          {p.provider}
        </span>
      ))}
      {flagged.length > 0 && (
        <span className="text-yellow-500">
          {flagged.length} provider(s) need review
        </span>
      )}
    </div>
  )
}

function ProviderTable({ provider }: { provider: ProviderBlock }) {
  return (
    <section>
      <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-gray-100 mb-4">
        {provider.display_name}
        <span className="font-mono text-xs text-gray-600 ml-2">
          {provider.models.length} models
        </span>
      </h2>
      <div className="overflow-x-auto border border-gray-800 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-mono text-xs uppercase tracking-wider text-gray-500 border-b border-gray-800">
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium text-right">Input /1M</th>
              <th className="px-4 py-3 font-medium text-right">Output /1M</th>
              <th className="px-4 py-3 font-medium text-right">Cached /1M</th>
              <th className="px-4 py-3 font-medium text-right">Context</th>
            </tr>
          </thead>
          <tbody>
            {provider.models.map((m) => (
              <tr
                key={m.model_id}
                className="border-b border-gray-900 last:border-0 hover:bg-gray-900/40"
              >
                <td className="px-4 py-3">
                  <div className="text-gray-200">{m.model_name}</div>
                  <div className="font-mono text-xs text-gray-600">
                    {m.model_id}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-300">
                  {fmtUsd(m.input_per_million)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-300">
                  {fmtUsd(m.output_per_million)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-500">
                  {m.cached_input_per_million !== null
                    ? fmtUsd(m.cached_input_per_million)
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-500">
                  {fmtTokens(m.context_window)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
