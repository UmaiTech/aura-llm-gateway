import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  SkeletonRows,
  SkeletonStats,
  Stat,
  StatGrid,
  StatusDot,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui'
import { RequestVolumeChart } from '@/components/RequestVolumeChart'
import { cn, formatNumber, formatCurrency, formatDuration, formatStrategy } from '@/lib/utils'
import { Refresh1Line, ChartBarLine, ArrowRightLine } from '@mingcute/react'
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

const TIME_RANGES: { value: TimeRange; label: string; short: string }[] = [
  { value: '24h', label: '24 Hours', short: '24h' },
  { value: '2d', label: '2 Days', short: '2d' },
  { value: '3d', label: '3 Days', short: '3d' },
  { value: '4d', label: '4 Days', short: '4d' },
  { value: '5d', label: '5 Days', short: '5d' },
  { value: '6d', label: '6 Days', short: '6d' },
  { value: '7d', label: '7 Days', short: '7d' },
  { value: 'all', label: 'All Time', short: 'All' },
]

const PANEL_COUNT = 8

/**
 * Wrap a panel's fetch so one failing endpoint doesn't blank the
 * whole dashboard, but the failure is still recorded and surfaced
 * (previously each call was `.catch(() => null)` and errors were
 * indistinguishable from "no traffic").
 */
async function settle<T>(p: Promise<T>, fallback: T, errors: unknown[]): Promise<T> {
  try {
    return await p
  } catch (err) {
    errors.push(err)
    return fallback
  }
}

export function DashboardPage() {
  const navigate = useNavigate()

  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [refreshKey, setRefreshKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<unknown[]>([])
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null)
  const [dynamicStats, setDynamicStats] = useState<DynamicStats | null>(null)
  const [providers, setProviders] = useState<ProviderHealth[]>([])
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [routingStats, setRoutingStatsData] = useState<RoutingStats[]>([])
  const [recentRequests, setRecentRequests] = useState<RecentLog[]>([])
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [featureStats, setFeatureStats] = useState<FeatureStats | null>(null)

  const handleRefresh = () => {
    setIsRefreshing(true)
    setRefreshKey((k) => k + 1)
  }

  const useHourly = timeRange === '24h' || timeRange === '2d'

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      if (!isRefreshing) setLoading(true)
      const failed: unknown[] = []

      const [overview, dynamic, health, cache, routing, logs, timelineData, features] = await Promise.all([
        settle(getOverviewStats(), null, failed),
        settle(getDynamicStats(timeRange), null, failed),
        settle(getProviderHealth(), [], failed),
        settle(getCacheStats(), null, failed),
        settle(getRoutingStats(), [], failed),
        settle(getRecentLogs({ limit: 8 }), [], failed),
        settle(useHourly ? getHourlyTimeline() : getDailyTimeline(), [], failed),
        settle(getFeatureStats(timeRange), null, failed),
      ])
      if (cancelled) return

      setOverviewStats(overview)
      setDynamicStats(dynamic)
      setProviders(health)
      setCacheStats(cache)
      setRoutingStatsData(routing)
      setRecentRequests(logs.slice(0, 8))
      setTimeline(timelineData)
      setFeatureStats(features)
      setErrors(failed)
      setLoading(false)
      setIsRefreshing(false)
    }

    fetchData()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, refreshKey])

  // Use dynamic stats if available, fall back to overview stats
  const currentStats =
    dynamicStats ||
    (overviewStats
      ? {
          total_requests: overviewStats.total_requests_24h,
          input_tokens: overviewStats.input_tokens_24h,
          output_tokens: overviewStats.output_tokens_24h,
          cached_tokens: overviewStats.cached_tokens_24h,
          total_cost: overviewStats.cost_24h,
          avg_latency: overviewStats.avg_latency_24h,
          success_rate: overviewStats.success_rate_24h,
          period: '24h',
        }
      : null)

  const totalRoutingRequests = routingStats.reduce((sum, s) => sum + s.request_count, 0)
  const routingWithPercentages = routingStats.map((s) => ({
    ...s,
    percentage: totalRoutingRequests > 0 ? (s.request_count / totalRoutingRequests) * 100 : 0,
  }))

  // Split providers so a fleet of idle integrations doesn't bury the
  // ones actually serving traffic.
  const activeProviders = providers.filter((p) => p.total_requests > 0)
  const idleProviders = providers.filter((p) => p.total_requests === 0)

  // Every request failed → the gateway is unreachable or rejecting us.
  // Say so instead of rendering eight "no data" cards.
  const allFailed = !loading && errors.length >= PANEL_COUNT

  return (
    <div className="flex flex-col">
      <Header title="Dashboard" description="Overview of your gateway usage and health" />

      <div className="flex-1 space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing{' '}
            <span className="text-foreground">
              {TIME_RANGES.find((t) => t.value === timeRange)?.label.toLowerCase()}
            </span>
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh data"
              title="Refresh data"
            >
              <Refresh1Line className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </Button>
            <SegmentedControl aria-label="Time range" options={TIME_RANGES} value={timeRange} onChange={setTimeRange} />
          </div>
        </div>

        {allFailed ? (
          <ErrorState
            variant="page"
            error={errors[0]}
            what="dashboard stats"
            onRetry={handleRefresh}
            retrying={isRefreshing}
            className="mt-8"
          />
        ) : (
          <>
            {errors.length > 0 && !loading && (
              <ErrorState
                error={errors[0]}
                what={`${errors.length} of ${PANEL_COUNT} dashboard panels`}
                onRetry={handleRefresh}
                retrying={isRefreshing}
              />
            )}

            {/* Headline stats */}
            {loading ? (
              <SkeletonStats count={4} />
            ) : (
              <StatGrid columns={4}>
                <Stat label="Total requests" value={currentStats ? formatNumber(currentStats.total_requests) : '—'} />
                <Stat label="Total cost" value={currentStats ? formatCurrency(currentStats.total_cost) : '—'} />
                <Stat label="Avg latency" value={currentStats ? formatDuration(currentStats.avg_latency) : '—'} />
                <Stat
                  label="Success rate"
                  value={currentStats ? `${currentStats.success_rate.toFixed(1)}%` : '—'}
                  tone={
                    !currentStats || currentStats.total_requests === 0
                      ? 'default'
                      : currentStats.success_rate < 95
                        ? 'destructive'
                        : currentStats.success_rate < 99
                          ? 'warning'
                          : 'default'
                  }
                />
              </StatGrid>
            )}

            {/* Request volume + provider health. items-start so the chart
                card doesn't stretch to the provider list's height. */}
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle>Request volume</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-[240px] w-full" />
                  ) : timeline.length === 0 || timeline.every((t) => t.request_count === 0) ? (
                    <EmptyState
                      size="compact"
                      icon={ChartBarLine}
                      title="No requests in this period"
                      description="Send a request through the gateway, or pick a longer time range."
                    />
                  ) : (
                    <RequestVolumeChart
                      points={useHourly ? timeline.slice(timeRange === '2d' ? -48 : -24) : timeline.slice(-30)}
                      granularity={useHourly ? 'hour' : 'day'}
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle>Provider health</CardTitle>
                  <Link to="/providers" className="text-xs text-muted-foreground hover:text-foreground">
                    All providers →
                  </Link>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <SkeletonRows rows={4} />
                  ) : providers.length === 0 ? (
                    <EmptyState
                      size="compact"
                      title="No providers configured"
                      description="Add a provider API key to the gateway config."
                    />
                  ) : (
                    <div className="divide-y divide-border/60">
                      {activeProviders.length === 0 && (
                        <p className="pb-3 text-sm text-muted-foreground">
                          No provider has served traffic in this period.
                        </p>
                      )}
                      {activeProviders.map((provider) => (
                        <div key={provider.provider_name} className="py-3 first:pt-0">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2">
                              <StatusDot status={provider.health_status} />
                              <span className="truncate text-sm font-medium">
                                {provider.display_name || provider.provider_name}
                              </span>
                            </span>
                            <StatusPill status={provider.health_status} dot={false} />
                          </div>
                          <dl className="grid grid-cols-4 gap-2 text-xs">
                            {[
                              ['Reqs', formatNumber(provider.total_requests)],
                              [
                                'Success',
                                `${((provider.successful_requests / provider.total_requests) * 100).toFixed(1)}%`,
                              ],
                              ['Avg', formatDuration(provider.avg_latency_ms)],
                              ['p95', formatDuration(provider.p95_latency_ms)],
                            ].map(([k, v]) => (
                              <div key={k}>
                                <dt className="text-muted-foreground">{k}</dt>
                                <dd className="font-mono tabular-nums">{v}</dd>
                              </div>
                            ))}
                          </dl>
                          {provider.failed_requests > 0 && (
                            <p className="mt-1.5 text-[11px] text-destructive">
                              {formatNumber(provider.failed_requests)} failed request
                              {provider.failed_requests !== 1 && 's'}
                            </p>
                          )}
                        </div>
                      ))}
                      {idleProviders.length > 0 && (
                        <div className={cn(activeProviders.length > 0 ? 'pt-3' : 'pt-0 border-t-0')}>
                          <p className="eyebrow mb-2">No traffic · {idleProviders.length}</p>
                          <ul className="flex flex-wrap gap-1.5">
                            {idleProviders.map((p) => (
                              <li
                                key={p.provider_name}
                                className="inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground"
                                title={p.is_enabled ? 'Enabled, no requests in this period' : 'Disabled'}
                              >
                                <StatusDot tone={p.is_enabled ? 'neutral' : 'destructive'} className="h-1.5 w-1.5" />
                                {p.display_name || p.provider_name}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Routing / cache / usage */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Routing distribution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loading ? (
                    <SkeletonRows rows={3} />
                  ) : routingWithPercentages.length === 0 ? (
                    <EmptyState size="compact" title="No routed requests yet" />
                  ) : (
                    routingWithPercentages.map((stat) => (
                      <div key={stat.routing_strategy} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span>{formatStrategy(stat.routing_strategy)}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatNumber(stat.request_count)} · {stat.percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${stat.percentage}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Cache performance</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <SkeletonRows rows={3} />
                  ) : cacheStats && cacheStats.total_requests > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-baseline justify-between">
                        <span className="font-display text-3xl font-medium tracking-tight">
                          {cacheStats.hit_rate.toFixed(1)}%
                        </span>
                        <span className="eyebrow">hit rate</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-success"
                          style={{ width: `${Math.min(100, cacheStats.hit_rate)}%` }}
                        />
                      </div>
                      <dl className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-muted-foreground">Hits</dt>
                          <dd className="font-mono">{formatNumber(cacheStats.cache_hits)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Misses</dt>
                          <dd className="font-mono">{formatNumber(cacheStats.cache_misses)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Saved</dt>
                          <dd className="font-mono">{formatCurrency(cacheStats.estimated_savings)}</dd>
                        </div>
                      </dl>
                    </div>
                  ) : (
                    <EmptyState
                      size="compact"
                      title="No cache activity"
                      description="Cache hits show up once repeated prompts flow through."
                    />
                  )}
                </CardContent>
              </Card>

              <Card className="md:col-span-2 lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle>Usage summary</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <SkeletonRows rows={3} />
                  ) : overviewStats ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="font-display text-2xl font-medium tracking-tight">
                            {formatNumber(overviewStats.total_tokens_7d)}
                          </p>
                          <p className="eyebrow mt-1">tokens · 7d</p>
                        </div>
                        <div>
                          <p className="font-display text-2xl font-medium tracking-tight">
                            {formatCurrency(overviewStats.cost_7d)}
                          </p>
                          <p className="eyebrow mt-1">cost · 7d</p>
                        </div>
                      </div>
                      <dl className="divide-y divide-border/60 text-sm">
                        {(
                          [
                            ['Active API keys', overviewStats.active_api_keys, '/keys'],
                            ['Organizations', overviewStats.total_organizations, '/organizations'],
                            ['End users', overviewStats.total_end_users, '/end-users'],
                          ] as const
                        ).map(([k, v, href]) => (
                          <div key={k} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                            <dt>
                              <Link to={href} className="text-muted-foreground hover:text-foreground">
                                {k}
                              </Link>
                            </dt>
                            <dd className="font-mono">{formatNumber(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : (
                    <EmptyState size="compact" title="No usage recorded yet" />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Request-modifying strategies */}
            {!loading && featureStats && (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <FeatureCard
                  title="Compression"
                  active={featureStats.compression.requests_compressed > 0}
                  emptyHint="Enable it per request or in aura.yaml."
                  primary={[
                    [`${featureStats.compression.avg_savings_percent.toFixed(1)}%`, 'avg savings'],
                    [formatNumber(featureStats.compression.total_tokens_saved), 'tokens saved'],
                  ]}
                  rows={featureStats.compression.by_strategy}
                />
                <FeatureCard
                  title="Validation"
                  active={featureStats.validation.requests_validated > 0}
                  emptyHint="Runs when a request sets a validation strategy."
                  primary={[
                    [formatNumber(featureStats.validation.requests_validated), 'validated'],
                    [
                      featureStats.validation.avg_confidence !== null
                        ? featureStats.validation.avg_confidence.toFixed(2)
                        : '—',
                      'avg confidence',
                    ],
                  ]}
                  rows={featureStats.validation.by_strategy}
                />
                <FeatureCard
                  title="Consistency"
                  active={featureStats.consistency.requests_applied > 0}
                  emptyHint="Applies when a request includes a style profile or principles."
                  primary={[
                    [formatNumber(featureStats.consistency.requests_applied), 'applied'],
                    [formatNumber(featureStats.consistency.requests_with_principles), 'with principles'],
                  ]}
                  rows={featureStats.consistency.by_strategy}
                />
              </div>
            )}

            {/* Recent requests */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>Recent requests</CardTitle>
                <Link
                  to="/dev-logs"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  View all in Dev Logs <ArrowRightLine className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <SkeletonRows rows={5} />
                ) : recentRequests.length === 0 ? (
                  <EmptyState
                    size="compact"
                    title="No requests yet"
                    description="Requests appear here as soon as the gateway serves them."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Request</TableHead>
                        <TableHead className="hidden sm:table-cell">Provider</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead numeric className="hidden md:table-cell">
                          Cost
                        </TableHead>
                        <TableHead numeric>Latency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentRequests.map((request) => (
                        <TableRow
                          key={request.id}
                          interactive
                          onClick={() => navigate(`/dev-logs?focus=${encodeURIComponent(request.response_id)}`)}
                          title="Open in Dev Logs"
                        >
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {request.response_id.slice(0, 14)}…
                          </TableCell>
                          <TableCell className="hidden capitalize sm:table-cell">{request.provider_name}</TableCell>
                          <TableCell className="max-w-[12rem] truncate">{request.model_id}</TableCell>
                          <TableCell>
                            <StatusPill status={request.status} />
                          </TableCell>
                          <TableCell numeric className="hidden md:table-cell">
                            {request.cost_usd && request.cost_usd > 0 ? formatCurrency(request.cost_usd) : '—'}
                          </TableCell>
                          <TableCell numeric>
                            {request.latency_ms && request.latency_ms > 0 ? formatDuration(request.latency_ms) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

function FeatureCard({
  title,
  active,
  emptyHint,
  primary,
  rows,
}: {
  title: string
  active: boolean
  emptyHint: string
  primary: [string, string][]
  rows: { strategy: string; request_count: number }[]
}) {
  const visible = rows.filter((s) => s.strategy !== 'none').slice(0, 4)
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {active ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {primary.map(([value, label]) => (
                <div key={label}>
                  <p className="font-display text-xl font-medium tracking-tight">{value}</p>
                  <p className="eyebrow mt-1">{label}</p>
                </div>
              ))}
            </div>
            {visible.length > 0 && (
              <dl className="divide-y divide-border/60 border-t text-sm">
                {visible.map((s) => (
                  <div key={s.strategy} className="flex items-center justify-between py-1.5">
                    <dt className="text-muted-foreground">{formatStrategy(s.strategy)}</dt>
                    <dd className="font-mono text-xs">{formatNumber(s.request_count)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No {title.toLowerCase()} activity in this period. {emptyHint}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
