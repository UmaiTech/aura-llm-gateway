/**
 * React hook for the managed-service beta signup state.
 *
 * Behavior:
 *  - On mount: fetch current signup state from the server.
 *  - `signedUp` reflects whether the user has joined.
 *  - `join(source)` POSTs an opt-in; on success, flips `signedUp` to
 *    true so any component listening updates immediately.
 *  - Errors during fetch fall back to `signedUp: false` rather than
 *    surfacing — the beta CTA is non-critical UI and shouldn't block
 *    the chat.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  type BetaSignupSource,
  type BetaSignupState,
  getBetaSignupState,
  joinBeta,
} from '../lib/beta-signup'

interface UseBetaSignup {
  signedUp: boolean
  loading: boolean
  joining: boolean
  error: string | null
  join: (source: BetaSignupSource) => Promise<void>
}

export function useBetaSignup(): UseBetaSignup {
  const [state, setState] = useState<BetaSignupState>({
    signedUp: false,
    signup: null,
  })
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getBetaSignupState()
      .then((s) => {
        if (!cancelled) setState(s)
      })
      .catch((err) => {
        // Non-fatal for the chat: the beta CTA is optional UI, we
        // don't want a broken /api/beta-signup to block sign-in or
        // chatting. But silently swallowing the error makes auth /
        // backend failures invisible. Log it so they show up in the
        // browser console + Vercel error tracking.
        console.error('[beta-signup] state fetch failed:', err)
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not check beta signup state.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const join = useCallback(async (source: BetaSignupSource) => {
    setJoining(true)
    setError(null)
    try {
      const signup = await joinBeta(source)
      setState({ signedUp: true, signup })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the beta.')
    } finally {
      setJoining(false)
    }
  }, [])

  return {
    signedUp: state.signedUp,
    loading,
    joining,
    error,
    join,
  }
}
