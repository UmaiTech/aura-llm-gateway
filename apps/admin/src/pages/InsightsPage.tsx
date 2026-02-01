import { useEffect, useRef } from 'react'
import { Header } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { formatNumber, formatCurrency, formatDuration } from '@/lib/utils'
import { animateStaggered, animateNumber } from '@/lib/animations'
import {
  FlashLine,
  CoinLine,
  ClockLine,
  AiLine,
  ArrowUpLine,
  ArrowDownLine,
} from '@mingcute/react'

const metrics = [
  { title: 'Total Requests', value: 847200, change: 23, icon: FlashLine, format: formatNumber },
  { title: 'Total Tokens', value: 12400000, change: 18, icon: AiLine, format: formatNumber },
  { title: 'Total Cost', value: 1247, change: 15, icon: CoinLine, format: formatCurrency },
  { title: 'Avg Latency', value: 287, change: -8, icon: ClockLine, format: (v: number) => formatDuration(v) },
  { title: 'Tool Calls', value: 24800, change: 45, icon: AiLine, format: formatNumber },
]

const topModels = [
  { name: 'gpt-4o', cost: 567, percentage: 45 },
  { name: 'claude-3-opus', cost: 312, percentage: 25 },
  { name: 'gpt-4o-mini', cost: 201, percentage: 16 },
  { name: 'gemini-pro', cost: 112, percentage: 9 },
  { name: 'claude-3-sonnet', cost: 55, percentage: 5 },
]

const toolUsage = [
  { name: 'web_search', usage: 45, color: 'bg-blue-500' },
  { name: 'calculate', usage: 22, color: 'bg-green-500' },
  { name: 'get_weather', usage: 15, color: 'bg-cyan-500' },
  { name: 'code_execute', usage: 10, color: 'bg-orange-500' },
  { name: 'file_read', usage: 8, color: 'bg-purple-500' },
]

const heatmapData = [
  [1, 2, 3, 4, 3, 1, 0],
  [2, 3, 4, 4, 4, 2, 1],
  [4, 5, 5, 5, 5, 3, 2],
  [5, 5, 5, 5, 5, 3, 2],
  [4, 4, 5, 5, 4, 2, 1],
  [2, 3, 3, 3, 3, 1, 0],
]

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00']

export function InsightsPage() {
  const metricsRef = useRef<HTMLDivElement>(null)
  const numberRefs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    if (metricsRef.current) {
      const cards = metricsRef.current.querySelectorAll('.metric-card')
      animateStaggered(cards, 'fadeInUp', 60)
    }

    numberRefs.current.forEach((ref, index) => {
      if (ref) {
        animateNumber(ref, metrics[index].value, 1500, metrics[index].format)
      }
    })
  }, [])

  const getHeatmapColor = (value: number) => {
    switch (value) {
      case 0: return 'bg-muted'
      case 1: return 'bg-primary/20'
      case 2: return 'bg-primary/40'
      case 3: return 'bg-primary/60'
      case 4: return 'bg-primary/80'
      case 5: return 'bg-primary'
      default: return 'bg-muted'
    }
  }

  return (
    <div className="flex flex-col">
      <Header title="Insights" description="Analytics and usage patterns" />

      <div className="flex-1 p-6 space-y-6">
        {/* Metrics Grid */}
        <div ref={metricsRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.map((metric, index) => (
            <Card key={metric.title} className="metric-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <metric.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-medium ${metric.change > 0 ? 'text-success' : 'text-destructive'}`}>
                    {metric.change > 0 ? <ArrowUpLine className="h-3 w-3" /> : <ArrowDownLine className="h-3 w-3" />}
                    {Math.abs(metric.change)}%
                  </div>
                </div>
                <span
                  ref={(el) => { numberRefs.current[index] = el }}
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
              <div className="h-[200px] flex items-end gap-2">
                {[65, 45, 78, 52, 90, 38, 72, 85, 62, 95, 48, 70].map((value, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-gradient-to-t from-primary to-aura-400 rounded-t transition-all duration-500"
                      style={{ height: `${value}%` }}
                    />
                    <span className="text-2xs text-muted-foreground">{i + 1}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-primary" /> Input
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-aura-400" /> Output
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Cost by Model */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Cost by Model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topModels.map((model) => (
                <div key={model.name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{model.name}</span>
                    <span className="text-muted-foreground">{formatCurrency(model.cost)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-aura-400 rounded-full transition-all duration-1000"
                      style={{ width: `${model.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
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
              {toolUsage.map((tool) => (
                <div key={tool.name} className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded ${tool.color}`} />
                  <span className="flex-1 text-sm font-medium">{tool.name}</span>
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${tool.color} rounded-full`}
                      style={{ width: `${tool.usage}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-10 text-right">{tool.usage}%</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Usage Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Usage Heatmap</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="flex gap-1 ml-12">
                  {days.map((day) => (
                    <div key={day} className="flex-1 text-center text-xs text-muted-foreground">
                      {day}
                    </div>
                  ))}
                </div>
                {heatmapData.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex items-center gap-1">
                    <span className="w-10 text-xs text-muted-foreground text-right">
                      {hours[rowIndex]}
                    </span>
                    <div className="flex-1 flex gap-1">
                      {row.map((value, colIndex) => (
                        <div
                          key={colIndex}
                          className={`flex-1 h-6 rounded ${getHeatmapColor(value)}`}
                          title={`${days[colIndex]} ${hours[rowIndex]}: Level ${value}`}
                        />
                      ))}
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
