import { useEffect, useState } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { cn, formatCurrency, formatNumber, formatStrategy } from '@/lib/utils'
import {
  Sparkles2Line,
  ShieldLine,
  AiLine,
  Refresh1Line,
  Loading3Line,
  FileZipLine,
  InformationLine,
} from '@mingcute/react'
import {
  getFeatureStats,
  getCacheStats,
  type FeatureStats,
  type CacheStats,
  type TimeRange,
} from '@/lib/api'

/**
 * Features page — single-pane deep dive into the optional request-
 * modifying strategies the gateway offers: compression, validation,
 * consistency, and caching.
 *
 * The Dashboard has summary cards for each of these (see B4). This
 * page exists for users who actively run those strategies and need
 * per-strategy detail: by-strategy breakdowns, savings rollups, what
 * fraction of traffic is hitting each strategy etc. (#175 C3 + 7+20.)
 */
const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '2d', label: '2d' },
  { value: '7d', label: '7d' },
  { value: 'all', label: 'All' },
]

export function FeaturesPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')
  const [stats, setStats] = useState<FeatureStats | null>(null)
  const [cache, setCache] = useState<CacheStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchData = async () => {
    setError(null)
    try {
      const [featureData, cacheData] = await Promise.all([
        getFeatureStats(timeRange),
        // Cache stats endpoint doesn't accept a period; it always
        // returns lifetime totals. Documented in the section below.
        getCacheStats().catch(() => null),
      ])
      setStats(featureData)
      setCache(cacheData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load feature stats')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    // Show the loading skeleton on every period switch, otherwise
    // the previous range's stats stay visible while the new request
    // is in flight and the user sees nothing change.
    setLoading(true)
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange])

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchData()
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Features" description="Compression, validation, consistency, caching" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loading3Line className="h-5 w-5 animate-spin" />
            <span>Loading feature stats...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Features" description="Compression, validation, consistency, caching" />
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full border-destructive/30 bg-destructive/5">
            <CardContent className="p-6 space-y-3">
              <div className="text-sm font-medium text-destructive">
                Failed to load feature stats
              </div>
              <div className="text-sm text-muted-foreground">{error}</div>
              <Button size="sm" onClick={handleRefresh}>
                <Refresh1Line className="h-4 w-4 mr-2" />
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
        title="Features"
        description="Compression, validation, consistency, caching"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {TIME_RANGES.map((range) => (
                <button
                  key={range.value}
                  onClick={() => setTimeRange(range.value)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                    timeRange === range.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <Refresh1Line className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Compression deep dive */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileZipLine className="h-4 w-4 text-purple-400" />
              Compression
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FeatureSection
              empty={!stats || stats.compression.requests_compressed === 0}
              emptyCopy="No compression activity in the selected period. Set `compression: { strategy: ... }` on requests to start saving tokens."
              stats={
                stats &&
                stats.compression.requests_compressed > 0 && [
                  {
                    label: 'Requests compressed',
                    value: formatNumber(stats.compression.requests_compressed),
                  },
                  {
                    label: 'Avg savings',
                    value: `${stats.compression.avg_savings_percent.toFixed(1)}%`,
                  },
                  {
                    label: 'Tokens saved',
                    value: formatNumber(stats.compression.total_tokens_saved),
                  },
                ]
              }
              breakdown={stats?.compression.by_strategy ?? []}
            />
          </CardContent>
        </Card>

        {/* Validation deep dive */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldLine className="h-4 w-4 text-blue-400" />
              Validation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FeatureSection
              empty={!stats || stats.validation.requests_validated === 0}
              emptyCopy="No validation activity in the selected period. Use `validation: { strategy: logprobs | best_of_n | self_consistency | confidence_threshold }` to enable."
              stats={
                stats &&
                stats.validation.requests_validated > 0 && [
                  {
                    label: 'Validated',
                    value: formatNumber(stats.validation.requests_validated),
                  },
                  {
                    label: 'Avg confidence',
                    value:
                      stats.validation.avg_confidence !== null
                        ? stats.validation.avg_confidence.toFixed(3)
                        : '—',
                  },
                ]
              }
              breakdown={stats?.validation.by_strategy ?? []}
            />
          </CardContent>
        </Card>

        {/* Consistency deep dive */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles2Line className="h-4 w-4 text-amber-400" />
              Consistency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FeatureSection
              empty={!stats || stats.consistency.requests_applied === 0}
              emptyCopy="No consistency activity in the selected period. Use `consistency: { strategy: constitutional | style_profile | ... }` to enable."
              stats={
                stats &&
                stats.consistency.requests_applied > 0 && [
                  { label: 'Applied', value: formatNumber(stats.consistency.requests_applied) },
                  {
                    label: 'With principles',
                    value: formatNumber(stats.consistency.requests_with_principles),
                  },
                ]
              }
              breakdown={stats?.consistency.by_strategy ?? []}
            />
          </CardContent>
        </Card>

        {/* Caching — read-only, no per-period breakdown today */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AiLine className="h-4 w-4 text-green-400" />
              Caching
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!cache || cache.total_requests === 0 ? (
              <p className="text-sm text-muted-foreground">
                No cache activity recorded. Cache is automatically enabled for
                <code className="mx-1">temperature=0</code> non-streaming requests. Set
                <code className="mx-1">X-Cache-Control: no-cache</code> to bypass per-request.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Stat label="Hit rate" value={`${(cache.hit_rate * 100).toFixed(1)}%`} />
                  <Stat label="Cache hits" value={formatNumber(cache.cache_hits)} />
                  <Stat label="Cache misses" value={formatNumber(cache.cache_misses)} />
                  <Stat
                    label="Estimated savings"
                    value={formatCurrency(cache.estimated_savings)}
                  />
                </div>
                <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <InformationLine className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    Cache totals are lifetime — they don't filter by the selected period above.
                    Per-period cache stats need a backend change tracked in #175.
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-muted/50 rounded-lg">
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function FeatureSection({
  empty,
  emptyCopy,
  stats,
  breakdown,
}: {
  empty: boolean
  emptyCopy: string
  stats: { label: string; value: string }[] | false | null | undefined
  breakdown: { strategy: string; request_count: number }[]
}) {
  if (empty) {
    return <p className="text-sm text-muted-foreground">{emptyCopy}</p>
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(stats || []).map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} />
        ))}
      </div>
      {breakdown.filter((b) => b.strategy !== 'none').length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">By strategy</h4>
          <div className="space-y-1">
            {breakdown
              .filter((b) => b.strategy !== 'none')
              .map((b) => (
                <div
                  key={b.strategy}
                  className="flex items-center justify-between p-2 rounded border border-border/40 text-sm"
                >
                  <Badge variant="secondary">{formatStrategy(b.strategy)}</Badge>
                  <span className="font-mono tabular-nums">
                    {formatNumber(b.request_count)} requests
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
