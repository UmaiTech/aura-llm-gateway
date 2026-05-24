import { useState, useEffect } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui'
import { cn, formatCurrency, formatNumber } from '@/lib/utils'
import {
  AddLine,
  SearchLine,
  Building4Line,
  User2Line,
  Key2Line,
  Group2Line,
  DeleteLine,
  EditLine,
  CheckLine,
  CloseLine,
  Loading3Line,
  Refresh1Line,
  CoinLine,
  FlashLine,
} from '@mingcute/react'
import {
  getOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  type OrganizationSummary,
} from '@/lib/api'

export function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingOrg, setEditingOrg] = useState<OrganizationSummary | null>(null)
  const [newOrg, setNewOrg] = useState({ name: '', slug: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const openCreate = () => {
    setNewOrg({ name: '', slug: '' })
    setFormError(null)
    setShowCreateModal(true)
  }

  const handleCreate = async () => {
    if (!newOrg.name || !newOrg.slug) {
      setFormError('Name and slug are required.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      await createOrganization({ name: newOrg.name, slug: newOrg.slug })
      setShowCreateModal(false)
      await fetchData()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingOrg) return
    setSubmitting(true)
    try {
      await updateOrganization(editingOrg.id, { name: editingOrg.name })
      setEditingOrg(null)
      await fetchData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (org: OrganizationSummary) => {
    if (!confirm(`Delete organization "${org.name}"? This cascades to all teams and keys.`)) return
    try {
      await deleteOrganization(org.id)
      await fetchData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const fetchData = async () => {
    try {
      const data = await getOrganizations()
      setOrganizations(data)
    } catch (error) {
      console.error('Failed to fetch organizations:', error)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchData()
  }

  const filteredOrgs = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.slug.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Calculate totals
  const totals = {
    organizations: organizations.length,
    teams: organizations.reduce((acc, org) => acc + org.team_count, 0),
    endUsers: organizations.reduce((acc, org) => acc + org.end_user_count, 0),
    apiKeys: organizations.reduce((acc, org) => acc + org.api_key_count, 0),
    requests: organizations.reduce((acc, org) => acc + org.total_requests, 0),
    cost: organizations.reduce((acc, org) => acc + org.total_cost, 0),
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Organizations" description="Manage organizations and their settings" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loading3Line className="h-5 w-5 animate-spin" />
            <span>Loading organizations...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Organizations"
        description="Manage organizations and their settings"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <Refresh1Line className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </Button>
            <Button onClick={openCreate}>
              <AddLine className="w-4 h-4 mr-2" />
              Create Organization
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Search */}
        <div className="relative max-w-md">
          <SearchLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search organizations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                  <Building4Line className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totals.organizations}</p>
                  <p className="text-xs text-muted-foreground">Organizations</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Group2Line className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totals.teams}</p>
                  <p className="text-xs text-muted-foreground">Teams</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <User2Line className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{formatNumber(totals.endUsers)}</p>
                  <p className="text-xs text-muted-foreground">End Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <Key2Line className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totals.apiKeys}</p>
                  <p className="text-xs text-muted-foreground">API Keys</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/20 rounded-lg">
                  <FlashLine className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{formatNumber(totals.requests)}</p>
                  <p className="text-xs text-muted-foreground">Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <CoinLine className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{formatCurrency(totals.cost)}</p>
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Organizations List */}
        <Card>
          <CardHeader>
            <CardTitle>All Organizations</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredOrgs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building4Line className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-1">No Organizations Found</p>
                <p className="text-sm">
                  {searchQuery ? 'No organizations match your search.' : 'Create your first organization to get started.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrgs.map((org) => (
                  <div
                    key={org.id}
                    className="flex items-center justify-between p-4 bg-card-alt rounded-lg border border-border/50 hover:border-border transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-violet-500/20 rounded-lg">
                        <Building4Line className="w-6 h-6 text-violet-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{org.name}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">/{org.slug}</p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Group2Line className="h-3 w-3" />
                            {org.team_count} teams
                          </span>
                          <span className="flex items-center gap-1">
                            <Key2Line className="h-3 w-3" />
                            {org.api_key_count} keys
                          </span>
                          <span className="flex items-center gap-1">
                            <User2Line className="h-3 w-3" />
                            {formatNumber(org.end_user_count)} users
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="font-medium font-mono">{formatNumber(org.total_requests)}</p>
                        <p className="text-xs text-muted-foreground">requests</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium font-mono">{formatNumber(org.total_tokens)}</p>
                        <p className="text-xs text-muted-foreground">tokens</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium font-mono">{formatCurrency(org.total_cost)}</p>
                        <p className="text-xs text-muted-foreground">total cost</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingOrg(org)}
                        >
                          <EditLine className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(org)}>
                          <DeleteLine className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Organization Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Create Organization</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
                  <CloseLine className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {formError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                  {formError}
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <Input
                  placeholder="Acme Corporation"
                  value={newOrg.name}
                  onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Slug</label>
                <Input
                  placeholder="acme-corp"
                  value={newOrg.slug}
                  onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  URL-friendly identifier (lowercase, no spaces)
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={submitting}>
                  <CheckLine className="w-4 h-4 mr-2" />
                  {submitting ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Organization Modal */}
      {editingOrg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Edit Organization</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setEditingOrg(null)}>
                  <CloseLine className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <Input
                  value={editingOrg.name}
                  onChange={(e) =>
                    setEditingOrg({ ...editingOrg, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Slug</label>
                <Input value={editingOrg.slug} disabled />
                <p className="text-xs text-muted-foreground mt-1">
                  Slugs are immutable once set.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setEditingOrg(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit} disabled={submitting}>
                  <CheckLine className="w-4 h-4 mr-2" />
                  {submitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
