import { useState, useEffect } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Input } from '@/components/ui'
import { formatDuration } from '@/lib/utils'
import {
  ServerLine,
  AddLine,
  CheckLine,
  AlertLine,
  Refresh1Line,
  Settings1Line,
  TimeLine,
  ChartBarLine,
  CoinLine,
} from '@mingcute/react'
import { getProviders } from '@/lib/api'
import type { ProviderSummary } from '@/lib/types'

export function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)

  const fetchProviders = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getProviders()
      setProviders(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch providers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProviders()
  }, [])

  const getStatusBadge = (status: ProviderSummary['health_status'], isEnabled: boolean) => {
    if (!isEnabled) {
      return <Badge variant="secondary" className="gap-1">Disabled</Badge>
    }
    switch (status) {
      case 'healthy':
        return <Badge variant="success" className="gap-1"><CheckLine className="h-3 w-3" /> Healthy</Badge>
      case 'degraded':
        return <Badge variant="warning" className="gap-1"><AlertLine className="h-3 w-3" /> Degraded</Badge>
      case 'inactive':
        return <Badge variant="secondary" className="gap-1"><TimeLine className="h-3 w-3" /> Inactive</Badge>
      case 'no_data':
        return <Badge variant="secondary" className="gap-1">No Data</Badge>
      case 'disabled':
        return <Badge variant="secondary" className="gap-1">Disabled</Badge>
      default:
        return <Badge variant="secondary" className="gap-1">{status}</Badge>
    }
  }

  const getProviderColor = (name: string) => {
    const normalizedName = name.toLowerCase()
    if (normalizedName.includes('openai')) return 'bg-emerald-500/10 text-emerald-500'
    if (normalizedName.includes('anthropic')) return 'bg-orange-500/10 text-orange-500'
    if (normalizedName.includes('google')) return 'bg-blue-500/10 text-blue-500'
    return 'bg-violet-500/10 text-violet-500'
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
    if (diffMs < 60000) return 'Just now'
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  // Summary stats
  const totalRequests24h = providers.reduce((acc, p) => acc + p.requests_24h, 0)
  const totalCost24h = providers.reduce((acc, p) => acc + p.cost_24h, 0)
  const avgLatency = providers.length > 0
    ? Math.round(providers.reduce((acc, p) => acc + p.avg_latency_ms, 0) / providers.length)
    : 0
  const enabledCount = providers.filter(p => p.is_enabled).length

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Providers" description="Configure and monitor LLM providers" />
        <div className="flex-1 flex items-center justify-center">
          <Refresh1Line className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Providers" description="Configure and monitor LLM providers" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-red-400">{error}</p>
          <Button onClick={fetchProviders}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Providers"
        description="Configure and monitor LLM providers"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchProviders}>
              <Refresh1Line className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => setShowAddDialog(true)} className="gap-2">
              <AddLine className="h-4 w-4" />
              Add Provider
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                  <ServerLine className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{enabledCount}/{providers.length}</p>
                  <p className="text-sm text-muted-foreground">Active Providers</p>
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
                  <p className="text-2xl font-semibold">{totalRequests24h.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Requests (24h)</p>
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
                  <p className="text-2xl font-semibold">{formatCurrency(totalCost24h)}</p>
                  <p className="text-sm text-muted-foreground">Cost (24h)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <TimeLine className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{formatDuration(avgLatency)}</p>
                  <p className="text-sm text-muted-foreground">Avg Latency</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Provider Cards */}
        <div className="grid gap-6">
          {providers.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No providers configured. Add a provider to get started.
              </CardContent>
            </Card>
          ) : (
            providers.map((provider) => (
              <Card key={provider.provider_name}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getProviderColor(provider.provider_name)}`}>
                        <ServerLine className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold">{provider.display_name || provider.provider_name}</h3>
                          {getStatusBadge(provider.health_status, provider.is_enabled)}
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {provider.api_base_url || 'Default endpoint'}
                        </p>

                        {/* 24h Stats Row */}
                        <div className="flex gap-6 text-sm">
                          <div>
                            <span className="text-muted-foreground">Success Rate:</span>{' '}
                            <span className={`font-mono ${provider.success_rate >= 99 ? 'text-green-400' : provider.success_rate >= 95 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {provider.success_rate.toFixed(1)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">P95:</span>{' '}
                            <span className="font-mono">{formatDuration(provider.p95_latency_ms)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">P99:</span>{' '}
                            <span className="font-mono">{formatDuration(provider.p99_latency_ms)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="text-right space-y-1">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Avg Latency:</span>{' '}
                        <span className="font-mono">{formatDuration(provider.avg_latency_ms)}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">24h Requests:</span>{' '}
                        <span className="font-mono">{provider.requests_24h.toLocaleString()}</span>
                        <span className="text-muted-foreground text-xs ml-1">
                          ({provider.successful_24h} ok / {provider.failed_24h} fail)
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">24h Cost:</span>{' '}
                        <span className="font-mono">{formatCurrency(provider.cost_24h)}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">All Time:</span>{' '}
                        <span className="font-mono">{provider.all_time_requests.toLocaleString()} reqs</span>
                        <span className="text-muted-foreground"> / </span>
                        <span className="font-mono">{formatCurrency(provider.all_time_cost)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Last request: {formatRelativeTime(provider.last_request_at)}
                      </div>
                      <div className="flex gap-2 mt-4 justify-end">
                        <Button variant="outline" size="sm" className="gap-2">
                          <Refresh1Line className="h-4 w-4" />
                          Test
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Settings1Line className="h-4 w-4" />
                          Configure
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Add Provider Dialog */}
        {showAddDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <Card className="w-full max-w-md animate-scale-in">
              <CardHeader>
                <CardTitle>Add Provider</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Provider Type</label>
                  <select className="w-full bg-muted border-0 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring">
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google AI</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input placeholder="Production API" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">API Key</label>
                  <Input type="password" placeholder="sk-..." />
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button className="flex-1">Add Provider</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
