import { useEffect, useState } from 'react'
import { Drawer } from '@aura/ui/ui/Drawer.tsx'
import { RoutingInspector } from '@aura/ui/routing/RoutingInspector.tsx'
import { fromStoredDecision, formatUsd } from '@aura/ui/routing/decision.ts'
import { Button } from '@/components/ui'
import { getRoutingDecision } from '@/lib/api'
import type { RoutingDecisionDetail } from '@/lib/routing'
import type { RoutingOutcome } from '@/lib/types'
import { formatDuration, formatNumber } from '@/lib/utils'
import { OUTCOME_LABELS, formatReward } from './format'

/** Outcome fields shared by the decision detail and the stats rows. */
interface OutcomeFields {
  status?: string | null
  actual_model?: string | null
  input_tokens?: number | null
  output_tokens?: number | null
  cost_usd?: number | null
  latency_ms?: number | null
  feedback?: string | null
  estimated_savings_usd?: number | null
  next_turn?: string | null
  reward?: number | null
}

/**
 * Read-only detail for one auto-router decision, rendered with the shared
 * routing inspector (the same one the playground shows next to an answer).
 * The stored decision supplies the score, constraints and candidates; its
 * `outcome` (or, from an older gateway, the stats row that opened the
 * drawer) supplies what actually happened.
 */
export function RoutingDecisionDrawer({
  responseId,
  fallbackOutcome,
  onClose,
}: {
  responseId: string | null
  fallbackOutcome?: RoutingOutcome | null
  onClose: () => void
}) {
  const [detail, setDetail] = useState<RoutingDecisionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!responseId) return
    let cancelled = false
    setDetail(null)
    setError(null)
    getRoutingDecision(responseId)
      // The endpoint returns the full outcome; the shared type only names
      // the fields the inspector reads.
      .then((d) => !cancelled && setDetail(d as RoutingDecisionDetail))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load the decision'))
    return () => {
      cancelled = true
    }
  }, [responseId, attempt])

  const outcome: OutcomeFields | null = detail?.outcome ?? fallbackOutcome ?? null

  return (
    <Drawer
      open={responseId !== null}
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
      ) : !detail ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Loading decision…
        </p>
      ) : (
        <RoutingInspector
          view={fromStoredDecision(detail, { model: outcome?.actual_model ?? null })}
          raw={detail}
          overviewExtra={<OutcomeRows outcome={outcome} shadow={detail.shadow} />}
        />
      )}
    </Drawer>
  )
}

/** What the request cost, how it ended and how it was scored; savings stay counterfactual. */
function OutcomeRows({ outcome, shadow }: { outcome: OutcomeFields | null; shadow: boolean }) {
  if (!outcome || (outcome.status == null && outcome.next_turn == null)) {
    return (
      <div>
        <dt>Outcome</dt>
        <dd>No request log or score yet</dd>
      </div>
    )
  }
  return (
    <>
      <div>
        <dt>Status</dt>
        <dd>{outcome.status ?? 'unknown'}</dd>
      </div>
      <div>
        <dt>Tokens in / out</dt>
        <dd>
          {outcome.input_tokens != null ? formatNumber(outcome.input_tokens) : '—'} /{' '}
          {outcome.output_tokens != null ? formatNumber(outcome.output_tokens) : '—'}
        </dd>
      </div>
      <div>
        <dt>Actual cost</dt>
        <dd>{formatUsd(outcome.cost_usd)}</dd>
      </div>
      <div>
        <dt>Latency</dt>
        <dd>{outcome.latency_ms != null ? formatDuration(outcome.latency_ms) : '—'}</dd>
      </div>
      <div>
        <dt>Next turn</dt>
        <dd>{outcome.next_turn ? (OUTCOME_LABELS[outcome.next_turn] ?? outcome.next_turn) : 'not scored yet'}</dd>
      </div>
      <div>
        <dt>Reward (−1 to +1)</dt>
        <dd>{formatReward(outcome.reward)}</dd>
      </div>
      {outcome.feedback && (
        <div>
          <dt>Feedback</dt>
          <dd>{outcome.feedback}</dd>
        </div>
      )}
      {shadow && (
        <div>
          <dt>Est. savings if applied (counterfactual)</dt>
          <dd>{formatUsd(outcome.estimated_savings_usd)}</dd>
        </div>
      )}
    </>
  )
}
