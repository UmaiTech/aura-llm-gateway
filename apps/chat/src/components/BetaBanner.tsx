/**
 * Persistent banner above the chat that invites the user to join the
 * managed-service beta. Hidden once they've opted in (the hook
 * persists state, so the banner stays gone across sessions for a
 * signed-up user).
 *
 * Click → one-shot POST /api/beta-signup with source='header_banner'.
 * No form, no second step — the user is already authenticated, so
 * we have everything we need on the server.
 */

import { Sparkles } from 'lucide-react'
import { useBetaSignup } from '../hooks/useBetaSignup'

export function BetaBanner() {
  const { signedUp, loading, joining, error, join } = useBetaSignup()

  // Don't flash the banner during the initial load — wait until we
  // know the user's signup state.
  if (loading) return null
  if (signedUp) return null

  return (
    <div className="border-b border-aura-500/20 bg-gradient-to-r from-aura-500/10 via-primary-500/10 to-aura-500/10 px-4 py-2.5">
      <div className="flex items-center justify-between gap-3 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-gray-200">
          <Sparkles className="h-4 w-4 text-aura-400 shrink-0" />
          <span>
            <span className="font-medium">Managed Aura is coming.</span>{' '}
            <span className="text-gray-400">
              Higher limits, prod-ready uptime, SSO.
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {error ? (
            <span className="text-xs text-amber-400">{error}</span>
          ) : null}
          <button
            onClick={() => void join('header_banner')}
            disabled={joining}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-aura-500 text-white text-xs font-medium hover:bg-aura-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
          >
            {joining ? 'Joining…' : 'Join the beta'}
          </button>
        </div>
      </div>
    </div>
  )
}
