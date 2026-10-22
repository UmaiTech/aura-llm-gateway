import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { cn, formatDuration, formatNumber } from '@/lib/utils'
import { CloseLine, Loading3Line, Refresh1Line } from '@mingcute/react'
import { getRoutingDecision, type RoutingDecisionDetail } from '@/lib/routing'
import {
  OUTCOME_LABELS,
  TIER_BAR,
  TIER_TONE,
  formatMicros,
  formatReward,
  formatTimestamp,
  formatUsd,
  rewardTone,
  tierBands,
} from './format'

// Hard filters that come from request options (or org policy) rather
// than from the request's shape.
const OPTION_PREFIXES = ['min_tier', 'max_tier', 'allow/deny', 'max_cost_usd', 'sticky']

function isOption(filter: string): boolean {
  return OPTION_PREFIXES.some((p) => filter.startsWith(p))
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm truncate">{children}</div>
    </div>
  )
}

function Flag({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', tone)}>{children}</span>
}

/**
 * Explains one auto-router decision. Mirrors the playground's routing
 * inspector (score against the tier bands, signals, constraints,
 * candidates, escalations, reason) and adds what happened afterwards.
 */
export function DecisionDrawer({ responseId, onClose }: { responseId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<RoutingDecisionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getRoutingDecision(responseId)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load decision'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [responseId, attempt])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Routing decision"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-5 py-3 backdrop-blur">
          <div className="min-w-0">
            <div className="text-sm font-medium">Routing decision</div>
            <div className="font-mono text-xs text-muted-foreground truncate">{responseId}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} title="Close (Esc)">
            <CloseLine className="h-4 w-4" />
          </Button>
        </div>

        {loading && !detail ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loading3Line className="h-4 w-4 animate-spin" />
            Loading decision...
          </div>
        ) : error ? (
          <div className="space-y-3 p-5">
            <div className="text-sm text-destructive">{error}</div>
            <Button size="sm" onClick={() => setAttempt((a) => a + 1)}>
              <Refresh1Line className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : detail ? (
          <DecisionBody d={detail} />
        ) : null}
      </aside>
    </div>
  )
}

function DecisionBody({ d }: { d: RoutingDecisionDetail }) {
  const bands = tierBands(d.boundaries_in_force)
  const score = Math.min(1, Math.max(0, d.score))
  const signals = Object.entries(d.signals ?? {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  const candidates = Array.isArray(d.candidates) ? d.candidates : []
  const hasPredicted = candidates.some((c) => c.predicted_cost_usd != null)
  const escalations = d.escalations ?? []
  const options = d.hard_filters.filter(isOption)
  const constraints = d.hard_filters.filter((f) => !isOption(f))
  const originalModel = escalations.length > 0 ? escalations[0].from_model : d.selected_model
  const predicted = candidates.find((c) => c.model === d.selected_model)?.predicted_cost_usd ?? null
  const o = d.outcome
  const features = Object.entries(d.features ?? {}).filter(([, v]) => v !== null && v !== false && v !== 0)

  return (
    <div className="space-y-6 p-5">
      {/* Headline */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Flag tone={TIER_TONE[d.tier] ?? 'bg-muted text-muted-foreground'}>{d.tier}</Flag>
          {d.shadow ? (
            <Flag tone="bg-amber-500/15 text-amber-400">shadow · would have picked {d.selected_model}</Flag>
          ) : (
            <Flag tone="bg-muted text-foreground">applied</Flag>
          )}
          {d.synthetic && <Flag tone="bg-sky-500/15 text-sky-300">synthetic</Flag>}
          {escalations.length > 0 && <Flag tone="bg-orange-500/15 text-orange-300">escalated</Flag>}
          {d.hard_filters.includes('sticky tool loop') && (
            <Flag tone="bg-muted text-muted-foreground">sticky</Flag>
          )}
          <span className="text-xs text-muted-foreground">{formatTimestamp(d.created_at)}</span>
        </div>
        <div className="font-mono text-sm">
          {d.requested_model} <span className="text-muted-foreground">→</span> {d.selected_model}
          {d.selected_provider && <span className="text-muted-foreground"> · {d.selected_provider}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Mode">{d.mode}</Field>
          <Field label="Classifier">
            <span className="font-mono text-xs">{d.classifier}</span>
          </Field>
          <Field label="Decided in">{formatMicros(d.decision_latency_us)}</Field>
          <Field label="Candidates">
            {candidates.filter((c) => c.eligible).length} / {candidates.length} eligible
          </Field>
        </div>
      </div>

      {/* Score against the tier boundaries */}
      <Section title="Complexity">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            score <span className="font-medium text-foreground tabular-nums">{d.score.toFixed(2)}</span>
            {d.raw_score !== d.score && (
              <span className="tabular-nums"> (raw {d.raw_score.toFixed(2)}, {d.mode} offset)</span>
            )}
          </span>
          <span title="Where these boundaries come from">
            {d.boundaries_source === 'recorded'
              ? 'boundaries at decision time'
              : d.boundaries_source === 'config'
                ? 'current boundaries (not recorded for this row)'
                : 'default boundaries'}
          </span>
        </div>
        <div className="relative flex h-2.5 w-full overflow-hidden rounded">
          {bands.map((b) => (
            <div
              key={b.tier}
              className={cn('h-full opacity-30', TIER_BAR[b.tier])}
              style={{ width: `${(b.to - b.from) * 100}%` }}
              title={`${b.tier}: ${b.from}–${b.to}`}
            />
          ))}
          <div
            className="absolute top-0 h-full w-0.5 bg-foreground"
            style={{ left: `calc(${score * 100}% - 1px)` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          {bands.map((b) => (
            <span key={b.tier} className={cn(b.tier === d.tier && 'font-medium text-foreground')}>
              {b.tier}
              {b.tier === d.classified_tier && b.tier !== d.tier && ' (classified)'}
            </span>
          ))}
        </div>
        {d.classified_tier !== d.tier && (
          <p className="text-xs text-muted-foreground">
            Classified <span className="text-foreground">{d.classified_tier}</span>, routed{' '}
            <span className="text-foreground">{d.tier}</span> after constraints
            {escalations.length > 0 && ' and escalation'}.
          </p>
        )}
      </Section>

      {signals.length > 0 && (
        <Section title="Signals">
          <div className="flex flex-wrap gap-1">
            {signals.map(([name, value]) => (
              <span
                key={name}
                className={cn(
                  'rounded px-1.5 py-0.5 font-mono text-xs',
                  value > 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400',
                )}
              >
                {name} {value > 0 ? '+' : ''}
                {value.toFixed(2)}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Applied options & constraints">
        {options.length === 0 && constraints.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            None. Mode <span className="text-foreground">{d.mode}</span>, no tier clamps, allow/deny lists or
            budget.
          </p>
        ) : (
          <div className="space-y-2">
            {options.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-muted-foreground">options</span>
                {options.map((f, i) => (
                  <span key={i} className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                    {f}
                  </span>
                ))}
              </div>
            )}
            {constraints.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-muted-foreground">request shape</span>
                {constraints.map((f, i) => (
                  <span key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      {candidates.length > 0 && (
        <Section title={`Candidates in ${d.tier}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/40">
                  <th className="py-1 pr-3 text-left font-normal">Model</th>
                  <th className="py-1 pr-3 text-left font-normal">Provider</th>
                  <th className="py-1 pr-3 text-left font-normal">Tier</th>
                  <th className="py-1 pr-3 text-right font-normal">$/1M</th>
                  {hasPredicted && <th className="py-1 pr-3 text-right font-normal">Predicted</th>}
                  <th className="py-1 text-left font-normal">Eligible</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const selected = c.model === d.selected_model
                  const original = escalations.length > 0 && c.model === originalModel
                  return (
                    <tr
                      key={`${c.tier}:${c.model}`}
                      className={cn(
                        'border-b border-border/20 last:border-0',
                        selected && 'font-medium',
                        !c.eligible && 'text-muted-foreground/60',
                      )}
                    >
                      <td className={cn('py-1 pr-3 font-mono', !c.eligible && 'line-through')}>
                        {selected ? '▸ ' : ''}
                        {c.model}
                        {original && <span className="ml-1 font-sans text-muted-foreground">(first choice)</span>}
                      </td>
                      <td className="py-1 pr-3">{c.provider ?? '—'}</td>
                      <td className="py-1 pr-3">{c.tier}</td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">
                        {c.cost_per_million != null ? c.cost_per_million.toFixed(2) : '—'}
                      </td>
                      {hasPredicted && (
                        <td className="py-1 pr-3 text-right font-mono tabular-nums">
                          {formatUsd(c.predicted_cost_usd)}
                        </td>
                      )}
                      <td className="py-1">
                        {c.eligible ? (
                          <span className="text-emerald-400">yes</span>
                        ) : (
                          <span>no</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {escalations.length > 0 && (
        <Section title="Escalation chain">
          <ol className="space-y-1 text-xs">
            <li className="font-mono">
              1. {escalations[0].from_model}{' '}
              <span className="text-muted-foreground">({escalations[0].from_tier})</span>
            </li>
            {escalations.map((e, i) => (
              <li key={i} className="font-mono">
                {i + 2}. {e.to_model} <span className="text-muted-foreground">({e.to_tier})</span>
                <span className="ml-2 font-sans text-orange-300">after {e.error_code}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section title="Reason">
        <p className="text-sm">{d.reason}</p>
      </Section>

      <Section title="Outcome">
        {!o || (o.status === null && o.next_turn === null) ? (
          <p className="text-xs text-muted-foreground">
            No request log or outcome yet. Outcomes are scored by the rollup after the conversation moves on
            (or via <code className="text-foreground">POST /admin/routing/rollup</code>).
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Status">
                <span
                  className={cn(
                    o.status === 'completed' ? 'text-emerald-400' : o.status ? 'text-destructive/80' : '',
                  )}
                >
                  {o.status ?? '—'}
                </span>
                {o.incomplete_reason && (
                  <span className="text-muted-foreground"> · {o.incomplete_reason}</span>
                )}
              </Field>
              <Field label="Served by">
                <span className="font-mono text-xs">{o.actual_model ?? '—'}</span>
              </Field>
              <Field label="Latency">{o.latency_ms != null ? formatDuration(o.latency_ms) : '—'}</Field>
              <Field label="Tokens">
                {o.input_tokens != null || o.output_tokens != null
                  ? `${formatNumber(o.input_tokens ?? 0)} in / ${formatNumber(o.output_tokens ?? 0)} out`
                  : '—'}
              </Field>
              <Field label="Actual cost">{formatUsd(o.cost_usd)}</Field>
              <Field label="Predicted cost">{formatUsd(predicted)}</Field>
              {d.shadow && <Field label="Est. savings">{formatUsd(o.estimated_savings_usd)}</Field>}
              <Field label="Tool calls">{o.tool_calls_count}</Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Next turn">
                {o.next_turn ? (OUTCOME_LABELS[o.next_turn] ?? o.next_turn) : 'not scored yet'}
              </Field>
              <Field label="Reward">
                <span className={cn('tabular-nums', rewardTone(o.reward))}>{formatReward(o.reward)}</span>
              </Field>
              <Field label="Feedback">{o.feedback ?? '—'}</Field>
              <Field label="Next model">
                <span className="font-mono text-xs">{o.next_model ?? '—'}</span>
              </Field>
            </div>
          </div>
        )}
      </Section>

      {features.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Features ({features.length} non-zero)
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
            {features.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-border/20 py-0.5">
                <span className="truncate text-muted-foreground">{k}</span>
                <span className="font-mono tabular-nums">
                  {typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(3)) : String(v)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="space-y-0.5 border-t border-border/40 pt-3 font-mono text-[11px] text-muted-foreground">
        <div>request {d.response_id}</div>
        {d.provider_response_id && <div>response {d.provider_response_id}</div>}
        {d.organization_id && <div>org {d.organization_id}</div>}
        {d.api_key_id && <div>key {d.api_key_id}</div>}
        {d.conversation_id && <div>conversation {d.conversation_id}</div>}
      </div>
    </div>
  )
}
