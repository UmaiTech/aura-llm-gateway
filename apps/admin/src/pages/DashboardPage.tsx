import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { cn, formatNumber, formatCurrency, formatDuration, formatStrategy } from '@/lib/utils'
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
  getFeatureStats,
  type OverviewStats,
  type DynamicStats,
  type ProviderHealth,
  type CacheStats,
  type RoutingStats,
  type RecentLog,
  type TimeRange,
  type TimelinePoint,
  type FeatureStats,
} from '@/lib/api'

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '24h', label: '24 Hours' },
  { value: '2d', label: '2 Days' },
  { value: '3d', label: '3 Days' },
  { value: '4d', label: '4 Days' },
  { value: '5d', label: '5 Days' },
  { value: '6d', label: '6 Days' },
  { value: '7d', label: '7 Days' },
  { value: 'all', label: 'All Time' },
]

export function DashboardPage() {
  const navigate = useNavigate()
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
  const [featureStats, setFeatureStats] = useState<FeatureStats | null>(null)

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

        const [overview, dynamic, health, cache, routing, logs, timelineData, features] = await Promise.all([
          getOverviewStats().catch(() => null),
          getDynamicStats(timeRange).catch(() => null),
          getProviderHealth().catch(() => []),
          getCacheStats().catch(() => null),
          getRoutingStats().catch(() => []),
          getRecentLogs({ limit: 5 }).catch(() => []),
          useHourly ? getHourlyTimeline().catch(() => []) : getDailyTimeline().catch(() => []),
          getFeatureStats(timeRange).catch(() => null),
        ])

        setOverviewStats(overview)
        setDynamicStats(dynamic)
        setProviders(health)
        setCacheStats(cache)
        setRoutingStatsData(routing)
        setRecentRequests(logs)
        setTimeline(timelineData)
        setFeatureStats(features)
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

        {/* Stats — editorial. Big serif number first, mono uppercase
            label, trend chip on the right. No coloured icon tile;
            the stat itself is the visual anchor. */}
        <div ref={statsRef} className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-4 border border-border rounded-lg overflow-hidden bg-border">
          {stats.map((stat, index) => (
            <div
              key={stat.title}
              className="stats-card bg-card p-6 flex flex-col"
            >
              <div className="flex items-baseline gap-3 justify-between">
                <span
                  ref={(el) => {
                    numberRefs.current[index] = el
                  }}
                  className="font-display text-3xl font-semibold tracking-tight leading-none"
                >
                  {stat.format(0)}
                </span>
                {stat.change !== 0 && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 text-xs font-mono',
                      stat.trend === 'down' && stat.title === 'Success Rate'
                        ? 'text-destructive'
                        : 'text-success'
                    )}
                  >
                    {stat.change > 0 ? (
                      <ArrowUpLine className="h-3 w-3" />
                    ) : (
                      <ArrowDownLine className="h-3 w-3" />
                    )}
                    {Math.abs(stat.change)}%
                  </span>
                )}
              </div>
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground mt-3">
                {stat.title}
              </p>
            </div>
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
                // Hourly periods (24h, 2d) render label as HH:00 in local time
                // so the chart matches what the user sees on the wall clock.
                // Daily periods render MM-DD. We keep up to 30 buckets either
                // way — that's the limit of the daily view's window and
                // happens to be more than enough for the hourly view (24).
                const useHourlyLabels = timeRange === '24h' || timeRange === '2d'
                const allData = timeline.slice(-30)
                // For hourly view, keep the full window even when most buckets
                // are zero — a sparse 24-hour line is more useful than a
                // collapsed view that hides the gaps in traffic.
                // For daily view, collapse to only-non-empty days for clarity.
                const dataWithRequests = allData.filter(t => t.request_count > 0)
                const totalRequests = allData.reduce((sum, t) => sum + t.request_count, 0)

                const displayData = useHourlyLabels
                  ? allData
                  : (dataWithRequests.length > 0 ? dataWithRequests : allData.slice(-7))
                const maxRequests = Math.max(...displayData.map(t => t.request_count), 1)

                const maxBarHeight = 180 // pixels

                const formatLabel = (timestamp: string | undefined): { primary: string; full: string } => {
                  if (!timestamp) return { primary: '', full: '' }
                  if (useHourlyLabels) {
                    const d = new Date(timestamp)
                    const hh = d.getHours().toString().padStart(2, '0')
                    return { primary: `${hh}:00`, full: d.toLocaleString() }
                  }
                  const dateStr = timestamp.split('T')[0] || ''
                  return { primary: dateStr.slice(5), full: dateStr }
                }

                return (
                  <div className="h-[300px]">
                    {totalRequests > 0 ? (
                      <>
                        <div className="h-[240px] flex items-end gap-2 px-2">
                          {displayData.map((point, i) => {
                            // Calculate pixel height - minimum 30px for visibility
                            const heightPx = Math.max(30, Math.round((point.request_count / maxRequests) * maxBarHeight))
                            const hasErrors = point.error_count > 0
                            const label = formatLabel(point.timestamp)
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
                                  title={`${label.full}: ${point.request_count} requests${hasErrors ? `, ${point.error_count} errors` : ''}`}
                                />
                                <span className="text-2xs text-muted-foreground mt-2">
                                  {label.primary}
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
            <CardContent className="space-y-3">
              {providers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No provider data available</p>
              ) : (
                providers.map((provider) => (
                  <div
                    key={provider.provider_name}
                    className="border-b border-border/40 last:border-0 pb-3 last:pb-0"
                  >
                    <div className="flex items-center justify-between mb-2">
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
                        <span className="font-medium text-sm">
                          {provider.display_name || provider.provider_name}
                        </span>
                      </div>
                      {provider.health_status === 'healthy' ? (
                        <CheckLine className="h-4 w-4 text-success" />
                      ) : provider.health_status === 'degraded' ? (
                        <AlertLine className="h-4 w-4 text-warning" />
                      ) : (
                        <CloseLine className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Reqs</div>
                        <div className="font-medium tabular-nums">
                          {provider.total_requests}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Success</div>
                        <div className="font-medium tabular-nums">
                          {provider.total_requests > 0
                            ? `${((provider.successful_requests / provider.total_requests) * 100).toFixed(1)}%`
                            : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Avg</div>
                        <div className="font-medium tabular-nums">
                          {formatDuration(provider.avg_latency_ms)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">p95</div>
                        <div className="font-medium tabular-nums">
                          {formatDuration(provider.p95_latency_ms)}
                        </div>
                      </div>
                    </div>
                    {provider.failed_requests > 0 && (
                      <div className="mt-1 text-2xs text-destructive/80">
                        {provider.failed_requests} error
                        {provider.failed_requests !== 1 && 's'}
                      </div>
                    )}
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
                      <span>{formatStrategy(stat.routing_strategy)}</span>
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

        {/* Gateway Strategy Features Row — compression / validation /
            consistency rollups for the selected period. Mirrors the
            Routing/Cache/Usage cards above but for the optional
            request-modifying strategies. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Compression */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Compression</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {featureStats && featureStats.compression.requests_compressed > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold tabular-nums">
                        {featureStats.compression.avg_savings_percent.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Avg savings</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold tabular-nums">
                        {formatNumber(featureStats.compression.total_tokens_saved)}
                      </p>
                      <p className="text-xs text-muted-foreground">Tokens saved</p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatNumber(featureStats.compression.requests_compressed)} request
                    {featureStats.compression.requests_compressed !== 1 && 's'} compressed
                  </div>
                  {featureStats.compression.by_strategy
                    .filter((s) => s.strategy !== 'none')
                    .slice(0, 4)
                    .map((s) => (
                      <div
                        key={s.strategy}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-muted-foreground">{formatStrategy(s.strategy)}</span>
                        <span className="font-mono tabular-nums">{s.request_count}</span>
                      </div>
                    ))}
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No compression activity
                </p>
              )}
            </CardContent>
          </Card>

          {/* Validation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Validation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {featureStats && featureStats.validation.requests_validated > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold tabular-nums">
                        {formatNumber(featureStats.validation.requests_validated)}
                      </p>
                      <p className="text-xs text-muted-foreground">Validated</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold tabular-nums">
                        {featureStats.validation.avg_confidence !== null
                          ? featureStats.validation.avg_confidence.toFixed(2)
                          : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">Avg confidence</p>
                    </div>
                  </div>
                  {featureStats.validation.by_strategy
                    .filter((s) => s.strategy !== 'none')
                    .slice(0, 4)
                    .map((s) => (
                      <div
                        key={s.strategy}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-muted-foreground">{formatStrategy(s.strategy)}</span>
                        <span className="font-mono tabular-nums">{s.request_count}</span>
                      </div>
                    ))}
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No validation activity
                </p>
              )}
            </CardContent>
          </Card>

          {/* Consistency */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Consistency</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {featureStats && featureStats.consistency.requests_applied > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold tabular-nums">
                        {formatNumber(featureStats.consistency.requests_applied)}
                      </p>
                      <p className="text-xs text-muted-foreground">Applied</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold tabular-nums">
                        {formatNumber(featureStats.consistency.requests_with_principles)}
                      </p>
                      <p className="text-xs text-muted-foreground">With principles</p>
                    </div>
                  </div>
                  {featureStats.consistency.by_strategy
                    .filter((s) => s.strategy !== 'none')
                    .slice(0, 4)
                    .map((s) => (
                      <div
                        key={s.strategy}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-muted-foreground">{formatStrategy(s.strategy)}</span>
                        <span className="font-mono tabular-nums">{s.request_count}</span>
                      </div>
                    ))}
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No consistency activity
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
                      <tr
                        key={request.id}
                        className="border-t border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() =>
                          navigate(`/dev-logs?focus=${encodeURIComponent(request.response_id)}`)
                        }
                        title="Open in Dev Logs"
                      >
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
