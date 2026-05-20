/**
 * Daily message quota tracker for the free-tier playground.
 *
 * The gateway returns `X-Daily-Limit`, `X-Daily-Remaining`, and
 * `X-Daily-Reset` headers on every successful /v1/responses call.
 * The proxy passes them through to the browser unchanged. This
 * store captures the values on each successful response so the
 * Header chip and ChatInput cutoff can react in real time.
 *
 * On 429 with `daily_message_limit_exceeded`, we also push the
 * limit into the store so the UI knows the user has zero remaining
 * even though no successful response carried that information.
 *
 * Reset happens at 00:00 UTC. We don't bother decrementing
 * client-side optimistically — the gateway's headers are the
 * source of truth and update on every request.
 *
 * Persistence: state is persisted to localStorage with a freshness
 * check. If the stored values are older than `STALE_AFTER_MS`
 * (1h), the chip stays hidden on load until the next API call
 * refreshes it. Avoids the "chip looks reset on page reload" UX
 * bug while keeping the gateway as the source of truth.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * How long a stored quota reading stays useful after a page reload.
 * The gateway's counter is per UTC day — at the extreme, a value
 * stored just before midnight UTC is meaningless 5 minutes later.
 * 1h is a safe-ish middle ground: long enough that a brief refresh
 * doesn't flash an empty chip; short enough that a stale value
 * doesn't linger across major time-of-day shifts.
 */
const STALE_AFTER_MS = 60 * 60 * 1000

interface DailyQuotaState {
  /** Max messages allowed today. Null until we've heard from the server. */
  limit: number | null
  /** Messages remaining today. Null until we've heard from the server. */
  remaining: number | null
  /** Seconds until the limit resets. Null until we've heard from the server. */
  resetInSeconds: number | null
  /** Epoch ms of the last server update. Null = never. */
  lastUpdatedAt: number | null

  /** Update from response headers (gateway → proxy → browser). */
  updateFromHeaders: (headers: Headers) => void
  /** Force "0 remaining" when a 429 lands so the UI reflects the wall. */
  markExhausted: (limit: number, resetInSeconds?: number) => void
  /**
   * Returns true if the stored values are recent enough to trust.
   * Components should gate UI on this before reading limit/remaining
   * — a stale persisted value from yesterday shouldn't drive a
   * "you're at 0" cutoff if we haven't actually confirmed it today.
   */
  isFresh: () => boolean
  /**
   * Convenience: stored data says quota is exhausted AND the data
   * is fresh. Used by ChatInput to hard-disable the Send button.
   */
  isExhausted: () => boolean
}

export const useQuotaStore = create<DailyQuotaState>()(
  persist(
    (set, get) => ({
      limit: null,
      remaining: null,
      resetInSeconds: null,
      lastUpdatedAt: null,

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
          // Bump the freshness timestamp on every header capture, even
          // partial ones — any signal from the server beats a stale
          // localStorage value.
          lastUpdatedAt: Date.now(),
        }))
      },

      markExhausted: (limit, resetInSeconds) =>
        set({
          limit,
          remaining: 0,
          resetInSeconds: resetInSeconds ?? null,
          lastUpdatedAt: Date.now(),
        }),

      isFresh: () => {
        const t = get().lastUpdatedAt
        if (t === null) return false
        return Date.now() - t < STALE_AFTER_MS
      },

      isExhausted: () => {
        const s = get()
        if (!s.isFresh()) return false
        if (s.limit === null || s.remaining === null) return false
        if (s.limit <= 0) return false
        return s.remaining <= 0
      },
    }),
    {
      name: 'aura.quota',
      storage: createJSONStorage(() => localStorage),
      // Persist everything except the methods. Zustand's default
      // partializer would persist the closures too, which then get
      // overwritten on rehydrate — works but produces noisy
      // localStorage. Explicit partialize keeps the payload small.
      partialize: (state) => ({
        limit: state.limit,
        remaining: state.remaining,
        resetInSeconds: state.resetInSeconds,
        lastUpdatedAt: state.lastUpdatedAt,
      }),
    },
  ),
)

function parseIntHeader(value: string | null): number | null {
  if (value === null) return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}
