import { useState } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  AddLine,
  SearchLine,
  Building4Line,
  User2Line,
  Settings1Line,
  DeleteLine,
  EditLine,
  CheckLine,
  CloseLine,
} from '@mingcute/react'

interface Organization {
  id: string
  name: string
  slug: string
  ownerId: string
  teamsCount: number
  projectsCount: number
  endUsersCount: number
  totalRequests: number
  totalCost: number
  status: 'active' | 'suspended' | 'trial'
  createdAt: string
}

const mockOrganizations: Organization[] = [
  {
    id: 'org_1',
    name: 'Acme Corporation',
    slug: 'acme-corp',
    ownerId: 'user_123',
    teamsCount: 4,
    projectsCount: 12,
    endUsersCount: 1250,
    totalRequests: 45000,
    totalCost: 1234.56,
    status: 'active',
    createdAt: '2025-06-15',
  },
  {
    id: 'org_2',
    name: 'TechStart Inc',
    slug: 'techstart',
    ownerId: 'user_456',
    teamsCount: 2,
    projectsCount: 5,
    endUsersCount: 320,
    totalRequests: 12000,
    totalCost: 456.78,
    status: 'active',
    createdAt: '2025-09-01',
  },
  {
    id: 'org_3',
    name: 'Beta Labs',
    slug: 'beta-labs',
    ownerId: 'user_789',
    teamsCount: 1,
    projectsCount: 2,
    endUsersCount: 50,
    totalRequests: 2500,
    totalCost: 89.00,
    status: 'trial',
    createdAt: '2026-01-10',
  },
]

export function OrganizationsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [newOrg, setNewOrg] = useState({ name: '', slug: '', ownerId: '' })

  const filteredOrgs = mockOrganizations.filter(
    (org) =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.slug.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getStatusColor = (status: Organization['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'suspended':
        return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'trial':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num)
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Organizations"
        description="Manage organizations and their settings"
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <AddLine className="w-4 h-4 mr-2" />
            Create Organization
          </Button>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                  <Building4Line className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{mockOrganizations.length}</p>
                  <p className="text-sm text-muted-foreground">Total Organizations</p>
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
                  <p className="text-2xl font-semibold">
                    {formatNumber(mockOrganizations.reduce((acc, org) => acc + org.endUsersCount, 0))}
                  </p>
                  <p className="text-sm text-muted-foreground">Total End Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <CheckLine className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {formatNumber(mockOrganizations.reduce((acc, org) => acc + org.totalRequests, 0))}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <Settings1Line className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {formatCurrency(mockOrganizations.reduce((acc, org) => acc + org.totalCost, 0))}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
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
                        <Badge className={cn('text-xs', getStatusColor(org.status))}>
                          {org.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">/{org.slug}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>{org.teamsCount} teams</span>
                        <span>{org.projectsCount} projects</span>
                        <span>{formatNumber(org.endUsersCount)} users</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="font-medium">{formatNumber(org.totalRequests)}</p>
                      <p className="text-xs text-muted-foreground">requests</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(org.totalCost)}</p>
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
                      <Button variant="ghost" size="sm">
                        <DeleteLine className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {filteredOrgs.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No organizations found matching your search.
                </div>
              )}
            </div>
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
              <div>
                <label className="text-sm font-medium mb-1 block">Owner ID</label>
                <Input
                  placeholder="user_123"
                  value={newOrg.ownerId}
                  onChange={(e) => setNewOrg({ ...newOrg, ownerId: e.target.value })}
                />
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
                <Input defaultValue={editingOrg.name} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Slug</label>
                <Input defaultValue={editingOrg.slug} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Status</label>
                <select className="w-full px-3 py-2 bg-background border border-border rounded-md">
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="trial">Trial</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setEditingOrg(null)}>
                  Cancel
                </Button>
                <Button onClick={() => setEditingOrg(null)}>
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
