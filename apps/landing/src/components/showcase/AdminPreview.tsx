import { ArrowRight } from 'lucide-react'
import { Drawer } from '@aura/ui/ui/Drawer.tsx'
import {
  SAMPLE_HEALTH,
  SAMPLE_HOURLY,
  SAMPLE_LABEL,
  SAMPLE_METRICS,
  SAMPLE_REQUESTS,
  type HealthStatus,
  type SampleRequest,
} from './sampleData'

const STATUS_CLASS: Record<HealthStatus, string> = {
  healthy: 'aui-status',
  degraded: 'aui-status aui-status--warn',
  down: 'aui-status aui-status--bad',
}

/** Static requests-per-hour bars. Described in text for screen readers. */
export function HourlyBars({ className = '' }: { className?: string }) {
  const max = Math.max(...SAMPLE_HOURLY)
  const peak = SAMPLE_HOURLY.indexOf(max)
  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${SAMPLE_HOURLY.length * 12} 80`} preserveAspectRatio="none" className="h-24 w-full" aria-hidden>
        {SAMPLE_HOURLY.map((v, i) => {
          const h = Math.max(4, (v / max) * 76)
          return (
            <rect
              key={i}
              x={i * 12 + 1.5}
              y={80 - h}
              width={9}
              height={h}
              rx={1.5}
              className={i === peak ? 'fill-aura-accent' : 'fill-aura-accent/45'}
            />
          )
        })}
      </svg>
      <figcaption className="sr-only">
        Sample requests per hour over one day, peaking at {max.toLocaleString('en-US')} requests around {peak}:00.
      </figcaption>
    </figure>
  )
}

export function MetricGrid({ count = 3 }: { count?: number }) {
  return (
    <dl className="grid grid-cols-3 gap-4">
      {SAMPLE_METRICS.slice(0, count).map((m) => (
        <div key={m.label} className="min-w-0">
          <dt className="text-[11px] text-aura-dim">{m.label}</dt>
          <dd className="mt-1 font-mono text-lg sm:text-2xl tabular-nums tracking-tight text-aura-text">{m.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HealthList() {
  return (
    <ul className="divide-y divide-aura-border">
      {SAMPLE_HEALTH.map((p) => (
        <li key={p.provider} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="text-sm text-aura-text">{p.provider}</div>
            <div className="mt-0.5 text-[11px] text-aura-dim">{p.note}</div>
          </div>
          <div className="shrink-0 text-right">
            <span className={STATUS_CLASS[p.status]}>{p.status}</span>
            <div className="mt-0.5 font-mono text-[11px] text-aura-dim tabular-nums">
              {p.successRate} · p50 {p.p50}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Sample request rows; each opens the request drawer. */
export function RequestTable({ onOpen }: { onOpen: (req: SampleRequest) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] text-left text-xs">
        <caption className="sr-only">Sample requests. Select a request to inspect it.</caption>
        <thead>
          <tr className="text-[11px] text-aura-dim">
            <th scope="col" className="py-2 pr-3 font-normal">Request</th>
            <th scope="col" className="py-2 pr-3 font-normal">Model</th>
            <th scope="col" className="py-2 pr-3 font-normal">Status</th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">Duration</th>
            <th scope="col" className="py-2 text-right font-normal">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-aura-border border-t border-aura-border">
          {SAMPLE_REQUESTS.map((r) => (
            <tr key={r.id} className="hover:bg-aura-accent/5">
              <td className="py-2.5 pr-3">
                <button
                  type="button"
                  onClick={() => onOpen(r)}
                  className="font-mono text-[11px] text-aura-accent underline-offset-2 hover:underline"
                  aria-label={`Inspect sample request ${r.id}`}
                >
                  {r.id}
                </button>
              </td>
              <td className="py-2.5 pr-3 font-mono text-[11px] text-aura-muted">
                {r.model}
                {r.requestedModel !== r.model && <span className="text-aura-dim"> ← {r.requestedModel}</span>}
              </td>
              <td className="py-2.5 pr-3">
                <span className={r.status === 'completed' ? 'aui-status' : 'aui-status aui-status--bad'}>{r.status}</span>
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-[11px] tabular-nums text-aura-muted">{r.duration}</td>
              <td className="py-2.5 text-right font-mono text-[11px] tabular-nums text-aura-muted">{r.cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Request detail as the admin app shows it, for one sample request. */
export function RequestDetail({ req }: { req: SampleRequest }) {
  const routing = req.routing
  return (
    <div className="space-y-5">
      <dl className="aui-kv">
        <div>
          <dt>Answered by</dt>
          <dd>{req.model}</dd>
        </div>
        <div>
          <dt>Requested model</dt>
          <dd>{req.requestedModel}</dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>{req.provider}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className={req.status === 'completed' ? 'aui-status' : 'aui-status aui-status--bad'}>{req.status}</span>
          </dd>
        </div>
        <div>
          <dt>Tokens in / out</dt>
          <dd>
            {req.inputTokens.toLocaleString('en-US')} / {req.outputTokens.toLocaleString('en-US')}
          </dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd>{req.cost}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{req.duration}</dd>
        </div>
      </dl>
      {routing && (
        <section aria-label="Routing decision" className="rounded-control border border-aura-border bg-aura-bg p-4">
          <div className="eyebrow">Auto routing · applied</div>
          <p className="mt-2 text-sm text-aura-text">
            Classified <span className="font-mono">{routing.classified_tier}</span> at score{' '}
            <span className="font-mono">{routing.score.toFixed(2)}</span>, routed in{' '}
            <span className="font-mono">{routing.tier}</span>.
          </p>
          <p className="mt-1 text-xs text-aura-muted">{routing.reason}</p>
          {routing.hard_filters.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Constraints">
              {routing.hard_filters.map((f) => (
                <li key={f} className="rounded border border-aura-border px-1.5 py-0.5 font-mono text-[10px] text-aura-muted">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

export function RequestDrawer({ req, onClose }: { req: SampleRequest | null; onClose: () => void }) {
  return (
    <Drawer
      open={req !== null}
      onClose={onClose}
      title="Request detail"
      subtitle={req ? `${req.id} · ${req.at}` : undefined}
      closeLabel="Close request detail"
      footer={`${SAMPLE_LABEL}. In the admin app this drawer opens from Request logs.`}
    >
      {req && <RequestDetail req={req} />}
    </Drawer>
  )
}

/** Compact admin card for the hero switcher. */
export function AdminGlance() {
  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="text-aura-muted">Sample workspace / Production</span>
        <span className="sample-tag">{SAMPLE_LABEL}</span>
      </div>
      <p className="mt-4 text-lg font-semibold tracking-tight text-aura-text">Your gateway, at a glance.</p>
      <div className="mt-5">
        <MetricGrid />
      </div>
      <HourlyBars className="mt-6" />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="aui-status">OpenAI healthy</span>
        <span className="aui-status aui-status--warn">Google degraded</span>
      </div>
      <a href="#admin" className="mt-3 inline-flex items-center gap-1.5 text-xs text-aura-accent hover:underline">
        Explore traffic, cost and health
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  )
}
