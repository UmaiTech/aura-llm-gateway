import { useState } from 'react'
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
} from '@mingcute/react'

interface EndUser {
  id: string
  organizationId: string
  organizationName: string
  externalId: string
  name: string | null
  email: string | null
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  requestCount: number
  isBlocked: boolean
  lastSeenAt: string | null
  createdAt: string
}

const mockEndUsers: EndUser[] = [
  {
    id: 'eu_1',
    organizationId: 'org_1',
    organizationName: 'Acme Corporation',
    externalId: 'customer_12345',
    name: 'John Smith',
    email: 'john@example.com',
    totalInputTokens: 1250000,
    totalOutputTokens: 890000,
    totalCostUsd: 45.67,
    requestCount: 342,
    isBlocked: false,
    lastSeenAt: '2026-02-01T14:30:00Z',
    createdAt: '2025-08-15',
  },
  {
    id: 'eu_2',
    organizationId: 'org_1',
    organizationName: 'Acme Corporation',
    externalId: 'customer_12346',
    name: 'Jane Doe',
    email: 'jane@example.com',
    totalInputTokens: 2100000,
    totalOutputTokens: 1500000,
    totalCostUsd: 78.90,
    requestCount: 567,
    isBlocked: false,
    lastSeenAt: '2026-02-02T09:15:00Z',
    createdAt: '2025-09-01',
  },
  {
    id: 'eu_3',
    organizationId: 'org_1',
    organizationName: 'Acme Corporation',
    externalId: 'customer_12347',
    name: null,
    email: null,
    totalInputTokens: 5600000,
    totalOutputTokens: 4200000,
    totalCostUsd: 234.50,
    requestCount: 1245,
    isBlocked: true,
    lastSeenAt: '2026-01-28T18:45:00Z',
    createdAt: '2025-07-20',
  },
  {
    id: 'eu_4',
    organizationId: 'org_2',
    organizationName: 'TechStart Inc',
    externalId: 'user_abc123',
    name: 'Bob Wilson',
    email: 'bob@techstart.io',
    totalInputTokens: 450000,
    totalOutputTokens: 320000,
    totalCostUsd: 15.20,
    requestCount: 89,
    isBlocked: false,
    lastSeenAt: '2026-02-01T16:00:00Z',
    createdAt: '2025-11-10',
  },
  {
    id: 'eu_5',
    organizationId: 'org_2',
    organizationName: 'TechStart Inc',
    externalId: 'user_def456',
    name: 'Alice Chen',
    email: 'alice@techstart.io',
    totalInputTokens: 780000,
    totalOutputTokens: 560000,
    totalCostUsd: 28.90,
    requestCount: 156,
    isBlocked: false,
    lastSeenAt: '2026-02-02T11:30:00Z',
    createdAt: '2025-10-05',
  },
]

export function EndUsersPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [orgFilter, setOrgFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked'>('all')
  const [selectedUser, setSelectedUser] = useState<EndUser | null>(null)

  const organizations = [...new Set(mockEndUsers.map((u) => u.organizationName))]

  const filteredUsers = mockEndUsers.filter((user) => {
    const matchesSearch =
      user.externalId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    const matchesOrg = orgFilter === 'all' || user.organizationName === orgFilter
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'blocked' && user.isBlocked) ||
      (statusFilter === 'active' && !user.isBlocked)
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

  const totalUsers = mockEndUsers.length
  const blockedUsers = mockEndUsers.filter((u) => u.isBlocked).length
  const totalCost = mockEndUsers.reduce((acc, u) => acc + u.totalCostUsd, 0)
  const totalRequests = mockEndUsers.reduce((acc, u) => acc + u.requestCount, 0)

  return (
    <div className="flex flex-col h-full">
      <Header
        title="End Users"
        description="Track and manage your customers' usage"
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
                          <p className="text-xs text-muted-foreground font-mono">{user.externalId}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">{user.organizationName}</td>
                      <td className="py-3 px-4 text-right text-sm">{user.requestCount.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right text-sm">
                        {formatTokens(user.totalInputTokens + user.totalOutputTokens)}
                      </td>
                      <td className="py-3 px-4 text-right text-sm">{formatCurrency(user.totalCostUsd)}</td>
                      <td className="py-3 px-4 text-right text-sm text-muted-foreground">
                        {formatRelativeTime(user.lastSeenAt)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {user.isBlocked ? (
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
                          {user.isBlocked ? (
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
                  No users found matching your criteria.
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
                  <p className="text-sm text-muted-foreground font-mono">{selectedUser.externalId}</p>
                  {selectedUser.email && (
                    <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                <div>
                  <p className="text-sm text-muted-foreground">Organization</p>
                  <p className="font-medium">{selectedUser.organizationName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {selectedUser.isBlocked ? (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Blocked</Badge>
                  ) : (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Requests</p>
                  <p className="text-xl font-semibold">{selectedUser.requestCount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Cost</p>
                  <p className="text-xl font-semibold">{formatCurrency(selectedUser.totalCostUsd)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Input Tokens</p>
                  <p className="font-medium">{formatTokens(selectedUser.totalInputTokens)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Output Tokens</p>
                  <p className="font-medium">{formatTokens(selectedUser.totalOutputTokens)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">First Seen</p>
                  <p className="font-medium">{selectedUser.createdAt}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Seen</p>
                  <p className="font-medium">{formatRelativeTime(selectedUser.lastSeenAt)}</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setSelectedUser(null)}>
                  Close
                </Button>
                <Button
                  variant={selectedUser.isBlocked ? 'default' : 'destructive'}
                  onClick={() => setSelectedUser(null)}
                >
                  {selectedUser.isBlocked ? (
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
