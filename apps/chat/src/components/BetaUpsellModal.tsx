/**
 * Modal that appears when the user taps a beta-locked model in the
 * picker. Same one-click signup as RateLimitNotice, just framed
 * around "you wanted a frontier model" rather than "you hit the cap".
 *
 * Renders nothing when `open` is false. Click outside or hit Esc to
 * dismiss. Stays open after a successful join so the user sees the
 * "you're on the list" confirmation before closing.
 */

import { useEffect } from 'react'
import { Lock, Sparkles, X, Check } from 'lucide-react'
import { useBetaSignup } from '../hooks/useBetaSignup'
import type { Model } from '../lib/types'

interface BetaUpsellModalProps {
  open: boolean
  model: Model | null
  onClose: () => void
}

export function BetaUpsellModal({ open, model, onClose }: BetaUpsellModalProps) {
  const { signedUp, joining, join } = useBetaSignup()

  // Esc-to-close + lock body scroll while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const modelName = model?.name ?? 'Frontier models'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-gray-950 border border-gray-800 shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-aura-500/15 border border-aura-500/30">
            <Lock className="h-6 w-6 text-aura-400" />
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-100">
            {modelName} is in the managed beta
          </h2>
          <p className="text-sm text-gray-400 leading-relaxed">
            The free playground tier covers small &amp; fast models from
            every provider. Frontier models (Opus, Sonnet, GPT-5, Gemini 3
            Pro) unlock with the managed beta — higher limits, prod-ready
            uptime, your own keys if you want them.
          </p>
        </div>

        {signedUp ? (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 text-emerald-400 text-sm font-medium border border-emerald-500/30 w-full justify-center">
            <Check className="h-4 w-4" />
            You&apos;re on the beta list — we&apos;ll be in touch
          </div>
        ) : (
          <button
            onClick={() => void join('locked_model')}
            disabled={joining}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-aura-500 text-white text-sm font-medium hover:bg-aura-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Sparkles className="h-4 w-4" />
            {joining ? 'Joining…' : 'Join the managed-service beta'}
          </button>
        )}

        <p className="text-xs text-gray-500 text-center pt-1">
          One click. We already have your email from sign-in.
        </p>
      </div>
    </div>
  )
}
