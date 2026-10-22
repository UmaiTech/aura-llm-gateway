import type { DemoDecision } from '../../lib/autoRouterDemo'

/**
 * Score against the tier bands. The selected tier is marked by text and an
 * underline, not colour alone; the classified tier is labelled when a
 * constraint moved the request.
 */
export function TierScale({ decision }: { decision: DemoDecision }) {
  const b = decision.boundaries
  const bands = [
    { tier: 'simple', from: 0, to: b.simple_medium },
    { tier: 'medium', from: b.simple_medium, to: b.medium_complex },
    { tier: 'complex', from: b.medium_complex, to: b.complex_reasoning },
    { tier: 'reasoning', from: b.complex_reasoning, to: 1 },
  ] as const
  const pct = Math.min(1, Math.max(0, decision.score)) * 100
  return (
    <div>
      <div className="relative">
        <ol className="flex gap-1" aria-label="Tiers">
          {bands.map((band) => {
            const final = band.tier === decision.tier
            const classified = band.tier === decision.classified_tier && !final
            return (
              <li key={band.tier} className="min-w-0" style={{ width: `${(band.to - band.from) * 100}%` }}>
                <div className={`h-1.5 rounded-full ${final ? 'bg-aura-accent' : 'bg-aura-border'}`} />
                <div
                  className={`mt-1.5 truncate font-mono text-[10px] ${final ? 'text-aura-text font-medium' : 'text-aura-dim'}`}
                  aria-current={final ? 'true' : undefined}
                >
                  {band.tier}
                  {final && <span className="sr-only"> (final tier)</span>}
                  {classified && <span className="text-aura-amber"> · classified</span>}
                </div>
              </li>
            )
          })}
        </ol>
        <div
          className="absolute -top-1 h-3.5 w-0.5 rounded bg-aura-text"
          style={{ left: `calc(${pct}% - 1px)` }}
          aria-hidden
          title={`score ${decision.score.toFixed(2)}`}
        />
      </div>
    </div>
  )
}

export function DecisionRows({ decision }: { decision: DemoDecision }) {
  const rows: Array<[string, string]> = [
    ['Requested', decision.requested_model],
    ['Mode · score', `${decision.mode} · ${decision.score.toFixed(2)}${decision.raw_score !== decision.score ? ` (raw ${decision.raw_score.toFixed(2)})` : ''}`],
    ['Classified → final tier', `${decision.classified_tier} → ${decision.tier}`],
    ['Constraints', decision.hard_filters.length ? decision.hard_filters.join(' · ') : 'none'],
    ['Reason', decision.reason],
  ]
  return (
    <dl className="aui-kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
