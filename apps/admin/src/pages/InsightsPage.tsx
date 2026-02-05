import { useEffect, useRef, useState } from 'react'
import { Header } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { cn, formatNumber, formatCurrency, formatDuration } from '@/lib/utils'
import { animateStaggered, animateNumber } from '@/lib/animations'
import {
  FlashLine,
  CoinLine,
  ClockLine,
  AiLine,
  ArrowUpLine,
  ArrowDownLine,
  Loading3Line,
  Refresh1Line,
} from '@mingcute/react'
import {
  getInsightsStats,
  getModelCosts,
  getToolUsage,
  getUsageHeatmap,
  getTokenTimeline,
  type TimeRange,
  type InsightsStats,
  type ModelCostStats,
  type ToolUsageStats,
  type HeatmapData,
  type TokenUsageTimeline,
} from '@/lib/api'

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '2d', label: '2d' },
  { value: '3d', label: '3d' },
  { value: '7d', label: '7d' },
]

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00']

// Color palette for tool usage
const toolColors = [
  'bg-blue-500',
  'bg-green-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-yellow-500',
  'bg-red-500',
]

export function InsightsPage() {
  const metricsRef = useRef<HTMLDivElement>(null)
  const numberRefs = useRef<(HTMLSpanElement | null)[]>([])

  // Time range state
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')
  const [refreshKey, setRefreshKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Hover state for charts
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null)

  // Refresh handler
  const handleRefresh = () => {
    setIsRefreshing(true)
    setRefreshKey((k) => k + 1)
  }

  // API state
  const [loading, setLoading] = useState(true)
  const [insightsStats, setInsightsStats] = useState<InsightsStats | null>(null)
  const [modelCosts, setModelCosts] = useState<ModelCostStats[]>([])
  const [toolUsage, setToolUsage] = useState<ToolUsageStats[]>([])
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([])
  const [tokenTimeline, setTokenTimeline] = useState<TokenUsageTimeline[]>([])

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      if (!isRefreshing) {
        setLoading(true)
      }
      try {
        const [stats, models, tools, heatmap, timeline] = await Promise.all([
          getInsightsStats(timeRange).catch(() => null),
          getModelCosts(timeRange).catch(() => []),
          getToolUsage(timeRange).catch(() => []),
          getUsageHeatmap(timeRange).catch(() => []),
          getTokenTimeline(timeRange).catch(() => []),
        ])

        setInsightsStats(stats)
        setModelCosts(models)
        setToolUsage(tools)
        setHeatmapData(heatmap)
        setTokenTimeline(timeline)
      } finally {
        setLoading(false)
        setIsRefreshing(false)
      }
    }

    fetchData()
  }, [timeRange, refreshKey])

  // Build metrics from API data
  const metrics = insightsStats
    ? [
        {
          title: 'Total Requests',
          value: insightsStats.total_requests,
          change: insightsStats.requests_change,
          icon: FlashLine,
          format: formatNumber,
        },
        {
          title: 'Total Tokens',
          value: insightsStats.total_tokens,
          change: insightsStats.tokens_change,
          icon: AiLine,
          format: formatNumber,
        },
        {
          title: 'Total Cost',
          value: insightsStats.total_cost,
          change: insightsStats.cost_change,
          icon: CoinLine,
          format: formatCurrency,
        },
        {
          title: 'Avg Latency',
          value: insightsStats.avg_latency,
          change: insightsStats.latency_change,
          icon: ClockLine,
          format: (v: number) => formatDuration(v),
        },
        {
          title: 'Tool Calls',
          value: insightsStats.tool_calls,
          change: insightsStats.tool_calls_change,
          icon: AiLine,
          format: formatNumber,
        },
      ]
    : []

  useEffect(() => {
    if (!loading && insightsStats && metricsRef.current) {
      const cards = metricsRef.current.querySelectorAll('.metric-card')
      animateStaggered(cards, 'fadeInUp', 60)

      numberRefs.current.forEach((ref, index) => {
        if (ref && metrics[index]) {
          animateNumber(ref, metrics[index].value, 1500, metrics[index].format)
        }
      })
    }
  }, [loading, insightsStats, timeRange])

  // Build heatmap grid (6 rows x 7 columns)
  const heatmapGrid = Array.from({ length: 6 }, (_, hourIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const dataPoint = heatmapData.find(
        (d) => d.day_of_week === dayIndex && Math.floor(d.hour_of_day / 4) === hourIndex
      )
      return dataPoint?.intensity ?? 0
    })
  )

  const getHeatmapColor = (value: number) => {
    switch (value) {
      case 0:
        return 'bg-muted'
      case 1:
        return 'bg-primary/20'
      case 2:
        return 'bg-primary/40'
      case 3:
        return 'bg-primary/60'
      case 4:
        return 'bg-primary/80'
      case 5:
        return 'bg-primary'
      default:
        return 'bg-muted'
    }
  }

  // Calculate max token value for chart scaling
  const maxTokens = Math.max(
    ...tokenTimeline.flatMap((t) => [t.input_tokens, t.output_tokens]),
    1
  )

  if (loading) {
    return (
      <div className="flex flex-col">
        <Header title="Insights" description="Analytics and usage patterns" />
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loading3Line className="h-5 w-5 animate-spin" />
            <span>Loading insights...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <Header title="Insights" description="Analytics and usage patterns" />

      <div className="flex-1 p-6 space-y-6">
        {/* Time Range Selector */}
        <div className="flex items-center justify-end gap-2">
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

        {/* Metrics Grid */}
        <div ref={metricsRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.map((metric, index) => (
            <Card key={metric.title} className="metric-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <metric.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div
                    className={`flex items-center gap-1 text-xs font-medium ${metric.change > 0 ? 'text-success' : metric.change < 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                  >
                    {metric.change !== 0 && (
                      <>
                        {metric.change > 0 ? (
                          <ArrowUpLine className="h-3 w-3" />
                        ) : (
                          <ArrowDownLine className="h-3 w-3" />
                        )}
                        {Math.abs(metric.change).toFixed(1)}%
                      </>
                    )}
                  </div>
                </div>
                <span
                  ref={(el) => {
                    numberRefs.current[index] = el
                  }}
                  className="text-xl font-bold"
                >
                  {metric.format(0)}
                </span>
                <p className="text-xs text-muted-foreground mt-1">{metric.title}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Token Usage Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Token Usage Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {tokenTimeline.length > 0 ? (
                <>
                  <div className="h-[200px] flex items-end gap-1 relative">
                    {tokenTimeline.slice(-12).map((point, i) => {
                      const inputHeight = (point.input_tokens / maxTokens) * 100
                      const outputHeight = (point.output_tokens / maxTokens) * 100
                      const isHovered = hoveredBar === i
                      const totalTokens = point.input_tokens + point.output_tokens
                      return (
                        <div
                          key={i}
                          className="flex-1 flex flex-col items-center gap-1 relative group"
                          onMouseEnter={() => setHoveredBar(i)}
                          onMouseLeave={() => setHoveredBar(null)}
                        >
                          {/* Tooltip */}
                          {isHovered && (
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                              <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs whitespace-nowrap">
                                <div className="font-medium mb-1">Period {i + 1}</div>
                                <div className="space-y-0.5 text-muted-foreground">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded bg-primary" />
                                    <span>Input: {formatNumber(point.input_tokens)}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded bg-aura-400" />
                                    <span>Output: {formatNumber(point.output_tokens)}</span>
                                  </div>
                                  <div className="border-t border-border mt-1 pt-1 font-medium text-foreground">
                                    Total: {formatNumber(totalTokens)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          <div className={cn(
                            'w-full flex gap-0.5 items-end h-[180px] transition-opacity',
                            hoveredBar !== null && !isHovered && 'opacity-40'
                          )}>
                            <div
                              className={cn(
                                'flex-1 bg-primary rounded-t transition-all duration-300',
                                isHovered && 'bg-primary/80'
                              )}
                              style={{ height: `${inputHeight}%` }}
                            />
                            <div
                              className={cn(
                                'flex-1 bg-aura-400 rounded-t transition-all duration-300',
                                isHovered && 'bg-aura-300'
                              )}
                              style={{ height: `${outputHeight}%` }}
                            />
                          </div>
                          <span className="text-2xs text-muted-foreground">{i + 1}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded bg-primary" /> Input
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded bg-aura-400" /> Output
                    </span>
                  </div>
                </>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  No token usage data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cost by Model */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Cost by Model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {modelCosts.length > 0 ? (
                modelCosts.slice(0, 5).map((model) => (
                  <div key={model.model_id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{model.model_name || model.model_id}</span>
                      <span className="text-muted-foreground">{formatCurrency(model.total_cost)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-aura-400 rounded-full transition-all duration-1000"
                        style={{ width: `${model.percentage}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-muted-foreground">No cost data available</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Tool Usage */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Tool Usage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {toolUsage.length > 0 ? (
                toolUsage.slice(0, 5).map((tool, index) => (
                  <div key={tool.tool_name} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded ${toolColors[index % toolColors.length]}`} />
                    <span className="flex-1 text-sm font-medium">{tool.tool_name}</span>
                    <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${toolColors[index % toolColors.length]} rounded-full`}
                        style={{ width: `${tool.percentage}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-10 text-right">
                      {tool.percentage.toFixed(0)}%
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No tool usage data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Usage Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Usage Heatmap</CardTitle>
            </CardHeader>
            <CardContent>
              {heatmapData.length > 0 ? (
                <>
                  <div className="space-y-1">
                    <div className="flex gap-1 ml-12">
                      {days.map((day) => (
                        <div key={day} className="flex-1 text-center text-xs text-muted-foreground">
                          {day}
                        </div>
                      ))}
                    </div>
                    {heatmapGrid.map((row, rowIndex) => (
                      <div key={rowIndex} className="flex items-center gap-1">
                        <span className="w-10 text-xs text-muted-foreground text-right">
                          {hours[rowIndex]}
                        </span>
                        <div className="flex-1 flex gap-1">
                          {row.map((value, colIndex) => {
                            const isHovered = hoveredCell?.row === rowIndex && hoveredCell?.col === colIndex
                            const activityLevel = value === 0 ? 'No activity' : value <= 2 ? 'Low' : value <= 4 ? 'Medium' : 'High'
                            const endHour = rowIndex < 5 ? hours[rowIndex + 1] : '24:00'
                            return (
                              <div
                                key={colIndex}
                                className={cn(
                                  'flex-1 h-6 rounded cursor-pointer transition-all relative',
                                  getHeatmapColor(value),
                                  isHovered && 'ring-2 ring-foreground ring-offset-1 ring-offset-background scale-110 z-10',
                                  hoveredCell !== null && !isHovered && 'opacity-50'
                                )}
                                onMouseEnter={() => setHoveredCell({ row: rowIndex, col: colIndex })}
                                onMouseLeave={() => setHoveredCell(null)}
                              >
                                {isHovered && (
                                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                                    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs whitespace-nowrap">
                                      <div className="font-medium mb-1">{days[colIndex]}</div>
                                      <div className="text-muted-foreground space-y-0.5">
                                        <div>{hours[rowIndex]} - {endHour}</div>
                                        <div className="flex items-center gap-2">
                                          <span className={cn('w-2 h-2 rounded', getHeatmapColor(value))} />
                                          <span>{activityLevel} activity</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-3 text-xs text-muted-foreground">
                    <span>Low</span>
                    <div className="flex gap-0.5">
                      {[0, 1, 2, 3, 4, 5].map((v) => (
                        <div key={v} className={`w-4 h-4 rounded ${getHeatmapColor(v)}`} />
                      ))}
                    </div>
                    <span>High</span>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No heatmap data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
