import { useState, useEffect } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Badge } from '@/components/ui'
import {
  SearchLine,
  User2Line,
  ForbidCircleLine,
  CheckLine,
  CloseLine,
  ChartBarLine,
  CoinLine,
  Refresh1Line,
} from '@mingcute/react'
import { getEndUsers } from '@/lib/api'
import { useOrgFilterStore } from '@/stores/orgFilterStore'
import { OrgFilter } from '@/components/OrgFilter'
import type { EndUserSummary } from '@/lib/types'

export function EndUsersPage() {
  const selectedOrgId = useOrgFilterStore((s) => s.selectedOrgId)
  const [searchQuery, setSearchQuery] = useState('')
  const [orgFilter, setOrgFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked'>('all')
  const [selectedUser, setSelectedUser] = useState<EndUserSummary | null>(null)
  const [users, setUsers] = useState<EndUserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getEndUsers(selectedOrgId)
      setUsers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  // Re-fetch when the header org filter changes. The in-page
  // `orgFilter` select (by organization_name) is a separate client-
  // side narrowing — keeping it complementary instead of replacing
  // it avoids ripping out a feature in the same PR.
  useEffect(() => {
    fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId])

  const organizations = [...new Set(users.map((u) => u.organization_name))]

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.external_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    const matchesOrg = orgFilter === 'all' || user.organization_name === orgFilter
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'blocked' && user.is_blocked) ||
      (statusFilter === 'active' && !user.is_blocked)
    return matchesSearch && matchesOrg && matchesStatus
  })

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`
    return tokens.toString()
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const totalUsers = users.length
  const blockedUsers = users.filter((u) => u.is_blocked).length
  const totalCost = users.reduce((acc, u) => acc + u.total_cost_usd, 0)
  const totalRequests = users.reduce((acc, u) => acc + u.request_count, 0)

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="End Users" description="Track and manage your customers' usage" />
        <div className="flex-1 flex items-center justify-center">
          <Refresh1Line className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <Header title="End Users" description="Track and manage your customers' usage" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-red-400">{error}</p>
          <Button onClick={fetchUsers}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="End Users"
        description="Track and manage your customers' usage"
        actions={
          <div className="flex gap-2 items-center">
            <OrgFilter />
            <Button variant="outline" size="sm" onClick={fetchUsers}>
              <Refresh1Line className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <SearchLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID, name, or email..."
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'blocked')}
            className="px-3 py-2 bg-background border border-border rounded-md text-sm"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                  <User2Line className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totalUsers}</p>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <ForbidCircleLine className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{blockedUsers}</p>
                  <p className="text-sm text-muted-foreground">Blocked</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <ChartBarLine className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totalRequests.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Total Requests</p>
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
                  <p className="text-2xl font-semibold">{formatCurrency(totalCost)}</p>
                  <p className="text-sm text-muted-foreground">Total Cost</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>All End Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">User</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Organization</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Requests</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Tokens</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Cost</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Last Seen</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                      onClick={() => setSelectedUser(user)}
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{user.name || 'Anonymous'}</p>
                          <p className="text-xs text-muted-foreground font-mono">{user.external_id}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">{user.organization_name}</td>
                      <td className="py-3 px-4 text-right text-sm">{user.request_count.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right text-sm">
                        {formatTokens(user.total_tokens)}
                      </td>
                      <td className="py-3 px-4 text-right text-sm">{formatCurrency(user.total_cost_usd)}</td>
                      <td className="py-3 px-4 text-right text-sm text-muted-foreground">
                        {formatRelativeTime(user.last_seen_at)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {user.is_blocked ? (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                            Blocked
                          </Badge>
                        ) : (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                            Active
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            // Toggle block status
                          }}
                        >
                          {user.is_blocked ? (
                            <CheckLine className="w-4 h-4 text-green-400" />
                          ) : (
                            <ForbidCircleLine className="w-4 h-4 text-red-400" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredUsers.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  {users.length === 0
                    ? 'No end users found. Users will appear here when they make API requests.'
                    : 'No users found matching your criteria.'}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>User Details</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSelectedUser(null)}>
                  <CloseLine className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-violet-500/20 rounded-full">
                  <User2Line className="w-8 h-8 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{selectedUser.name || 'Anonymous User'}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{selectedUser.external_id}</p>
                  {selectedUser.email && (
                    <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                <div>
                  <p className="text-sm text-muted-foreground">Organization</p>
                  <p className="font-medium">{selectedUser.organization_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {selectedUser.is_blocked ? (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Blocked</Badge>
                  ) : (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Requests</p>
                  <p className="text-xl font-semibold">{selectedUser.request_count.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Cost</p>
                  <p className="text-xl font-semibold">{formatCurrency(selectedUser.total_cost_usd)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Input Tokens</p>
                  <p className="font-medium">{formatTokens(selectedUser.total_input_tokens)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Output Tokens</p>
                  <p className="font-medium">{formatTokens(selectedUser.total_output_tokens)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">First Seen</p>
                  <p className="font-medium">{formatRelativeTime(selectedUser.first_seen_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Seen</p>
                  <p className="font-medium">{formatRelativeTime(selectedUser.last_seen_at)}</p>
                </div>
              </div>

              {(selectedUser.monthly_token_limit || selectedUser.rate_limit_rpm) && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                  {selectedUser.monthly_token_limit && (
                    <div>
                      <p className="text-sm text-muted-foreground">Monthly Limit</p>
                      <p className="font-medium">{formatTokens(selectedUser.monthly_token_limit)} tokens</p>
                      <p className="text-xs text-muted-foreground">
                        Used: {formatTokens(selectedUser.current_month_tokens)}
                      </p>
                    </div>
                  )}
                  {selectedUser.rate_limit_rpm && (
                    <div>
                      <p className="text-sm text-muted-foreground">Rate Limit</p>
                      <p className="font-medium">{selectedUser.rate_limit_rpm} RPM</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setSelectedUser(null)}>
                  Close
                </Button>
                <Button
                  variant={selectedUser.is_blocked ? 'default' : 'destructive'}
                  onClick={() => setSelectedUser(null)}
                >
                  {selectedUser.is_blocked ? (
                    <>
                      <CheckLine className="w-4 h-4 mr-2" />
                      Unblock User
                    </>
                  ) : (
                    <>
                      <ForbidCircleLine className="w-4 h-4 mr-2" />
                      Block User
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
