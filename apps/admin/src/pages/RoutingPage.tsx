import { useEffect, useState } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { formatNumber, formatCurrency, formatDuration, cn } from '@/lib/utils'
import {
  DirectionsLine,
  ChartBarLine,
  CoinLine,
  TimeLine,
  Loading3Line,
  Refresh1Line,
  InformationLine,
} from '@mingcute/react'
import { getRoutingStats, type RoutingStats } from '@/lib/api'

/**
 * Routing page — read-only stats view.
 *
 * Previously this page rendered a mock "Active Rules" CRUD UI backed by
 * hardcoded data with no DB persistence (issue #175, A6). We removed the
 * rules table entirely instead of building a stub routing_rules schema
 * just to fill the UI — routing is configured today via the gateway's
 * config file + strategy plumbing in aura-core/router, and per-request
 * routing decisions are observable here via v_routing_stats.
 *
 * When admin-time rule editing lands, this page gets the rule list +
 * editor back. Tracking issue: #175 (A6 placeholder).
 */
const strategyLabels: Record<string, string> = {
  round_robin: 'Round Robin',
  weighted: 'Weighted',
  random: 'Random',
  least_latency: 'Least Latency',
  region_based: 'Region Based',
  priority: 'Priority',
  trait_based: 'Trait Based',
  cost_optimized: 'Cost Optimized',
  tool_aware: 'Tool Aware',
  context_adaptive: 'Context Adaptive',
  sticky_session: 'Sticky Session',
  reasoning_depth: 'Reasoning Depth',
}

const strategyDescriptions: Record<string, string> = {
  round_robin: 'Distribute requests evenly across providers',
  weighted: 'Route by configured weights per provider',
  random: 'Randomly select from available providers',
  least_latency: 'Route to the lowest-latency provider',
  cost_optimized: 'Route to the cheapest provider per model',
  tool_aware: 'Route based on which tools the request needs',
  context_adaptive: 'Route based on request context size',
  sticky_session: 'Keep a conversation on one provider',
  reasoning_depth: 'Route by required reasoning depth',
}

export function RoutingPage() {
  const [stats, setStats] = useState<RoutingStats[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchData = async () => {
    try {
      const data = await getRoutingStats()
      setStats(data)
    } catch {
      setStats([])
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

  const totalRequests = stats.reduce((acc, s) => acc + s.request_count, 0)
  const totalCost = stats.reduce((acc, s) => acc + s.total_cost, 0)
  // Weight avg latency by request count so high-traffic strategies dominate.
  const weightedAvgLatency =
    totalRequests > 0
      ? Math.round(
          stats.reduce((acc, s) => acc + s.avg_latency_ms * s.request_count, 0) /
            totalRequests,
        )
      : 0

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Routing" description="Observed routing strategy usage" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loading3Line className="h-5 w-5 animate-spin" />
            <span>Loading routing stats...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Routing"
        description="Observed routing strategy usage"
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <Refresh1Line className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Heads-up that this is observation only, not configuration. */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <InformationLine className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-muted-foreground">
              Routing strategies are configured in <code className="text-foreground">aura.yaml</code> on the
              gateway. This page surfaces observed per-strategy usage from{' '}
              <code className="text-foreground">v_routing_stats</code>. Admin-time rule editing is tracked in
              issue #175.
            </div>
          </CardContent>
        </Card>

        {/* Aggregate stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                  <DirectionsLine className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{stats.length}</p>
                  <p className="text-sm text-muted-foreground">Strategies Used</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <ChartBarLine className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatNumber(totalRequests)}
                  </p>
                  <p className="text-sm text-muted-foreground">Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <CoinLine className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatCurrency(totalCost)}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Cost</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <TimeLine className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatDuration(weightedAvgLatency)}
                  </p>
                  <p className="text-sm text-muted-foreground">Weighted Avg Latency</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Per-strategy breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Per-Strategy Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No routing activity in the observed window. Strategies appear here as soon as the
                gateway routes traffic.
              </p>
            ) : (
              <div className="space-y-3">
                {stats.map((s) => {
                  const label = strategyLabels[s.routing_strategy] || s.routing_strategy
                  const description = strategyDescriptions[s.routing_strategy]
                  const pct = totalRequests > 0 ? (s.request_count / totalRequests) * 100 : 0
                  const successRate =
                    s.request_count > 0
                      ? (s.successful_requests / s.request_count) * 100
                      : 0
                  return (
                    <div
                      key={s.routing_strategy}
                      className="p-4 border border-border/40 rounded-lg space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary">{label}</Badge>
                          {description && (
                            <span className="text-xs text-muted-foreground">{description}</span>
                          )}
                        </div>
                        <span className="text-sm font-mono tabular-nums">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Requests</div>
                          <div className="font-medium tabular-nums">
                            {formatNumber(s.request_count)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Success</div>
                          <div className="font-medium tabular-nums">
                            {s.request_count > 0 ? `${successRate.toFixed(1)}%` : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Avg Latency</div>
                          <div className="font-medium tabular-nums">
                            {formatDuration(s.avg_latency_ms)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Cost</div>
                          <div className="font-medium tabular-nums">
                            {formatCurrency(s.total_cost)}
                          </div>
                        </div>
                      </div>
                      {s.failed_requests > 0 && (
                        <div className="text-xs text-destructive/80">
                          {s.failed_requests} failed request
                          {s.failed_requests !== 1 && 's'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
