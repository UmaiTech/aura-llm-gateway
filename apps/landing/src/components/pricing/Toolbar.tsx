import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { CURRENCIES, type Converter, type Currency } from '../../lib/pricing/currency'
import { SORT_KEYS, SORT_LABELS, type RowFilters, type SortKey } from '../../lib/pricing/table'
import { fmtDate } from '../../lib/pricing/format'

const control =
  'rounded-control border border-aura-border bg-aura-surface text-sm text-aura-text hover:border-aura-dim/60 transition-colors'

export function Toolbar({
  filters,
  onFilters,
  providerOptions,
  capabilityOptions,
  sort,
  onSort,
  currency,
  onCurrency,
  currencies,
  conv,
  active,
  onReset,
}: {
  filters: RowFilters
  onFilters: (f: RowFilters) => void
  providerOptions: { value: string; label: string }[]
  capabilityOptions: string[]
  sort: SortKey
  onSort: (s: SortKey) => void
  currency: Currency
  onCurrency: (c: Currency) => void
  currencies: Currency[]
  conv: Converter
  active: boolean
  onReset: () => void
}) {
  const id = useId()
  // The requested currency stays selectable even without a rate (e.g. from
  // a shared link), so the fallback notice below has something to explain.
  const options = currencies.includes(currency) ? currencies : [...currencies, currency]
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_240px]">
          <label htmlFor={`${id}-q`} className="sr-only">
            Search models
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-aura-dim" aria-hidden />
          <input
            id={`${id}-q`}
            type="search"
            value={filters.query}
            onChange={(e) => onFilters({ ...filters, query: e.target.value })}
            placeholder="Search models, ids or providers"
            className={`${control} w-full py-2 pl-9 pr-3 placeholder:text-aura-dim focus:outline-none focus-visible:border-aura-accent`}
          />
        </div>
        <MultiSelect
          label="Providers"
          options={providerOptions}
          selected={filters.providers}
          onChange={(providers) => onFilters({ ...filters, providers })}
        />
        {capabilityOptions.length > 0 && (
          <MultiSelect
            label="Capabilities"
            options={capabilityOptions.map((c) => ({ value: c, label: c }))}
            selected={filters.capabilities}
            onChange={(capabilities) => onFilters({ ...filters, capabilities })}
            note="Shows models listing every selected capability. Models without capability data are unknown, not unsupported."
          />
        )}
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-sort`} className="text-xs text-aura-muted">
            Sort
          </label>
          <select
            id={`${id}-sort`}
            value={sort}
            onChange={(e) => onSort(e.target.value as SortKey)}
            className={`${control} cursor-pointer px-2.5 py-2`}
          >
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
                {k === 'context' ? ' (largest)' : k === 'name' ? ' (A–Z)' : ' (lowest)'}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-cur`} className="text-xs text-aura-muted">
            Currency
          </label>
          <select
            id={`${id}-cur`}
            value={currency}
            onChange={(e) => onCurrency(e.target.value as Currency)}
            className={`${control} cursor-pointer px-2.5 py-2`}
          >
            {CURRENCIES.filter((c) => options.includes(c)).map((c) => (
              <option key={c} value={c}>
                {c}
                {!currencies.includes(c) ? ' (no rate)' : ''}
              </option>
            ))}
          </select>
        </div>
        {active && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-control px-2 py-2 text-xs text-aura-muted hover:bg-aura-hover hover:text-aura-text"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear filters
          </button>
        )}
      </div>
      <p className="text-xs text-aura-muted">
        {conv.fallback ? (
          <span className="font-medium text-aura-amber">
            No {conv.requested} exchange rate is available, so prices are shown in USD.
          </span>
        ) : conv.display === 'USD' ? (
          'USD list prices as published by each provider.'
        ) : (
          <>
            Converted from USD list prices at the Riksbank rate
            {conv.rateDate ? (
              <>
                {' '}
                of <span className="font-mono tabular-nums text-aura-text">{fmtDate(conv.rateDate)}</span>
              </>
            ) : (
              ' (rate date unknown)'
            )}
            .
          </>
        )}
      </p>
    </div>
  )
}

/** Checkbox popover for multi-value filters. Escape or an outside click closes it. */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  note,
}: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
  note?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    const onFocus = (e: FocusEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocus)
    }
  }, [open])

  const set = new Set(selected)
  const toggle = (v: string) => onChange(set.has(v) ? selected.filter((s) => s !== v) : [...selected, v])

  return (
    <div className="relative" ref={root}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((o) => !o)}
        className={`${control} inline-flex items-center gap-2 px-3 py-2`}
      >
        {label}
        {selected.length > 0 ? (
          <span className="rounded-full bg-aura-accent/15 px-1.5 font-mono text-xs tabular-nums text-aura-accent">
            {selected.length}
            <span className="sr-only"> selected</span>
          </span>
        ) : (
          <span className="text-xs text-aura-muted">all</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-aura-muted" aria-hidden />
      </button>
      {open && (
        <div
          id={`${id}-panel`}
          className="absolute left-0 z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-panel border border-aura-border bg-aura-surface py-1.5 shadow-xl"
        >
          <fieldset>
            <legend className="sr-only">{label}</legend>
            <div className="max-h-72 overflow-y-auto">
              {options.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm text-aura-text hover:bg-aura-hover"
                >
                  <input
                    type="checkbox"
                    checked={set.has(o.value)}
                    onChange={() => toggle(o.value)}
                    className="h-4 w-4 accent-[rgb(var(--aura-rgb-action))]"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          {note && <p className="border-t border-aura-border px-3 pb-1 pt-2 text-[11px] leading-snug text-aura-muted">{note}</p>}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full border-t border-aura-border px-3 pt-2 text-left text-xs text-aura-muted hover:text-aura-text"
            >
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
