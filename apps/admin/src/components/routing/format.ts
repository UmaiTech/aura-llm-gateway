// Shared display helpers for the auto-router views (RoutingPage, the
// decisions explorer and its drawer).

import type { TierBoundaries } from '@/lib/routing'

export const TIER_ORDER = ['simple', 'medium', 'complex', 'reasoning']

/** Chip classes per tier (same tones RoutingPage has always used). */
export const TIER_TONE: Record<string, string> = {
  simple: 'bg-emerald-500/20 text-emerald-300',
  medium: 'bg-blue-500/20 text-blue-300',
  complex: 'bg-violet-500/20 text-violet-300',
  reasoning: 'bg-pink-500/20 text-pink-300',
}

/** Solid fills for the score band in the decision drawer. */
export const TIER_BAR: Record<string, string> = {
  simple: 'bg-emerald-400',
  medium: 'bg-blue-400',
  complex: 'bg-violet-400',
  reasoning: 'bg-pink-400',
}

export const DEFAULT_BOUNDARIES: TierBoundaries = {
  simple_medium: 0.15,
  medium_complex: 0.35,
  complex_reasoning: 0.6,
}

export function tierBands(b: TierBoundaries | null | undefined) {
  const { simple_medium, medium_complex, complex_reasoning } = b ?? DEFAULT_BOUNDARIES
  return [
    { tier: 'simple', from: 0, to: simple_medium },
    { tier: 'medium', from: simple_medium, to: medium_complex },
    { tier: 'complex', from: medium_complex, to: complex_reasoning },
    { tier: 'reasoning', from: complex_reasoning, to: 1 },
  ]
}

export function formatMicros(us: number): string {
  if (us >= 1000) return `${(us / 1000).toFixed(1)} ms`
  return `${us} µs`
}

/** Request costs are often fractions of a cent; keep them readable. */
export function formatUsd(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  if (v === 0) return '$0'
  if (Math.abs(v) < 0.0001) return `$${v.toExponential(1)}`
  if (Math.abs(v) < 1) return `$${v.toFixed(4)}`
  return `$${v.toFixed(2)}`
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
