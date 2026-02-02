import { useState } from 'react'
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
  ChartBarLine,
} from '@mingcute/react'

interface Team {
  id: string
  organizationId: string
  organizationName: string
  name: string
  slug: string
  description: string
  projectsCount: number
  membersCount: number
  monthlyTokenLimit: number | null
  currentMonthTokens: number
  totalRequests: number
  status: 'active' | 'over_limit'
  createdAt: string
}

const mockTeams: Team[] = [
  {
    id: 'team_1',
    organizationId: 'org_1',
    organizationName: 'Acme Corporation',
    name: 'Product Engineering',
    slug: 'product-eng',
    description: 'Main product development team',
    projectsCount: 5,
    membersCount: 12,
    monthlyTokenLimit: 5000000,
    currentMonthTokens: 3200000,
    totalRequests: 15000,
    status: 'active',
    createdAt: '2025-06-20',
  },
  {
    id: 'team_2',
    organizationId: 'org_1',
    organizationName: 'Acme Corporation',
    name: 'Customer Success',
    slug: 'customer-success',
    description: 'Customer support and success',
    projectsCount: 3,
    membersCount: 8,
    monthlyTokenLimit: 2000000,
    currentMonthTokens: 1850000,
    totalRequests: 8500,
    status: 'active',
    createdAt: '2025-07-01',
  },
  {
    id: 'team_3',
    organizationId: 'org_1',
    organizationName: 'Acme Corporation',
    name: 'Research',
    slug: 'research',
    description: 'AI research and experimentation',
    projectsCount: 4,
    membersCount: 5,
    monthlyTokenLimit: 10000000,
    currentMonthTokens: 10500000,
    totalRequests: 21000,
    status: 'over_limit',
    createdAt: '2025-08-15',
  },
  {
    id: 'team_4',
    organizationId: 'org_2',
    organizationName: 'TechStart Inc',
    name: 'Development',
    slug: 'dev',
    description: 'Core development team',
    projectsCount: 5,
    membersCount: 6,
    monthlyTokenLimit: null,
    currentMonthTokens: 890000,
    totalRequests: 4200,
    status: 'active',
    createdAt: '2025-09-05',
  },
]

export function TeamsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [orgFilter, setOrgFilter] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)

  const organizations = [...new Set(mockTeams.map((t) => t.organizationName))]

  const filteredTeams = mockTeams.filter((team) => {
    const matchesSearch =
      team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      team.slug.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesOrg = orgFilter === 'all' || team.organizationName === orgFilter
    return matchesSearch && matchesOrg
  })

  const getUsagePercent = (current: number, limit: number | null) => {
    if (!limit) return 0
    return Math.min((current / limit) * 100, 100)
  }

  const getUsageColor = (current: number, limit: number | null) => {
    if (!limit) return 'bg-violet-500'
    const percent = (current / limit) * 100
    if (percent >= 100) return 'bg-red-500'
    if (percent >= 80) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`
    return tokens.toString()
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Teams"
        description="Manage teams and their token budgets"
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <AddLine className="w-4 h-4 mr-2" />
            Create Team
          </Button>
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
            {organizations.map((org) => (
              <option key={org} value={org}>
                {org}
              </option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                  <Group2Line className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{mockTeams.length}</p>
                  <p className="text-sm text-muted-foreground">Total Teams</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <FolderLine className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {mockTeams.reduce((acc, t) => acc + t.projectsCount, 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Projects</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <ChartBarLine className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {mockTeams.filter((t) => t.status === 'over_limit').length}
                  </p>
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
            <div className="space-y-4">
              {filteredTeams.map((team) => (
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
                          {team.status === 'over_limit' && (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                              Over Limit
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {team.organizationName} / {team.slug}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{team.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingTeam(team)}>
                        <EditLine className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <DeleteLine className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      <FolderLine className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{team.projectsCount} projects</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User2Line className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{team.membersCount} members</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Requests:</span>{' '}
                      {team.totalRequests.toLocaleString()}
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">This Month:</span>{' '}
                      {formatTokens(team.currentMonthTokens)} tokens
                    </div>
                  </div>

                  {/* Token Usage Bar */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Token Usage</span>
                      <span>
                        {formatTokens(team.currentMonthTokens)} /{' '}
                        {team.monthlyTokenLimit ? formatTokens(team.monthlyTokenLimit) : 'Unlimited'}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full transition-all', getUsageColor(team.currentMonthTokens, team.monthlyTokenLimit))}
                        style={{
                          width: `${team.monthlyTokenLimit ? getUsagePercent(team.currentMonthTokens, team.monthlyTokenLimit) : 30}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {filteredTeams.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No teams found matching your criteria.
                </div>
              )}
            </div>
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
              <div>
                <label className="text-sm font-medium mb-1 block">Organization</label>
                <select className="w-full px-3 py-2 bg-background border border-border rounded-md">
                  <option>Acme Corporation</option>
                  <option>TechStart Inc</option>
                  <option>Beta Labs</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <Input placeholder="Product Engineering" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Slug</label>
                <Input placeholder="product-eng" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Input placeholder="Team description..." />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Monthly Token Limit</label>
                <Input type="number" placeholder="5000000" />
                <p className="text-xs text-muted-foreground mt-1">Leave empty for unlimited</p>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setShowCreateModal(false)}>
                  <CheckLine className="w-4 h-4 mr-2" />
                  Create
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
                <Input defaultValue={editingTeam.name} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Input defaultValue={editingTeam.description} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Monthly Token Limit</label>
                <Input
                  type="number"
                  defaultValue={editingTeam.monthlyTokenLimit || ''}
                  placeholder="Unlimited"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setEditingTeam(null)}>
                  Cancel
                </Button>
                <Button onClick={() => setEditingTeam(null)}>
                  <CheckLine className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
