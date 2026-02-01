import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  adminKey: string | null
  isAuthenticated: boolean
  login: (key: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      adminKey: null,
      isAuthenticated: false,
      login: (key: string) => {
        set({ adminKey: key, isAuthenticated: true })
      },
      logout: () => {
        set({ adminKey: null, isAuthenticated: false })
      },
    }),
    {
      name: 'aura-admin-auth',
    }
  )
)
