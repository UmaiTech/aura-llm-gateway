/**
 * Public pricing webapp (issue #123).
 *
 * Renders the live, scraped `model_pricing` data served by GET /api/pricing
 * — the read side of the weekly Firecrawl/LiteLLM scraper. One table per
 * provider, sorted cheapest-first, with the last-scrape freshness banner so
 * visitors can see how current the numbers are. Matches the editorial dark
 * theme of RoadmapPage.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  DollarSign,
  RefreshCw,
  Search,
} from 'lucide-react'

interface Model {
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
  effective_from: string
}

interface ProviderBlock {
  name: string
  display_name: string
  description: string | null
  models_url: string | null
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
  // Filter state: a set of selected provider names (empty = all) and a
  // free-text model search. Both applied client-side to the fetched data.
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(
    new Set(),
  )
  const [query, setQuery] = useState('')

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

  // Apply provider + model-name filters. A provider is shown when it's
  // selected (or nothing is selected) and has at least one model matching
  // the search query.
  const filteredProviders = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    return data.providers
      .filter(
        (p) => selectedProviders.size === 0 || selectedProviders.has(p.name),
      )
      .map((p) => ({
        ...p,
        models: q
          ? p.models.filter(
              (m) =>
                m.model_name.toLowerCase().includes(q) ||
                m.model_id.toLowerCase().includes(q),
            )
          : p.models,
      }))
      .filter((p) => p.models.length > 0)
  }, [data, selectedProviders, query])

  const shownModels = filteredProviders.reduce(
    (a, p) => a + p.models.length,
    0,
  )

  function toggleProvider(name: string) {
    setSelectedProviders((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

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

            {data.providers.length > 0 && (
              <FilterBar
                providers={data.providers}
                selected={selectedProviders}
                onToggle={toggleProvider}
                onClear={() => setSelectedProviders(new Set())}
                query={query}
                onQuery={setQuery}
                shownModels={shownModels}
                totalModels={totalModels}
              />
            )}

            <div className="space-y-12">
              {filteredProviders.map((p) => (
                <ProviderTable key={p.name} provider={p} />
              ))}
              {data.providers.length > 0 && filteredProviders.length === 0 && (
                <p className="text-gray-500 text-sm">
                  No models match your filters.{' '}
                  <button
                    onClick={() => {
                      setSelectedProviders(new Set())
                      setQuery('')
                    }}
                    className="text-green-400 hover:underline"
                  >
                    Clear filters
                  </button>
                </p>
              )}
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

function FilterBar({
  providers,
  selected,
  onToggle,
  onClear,
  query,
  onQuery,
  shownModels,
  totalModels,
}: {
  providers: ProviderBlock[]
  selected: Set<string>
  onToggle: (name: string) => void
  onClear: () => void
  query: string
  onQuery: (q: string) => void
  shownModels: number
  totalModels: number
}) {
  return (
    <div className="mb-10 space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Filter models by name…"
          className="w-full bg-gray-900/60 border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-600 transition-colors"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {providers.map((p) => {
          const active = selected.has(p.name)
          return (
            <button
              key={p.name}
              onClick={() => onToggle(p.name)}
              className={`font-mono text-xs px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? 'border-green-500/60 bg-green-500/10 text-green-400'
                  : 'border-gray-800 text-gray-400 hover:border-gray-600 hover:text-gray-200'
              }`}
            >
              {p.display_name}
            </button>
          )
        })}
        {(selected.size > 0 || query) && (
          <button
            onClick={onClear}
            className="font-mono text-xs px-2.5 py-1 text-gray-500 hover:text-gray-300 transition-colors"
          >
            clear
          </button>
        )}
        <span className="font-mono text-xs text-gray-600 ml-auto">
          {shownModels === totalModels
            ? `${totalModels} models`
            : `${shownModels} / ${totalModels} models`}
        </span>
      </div>
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
      <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-gray-100 mb-1">
        {provider.display_name}
        <span className="font-mono text-xs text-gray-600 ml-2">
          {provider.models.length} models
        </span>
      </h2>
      {(provider.description || provider.models_url) && (
        <p className="text-sm text-gray-500 mb-4 leading-relaxed">
          {provider.description}
          {provider.models_url && (
            <>
              {provider.description && ' '}
              <a
                href={provider.models_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-green-400 underline underline-offset-2 transition-colors"
              >
                View models →
              </a>
            </>
          )}
        </p>
      )}
      <div className="overflow-x-auto border border-gray-800 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-mono text-xs uppercase tracking-wider text-gray-500 border-b border-gray-800">
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium text-right">Input /1M</th>
              <th className="px-4 py-3 font-medium text-right">Output /1M</th>
              <th className="px-4 py-3 font-medium text-right">Cached /1M</th>
              <th className="px-4 py-3 font-medium text-right">Batch /1M</th>
              <th className="px-4 py-3 font-medium text-right">Context</th>
            </tr>
          </thead>
          <tbody>
            {provider.models.map((m) => (
              <ModelRow key={m.model_id} model={m} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ModelRow({ model: m }: { model: Model }) {
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        className="border-b border-gray-900 last:border-0 hover:bg-gray-900/40 cursor-pointer"
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Chevron className="h-3.5 w-3.5 text-gray-600 shrink-0" />
            <div>
              <div className="text-gray-200">{m.model_name}</div>
              <div className="font-mono text-xs text-gray-600">
                {m.model_id}
              </div>
            </div>
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
          {m.batch_input_per_million !== null &&
          m.batch_output_per_million !== null
            ? `${fmtUsd(m.batch_input_per_million)} / ${fmtUsd(m.batch_output_per_million)}`
            : '—'}
        </td>
        <td className="px-4 py-3 text-right font-mono text-gray-500">
          {fmtTokens(m.context_window)}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-gray-900 bg-gray-900/30">
          <td colSpan={6} className="px-4 py-4 space-y-3">
            {m.good_at && (
              <p className="text-sm text-gray-300">
                <span className="text-gray-500">Good at: </span>
                {m.good_at}
              </p>
            )}
            {m.capabilities && m.capabilities.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {m.capabilities.map((c) => (
                  <span
                    key={c}
                    className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-gray-700 text-gray-400"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-xs">
              <Detail label="Context window" value={fmtTokens(m.context_window)} />
              <Detail label="Max output" value={fmtTokens(m.max_output_tokens)} />
              <Detail
                label="Cached input /1M"
                value={
                  m.cached_input_per_million !== null
                    ? fmtUsd(m.cached_input_per_million)
                    : '—'
                }
              />
              <Detail
                label="Batch input /1M"
                value={
                  m.batch_input_per_million !== null
                    ? fmtUsd(m.batch_input_per_million)
                    : '—'
                }
              />
              <Detail
                label="Batch output /1M"
                value={
                  m.batch_output_per_million !== null
                    ? fmtUsd(m.batch_output_per_million)
                    : '—'
                }
              />
              <Detail
                label="Output / input ratio"
                value={
                  m.input_per_million > 0
                    ? `${(m.output_per_million / m.input_per_million).toFixed(1)}×`
                    : '—'
                }
              />
              <Detail label="Tracked since" value={fmtDate(m.effective_from)} />
            </dl>
          </td>
        </tr>
      )}
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono uppercase tracking-wider text-gray-600 mb-0.5">
        {label}
      </dt>
      <dd className="text-gray-300">{value}</dd>
    </div>
  )
}
