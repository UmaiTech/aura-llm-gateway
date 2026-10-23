import { Fragment, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react'
import { formatMoney, formatPrice, type Converter } from '../../lib/pricing/currency'
import type { Estimate } from '../../lib/pricing/estimator'
import { fmtCount, fmtDate, fmtTokens } from '../../lib/pricing/format'
import type { PricingRow } from '../../lib/pricing/types'
import { ProviderLink, RowFreshnessNote } from './Freshness'

const th = 'px-3 py-2.5 text-left align-bottom font-medium'
const thNum = `${th} text-right`

/** Header cell: short name plus the exact unit, both read by screen readers. */
function Head({ title, unit, num = true }: { title: string; unit: string; num?: boolean }) {
  return (
    <th scope="col" className={num ? thNum : th}>
      <span className="block text-xs text-aura-text">{title}</span>
      <span className="block whitespace-nowrap text-[11px] font-normal text-aura-muted">{unit}</span>
    </th>
  )
}

export function PricingTable({
  rows,
  estimates,
  conv,
  compare,
  compareFull,
  fullNoteId,
  onToggleCompare,
  requests,
}: {
  rows: PricingRow[]
  estimates: Map<string, Estimate>
  conv: Converter
  compare: string[]
  compareFull: boolean
  fullNoteId: string
  onToggleCompare: (row: PricingRow) => void
  requests: number | null
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggleOpen = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const cur = conv.display

  return (
    <div className="relative overflow-x-auto rounded-panel border border-aura-border bg-aura-surface">
      <table className="w-full min-w-[940px] border-collapse text-sm">
        <caption className="sr-only">
          Model list prices in {cur} per 1M tokens, with the estimated cost of your workload. Prices of unknown value are
          shown as a dash.
        </caption>
        <thead className="border-b border-aura-border bg-aura-surface-2/60">
          <tr>
            <th scope="col" className={`${th} w-12`}>
              <span className="block text-xs text-aura-text">Compare</span>
              <span className="block text-[11px] font-normal text-aura-muted">max 3</span>
            </th>
            <Head title="Model" unit="provider · id" num={false} />
            <Head title="Input" unit={`${cur} per 1M input tokens`} />
            <Head title="Output" unit={`${cur} per 1M output tokens`} />
            <Head title="Cached input" unit={`${cur} per 1M cached tokens`} />
            <Head title="Context" unit="tokens (max output)" />
            <Head
              title="Workload estimate"
              unit={requests === null ? `${cur} total` : `${cur} for ${fmtCount(requests)} requests`}
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const selected = compare.includes(r.key)
            const disabled = compareFull && !selected
            const isOpen = open.has(r.key)
            const Chevron = isOpen ? ChevronDown : ChevronRight
            const detailsId = `details-${r.key.replace(/[^a-zA-Z0-9_-]/g, '_')}`
            return (
              <Fragment key={r.key}>
                <tr className={`border-b border-aura-border/70 align-top ${selected ? 'bg-aura-accent/[0.06]' : ''}`}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      // aria-disabled keeps the box focusable so the reason is reachable;
                      // the toggle itself refuses and announces the cap.
                      aria-disabled={disabled || undefined}
                      aria-describedby={disabled ? fullNoteId : undefined}
                      aria-label={`Compare ${r.model_name} (${r.providerDisplay})`}
                      onChange={() => onToggleCompare(r)}
                      className={`mt-0.5 h-4 w-4 cursor-pointer accent-[rgb(var(--aura-rgb-action))] ${
                        disabled ? 'cursor-not-allowed opacity-40' : ''
                      }`}
                    />
                  </td>
                  <td className="min-w-[240px] px-3 py-3">
                    <button
                      type="button"
                      onClick={() => toggleOpen(r.key)}
                      aria-expanded={isOpen}
                      aria-controls={detailsId}
                      className="group flex items-start gap-1.5 rounded-control text-left"
                    >
                      <Chevron className="mt-0.5 h-4 w-4 shrink-0 text-aura-dim group-hover:text-aura-text" aria-hidden />
                      <span>
                        <span className="block font-medium text-aura-text group-hover:underline">{r.model_name}</span>
                        <span className="block text-xs text-aura-muted">
                          {r.providerDisplay} · <span className="font-mono">{r.model_id}</span>
                        </span>
                        <span className="sr-only">, show details</span>
                      </span>
                    </button>
                    <div className="pl-[22px]">
                      <RowFreshnessNote freshness={r.freshness} />
                    </div>
                  </td>
                  <PriceCell value={r.input_per_million} conv={conv} />
                  <PriceCell value={r.output_per_million} conv={conv} />
                  <PriceCell value={r.cached_input_per_million} conv={conv} muted />
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-aura-text">
                    {r.context_window === null ? <Unknown /> : fmtTokens(r.context_window)}
                    <span className="block text-xs text-aura-muted">
                      {r.max_output_tokens === null ? 'max out unknown' : `max ${fmtTokens(r.max_output_tokens)}`}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <EstimateCell estimate={estimates.get(r.key)} conv={conv} />
                  </td>
                </tr>
                {isOpen && (
                  <tr id={detailsId} className="border-b border-aura-border/70 bg-aura-surface-2/40">
                    <td />
                    <td colSpan={6} className="px-3 pb-4 pt-1">
                      <ModelDetails row={r} conv={conv} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Unknown({ label = 'unknown' }: { label?: string }) {
  return (
    <>
      <span aria-hidden className="text-aura-dim">
        —
      </span>
      <span className="sr-only">{label}</span>
    </>
  )
}

function PriceCell({ value, conv, muted }: { value: number | null; conv: Converter; muted?: boolean }) {
  return (
    <td className={`px-3 py-3 text-right font-mono tabular-nums ${muted ? 'text-aura-muted' : 'text-aura-text'}`}>
      {value === null ? <Unknown label="not published" /> : formatPrice(value, conv)}
    </td>
  )
}

export function EstimateCell({ estimate, conv }: { estimate: Estimate | undefined; conv: Converter }) {
  if (!estimate || estimate.status === 'invalid') {
    return (
      <span className="text-xs text-aura-muted">
        <Unknown label="no estimate" /> <span aria-hidden>check workload</span>
      </span>
    )
  }
  const { limits } = estimate
  const flags: string[] = []
  if (limits.exceedsContext) flags.push('exceeds context window')
  if (limits.exceedsMaxOutput) flags.push('exceeds max output')
  const unknownLimits: string[] = []
  if (limits.exceedsContext === null) unknownLimits.push('context')
  if (limits.exceedsMaxOutput === null) unknownLimits.push('max output')

  return (
    <div className="flex flex-col items-end gap-0.5">
      {estimate.status === 'ok' ? (
        <span className={`font-mono font-medium tabular-nums ${flags.length ? 'text-aura-muted' : 'text-aura-accent'}`}>
          {formatMoney(estimate.usd, conv)}
        </span>
      ) : (
        <span className="text-xs font-medium text-aura-text">
          Unavailable
          <span className="block font-normal text-aura-muted">no {estimate.missing.join(' or ')} price</span>
        </span>
      )}
      {flags.length > 0 && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-aura-amber">
          <TriangleAlert className="h-3 w-3" aria-hidden />
          {flags.join(', ')}
        </span>
      )}
      {flags.length === 0 && unknownLimits.length > 0 && (
        <span className="text-[11px] text-aura-muted">{unknownLimits.join(' and ')} limit unknown</span>
      )}
    </div>
  )
}

function ModelDetails({ row: r, conv }: { row: PricingRow; conv: Converter }) {
  const item = (label: string, value: ReactNode) => (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-aura-muted">{label}</dt>
      <dd className="mt-0.5 text-aura-text">{value}</dd>
    </div>
  )
  return (
    <div className="space-y-3 text-sm">
      {r.good_at && (
        <p className="text-aura-text">
          <span className="text-aura-muted">Good at: </span>
          {r.good_at}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-aura-muted">Capabilities:</span>
        {r.capabilities === null ? (
          <span className="text-xs text-aura-text">unknown (not published in the catalog)</span>
        ) : r.capabilities.length === 0 ? (
          <span className="text-xs text-aura-text">none listed</span>
        ) : (
          r.capabilities.map((c) => (
            <span key={c} className="rounded-full border border-aura-border px-2 py-0.5 font-mono text-[11px] text-aura-text">
              {c}
            </span>
          ))
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 font-mono text-xs tabular-nums sm:grid-cols-4">
        {item('Batch input /1M', formatPrice(r.batch_input_per_million, conv))}
        {item('Batch output /1M', formatPrice(r.batch_output_per_million, conv))}
        {item('Context window', r.context_window === null ? 'unknown' : `${fmtCount(r.context_window)} tokens`)}
        {item('Max output', r.max_output_tokens === null ? 'unknown' : `${fmtCount(r.max_output_tokens)} tokens`)}
        {item(
          'Output / input ratio',
          r.input_per_million && r.output_per_million !== null
            ? `${(r.output_per_million / r.input_per_million).toFixed(1)}×`
            : '—',
        )}
        {item('Price in effect since', fmtDate(r.effective_from))}
        {r.aliases.length > 0 && item('Also listed as', <span className="break-all">{r.aliases.join(', ')}</span>)}
        {r.price_samples !== undefined && r.price_samples > 1 && item('Price sources', `${r.price_samples} rows (majority vote)`)}
      </dl>
      <p className="text-xs text-aura-muted">
        Batch rates are listed for reference and are not used in the estimate.
        {r.modelsUrl && (
          <>
            {' '}
            Source: <ProviderLink href={r.modelsUrl} label={`${r.providerDisplay} models and pricing`} />
          </>
        )}
      </p>
    </div>
  )
}
