import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Selected organization for cross-page admin filtering.
 *
 * Currently scoped to the API Keys and End Users pages — the
 * dashboard stats endpoints don't yet accept an organization_id
 * filter (see follow-up TODO in routes/admin.rs).
 *
 * `selectedOrgId === null` means "show all orgs" — this is the
 * default for fresh installs and the explicit reset state. We use
 * null instead of empty string so we can pass it straight to the
 * API helpers without a falsy-string check.
 *
 * Persisted in localStorage so navigating away and back to Keys/
 * EndUsers preserves the filter without per-page state.
 */
interface OrgFilterState {
  selectedOrgId: string | null
  setSelectedOrgId: (id: string | null) => void
}

export const useOrgFilterStore = create<OrgFilterState>()(
  persist(
    (set) => ({
      selectedOrgId: null,
      setSelectedOrgId: (id: string | null) => set({ selectedOrgId: id }),
    }),
    {
      name: 'aura-admin-org-filter',
    },
  ),
)
