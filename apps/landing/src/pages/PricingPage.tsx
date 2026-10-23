/**
 * Public LLM pricing (issue #123): the live, scraped `model_pricing` data
 * served by GET /api/pricing, the read side of the weekly scraper.
 *
 * One cross-provider table with a workload estimate column, search /
 * provider / capability filters, a comparison of up to three models,
 * currency conversion via Riksbank rates, and freshness / provenance per
 * provider and row. All arithmetic and data handling lives in
 * lib/pricing/* (unit-tested); this file wires state, URL and layout.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowRight, CircleX, RefreshCw } from 'lucide-react'
import { SiteFooter, SiteHeader } from '../components/site/SiteChrome'
import { FreshnessPanel } from '../components/pricing/Freshness'
import { WorkloadPanel } from '../components/pricing/WorkloadPanel'
import { Toolbar } from '../components/pricing/Toolbar'
import { PricingTable } from '../components/pricing/PricingTable'
import { CompareDrawer, CompareTray } from '../components/pricing/Compare'
import { LINKS } from '../lib/links'
import { availableCurrencies, makeConverter, type Currency } from '../lib/pricing/currency'
import { estimateCost, parseWorkload, type Estimate, type WorkloadForm } from '../lib/pricing/estimator'
import { assessFreshness, capabilityOptions, flattenRows, normalizePricing } from '../lib/pricing/normalize'
import {
  EMPTY_FILTERS,
  MAX_COMPARE,
  filterRows,
  hasActiveFilters,
  resolveCompare,
  sortRows,
  toggleCompare,
  type RowFilters,
  type SortKey,
} from '../lib/pricing/table'
import type { PricingResponse, PricingRow } from '../lib/pricing/types'
import { readViewState, writeViewState, type PricingViewState } from '../lib/pricing/urlState'

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: PricingResponse }

function usePricing(): [Load, () => void] {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const ctrl = new AbortController()
    setLoad({ state: 'loading' })
    fetch('/api/pricing', { headers: { accept: 'application/json' }, signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return normalizePricing(await res.json())
      })
      .then((data) => setLoad({ state: 'ready', data }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setLoad({ state: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return () => ctrl.abort()
  }, [attempt])
  return [load, useCallback(() => setAttempt((a) => a + 1), [])]
}

export function PricingPage() {
  const [load, retry] = usePricing()
  const [params, setParams] = useSearchParams()
  // URL is read once on mount; afterwards state is the source of truth and
  // is mirrored back into the query so the view can be shared.
  const [view, setView] = useState<PricingViewState>(() => readViewState(params))
  useEffect(() => {
    setParams(writeViewState(view), { replace: true, preventScrollReset: true })
  }, [view, setParams])

  const setFilters = (filters: RowFilters) => setView((v) => ({ ...v, filters }))
  const setSort = (sort: SortKey) => setView((v) => ({ ...v, sort }))
  const setCurrency = (currency: Currency) => setView((v) => ({ ...v, currency }))
  const setWorkload = (workload: WorkloadForm) => setView((v) => ({ ...v, workload }))

  const data = load.state === 'ready' ? load.data : null
  const rows = useMemo(() => (data ? flattenRows(data) : []), [data])
  const rates = useMemo(() => data?.exchange_rates ?? [], [data])
  const conv = useMemo(() => makeConverter(view.currency, rates), [view.currency, rates])
  const parsed = useMemo(() => parseWorkload(view.workload), [view.workload])
  const estimates = useMemo(
    () => new Map<string, Estimate>(rows.map((r) => [r.key, estimateCost(r, parsed.workload)])),
    [rows, parsed],
  )
  const { rows: filtered, hiddenUnknownCapabilities } = useMemo(() => filterRows(rows, view.filters), [rows, view.filters])
  const sorted = useMemo(() => sortRows(filtered, view.sort, estimates), [filtered, view.sort, estimates])
  const compareRows = useMemo(() => resolveCompare(view.compare, rows), [view.compare, rows])
  const freshness = useMemo(() => (data ? assessFreshness(data) : null), [data])

  // Drop shared-link comparison keys that no longer exist in the catalog.
  useEffect(() => {
    if (data && compareRows.length !== view.compare.length) {
      setView((v) => ({ ...v, compare: compareRows.map((r) => r.key) }))
    }
  }, [data, compareRows, view.compare.length])

  const [announcement, setAnnouncement] = useState('')
  const [compareOpen, setCompareOpen] = useState(false)
  const fullNoteId = useId()
  const compareFull = view.compare.length >= MAX_COMPARE

  const onToggleCompare = (row: PricingRow) => {
    const t = toggleCompare(view.compare, row.key)
    const n = t.selected.length
    setView((v) => ({ ...v, compare: t.selected }))
    setAnnouncement(
      t.result === 'full'
        ? `Comparison is full. Remove a model before adding ${row.model_name}.`
        : t.result === 'added'
          ? `${row.model_name} added to comparison, ${n} of ${MAX_COMPARE} selected.`
          : `${row.model_name} removed from comparison, ${n} of ${MAX_COMPARE} selected.`,
    )
    if (n === 0) setCompareOpen(false)
  }

  const resetFilters = () => setFilters(EMPTY_FILTERS)
  const filtersActive = hasActiveFilters(view.filters)

  const providerOptions = useMemo(
    () => (data?.providers ?? []).map((p) => ({ value: p.name, label: p.display_name })),
    [data],
  )
  const capabilities = useMemo(() => capabilityOptions(rows), [rows])
  const currencies = useMemo(() => availableCurrencies(rates), [rates])

  // Announce result counts after typing settles, not on every keystroke.
  const [resultNote, setResultNote] = useState('')
  const firstCount = useRef(true)
  useEffect(() => {
    if (!data) return
    if (firstCount.current) {
      firstCount.current = false
      return
    }
    const t = setTimeout(() => setResultNote(`${sorted.length} of ${rows.length} models shown.`), 600)
    return () => clearTimeout(t)
  }, [sorted.length, rows.length, data])

  return (
    <div className="flex min-h-screen flex-col bg-aura-bg text-aura-text">
      <SiteHeader current="Pricing" />
      <main className="mx-auto w-full max-w-content flex-1 px-4 pb-16 pt-12 sm:px-8 sm:pt-16">
        <header className="max-w-3xl">
          <p className="eyebrow">LLM pricing</p>
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Model prices. <span className="text-aura-accent">Your workload.</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-aura-muted">
            List prices for the models Aura can route to, scraped weekly from each provider and versioned. Enter a
            workload to estimate its cost across models, then compare up to three side by side.
            {rows.length > 0 && ` ${rows.length} models tracked.`}
          </p>
          <p className="mt-3 text-sm text-aura-muted">
            Listed here means Aura supports the provider. It does not mean a particular gateway has that provider
            configured; check your gateway&apos;s <span className="font-mono text-[13px]">/v1/models</span> for what it
            can actually serve.
          </p>
        </header>

        <div className="sr-only" role="status" aria-live="polite">
          {announcement} {resultNote}
        </div>

        {load.state === 'loading' && <LoadingState />}

        {load.state === 'error' && (
          <div role="alert" className="mt-10 rounded-panel border border-aura-red/40 bg-aura-red/[0.06] p-5">
            <div className="flex items-start gap-3">
              <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-aura-red" aria-hidden />
              <div>
                <h2 className="font-semibold text-aura-text">Pricing data could not be loaded</h2>
                <p className="mt-1 text-sm text-aura-muted">
                  The pricing service did not answer ({load.message}). No prices are shown rather than outdated ones.
                </p>
                <button type="button" onClick={retry} className="btn-secondary mt-4 !py-2">
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {data && freshness && (
          <div className="mt-10 space-y-6">
            <FreshnessPanel data={data} freshness={freshness} />

            {rows.length === 0 ? (
              <div className="rounded-panel border border-dashed border-aura-border p-8 text-center">
                <h2 className="font-semibold">No pricing data yet</h2>
                <p className="mt-1 text-sm text-aura-muted">
                  The catalog is empty. The first weekly scrape will populate this table.
                </p>
              </div>
            ) : (
              <>
                <WorkloadPanel form={view.workload} parsed={parsed} conv={conv} onChange={setWorkload} />

                <section aria-labelledby="models-title">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id="models-title" className="text-lg font-semibold">
                      All models
                    </h2>
                    <span className="font-mono text-xs tabular-nums text-aura-muted">
                      {sorted.length === rows.length ? `${rows.length} models` : `${sorted.length} of ${rows.length} models`}
                    </span>
                  </div>
                  <Toolbar
                    filters={view.filters}
                    onFilters={setFilters}
                    providerOptions={providerOptions}
                    capabilityOptions={capabilities}
                    sort={view.sort}
                    onSort={setSort}
                    currency={view.currency}
                    onCurrency={setCurrency}
                    currencies={currencies}
                    conv={conv}
                    active={filtersActive}
                    onReset={resetFilters}
                  />

                  {hiddenUnknownCapabilities > 0 && (
                    <p className="mt-3 text-xs text-aura-muted">
                      {hiddenUnknownCapabilities} model{hiddenUnknownCapabilities === 1 ? ' has' : 's have'} no capability
                      data and {hiddenUnknownCapabilities === 1 ? 'is' : 'are'} hidden by the capability filter (unknown, not
                      unsupported).{' '}
                      <button
                        type="button"
                        onClick={() => setFilters({ ...view.filters, includeUnknownCapabilities: true })}
                        className="font-medium text-aura-accent underline-offset-2 hover:underline"
                      >
                        Show them
                      </button>
                    </p>
                  )}
                  {view.filters.includeUnknownCapabilities && view.filters.capabilities.length > 0 && (
                    <p className="mt-3 text-xs text-aura-muted">
                      Including models with unknown capabilities.{' '}
                      <button
                        type="button"
                        onClick={() => setFilters({ ...view.filters, includeUnknownCapabilities: false })}
                        className="font-medium text-aura-accent underline-offset-2 hover:underline"
                      >
                        Hide them
                      </button>
                    </p>
                  )}

                  <div className="mt-4">
                    {sorted.length === 0 ? (
                      <div className="rounded-panel border border-dashed border-aura-border p-8 text-center">
                        <p className="font-medium">No models match these filters.</p>
                        <button type="button" onClick={resetFilters} className="btn-secondary mt-4 !py-2">
                          Clear filters
                        </button>
                      </div>
                    ) : (
                      <PricingTable
                        rows={sorted}
                        estimates={estimates}
                        conv={conv}
                        compare={view.compare}
                        compareFull={compareFull}
                        fullNoteId={fullNoteId}
                        onToggleCompare={onToggleCompare}
                        requests={parsed.workload?.requests ?? null}
                      />
                    )}
                    <p className="mt-2 text-xs text-aura-muted">
                      Sorted by {view.sort === 'estimate' ? 'workload estimate' : 'the selected column'}; models with an
                      unknown value sort last
                      {view.sort === 'estimate' && ', after models whose context or output limit the workload exceeds'}.
                      No ranking here reflects model quality.
                    </p>
                    {compareRows.length > 0 && (
                      <CompareTray
                        rows={compareRows}
                        fullNoteId={fullNoteId}
                        onRemove={onToggleCompare}
                        onClear={() => {
                          setView((v) => ({ ...v, compare: [] }))
                          setAnnouncement('Comparison cleared.')
                        }}
                        onOpen={() => setCompareOpen(true)}
                      />
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        <section className="mt-16 flex flex-col gap-4 border-t border-aura-border pt-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Price is one part of routing.</h2>
            <p className="mt-2 max-w-xl text-sm text-aura-muted">
              Aura&apos;s auto router also weighs request complexity, tools, context and provider health before it picks
              a model.
            </p>
          </div>
          <a href={LINKS.autoRoutingDocs} className="btn-secondary self-start sm:self-auto">
            How auto routing works
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </section>
      </main>
      <SiteFooter />

      <CompareDrawer
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        rows={compareRows}
        estimates={estimates}
        conv={conv}
        onRemove={onToggleCompare}
      />
    </div>
  )
}

function LoadingState() {
  return (
    <div className="mt-10 space-y-4" aria-busy="true">
      <p role="status" className="font-mono text-sm text-aura-muted">
        Loading prices…
      </p>
      <div className="space-y-2" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-control bg-aura-surface-2 motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  )
}
