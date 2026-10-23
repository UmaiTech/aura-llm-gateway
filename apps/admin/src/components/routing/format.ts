// Shared display helpers for the auto-router views (RoutingPage, the
// decisions explorer and its drawer).

export { formatMicros, formatUsd } from '@aura/ui/routing/decision.ts'

export const TIER_ORDER = ['simple', 'medium', 'complex', 'reasoning']

/** Chip classes per tier (AA contrast in both themes, as RoutingPage uses). */
export const TIER_TONE: Record<string, string> = {
  simple: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  medium: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  complex: 'bg-violet-500/20 text-violet-700 dark:text-violet-300',
  reasoning: 'bg-pink-500/20 text-pink-700 dark:text-pink-300',
}

export function formatReward(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
}

export function rewardTone(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'text-muted-foreground'
  if (v < 0) return 'text-destructive/80'
  if (v > 0.5) return 'text-emerald-400'
  return 'text-foreground'
}

/** Outcome signals in display order, with their meaning. */
export const OUTCOME_LABELS: Record<string, string> = {
  move_on: 'move on',
  none: 'no next turn',
  retry: 'retry',
  correction: 'correction',
  escalation: 'escalation',
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
