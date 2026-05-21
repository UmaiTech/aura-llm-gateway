import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Admin auth has two paths today:
 *   - GitHub session cookie  → preferred, set by the playground's
 *                              better-auth on `.aura-llm.dev`. The
 *                              admin app calls /api/auth/get-session,
 *                              which returns user info if a valid
 *                              cookie exists.
 *   - AURA_ADMIN_KEY bearer  → fallback for CI / bootstrap / "I just
 *                              want in".
 *
 * `isAuthenticated` is true if EITHER path is satisfied. The
 * `sessionUser` field carries the GitHub user info (email, name)
 * when present so we can show it in the header and use it for
 * audit display. `adminKey` is only set when the bearer fallback is
 * actively in use.
 */
export interface SessionUser {
  email: string
  name: string | null
}

interface AuthState {
  adminKey: string | null
  sessionUser: SessionUser | null
  isAuthenticated: boolean
  /** Bearer-token login (fallback path). */
  loginWithKey: (key: string) => void
  /** Session-cookie login (preferred). Called after /api/auth/get-session returns. */
  loginWithSession: (user: SessionUser) => void
  /** Clear both paths. */
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      adminKey: null,
      sessionUser: null,
      isAuthenticated: false,
      loginWithKey: (key: string) => {
        set({ adminKey: key, sessionUser: null, isAuthenticated: true })
      },
      loginWithSession: (user: SessionUser) => {
        set({ adminKey: null, sessionUser: user, isAuthenticated: true })
      },
      logout: () => {
        set({ adminKey: null, sessionUser: null, isAuthenticated: false })
      },
    }),
    {
      name: 'aura-admin-auth',
    },
  ),
)
