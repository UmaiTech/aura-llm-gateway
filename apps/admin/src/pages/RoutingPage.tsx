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
import {
  getAutoRoutingStats,
  getRoutingStats,
  type AutoRoutingStats,
  type RoutingStats,
  type TimeRange,
} from '@/lib/api'

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
  'auto:simple': 'Auto · simple tier',
  'auto:medium': 'Auto · medium tier',
  'auto:complex': 'Auto · complex tier',
  'auto:reasoning': 'Auto · reasoning tier',
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
  'auto:simple': 'model: "auto" classified the request as simple',
  'auto:medium': 'model: "auto" classified the request as medium',
  'auto:complex': 'model: "auto" classified the request as complex',
  'auto:reasoning': 'model: "auto" classified the request as reasoning',
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

const tierOrder = ['simple', 'medium', 'complex', 'reasoning']
const tierTone: Record<string, string> = {
  simple: 'bg-emerald-500/20 text-emerald-300',
  medium: 'bg-blue-500/20 text-blue-300',
  complex: 'bg-violet-500/20 text-violet-300',
  reasoning: 'bg-pink-500/20 text-pink-300',
}

function formatMicros(us: number): string {
  if (us >= 1000) return `${(us / 1000).toFixed(1)} ms`
  return `${us} µs`
}

export function RoutingPage() {
  const [stats, setStats] = useState<RoutingStats[]>([])
  const [auto, setAuto] = useState<AutoRoutingStats | null>(null)
  const [autoPeriod, setAutoPeriod] = useState<TimeRange>('24h')
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setError(null)
    try {
      const [data, autoData] = await Promise.all([
        getRoutingStats(),
        // The auto-router table only exists once its migration ran; a
        // failure here must not take the whole page down.
        getAutoRoutingStats(autoPeriod).catch(() => null),
      ])
      setStats(data)
      setAuto(autoData)
    } catch (err) {
      // Don't silently render the empty-state copy ("No routing
      // activity in the observed window") on a network/auth failure
      // — that's misleading. Surface the actual error and let the
      // user retry.
      setStats([])
      setError(err instanceof Error ? err.message : 'Failed to load routing stats')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPeriod])

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

  // Render an error state with Retry rather than falling through to the
  // empty-data view — otherwise a 401 / 500 / network failure looks
  // identical to "no traffic yet", which made the page silently broken.
  if (error) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Routing" description="Observed routing strategy usage" />
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full border-destructive/30 bg-destructive/5">
            <CardContent className="p-6 space-y-3">
              <div className="text-sm font-medium text-destructive">
                Failed to load routing stats
              </div>
              <div className="text-sm text-muted-foreground">{error}</div>
              <Button onClick={handleRefresh} disabled={isRefreshing} size="sm">
                <Refresh1Line className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
                Retry
              </Button>
            </CardContent>
          </Card>
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

        {/* Auto router (model: "auto") */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-medium">Auto router</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Complexity-based model selection for <code className="text-foreground">model: "auto"</code>.
                Shadow rows are pinned-model requests scored for comparison only.
              </p>
            </div>
            <div className="flex items-center gap-1">
              {(['24h', '7d', 'all'] as TimeRange[]).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={autoPeriod === p ? 'secondary' : 'ghost'}
                  onClick={() => setAutoPeriod(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {!auto ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Auto-router stats are unavailable. Run the latest migrations and make sure the
                gateway has a database connection.
              </p>
            ) : auto.summary.applied_decisions + auto.summary.shadow_decisions === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No auto-routing decisions in this window. Send a request with{' '}
                <code className="text-foreground">model: "auto"</code>, or leave shadow scoring on
                and pinned-model traffic will show up here.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Applied decisions</div>
                    <div className="text-xl font-semibold tabular-nums">
                      {formatNumber(auto.summary.applied_decisions)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Shadow decisions</div>
                    <div className="text-xl font-semibold tabular-nums">
                      {formatNumber(auto.summary.shadow_decisions)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Applied cost</div>
                    <div className="text-xl font-semibold tabular-nums">
                      {formatCurrency(auto.summary.applied_cost)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Est. savings (shadow)</div>
                    <div
                      className={cn(
                        'text-xl font-semibold tabular-nums',
                        auto.summary.estimated_savings > 0 && 'text-emerald-400',
                      )}
                    >
                      {formatCurrency(auto.summary.estimated_savings)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Decision latency</div>
                    <div className="text-xl font-semibold tabular-nums">
                      {formatMicros(auto.summary.avg_decision_us)}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border/40">
                        <th className="text-left py-2 pr-3 font-medium">Tier</th>
                        <th className="text-left py-2 pr-3 font-medium">Kind</th>
                        <th className="text-right py-2 pr-3 font-medium">Decisions</th>
                        <th className="text-right py-2 pr-3 font-medium">Avg score</th>
                        <th className="text-right py-2 pr-3 font-medium">Completed</th>
                        <th className="text-right py-2 pr-3 font-medium">Avg latency</th>
                        <th className="text-right py-2 pr-3 font-medium">Cost</th>
                        <th className="text-right py-2 pr-3 font-medium">Est. savings</th>
                        <th className="text-right py-2 pr-3 font-medium">Feedback</th>
                        <th className="text-left py-2 font-medium">Top model</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...auto.by_tier]
                        .sort(
                          (a, b) =>
                            Number(a.shadow) - Number(b.shadow) ||
                            tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier),
                        )
                        .map((t) => (
                          <tr
                            key={`${t.shadow}-${t.tier}`}
                            className="border-b border-border/20 last:border-0"
                          >
                            <td className="py-2 pr-3">
                              <span
                                className={cn(
                                  'inline-block rounded px-2 py-0.5 text-xs font-medium',
                                  tierTone[t.tier] ?? 'bg-muted text-muted-foreground',
                                )}
                              >
                                {t.tier}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">
                              {t.shadow ? 'shadow' : 'applied'}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {formatNumber(t.decisions)}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {t.avg_score.toFixed(2)}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {t.completed + t.failed > 0
                                ? `${((t.completed / (t.completed + t.failed)) * 100).toFixed(0)}%`
                                : '—'}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {formatDuration(t.avg_latency_ms)}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {formatCurrency(t.actual_cost)}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {t.shadow ? formatCurrency(t.estimated_savings) : '—'}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {t.approved + t.rejected > 0
                                ? `${t.approved} / ${t.rejected}`
                                : '—'}
                            </td>
                            <td className="py-2 font-mono text-xs">{t.top_model ?? '—'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {auto.recent.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Recent decisions</div>
                    <div className="space-y-1">
                      {auto.recent.slice(0, 10).map((d) => (
                        <div
                          key={d.response_id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs py-1 border-b border-border/20 last:border-0"
                        >
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 font-medium',
                              tierTone[d.tier] ?? 'bg-muted text-muted-foreground',
                            )}
                          >
                            {d.tier}
                          </span>
                          <span className="text-muted-foreground">{d.shadow ? 'shadow' : d.mode}</span>
                          <span className="font-mono">
                            {d.requested_model} → {d.selected_model}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            score {d.score.toFixed(2)}
                          </span>
                          {d.status && (
                            <span
                              className={cn(
                                d.status === 'completed' ? 'text-emerald-400' : 'text-destructive/80',
                              )}
                            >
                              {d.status}
                            </span>
                          )}
                          {d.shadow && d.estimated_savings_usd != null && (
                            <span className="tabular-nums text-emerald-400">
                              saves {formatCurrency(d.estimated_savings_usd)}
                            </span>
                          )}
                          <span className="text-muted-foreground truncate max-w-md" title={d.reason}>
                            {d.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

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
