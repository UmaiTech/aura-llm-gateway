/**
 * Header chip showing today's remaining message quota for free-tier
 * users. Numbers come from the gateway's `X-Daily-Limit` /
 * `X-Daily-Remaining` headers, surfaced through the proxy and
 * captured into `quotaStore` on every successful chat response.
 *
 * Color steps as the day burns down:
 *   - 0 messages used      → muted (no scarcity)
 *   - >50% remaining       → muted (still plenty)
 *   - ≤50% to >15% rem.    → amber (heads-up)
 *   - ≤15% remaining       → red (close to wall)
 *   - 0 remaining          → red + "Tomorrow" copy + Join CTA primary
 *
 * Clicking the chip when remaining ≤ 15% opens the beta join (one-shot
 * POST /api/beta-signup via useBetaSignup). After the user joins, the
 * chip stops nudging and just shows the count.
 *
 * Hidden entirely until the first successful API call lands header
 * values — avoids the chip flickering "?/?" on cold load.
 */

import { useMemo } from 'react'
import { Sparkles, Check } from 'lucide-react'
import { cn } from '../lib/utils'
import { useQuotaStore } from '../stores/quotaStore'
import { useBetaSignup } from '../hooks/useBetaSignup'

export function DailyQuotaChip() {
  const { limit, remaining } = useQuotaStore()
  const { signedUp, joining, join } = useBetaSignup()
  // Subscribe via a selector so the chip re-renders when
  // lastUpdatedAt flips fresh→stale (or vice versa). Reading
  // isFresh() directly off the store would compute once on render
  // and miss the change.
  const fresh = useQuotaStore((s) => s.isFresh())

  const tone = useMemo(() => {
    if (!fresh) return 'hidden'
    if (limit === null || remaining === null) return 'hidden'
    // limit <= 0 means "no daily cap on this key" (e.g. admin / pro
    // keys with NULL → 0 fallthrough from a future change). Show
    // nothing — the chip is a free-tier nudge, irrelevant here.
    // Without this guard, `remaining / 0` would produce NaN/Infinity
    // and tone comparisons would silently misclassify.
    if (limit <= 0) return 'hidden'
    if (remaining <= 0) return 'exhausted'
    // Clamp ratio to [0, 1] — defensively, in case the server ever
    // sends remaining > limit (shouldn't happen, but a stale Redis
    // counter or a backfill bump-up could).
    const ratio = Math.min(remaining / limit, 1)
    if (ratio > 0.5) return 'muted'
    if (ratio > 0.15) return 'amber'
    return 'red'
  }, [fresh, limit, remaining])

  if (tone === 'hidden') return null
  if (limit === null || remaining === null) return null

  const isLow = tone === 'red' || tone === 'amber' || tone === 'exhausted'
  const showJoinCta = isLow && !signedUp

  const handleClick = () => {
    if (!showJoinCta || joining) return
    void join('header_banner')
  }

  return (
    <button
      onClick={handleClick}
      disabled={!showJoinCta || joining}
      // Only clickable when we want to drive the beta-join action.
      // For "muted" / signed-up users it's a passive indicator.
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors',
        tone === 'muted' &&
          'border-border bg-secondary/50 text-muted-foreground cursor-default',
        tone === 'amber' &&
          'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15',
        tone === 'red' &&
          'border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/15',
        tone === 'exhausted' &&
          'border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/20',
        showJoinCta && 'cursor-pointer',
        joining && 'opacity-60 cursor-wait',
      )}
      title={titleFor(tone, remaining, limit, signedUp)}
    >
      {signedUp && tone !== 'muted' ? (
        <Check className="h-3 w-3" />
      ) : showJoinCta ? (
        <Sparkles className="h-3 w-3" />
      ) : null}
      <span>
        {tone === 'exhausted'
          ? signedUp
            ? '0 / ' + limit + ' — resets at 00:00 UTC'
            : 'Daily limit reached — join the beta'
          : signedUp || !showJoinCta
            ? `${remaining} / ${limit} today`
            : `${remaining} / ${limit} — join the beta`}
      </span>
    </button>
  )
}

function titleFor(
  tone: string,
  remaining: number,
  limit: number,
  signedUp: boolean,
): string {
  if (tone === 'exhausted') {
    return signedUp
      ? 'Free-tier daily limit reached. Resets at 00:00 UTC.'
      : 'Free-tier daily limit reached. Click to join the managed beta for higher limits.'
  }
  if (signedUp) {
    return `${remaining} of ${limit} free-tier messages remaining today.`
  }
  if (tone === 'muted') {
    return `${remaining} of ${limit} free-tier messages remaining today.`
  }
  return `${remaining} of ${limit} free-tier messages remaining today. Click to join the managed beta for higher limits.`
}
