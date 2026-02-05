import { useEffect, useRef, useState } from 'react'
import { Header } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { cn, formatNumber, formatCurrency, formatDuration } from '@/lib/utils'
import { animateStaggered, animateNumber } from '@/lib/animations'
import {
  FlashLine,
  CoinLine,
  ClockLine,
  CloseLine,
  ArrowUpLine,
  ArrowDownLine,
  CheckLine,
  AlertLine,
  DirectionsLine,
  FileZipLine,
  ServerLine,
  Loading3Line,
  Refresh1Line,
} from '@mingcute/react'
import {
  getOverviewStats,
  getDynamicStats,
  getProviderHealth,
  getCacheStats,
  getRoutingStats,
  getRecentLogs,
  getHourlyTimeline,
  getDailyTimeline,
  type OverviewStats,
  type DynamicStats,
  type ProviderHealth,
  type CacheStats,
  type RoutingStats,
  type RecentLog,
  type TimeRange,
  type TimelinePoint,
} from '@/lib/api'

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '24h', label: '24 Hours' },
  { value: '2d', label: '2 Days' },
  { value: '3d', label: '3 Days' },
  { value: '4d', label: '4 Days' },
  { value: '5d', label: '5 Days' },
  { value: '6d', label: '6 Days' },
  { value: '7d', label: '7 Days' },
]

export function DashboardPage() {
  const statsRef = useRef<HTMLDivElement>(null)
  const numberRefs = useRef<(HTMLSpanElement | null)[]>([])

  // Time range state
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [refreshKey, setRefreshKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // API state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null)
  const [dynamicStats, setDynamicStats] = useState<DynamicStats | null>(null)
  const [providers, setProviders] = useState<ProviderHealth[]>([])
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [routingStats, setRoutingStatsData] = useState<RoutingStats[]>([])
  const [recentRequests, setRecentRequests] = useState<RecentLog[]>([])
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])

  // Refresh handler
  const handleRefresh = () => {
    setIsRefreshing(true)
    setRefreshKey((k) => k + 1)
  }

  // Fetch data on mount and when time range changes
  useEffect(() => {
    async function fetchData() {
      if (!isRefreshing) {
        setLoading(true)
      }
      setError(null)

      try {
        // Use hourly timeline for 24h-2d, daily for longer periods
        const useHourly = timeRange === '24h' || timeRange === '2d'

        const [overview, dynamic, health, cache, routing, logs, timelineData] = await Promise.all([
          getOverviewStats().catch(() => null),
          getDynamicStats(timeRange).catch(() => null),
          getProviderHealth().catch(() => []),
          getCacheStats().catch(() => null),
          getRoutingStats().catch(() => []),
          getRecentLogs({ limit: 5 }).catch(() => []),
          useHourly ? getHourlyTimeline().catch(() => []) : getDailyTimeline().catch(() => []),
        ])

        setOverviewStats(overview)
        setDynamicStats(dynamic)
        setProviders(health)
        setCacheStats(cache)
        setRoutingStatsData(routing)
        setRecentRequests(logs)
        setTimeline(timelineData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
      } finally {
        setLoading(false)
        setIsRefreshing(false)
      }
    }

    fetchData()
  }, [timeRange, refreshKey])

  // Use dynamic stats if available, fall back to overview stats
  const currentStats = dynamicStats || (overviewStats ? {
    total_requests: overviewStats.total_requests_24h,
    input_tokens: overviewStats.input_tokens_24h,
    output_tokens: overviewStats.output_tokens_24h,
    cached_tokens: overviewStats.cached_tokens_24h,
    total_cost: overviewStats.cost_24h,
    avg_latency: overviewStats.avg_latency_24h,
    success_rate: overviewStats.success_rate_24h,
    period: '24h',
  } : null)

  // Computed stats for display
  const stats = currentStats
    ? [
        {
          title: 'Total Requests',
          value: currentStats.total_requests,
          change: 0, // Would need historical comparison
          trend: 'up' as const,
          icon: FlashLine,
          format: formatNumber,
        },
        {
          title: 'Total Cost',
          value: currentStats.total_cost,
          change: 0,
          trend: 'up' as const,
          icon: CoinLine,
          format: formatCurrency,
        },
        {
          title: 'Avg Latency',
          value: currentStats.avg_latency,
          change: 0,
          trend: 'down' as const,
          icon: ClockLine,
          format: (v: number) => formatDuration(v),
        },
        {
          title: 'Success Rate',
          value: currentStats.success_rate,
          change: 0,
          trend: 'up' as const,
          icon: CloseLine,
          format: (v: number) => `${v.toFixed(1)}%`,
        },
      ]
    : []

  // Animate stats when data loads
  useEffect(() => {
    if (!loading && currentStats && statsRef.current) {
      const cards = statsRef.current.querySelectorAll('.stats-card')
      animateStaggered(cards, 'fadeInUp', 80)

      numberRefs.current.forEach((ref, index) => {
        if (ref && stats[index]) {
          animateNumber(ref, stats[index].value, 1200, stats[index].format)
        }
      })
    }
  }, [loading, currentStats, timeRange])

  // Calculate routing percentages
  const totalRoutingRequests = routingStats.reduce((sum, s) => sum + s.request_count, 0)
  const routingWithPercentages = routingStats.map((s) => ({
    ...s,
    percentage: totalRoutingRequests > 0 ? (s.request_count / totalRoutingRequests) * 100 : 0,
  }))

  if (loading) {
    return (
      <div className="flex flex-col">
        <Header title="Dashboard" description="Overview of your gateway usage and health" />
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loading3Line className="h-5 w-5 animate-spin" />
            <span>Loading dashboard...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col">
        <Header title="Dashboard" description="Overview of your gateway usage and health" />
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center">
            <p className="text-destructive mb-2">{error}</p>
            <p className="text-sm text-muted-foreground">
              Make sure the gateway is running and the database is configured.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <Header title="Dashboard" description="Overview of your gateway usage and health" />

      <div className="flex-1 p-6 space-y-6">
        {/* Time Range Selector */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Showing data for: <span className="text-foreground">{TIME_RANGES.find(t => t.value === timeRange)?.label}</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={cn(
                'p-2 rounded-lg transition-all hover:bg-muted',
                isRefreshing && 'opacity-50 cursor-not-allowed'
              )}
              title="Refresh data"
            >
              <Refresh1Line className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </button>
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {TIME_RANGES.map((range) => (
                <button
                  key={range.value}
                  onClick={() => setTimeRange(range.value)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                    timeRange === range.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div ref={statsRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <Card key={stat.title} className="stats-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <stat.icon className="h-5 w-5 text-primary" />
                  </div>
                  {stat.change !== 0 && (
                    <div
                      className={cn(
                        'flex items-center gap-1 text-xs font-medium',
                        stat.trend === 'up' && stat.title !== 'Success Rate'
                          ? 'text-success'
                          : stat.trend === 'down' && stat.title === 'Success Rate'
                            ? 'text-destructive'
                            : stat.trend === 'up'
                              ? 'text-success'
                              : 'text-success'
                      )}
                    >
                      {stat.change > 0 ? (
                        <ArrowUpLine className="h-3 w-3" />
                      ) : (
                        <ArrowDownLine className="h-3 w-3" />
                      )}
                      {Math.abs(stat.change)}%
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <span
                    ref={(el) => {
                      numberRefs.current[index] = el
                    }}
                    className="text-2xl font-bold"
                  >
                    {stat.format(0)}
                  </span>
                  <p className="text-sm text-muted-foreground mt-1">{stat.title}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Request Volume Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base font-medium">Request Volume</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length > 0 ? (() => {
                // Filter to only show days with data for cleaner visualization
                const allData = timeline.slice(-30)
                const dataWithRequests = allData.filter(t => t.request_count > 0)
                const totalRequests = allData.reduce((sum, t) => sum + t.request_count, 0)

                // If we have data, show only the days with requests
                // Otherwise show last 7 days
                const displayData = dataWithRequests.length > 0
                  ? dataWithRequests
                  : allData.slice(-7)
                const maxRequests = Math.max(...displayData.map(t => t.request_count), 1)

                const maxBarHeight = 180 // pixels

                return (
                  <div className="h-[300px]">
                    {totalRequests > 0 ? (
                      <>
                        <div className="h-[240px] flex items-end gap-2 px-2">
                          {displayData.map((point, i) => {
                            // Calculate pixel height - minimum 30px for visibility
                            const heightPx = Math.max(30, Math.round((point.request_count / maxRequests) * maxBarHeight))
                            const hasErrors = point.error_count > 0
                            const dateStr = point.timestamp?.split('T')[0] || ''
                            const shortDate = dateStr.slice(5) // MM-DD format
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-[40px]">
                                <span className="text-xs font-medium text-foreground mb-1">
                                  {point.request_count}
                                </span>
                                <div
                                  className={cn(
                                    'w-full rounded-t transition-all duration-500',
                                    hasErrors
                                      ? 'bg-gradient-to-t from-destructive/60 to-destructive'
                                      : 'bg-gradient-to-t from-primary/60 to-primary'
                                  )}
                                  style={{ height: `${heightPx}px` }}
                                  title={`${dateStr}: ${point.request_count} requests${hasErrors ? `, ${point.error_count} errors` : ''}`}
                                />
                                <span className="text-2xs text-muted-foreground mt-2">
                                  {shortDate}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex items-center justify-center mt-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-4">
                            <span className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded bg-primary" />
                              Total: {totalRequests} requests
                            </span>
                            {displayData.some(t => t.error_count > 0) && (
                              <span className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded bg-destructive" /> With Errors
                              </span>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="h-full flex items-center justify-center border border-dashed rounded-lg">
                        <p className="text-muted-foreground">No requests in this time period</p>
                      </div>
                    )}
                  </div>
                )
              })() : (
                <div className="h-[300px] flex items-center justify-center border border-dashed rounded-lg">
                  <p className="text-muted-foreground">No request data available for this period</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Provider Health */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Provider Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {providers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No provider data available</p>
              ) : (
                providers.map((provider) => (
                  <div key={provider.provider_name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'h-2 w-2 rounded-full',
                          provider.health_status === 'healthy'
                            ? 'bg-success'
                            : provider.health_status === 'degraded'
                              ? 'bg-warning'
                              : 'bg-muted'
                        )}
                      />
                      <span className="font-medium">
                        {provider.display_name || provider.provider_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {formatDuration(provider.avg_latency_ms)}
                      </span>
                      {provider.health_status === 'healthy' ? (
                        <CheckLine className="h-4 w-4 text-success" />
                      ) : provider.health_status === 'degraded' ? (
                        <AlertLine className="h-4 w-4 text-warning" />
                      ) : (
                        <CloseLine className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Gateway Features Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Routing Strategy Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <DirectionsLine className="h-4 w-4 text-primary" />
                Routing Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {routingWithPercentages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No routing data available</p>
              ) : (
                routingWithPercentages.map((stat) => (
                  <div key={stat.routing_strategy} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize">
                        {stat.routing_strategy.replace(/_/g, ' ')}
                      </span>
                      <span className="text-muted-foreground">{stat.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${stat.percentage}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Cache Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <ServerLine className="h-4 w-4 text-primary" />
                Cache Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cacheStats ? (
                <>
                  <div className="flex items-center justify-center">
                    <div className="relative w-32 h-32">
                      <svg
                        className="w-full h-full transform -rotate-90"
                        viewBox="0 0 100 100"
                      >
                        <circle
                          className="text-muted stroke-current"
                          strokeWidth="10"
                          fill="transparent"
                          r="40"
                          cx="50"
                          cy="50"
                        />
                        <circle
                          className="text-success stroke-current"
                          strokeWidth="10"
                          strokeLinecap="round"
                          fill="transparent"
                          r="40"
                          cx="50"
                          cy="50"
                          strokeDasharray={`${cacheStats.hit_rate * 2.51} 251`}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold">{cacheStats.hit_rate.toFixed(1)}%</span>
                        <span className="text-xs text-muted-foreground">Hit Rate</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 text-center text-sm">
                    <div>
                      <p className="font-semibold text-success">
                        {formatNumber(cacheStats.cache_hits)}
                      </p>
                      <p className="text-xs text-muted-foreground">Cache Hits</p>
                    </div>
                    <div>
                      <p className="font-semibold text-muted-foreground">
                        {formatNumber(cacheStats.cache_misses)}
                      </p>
                      <p className="text-xs text-muted-foreground">Cache Misses</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No cache data available
                </p>
              )}
            </CardContent>
          </Card>

          {/* Stats Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <FileZipLine className="h-4 w-4 text-primary" />
                Usage Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {overviewStats ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-2xl font-bold text-green-400">
                        {formatNumber(overviewStats.total_tokens_7d)}
                      </p>
                      <p className="text-xs text-muted-foreground">Tokens (7d)</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-2xl font-bold">{formatCurrency(overviewStats.cost_7d)}</p>
                      <p className="text-xs text-muted-foreground">Cost (7d)</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Active API Keys</span>
                    <span className="font-mono">{overviewStats.active_api_keys}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Organizations</span>
                    <span className="font-mono">{overviewStats.total_organizations}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">End Users</span>
                    <span className="font-mono">{formatNumber(overviewStats.total_end_users)}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No usage data available
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Recent Requests</CardTitle>
            <a href="/dev-logs" className="text-sm text-primary hover:underline">
              View all
            </a>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">Request ID</th>
                    <th className="pb-3 font-medium">Provider</th>
                    <th className="pb-3 font-medium">Model</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Cost</th>
                    <th className="pb-3 font-medium text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {recentRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        No recent requests
                      </td>
                    </tr>
                  ) : (
                    recentRequests.map((request) => (
                      <tr key={request.id} className="border-t border-border/50">
                        <td className="py-3 font-mono text-xs">
                          {request.response_id.slice(0, 16)}...
                        </td>
                        <td className="py-3 capitalize">{request.provider_name}</td>
                        <td className="py-3">{request.model_id}</td>
                        <td className="py-3">
                          <Badge
                            variant={request.status === 'completed' ? 'success' : 'destructive'}
                          >
                            {request.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-right font-mono">
                          {request.cost_usd && request.cost_usd > 0
                            ? formatCurrency(request.cost_usd)
                            : '—'}
                        </td>
                        <td className="py-3 text-right font-mono">
                          {request.latency_ms && request.latency_ms > 0
                            ? formatDuration(request.latency_ms)
                            : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
