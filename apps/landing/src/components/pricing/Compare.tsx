import type { ReactNode } from 'react'
import { Columns3, X } from 'lucide-react'
import { Drawer } from '@aura/ui/ui/Drawer.tsx'
import { formatPrice, type Converter } from '../../lib/pricing/currency'
import type { Estimate } from '../../lib/pricing/estimator'
import { fmtCount, fmtDate } from '../../lib/pricing/format'
import { MAX_COMPARE } from '../../lib/pricing/table'
import type { PricingRow } from '../../lib/pricing/types'
import { EstimateCell } from './PricingTable'
import { EXCLUSIONS } from './WorkloadPanel'

/**
 * Sticky tray listing the models picked for comparison. Each chip removes
 * its model; the selection is independent of the current filters.
 */
export function CompareTray({
  rows,
  fullNoteId,
  onRemove,
  onClear,
  onOpen,
}: {
  rows: PricingRow[]
  fullNoteId: string
  onRemove: (row: PricingRow) => void
  onClear: () => void
  onOpen: () => void
}) {
  const full = rows.length >= MAX_COMPARE
  return (
    <section
      aria-label="Comparison selection"
      className="sticky bottom-3 z-20 mt-4 rounded-panel border border-aura-border bg-aura-surface/95 px-3 py-2.5 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-aura-surface/85"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-aura-muted">
          <span className="font-mono tabular-nums text-aura-text">
            {rows.length} of {MAX_COMPARE}
          </span>{' '}
          selected
        </span>
        <ul className="order-last flex min-w-0 basis-full flex-wrap gap-1.5 sm:order-none sm:basis-0 sm:flex-1">
          {rows.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => onRemove(r)}
                className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-aura-border bg-aura-bg py-0.5 pl-2.5 pr-1.5 text-xs text-aura-text hover:border-aura-dim"
              >
                <span className="truncate">{r.model_name}</span>
                <X className="h-3.5 w-3.5 shrink-0 text-aura-muted" aria-hidden />
                <span className="sr-only">: remove from comparison</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1.5 sm:ml-0">
          <button
            type="button"
            onClick={onClear}
            className="rounded-control px-2 py-1.5 text-xs text-aura-muted hover:bg-aura-hover hover:text-aura-text"
          >
            Clear
          </button>
          <button type="button" onClick={onOpen} className="btn-primary !px-3 !py-1.5 text-xs">
            <Columns3 className="h-3.5 w-3.5" aria-hidden />
            Compare {rows.length > 1 ? `${rows.length} models` : 'model'}
          </button>
        </div>
      </div>
      <p id={fullNoteId} className={full ? 'mt-1.5 text-[11px] text-aura-muted' : 'sr-only'}>
        {full
          ? `Comparison is full: up to ${MAX_COMPARE} models. Remove one to add another.`
          : `You can compare up to ${MAX_COMPARE} models.`}
      </p>
    </section>
  )
}

/** Side-by-side comparison of up to three models, in the shared Drawer. */
export function CompareDrawer({
  open,
  onClose,
  rows,
  estimates,
  conv,
  onRemove,
}: {
  open: boolean
  onClose: () => void
  rows: PricingRow[]
  estimates: Map<string, Estimate>
  conv: Converter
  onRemove: (row: PricingRow) => void
}) {
  const cur = conv.display
  const line = (label: string, cell: (r: PricingRow) => ReactNode) => (
    <tr className="border-b border-aura-border/70 align-top">
      <th scope="row" className="w-28 py-2.5 pr-3 sm:w-36 text-left text-xs font-medium text-aura-muted">
        {label}
      </th>
      {rows.map((r) => (
        <td key={r.key} className="px-2 py-2.5 text-right font-mono text-[13px] tabular-nums text-aura-text">
          {cell(r)}
        </td>
      ))}
    </tr>
  )
  const price = (v: number | null) => formatPrice(v, conv)
  const tokens = (v: number | null) => (v === null ? 'unknown' : fmtCount(v))

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Compare models"
      subtitle={`${rows.length} of ${MAX_COMPARE} · list prices in ${cur}`}
      closeLabel="Close comparison"
      className="w-[min(860px,100vw)]"
      footer={
        <>
          Estimates are approximate list-price arithmetic. Not included: {EXCLUSIONS.join(', ')}. “—” means unknown,
          never free.
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-aura-muted">No models selected. Tick “Compare” on up to {MAX_COMPARE} rows.</p>
      ) : (
        <div className="relative -mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[440px] border-collapse">
            <caption className="sr-only">Side-by-side comparison of the selected models</caption>
            <thead>
              <tr className="border-b border-aura-border">
                <td />
                {rows.map((r) => (
                  <th key={r.key} scope="col" className="px-2 pb-3 text-right align-bottom font-normal">
                    <span className="block text-sm font-semibold text-aura-text">{r.model_name}</span>
                    <span className="block text-xs text-aura-muted">{r.providerDisplay}</span>
                    <span className="block break-all font-mono text-[11px] text-aura-muted">{r.model_id}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(r)}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-xs text-aura-muted hover:bg-aura-hover hover:text-aura-text"
                    >
                      <X className="h-3 w-3" aria-hidden />
                      Remove<span className="sr-only"> {r.model_name}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {line(`Workload estimate (${cur})`, (r) => (
                <EstimateCell estimate={estimates.get(r.key)} conv={conv} />
              ))}
              {line(`Input, per 1M input tokens`, (r) => price(r.input_per_million))}
              {line(`Output, per 1M output tokens`, (r) => price(r.output_per_million))}
              {line(`Cached input, per 1M cached tokens`, (r) => price(r.cached_input_per_million))}
              {line('Batch input, per 1M', (r) => price(r.batch_input_per_million))}
              {line('Batch output, per 1M', (r) => price(r.batch_output_per_million))}
              {line('Context window, tokens', (r) => tokens(r.context_window))}
              {line('Max output, tokens', (r) => tokens(r.max_output_tokens))}
              {line('Capabilities', (r) => (
                <span className="font-sans text-xs">
                  {r.capabilities === null ? 'unknown' : r.capabilities.length ? r.capabilities.join(', ') : 'none listed'}
                </span>
              ))}
              {line('Price in effect since', (r) => fmtDate(r.effective_from))}
              {line('Latest scrape', (r) => (
                <span className={`font-sans text-xs ${r.freshness === 'current' ? '' : 'text-aura-amber'}`}>
                  {r.freshness === 'current' ? 'updated' : r.freshness === 'review' ? 'held for review' : 'not re-checked'}
                </span>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  )
}
