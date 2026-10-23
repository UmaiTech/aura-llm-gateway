import { useEffect, useState } from 'react'
import { Drawer } from '@aura/ui/ui/Drawer.tsx'
import { RoutingInspector } from '@aura/ui/routing/RoutingInspector.tsx'
import { fromStoredDecision, formatUsd, type StoredRoutingDecision } from '@aura/ui/routing/decision.ts'
import { Button } from '@/components/ui'
import { getRoutingDecision } from '@/lib/api'
import type { RoutingOutcome } from '@/lib/types'

/**
 * Read-only detail for one auto-router decision, rendered with the shared
 * routing inspector (the same one the playground shows next to an answer).
 * The outcome row supplies what actually happened; the stored decision
 * supplies the score, constraints and candidates.
 */
export function RoutingDecisionDrawer({ outcome, onClose }: { outcome: RoutingOutcome | null; onClose: () => void }) {
  const [detail, setDetail] = useState<StoredRoutingDecision | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const responseId = outcome?.response_id ?? null

  useEffect(() => {
    if (!responseId) return
    let cancelled = false
    setDetail(null)
    setError(null)
    getRoutingDecision(responseId)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load the decision'))
    return () => {
      cancelled = true
    }
  }, [responseId, attempt])

  return (
    <Drawer
      open={outcome !== null}
      onClose={onClose}
      title="Routing decision"
      subtitle={responseId ?? undefined}
      closeLabel="Close routing decision"
      footer="Read-only. Gateway defaults live in Settings; organization limits in Organization detail."
    >
      {error ? (
        <div className="space-y-3" role="alert">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => setAttempt((a) => a + 1)}>
            Retry
          </Button>
        </div>
      ) : !detail || !outcome ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Loading decision…
        </p>
      ) : (
        <RoutingInspector
          view={fromStoredDecision(detail, { model: outcome.actual_model })}
          raw={detail}
          overviewExtra={<OutcomeRows outcome={outcome} />}
        />
      )}
    </Drawer>
  )
}

/** What the request cost and how it ended; savings stay counterfactual. */
function OutcomeRows({ outcome }: { outcome: RoutingOutcome }) {
  return (
    <>
      <div>
        <dt>Status</dt>
        <dd>{outcome.status ?? 'unknown'}</dd>
      </div>
      <div>
        <dt>Tokens in / out</dt>
        <dd>
          {outcome.input_tokens ?? '—'} / {outcome.output_tokens ?? '—'}
        </dd>
      </div>
      <div>
        <dt>Actual cost</dt>
        <dd>{formatUsd(outcome.cost_usd)}</dd>
      </div>
      {outcome.shadow && (
        <div>
          <dt>Est. savings if applied (counterfactual)</dt>
          <dd>{formatUsd(outcome.estimated_savings_usd)}</dd>
        </div>
      )}
    </>
  )
}
