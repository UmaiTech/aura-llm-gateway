/**
 * Daily message quota tracker for the free-tier playground.
 *
 * The gateway returns `X-Daily-Limit`, `X-Daily-Remaining`, and
 * `X-Daily-Reset` headers on every successful /v1/responses call.
 * The proxy passes them through to the browser unchanged. This
 * store captures the values on each successful response so the
 * Header can render a "X / 20 today" chip in real time.
 *
 * On 429 with `daily_message_limit_exceeded`, we also push the
 * limit into the store so the UI knows the user has zero remaining
 * even though no successful response carried that information.
 *
 * Reset happens at 00:00 UTC. We don't bother decrementing
 * client-side optimistically — the gateway's headers are the
 * source of truth and update on every request.
 */

import { create } from 'zustand'

interface DailyQuotaState {
  /** Max messages allowed today. Null until we've heard from the server. */
  limit: number | null
  /** Messages remaining today. Null until we've heard from the server. */
  remaining: number | null
  /** Seconds until the limit resets. Null until we've heard from the server. */
  resetInSeconds: number | null

  /** Update from response headers (gateway → proxy → browser). */
  updateFromHeaders: (headers: Headers) => void
  /** Force "0 remaining" when a 429 lands so the UI reflects the wall. */
  markExhausted: (limit: number, resetInSeconds?: number) => void
}

export const useQuotaStore = create<DailyQuotaState>((set) => ({
  limit: null,
  remaining: null,
  resetInSeconds: null,

  updateFromHeaders: (headers: Headers) => {
    const limit = parseIntHeader(headers.get('X-Daily-Limit'))
    const remaining = parseIntHeader(headers.get('X-Daily-Remaining'))
    const resetInSeconds = parseIntHeader(headers.get('X-Daily-Reset'))
    // Update only fields we actually got — a future endpoint that
    // doesn't surface these shouldn't clobber whatever we already know.
    set((s) => ({
      limit: limit ?? s.limit,
      remaining: remaining ?? s.remaining,
      resetInSeconds: resetInSeconds ?? s.resetInSeconds,
    }))
  },

  markExhausted: (limit, resetInSeconds) =>
    set({
      limit,
      remaining: 0,
      resetInSeconds: resetInSeconds ?? null,
    }),
}))

function parseIntHeader(value: string | null): number | null {
  if (value === null) return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}
