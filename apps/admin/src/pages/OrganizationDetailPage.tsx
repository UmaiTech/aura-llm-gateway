import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { cn, formatCurrency, formatNumber } from '@/lib/utils'
import {
  ArrowLeftLine,
  Building4Line,
  Group2Line,
  Key2Line,
  User2Line,
  FlashLine,
  CoinLine,
  Loading3Line,
  Refresh1Line,
} from '@mingcute/react'
import {
  getOrganizations,
  getTeams,
  getApiKeys,
  getEndUsers,
  type OrganizationSummary,
  type TeamSummary,
  type ApiKeySummary,
  type EndUserSummary,
} from '@/lib/api'

/**
 * Organization detail page — drill-down view for a single org.
 *
 * Routed from /organizations/:id. All four entities (org metadata,
 * teams, api keys, end users) come from existing list endpoints
 * filtered client-side so we don't need a per-org backend route.
 * The list endpoints already accept `?organization_id=<uuid>` for
 * api-keys and end-users; teams come back with `organization_id` on
 * each row so we filter in the browser.
 */
export function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [org, setOrg] = useState<OrganizationSummary | null>(null)
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([])
  const [endUsers, setEndUsers] = useState<EndUserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchData = async () => {
    if (!id) return
    setError(null)
    try {
      const [orgs, allTeams, keys, users] = await Promise.all([
        getOrganizations(),
        getTeams(),
        getApiKeys(id),
        getEndUsers(id),
      ])
      const matched = orgs.find((o) => o.id === id) ?? null
      setOrg(matched)
      setTeams(allTeams.filter((t) => t.organization_id === id))
      setApiKeys(keys)
      setEndUsers(users)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load organization')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    // Reset to a loading skeleton when navigating between orgs so
    // we don't briefly show the previous org's data under the new id.
    setLoading(true)
    setOrg(null)
    setTeams([])
    setApiKeys([])
    setEndUsers([])
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchData()
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Organization" description="Loading..." />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loading3Line className="h-5 w-5 animate-spin" />
            <span>Loading organization...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error || !org) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Organization" description="Not found" />
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full border-destructive/30 bg-destructive/5">
            <CardContent className="p-6 space-y-3">
              <div className="text-sm font-medium text-destructive">
                {error ? 'Failed to load organization' : 'Organization not found'}
              </div>
              {error && <div className="text-sm text-muted-foreground">{error}</div>}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate('/organizations')}>
                  <ArrowLeftLine className="h-4 w-4 mr-2" />
                  Back to list
                </Button>
                {error && (
                  <Button size="sm" onClick={handleRefresh}>
                    <Refresh1Line className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Cost-by-team is derivable client-side from teams + api keys: each
  // key carries its own current_month_tokens / total_cost, but keys
  // aren't joined to teams in the API today, so this section is left
  // as a placeholder until that join exists in the backend. Showing
  // the team-level token usage we DO have for now.
  return (
    <div className="flex flex-col h-full">
      <Header
        title={org.name}
        description={`/${org.slug}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/organizations')}>
              <ArrowLeftLine className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <Refresh1Line className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stat row */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                  <Building4Line className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{teams.length}</p>
                  <p className="text-xs text-muted-foreground">Teams</p>
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
                  <p className="text-2xl font-semibold tabular-nums">{apiKeys.length}</p>
                  <p className="text-xs text-muted-foreground">API Keys</p>
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
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatNumber(endUsers.length)}
                  </p>
                  <p className="text-xs text-muted-foreground">End Users</p>
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
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatNumber(org.total_requests)}
                  </p>
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
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatCurrency(org.total_cost)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Teams in this org */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Teams</CardTitle>
          </CardHeader>
          <CardContent>
            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No teams in this organization yet.
              </p>
            ) : (
              <div className="space-y-2">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between p-3 rounded-md border border-border/40 hover:border-border transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-violet-500/10 rounded">
                        <Group2Line className="w-4 h-4 text-violet-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{team.name}</p>
                        <p className="text-xs text-muted-foreground">
                          /{team.slug} · {team.member_count} member
                          {team.member_count !== 1 && 's'} · {team.project_count} project
                          {team.project_count !== 1 && 's'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono tabular-nums">
                        {formatNumber(team.current_month_tokens)}
                        {team.monthly_token_limit !== null
                          ? ` / ${formatNumber(team.monthly_token_limit)}`
                          : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">tokens this month</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Keys in this org */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">API Keys</CardTitle>
          </CardHeader>
          <CardContent>
            {apiKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No API keys in this organization yet.
              </p>
            ) : (
              <div className="space-y-2">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between p-3 rounded-md border border-border/40 hover:border-border transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-500/10 rounded">
                        <Key2Line className="w-4 h-4 text-orange-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{key.name}</p>
                        <p className="text-xs font-mono text-muted-foreground">{key.key_id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <Badge
                        variant={key.status === 'active' ? 'success' : 'secondary'}
                        className="capitalize"
                      >
                        {key.status}
                      </Badge>
                      <div>
                        <p className="text-sm font-mono tabular-nums">
                          {formatNumber(key.total_requests)}
                        </p>
                        <p className="text-xs text-muted-foreground">requests</p>
                      </div>
                      <div>
                        <p className="text-sm font-mono tabular-nums">
                          {formatCurrency(key.total_cost)}
                        </p>
                        <p className="text-xs text-muted-foreground">cost</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* End users in this org */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">End Users</CardTitle>
          </CardHeader>
          <CardContent>
            {endUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No end users in this organization yet. End users are auto-created on the first
                /v1/responses request that includes a <code>user</code> field.
              </p>
            ) : (
              <div className="space-y-2">
                {endUsers.slice(0, 10).map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-md border border-border/40"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-500/10 rounded">
                        <User2Line className="w-4 h-4 text-green-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{user.name || user.external_id}</p>
                        <p className="text-xs font-mono text-muted-foreground">
                          {user.external_id}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono tabular-nums">
                        {formatNumber(user.request_count)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(user.total_cost_usd)} · {formatNumber(user.total_tokens)} tokens
                      </p>
                    </div>
                  </div>
                ))}
                {endUsers.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    Showing 10 of {endUsers.length} end users.{' '}
                    <button
                      className="text-primary hover:underline"
                      onClick={() => navigate('/end-users')}
                    >
                      View all
                    </button>
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
