import { useState, useEffect } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, ErrorState, SkeletonPage, Stat, StatGrid, StatusPill } from '@/components/ui'
import { formatDuration } from '@/lib/utils'
import {
  ServerLine,
  AddLine,
  Refresh1Line,
  Settings1Line,
} from '@mingcute/react'
import { getProviders } from '@/lib/api'
import type { ProviderSummary } from '@/lib/types'

export function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)

  const fetchProviders = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getProviders()
      setProviders(data)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProviders()
  }, [])

  const getStatusBadge = (status: ProviderSummary['health_status'], isEnabled: boolean) =>
    isEnabled ? <StatusPill status={status} /> : <StatusPill status="disabled" />

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
      <div className="flex flex-col">
        <Header title="Providers" description="Configure and monitor LLM providers" />
        <div className="flex-1 p-4 sm:p-6">
          <SkeletonPage stats={4} rows={4} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col">
        <Header title="Providers" description="Configure and monitor LLM providers" />
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState variant="page" error={error} what="providers" onRetry={fetchProviders} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
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

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5">
        {/* Summary Stats */}
        <StatGrid>
          <Stat label="Active Providers" value={<>{enabledCount}/{providers.length}</>} />
          <Stat label="Requests (24h)" value={totalRequests24h.toLocaleString()} />
          <Stat label="Cost (24h)" value={formatCurrency(totalCost24h)} />
          <Stat label="Avg Latency" value={formatDuration(avgLatency)} />
        </StatGrid>

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
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="hidden h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground sm:flex">
                        <ServerLine className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-medium">{provider.display_name || provider.provider_name}</h3>
                          {getStatusBadge(provider.health_status, provider.is_enabled)}
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {provider.api_base_url || 'Default endpoint'}
                        </p>

                        {/* 24h Stats Row */}
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                          <div>
                            <span className="text-muted-foreground">Success Rate:</span>{' '}
                            <span className={`font-mono ${provider.success_rate >= 99 ? 'text-success' : provider.success_rate >= 95 ? 'text-warning' : 'text-destructive'}`}>
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
                    <div className="space-y-1 border-t pt-3 md:border-t-0 md:pt-0 md:text-right">
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
                      <div className="mt-4 flex gap-2 md:justify-end">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="shadow-panel w-full max-w-md animate-scale-in">
              <CardHeader>
                <CardTitle>Add Provider</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Provider Type</label>
                  <select className="w-full bg-card pl-3 pr-8 py-2 text-sm focus:ring-2 focus:ring-ring">
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
