/**
 * Rendered inline in the chat when the user hits the free-tier rate
 * limit. Shows the apology message + two CTAs:
 *   1. Join the managed-service beta (primary, hidden if already
 *      joined).
 *   2. Star the repo on GitHub (secondary, always shown).
 *
 * The signup is one-click — we have the user's email and name from
 * the better-auth session, so the button POSTs straight to
 * /api/beta-signup. After a successful click the CTA flips to a
 * "You're on the list" state.
 */

import { Github, Sparkles, AlertTriangle, Check } from 'lucide-react'
import { useBetaSignup } from '../hooks/useBetaSignup'

interface RateLimitNoticeProps {
  message: string
}

export function RateLimitNotice({ message }: RateLimitNoticeProps) {
  const { signedUp, joining, error, join } = useBetaSignup()

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm text-gray-200 leading-relaxed">{message}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-7">
        {signedUp ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/30">
            <Check className="h-3.5 w-3.5" />
            You&apos;re on the beta list
          </span>
        ) : (
          <button
            onClick={() => void join('rate_limit_429')}
            disabled={joining}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-aura-500 text-white text-xs font-medium hover:bg-aura-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {joining ? 'Joining…' : 'Join the managed-service beta'}
          </button>
        )}

        <a
          href="https://github.com/UmaiTech/aura-llm-gateway"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-800 text-gray-200 text-xs font-medium hover:bg-gray-700 transition-colors border border-gray-700"
        >
          <Github className="h-3.5 w-3.5" />
          Star the repo
        </a>

        {error ? (
          <span className="text-xs text-amber-400">{error}</span>
        ) : null}
      </div>
    </div>
  )
}
