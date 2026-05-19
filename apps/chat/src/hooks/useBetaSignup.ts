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
      .catch(() => {
        // Non-fatal — leave default `signedUp: false`.
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
