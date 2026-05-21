import { useEffect, useState } from 'react'
import { Building2Line } from '@mingcute/react'
import { useOrgFilterStore } from '@/stores/orgFilterStore'
import { getOrganizations } from '@/lib/api'
import type { OrganizationSummary } from '@/lib/types'

/**
 * Dropdown that scopes API Keys / End Users tables to a single
 * organization, with "All organizations" as the default no-filter
 * option. Selection is persisted via useOrgFilterStore so it
 * survives navigation between pages.
 *
 * Pulls the org list from /admin/organizations on mount and caches
 * it in component state — the list is short-lived enough that we
 * don't need React Query / SWR here. If the fetch fails we render
 * a disabled select with the current selection still showing so
 * the user isn't stuck unable to switch back.
 */
export function OrgFilter() {
  const { selectedOrgId, setSelectedOrgId } = useOrgFilterStore()
  const [orgs, setOrgs] = useState<OrganizationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getOrganizations()
      .then((data) => {
        if (!cancelled) setOrgs(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load orgs')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setSelectedOrgId(value === '' ? null : value)
  }

  return (
    <div className="flex items-center gap-2">
      <Building2Line className="h-4 w-4 text-muted-foreground" />
      <select
        value={selectedOrgId ?? ''}
        onChange={handleChange}
        disabled={loading || !!error}
        className="h-9 rounded-lg border border-input bg-background px-3 pr-8 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Filter by organization"
      >
        <option value="">All organizations</option>
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-xs text-destructive" title={error}>
          (failed to load)
        </span>
      )}
    </div>
  )
}
