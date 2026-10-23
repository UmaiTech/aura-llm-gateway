import { useState, type ReactNode } from 'react'
import { TabPanel, Tabs, useTabsId } from '../ui/Tabs.tsx'
import { formatMicros, formatOffset, formatPerMillion, formatUsd, type RoutingView } from './decision.ts'

export type InspectorTab = 'overview' | 'routing' | 'raw'

interface RoutingInspectorProps {
  view: RoutingView
  /** Full response or stored record, shown on the Raw JSON tab. */
  raw?: unknown
  /** Extra overview rows (usage, cost, latency) from the host app. */
  overviewExtra?: ReactNode
  initialTab?: InspectorTab
  /** Controlled tab, e.g. to open straight on Routing. */
  tab?: InspectorTab
  onTabChange?: (tab: InspectorTab) => void
  className?: string
}

/**
 * Explains one auto-router decision: overview → routing detail → raw JSON.
 * Shared by the playground, the admin app and the landing previews; feed
 * it a view from `fromResponseDecision` / `fromStoredDecision`.
 *
 * Field order follows AUTO_ROUTER_CONTRACT.md: the model that answered,
 * applied vs shadow, requested alias and mode, classified → final tier with
 * score and boundaries, reason and constraints, candidates, escalations,
 * raw metadata. Shadow picks are always labelled hypothetical.
 */
export function RoutingInspector({
  view,
  raw,
  overviewExtra,
  initialTab = 'overview',
  tab: controlledTab,
  onTabChange,
  className = '',
}: RoutingInspectorProps) {
  const [ownTab, setOwnTab] = useState<InspectorTab>(initialTab)
  const tab = controlledTab ?? ownTab
  const setTab = (t: InspectorTab) => {
    setOwnTab(t)
    onTabChange?.(t)
  }
  const ids = useTabsId()
  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'routing', label: 'Routing' },
    ...(raw !== undefined ? [{ id: 'raw' as const, label: 'Raw JSON' }] : []),
  ]

  return (
    <div className={`aui-ri ${className}`}>
      <Tabs ids={ids} label="Request details" tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel ids={ids} id={tab} className="aui-ri-panel">
        {tab === 'overview' && <Overview view={view} extra={overviewExtra} />}
        {tab === 'routing' && <RoutingDetail view={view} />}
        {tab === 'raw' && <RawJson value={raw} />}
      </TabPanel>
    </div>
  )
}

export function DecisionBadge({ view }: { view: RoutingView }) {
  return view.kind === 'shadow' ? (
    <span className="aui-badge aui-badge--shadow">Shadow · not applied</span>
  ) : (
    <span className="aui-badge aui-badge--applied">Auto · applied</span>
  )
}

function Overview({ view, extra }: { view: RoutingView; extra?: ReactNode }) {
  return (
    <div className="aui-ri-stack">
      <div>
        <div className="aui-ri-row-between">
          <span className="aui-ri-label">Answered by</span>
          <DecisionBadge view={view} />
        </div>
        <div className="aui-ri-model">{view.answeredBy ?? 'unknown'}</div>
        {view.answeredByProvider && <div className="aui-ri-sub">{view.answeredByProvider}</div>}
      </div>

      {view.kind === 'shadow' && (
        <p className="aui-ri-callout aui-ri-callout--shadow">
          Auto would have picked <code>{view.hypotheticalModel ?? 'nothing eligible'}</code>
          {view.hypotheticalProvider ? ` (${view.hypotheticalProvider})` : ''} in {view.finalTier}. Recorded for
          comparison only — the pinned model answered.
        </p>
      )}
      {view.firstTried && (
        <p className="aui-ri-callout">
          Escalated after a provider failure: first tried <code>{view.firstTried}</code>.
        </p>
      )}
      {view.answerDiffersFromPick && !view.firstTried && (
        <p className="aui-ri-callout">
          The response reports <code>{view.answeredBy}</code>; the router picked <code>{view.selected}</code>.
        </p>
      )}

      <dl className="aui-kv">
        <div>
          <dt>Requested</dt>
          <dd>{view.requestedModel}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{view.mode}</dd>
        </div>
        <div>
          <dt>Tier</dt>
          <dd>{view.tierMoved ? `${view.classifiedTier} → ${view.finalTier}` : view.finalTier}</dd>
        </div>
        {view.predictedCostUsd !== null && (
          <div>
            <dt>{view.kind === 'shadow' ? 'Predicted cost (hypothetical)' : 'Predicted cost'}</dt>
            <dd>{formatUsd(view.predictedCostUsd)}</dd>
          </div>
        )}
        {extra}
      </dl>
      <p className="aui-ri-reason">{view.reason}</p>
    </div>
  )
}

export function TierScale({ view }: { view: RoutingView }) {
  const pct = Math.min(1, Math.max(0, view.score)) * 100
  return (
    <div className="aui-ri-scale">
      <div className="aui-ri-scale-track">
        <ol className="aui-ri-bands" aria-label="Tiers and score boundaries">
          {view.bands.map((band) => {
            const final = band.tier === view.finalTier
            const classified = band.tier === view.classifiedTier && view.tierMoved
            return (
              <li key={band.tier} style={{ width: `${(band.to - band.from) * 100}%` }} aria-current={final ? 'true' : undefined}>
                <span className={`aui-ri-band ${final ? 'is-final' : ''}`} />
                <span className={`aui-ri-band-label ${final ? 'is-final' : ''}`}>
                  {band.tier}
                  {final && <span className="aui-sr"> (final tier)</span>}
                  {classified && <span className="aui-ri-classified"> · classified</span>}
                </span>
                <span className="aui-ri-band-from">{band.from.toFixed(2)}</span>
              </li>
            )
          })}
        </ol>
        <span className="aui-ri-marker" style={{ left: `calc(${pct}% - 1px)` }} aria-hidden="true" />
      </div>
      <p className="aui-ri-sub">
        Score <strong>{view.score.toFixed(2)}</strong>
        {view.rawScore !== null && view.scoreOffset !== null && view.scoreOffset !== 0 && (
          <>
            {' '}
            (raw {view.rawScore.toFixed(2)}, {view.mode} {formatOffset(view.scoreOffset)})
          </>
        )}
        {view.boundariesSource === 'default'
          ? ' · default boundaries (not reported with this decision)'
          : view.boundariesSource === 'config'
            ? ' · boundaries currently configured'
            : ' · boundaries in force for this decision'}
      </p>
    </div>
  )
}

function RoutingDetail({ view }: { view: RoutingView }) {
  return (
    <div className="aui-ri-stack">
      <section>
        <h3 className="aui-ri-h">Classified → final tier</h3>
        <TierScale view={view} />
      </section>

      {view.signals.length > 0 && (
        <section>
          <h3 className="aui-ri-h">Signals</h3>
          <ul className="aui-ri-chips">
            {view.signals.map((s) => (
              <li key={s.name} className="aui-ri-chip">
                {s.name} <span className={s.value > 0 ? 'aui-up' : 'aui-down'}>{formatOffset(s.value)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="aui-ri-h">Constraints</h3>
        {view.optionFilters.length === 0 && view.shapeFilters.length === 0 && view.appliedOptions.length === 0 ? (
          <p className="aui-ri-sub">None applied.</p>
        ) : (
          <dl className="aui-kv">
            {view.optionFilters.length > 0 && (
              <div>
                <dt>Request & policy</dt>
                <dd>{view.optionFilters.join(' · ')}</dd>
              </div>
            )}
            {view.shapeFilters.length > 0 && (
              <div>
                <dt>Request shape</dt>
                <dd>{view.shapeFilters.join(' · ')}</dd>
              </div>
            )}
            {view.appliedOptions.length > 0 && (
              <div>
                <dt>Applied options</dt>
                <dd>{view.appliedOptions.map((o) => `${o.key}=${o.value}`).join(' · ')}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {view.candidates.length > 0 && (
        <section>
          <h3 className="aui-ri-h">Candidates considered</h3>
          <div className="aui-ri-table-wrap">
            <table className="aui-ri-table">
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Tier</th>
                  <th scope="col" className="num">
                    $ / 1M
                  </th>
                  {view.hasPredictedCosts && (
                    <th scope="col" className="num">
                      Predicted
                    </th>
                  )}
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {view.candidates.map((c) => (
                  <tr key={`${c.tier}:${c.model}`} className={c.picked ? 'is-picked' : c.eligible ? '' : 'is-ineligible'}>
                    <td className="mono">{c.model}</td>
                    <td>{c.provider ?? '—'}</td>
                    <td>{c.tier}</td>
                    <td className="num mono">{formatPerMillion(c.costPerMillion)}</td>
                    {view.hasPredictedCosts && <td className="num mono">{formatUsd(c.predictedCostUsd)}</td>}
                    <td>{c.picked ? (view.kind === 'shadow' ? 'would pick' : 'picked') : c.eligible ? 'eligible' : 'ineligible'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="aui-ri-sub">$ / 1M is the blended list price the router compares; "—" means unknown, not free.</p>
        </section>
      )}

      {view.escalations.length > 0 && (
        <section>
          <h3 className="aui-ri-h">Escalations</h3>
          <ol className="aui-ri-list">
            {view.escalations.map((e, i) => (
              <li key={i}>
                <code>{e.from_model}</code> ({e.from_tier}) → <code>{e.to_model}</code> ({e.to_tier}) after{' '}
                <code>{e.error_code}</code>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="aui-ri-sub">
        Classifier {view.classifier} · decided in {formatMicros(view.latencyUs)}
        {view.synthetic && ' · synthetic trace (excluded from stats)'}
      </p>
    </div>
  )
}

function RawJson({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false)
  const text = JSON.stringify(value, null, 2) ?? 'null'
  return (
    <div className="aui-ri-raw">
      <button
        type="button"
        className="aui-ri-copy"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }}
      >
        {copied ? 'Copied' : 'Copy JSON'}
      </button>
      <pre>{text}</pre>
    </div>
  )
}
