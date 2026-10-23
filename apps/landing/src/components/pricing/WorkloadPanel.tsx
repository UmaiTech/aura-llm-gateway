import { useId } from 'react'
import { Info, RotateCcw } from 'lucide-react'
import {
  DEFAULT_WORKLOAD_FORM,
  type ParsedWorkload,
  type WorkloadField,
  type WorkloadForm,
} from '../../lib/pricing/estimator'
import type { Converter } from '../../lib/pricing/currency'
import { fmtCount } from '../../lib/pricing/format'

const FIELDS: { field: WorkloadField; label: string; hint: string; suffix?: string }[] = [
  { field: 'requests', label: 'Requests', hint: 'How many requests (N)' },
  { field: 'inputTokens', label: 'Input tokens per request', hint: 'Prompt, history and tool results (I)' },
  { field: 'outputTokens', label: 'Output tokens per request', hint: 'Generated tokens (O)' },
  { field: 'cachedPercent', label: 'Cached input', hint: 'Share of input served from cache, 0–100 (H)', suffix: '%' },
]

export const EXCLUSIONS = [
  'cache-write charges',
  'reasoning and tool-call fees',
  'batch pricing',
  'regional and long-context price tiers',
  'negotiated or committed-use rates',
  'taxes',
]

/**
 * Workload assumptions for the estimate column. Values are plain text
 * inputs (so "1,000" works) validated inline; an invalid field blanks the
 * estimates instead of guessing.
 */
export function WorkloadPanel({
  form,
  parsed,
  conv,
  onChange,
}: {
  form: WorkloadForm
  parsed: ParsedWorkload
  conv: Converter
  onChange: (next: WorkloadForm) => void
}) {
  const id = useId()
  const isDefault = (Object.keys(DEFAULT_WORKLOAD_FORM) as WorkloadField[]).every(
    (k) => form[k] === DEFAULT_WORKLOAD_FORM[k],
  )
  const w = parsed.workload

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-panel border border-aura-border bg-aura-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-base font-semibold text-aura-text">
            Your workload
          </h2>
          <p className="mt-1 text-sm text-aura-muted">
            Sets the <span className="text-aura-text">workload estimate</span> column. Approximate list-price arithmetic in{' '}
            {conv.display}, not a quote.
          </p>
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_WORKLOAD_FORM)}
            className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs text-aura-muted hover:bg-aura-hover hover:text-aura-text"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset workload
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FIELDS.map(({ field, label, hint, suffix }) => {
          const inputId = `${id}-${field}`
          const error = parsed.errors[field]
          return (
            <div key={field}>
              <label htmlFor={inputId} className="block text-xs font-medium text-aura-text">
                {label}
              </label>
              <div className="relative mt-1.5">
                <input
                  id={inputId}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  value={form[field]}
                  onChange={(e) => onChange({ ...form, [field]: e.target.value })}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ''}`}
                  className={`w-full rounded-control border bg-aura-bg px-3 py-2 font-mono text-sm tabular-nums text-aura-text focus:outline-none focus-visible:border-aura-accent focus-visible:outline-2 focus-visible:outline-offset-0 ${
                    suffix ? 'pr-8' : ''
                  } ${error ? 'border-aura-red' : 'border-aura-border'}`}
                />
                {suffix && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-aura-muted" aria-hidden>
                    {suffix}
                  </span>
                )}
              </div>
              <p id={`${inputId}-hint`} className="mt-1 text-[11px] text-aura-muted">
                {hint}
              </p>
              {error && (
                <p id={`${inputId}-error`} className="mt-1 text-xs font-medium text-aura-red">
                  {error}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4 border-t border-aura-border pt-3 text-xs text-aura-muted">
        <p>
          {w ? (
            <>
              Estimating{' '}
              <span className="font-mono tabular-nums text-aura-text">{fmtCount(w.requests)}</span> requests ×{' '}
              <span className="font-mono tabular-nums text-aura-text">{fmtCount(w.inputTokens)}</span> input +{' '}
              <span className="font-mono tabular-nums text-aura-text">{fmtCount(w.outputTokens)}</span> output tokens,{' '}
              <span className="font-mono tabular-nums text-aura-text">{fmtCount(w.cachedShare * 100)}%</span> of input cached.
            </>
          ) : (
            <span className="text-aura-red">Fix the highlighted field to see estimates.</span>
          )}
        </p>
        <p className="mt-1.5 flex items-start gap-1.5">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Approximate: token counts are your assumption and tokenizers differ by model. Not included:{' '}
            {EXCLUSIONS.join(', ')}. “—” means a price is unknown, never free.
          </span>
        </p>
      </div>
    </section>
  )
}
