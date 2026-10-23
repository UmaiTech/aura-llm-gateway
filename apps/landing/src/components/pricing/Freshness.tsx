import { CircleAlert, CircleCheck, CircleX, Clock, ExternalLink } from 'lucide-react'
import type { CatalogFreshness } from '../../lib/pricing/normalize'
import { STALE_AFTER_DAYS } from '../../lib/pricing/normalize'
import { fmtAge, fmtDate } from '../../lib/pricing/format'
import type { PricingResponse, RowFreshness } from '../../lib/pricing/types'

/**
 * Catalog freshness and provenance: the global refresh, whether it is
 * stale, and per-provider outcomes of the latest scrape (a failed provider
 * keeps its earlier prices, which the table marks per row).
 */
export function FreshnessPanel({ data, freshness }: { data: PricingResponse; freshness: CatalogFreshness }) {
  const display = new Map(data.providers.map((p) => [p.name, p.display_name]))
  const name = (p: string) => display.get(p) ?? p
  const runs = data.last_run?.providers ?? []

  return (
    <section aria-labelledby="freshness-title" className="rounded-panel border border-aura-border bg-aura-surface">
      <h2 id="freshness-title" className="sr-only">
        Data freshness
      </h2>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex items-start gap-2.5 text-sm">
          {freshness.stale ? (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-aura-amber" aria-hidden />
          ) : (
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-aura-green" aria-hidden />
          )}
          <div>
            <p className="text-aura-text">
              {freshness.stale ? (
                <strong className="font-semibold text-aura-amber">Prices may be out of date. </strong>
              ) : null}
              Last refreshed{' '}
              <time dateTime={freshness.updatedAt ?? undefined} className="font-mono tabular-nums">
                {fmtDate(freshness.updatedAt)}
              </time>{' '}
              <span className="text-aura-muted">({fmtAge(freshness.ageDays)})</span>
            </p>
            <p className="mt-0.5 text-xs text-aura-muted">
              {freshness.stale
                ? freshness.ageDays === null
                  ? 'No refresh date is recorded.'
                  : `The scraper runs weekly; nothing newer than ${STALE_AFTER_DAYS} days means at least one run was missed.`
                : 'Scraped weekly from provider pricing pages and versioned with full price history.'}
              {!freshness.fromRun && freshness.updatedAt && ' No scrape run is logged, so this is the newest price change.'}
            </p>
          </div>
        </div>
        {runs.length > 0 && (
          <ul aria-label="Latest scrape by provider" className="flex flex-wrap gap-1.5 sm:max-w-[55%] sm:justify-end">
            {runs.map((r) => (
              <li key={r.provider}>
                <ProviderRunChip label={name(r.provider)} status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {(freshness.failed.length > 0 || freshness.review.length > 0 || freshness.missing.length > 0) && (
        <ul className="space-y-1.5 border-t border-aura-border px-4 py-3 text-xs sm:px-5">
          {freshness.failed.map((r) => (
            <li key={r.provider} className="flex items-start gap-2 text-aura-text">
              <CircleX className="mt-px h-3.5 w-3.5 shrink-0 text-aura-red" aria-hidden />
              <span>
                <strong className="font-semibold">{name(r.provider)}: latest scrape failed</strong>
                {r.error && <span className="font-mono text-aura-muted"> ({r.error})</span>}. Its prices are from earlier
                runs and were not re-checked.
              </span>
            </li>
          ))}
          {freshness.review.map((r) => (
            <li key={r.provider} className="flex items-start gap-2 text-aura-text">
              <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-aura-amber" aria-hidden />
              <span>
                <strong className="font-semibold">{name(r.provider)}: {r.models_flagged} price change(s) held for review</strong>.
                Those models keep their previous price until reviewed.
              </span>
            </li>
          ))}
          {freshness.missing.map((p) => (
            <li key={p} className="flex items-start gap-2 text-aura-text">
              <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-aura-amber" aria-hidden />
              <span>
                <strong className="font-semibold">{name(p)}: not covered by the latest scrape</strong>. Prices are from earlier
                runs.
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const RUN_LABEL: Record<string, string> = {
  success: 'updated',
  needs_review: 'needs review',
  failed: 'failed',
}

function ProviderRunChip({ label, status }: { label: string; status: string }) {
  const tone =
    status === 'success'
      ? 'text-aura-green border-aura-green/30'
      : status === 'needs_review'
        ? 'text-aura-amber border-aura-amber/40'
        : 'text-aura-red border-aura-red/40'
  const Icon = status === 'success' ? CircleCheck : status === 'needs_review' ? CircleAlert : CircleX
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${tone}`}>
      <Icon className="h-3 w-3" aria-hidden />
      <span className="text-aura-text">{label}</span>
      <span>{RUN_LABEL[status] ?? status}</span>
    </span>
  )
}

/** Per-row provenance marker; nothing is shown for a row verified in the latest run. */
export function RowFreshnessNote({ freshness }: { freshness: RowFreshness }) {
  if (freshness === 'current') return null
  return (
    <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-aura-amber">
      <Clock className="h-3 w-3" aria-hidden />
      {freshness === 'review' ? 'Provider has prices held for review' : 'Not re-checked in the latest scrape'}
    </span>
  )
}

export function ProviderLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-aura-accent underline-offset-2 hover:underline"
    >
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}
