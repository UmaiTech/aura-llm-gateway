import { useState, useEffect } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  AddLine,
  SearchLine,
  Group2Line,
  FolderLine,
  User2Line,
  DeleteLine,
  EditLine,
  CheckLine,
  CloseLine,
  AiLine,
  Loading3Line,
  Refresh1Line,
  Building4Line,
} from '@mingcute/react'
import {
  getTeams,
  getOrganizations,
  createTeam,
  updateTeam,
  deleteTeam,
  type TeamSummary,
  type OrganizationSummary,
} from '@/lib/api'

export function TeamsPage() {
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [orgFilter, setOrgFilter] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTeam, setEditingTeam] = useState<TeamSummary | null>(null)
  // Create-modal form state. Initialized to empty; reset when the
  // modal opens.
  const [formOrgId, setFormOrgId] = useState('')
  const [formName, setFormName] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formTokenLimit, setFormTokenLimit] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const openCreateModal = () => {
    setFormOrgId(organizations[0]?.id || '')
    setFormName('')
    setFormSlug('')
    setFormDescription('')
    setFormTokenLimit('')
    setFormError(null)
    setShowCreateModal(true)
  }

  const handleCreate = async () => {
    if (!formOrgId || !formName || !formSlug) {
      setFormError('Organization, name, and slug are required.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      await createTeam({
        organization_id: formOrgId,
        name: formName,
        slug: formSlug,
        description: formDescription || undefined,
        monthly_token_limit: formTokenLimit ? Number(formTokenLimit) : undefined,
      })
      setShowCreateModal(false)
      await fetchData()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (team: TeamSummary) => {
    if (!confirm(`Delete team "${team.name}"? This cannot be undone.`)) return
    try {
      await deleteTeam(team.id)
      await fetchData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const handleSaveEdit = async () => {
    if (!editingTeam) return
    setSubmitting(true)
    try {
      await updateTeam(editingTeam.id, {
        name: editingTeam.name,
        description: editingTeam.description || undefined,
        monthly_token_limit: editingTeam.monthly_token_limit || undefined,
      })
      setEditingTeam(null)
      await fetchData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSubmitting(false)
    }
  }

  const fetchData = async () => {
    try {
      const [teamsData, orgsData] = await Promise.all([
        getTeams().catch(() => []),
        getOrganizations().catch(() => []),
      ])
      setTeams(teamsData)
      setOrganizations(orgsData)
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

  // Get unique organization names for filter
  const orgNames = [...new Set(teams.map((t) => t.organization_name))]

  const filteredTeams = teams.filter((team) => {
    const matchesSearch =
      team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      team.slug.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesOrg = orgFilter === 'all' || team.organization_name === orgFilter
    return matchesSearch && matchesOrg
  })

  const getUsagePercent = (current: number, limit: number | null) => {
    if (!limit) return 0
    return Math.min((current / limit) * 100, 100)
  }

  const getUsageColor = (current: number, limit: number | null) => {
    if (!limit) return 'bg-primary'
    const percent = (current / limit) * 100
    if (percent >= 100) return 'bg-red-500'
    if (percent >= 80) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const isOverLimit = (current: number, limit: number | null) => {
    return limit !== null && current > limit
  }

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`
    return tokens.toString()
  }

  // Calculate totals
  const totals = {
    teams: teams.length,
    members: teams.reduce((acc, t) => acc + t.member_count, 0),
    projects: teams.reduce((acc, t) => acc + t.project_count, 0),
    overLimit: teams.filter((t) => isOverLimit(t.current_month_tokens, t.monthly_token_limit)).length,
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Teams" description="Manage teams and their token budgets" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loading3Line className="h-5 w-5 animate-spin" />
            <span>Loading teams...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Teams"
        description="Manage teams and their token budgets"
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
            <Button onClick={openCreateModal}>
              <AddLine className="w-4 h-4 mr-2" />
              Create Team
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Filters */}
        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md">
            <SearchLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-md text-sm"
          >
            <option value="all">All Organizations</option>
            {orgNames.map((org) => (
              <option key={org} value={org}>
                {org}
              </option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                  <Group2Line className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totals.teams}</p>
                  <p className="text-sm text-muted-foreground">Total Teams</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <User2Line className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totals.members}</p>
                  <p className="text-sm text-muted-foreground">Total Members</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <FolderLine className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totals.projects}</p>
                  <p className="text-sm text-muted-foreground">Total Projects</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <AiLine className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totals.overLimit}</p>
                  <p className="text-sm text-muted-foreground">Over Limit</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Teams List */}
        <Card>
          <CardHeader>
            <CardTitle>All Teams</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredTeams.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Group2Line className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-1">No Teams Found</p>
                <p className="text-sm">
                  {searchQuery || orgFilter !== 'all'
                    ? 'No teams match your criteria.'
                    : 'Create your first team to get started.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTeams.map((team) => {
                  const overLimit = isOverLimit(team.current_month_tokens, team.monthly_token_limit)
                  return (
                    <div
                      key={team.id}
                      className="p-4 bg-card-alt rounded-lg border border-border/50 hover:border-border transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Group2Line className="w-5 h-5 text-blue-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{team.name}</h3>
                              {overLimit && (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                                  Over Limit
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Building4Line className="h-3 w-3" />
                              {team.organization_name} / {team.slug}
                            </p>
                            {team.description && (
                              <p className="text-xs text-muted-foreground mt-1">{team.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setEditingTeam(team)}>
                            <EditLine className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(team)}>
                            <DeleteLine className="w-4 h-4 text-red-400" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div className="flex items-center gap-2">
                          <User2Line className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{team.member_count} members</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <FolderLine className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{team.project_count} projects</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <AiLine className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{formatTokens(team.current_month_tokens)} tokens this month</span>
                        </div>
                      </div>

                      {/* Token Usage Bar */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Token Usage</span>
                          <span className={cn(overLimit && 'text-red-400')}>
                            {formatTokens(team.current_month_tokens)} /{' '}
                            {team.monthly_token_limit ? formatTokens(team.monthly_token_limit) : 'Unlimited'}
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full transition-all',
                              getUsageColor(team.current_month_tokens, team.monthly_token_limit)
                            )}
                            style={{
                              width: `${
                                team.monthly_token_limit
                                  ? Math.min(getUsagePercent(team.current_month_tokens, team.monthly_token_limit), 100)
                                  : 30
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Create Team</CardTitle>
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
                <label className="text-sm font-medium mb-1 block">Organization</label>
                <select
                  className="w-full px-3 py-2 bg-background border border-border rounded-md"
                  value={formOrgId}
                  onChange={(e) => setFormOrgId(e.target.value)}
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <Input
                  placeholder="Product Engineering"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Slug</label>
                <Input
                  placeholder="product-eng"
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Input
                  placeholder="Team description..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Monthly Token Limit</label>
                <Input
                  type="number"
                  placeholder="5000000"
                  value={formTokenLimit}
                  onChange={(e) => setFormTokenLimit(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">Leave empty for unlimited</p>
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

      {/* Edit Team Modal */}
      {editingTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Edit Team</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setEditingTeam(null)}>
                  <CloseLine className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <Input
                  value={editingTeam.name}
                  onChange={(e) =>
                    setEditingTeam({ ...editingTeam, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Input
                  value={editingTeam.description || ''}
                  onChange={(e) =>
                    setEditingTeam({ ...editingTeam, description: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Monthly Token Limit</label>
                <Input
                  type="number"
                  value={editingTeam.monthly_token_limit ?? ''}
                  onChange={(e) =>
                    setEditingTeam({
                      ...editingTeam,
                      monthly_token_limit: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="Unlimited"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setEditingTeam(null)}>
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
