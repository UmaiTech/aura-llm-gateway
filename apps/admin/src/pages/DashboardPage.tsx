import { useEffect, useRef } from 'react'
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
} from '@mingcute/react'

// Mock data - will be replaced with API calls
const stats = [
  {
    title: 'Total Requests',
    value: 24847,
    change: 12.3,
    trend: 'up' as const,
    icon: FlashLine,
    format: formatNumber,
  },
  {
    title: 'Total Cost',
    value: 127.43,
    change: 8.2,
    trend: 'up' as const,
    icon: CoinLine,
    format: formatCurrency,
  },
  {
    title: 'Avg Latency',
    value: 234,
    change: -5.1,
    trend: 'down' as const,
    icon: ClockLine,
    format: (v: number) => formatDuration(v),
  },
  {
    title: 'Error Rate',
    value: 0.12,
    change: -0.03,
    trend: 'down' as const,
    icon: CloseLine,
    format: (v: number) => `${v}%`,
  },
]

const providers = [
  { name: 'OpenAI', status: 'healthy', latency: 234 },
  { name: 'Anthropic', status: 'healthy', latency: 456 },
  { name: 'Google', status: 'degraded', latency: 892 },
]

const routingStats = [
  { strategy: 'round_robin', requests: 8900, percentage: 35.8 },
  { strategy: 'cost_based', requests: 7200, percentage: 29.0 },
  { strategy: 'weighted', requests: 4200, percentage: 16.9 },
  { strategy: 'latency_based', requests: 3100, percentage: 12.5 },
  { strategy: 'fallback', requests: 1447, percentage: 5.8 },
]

const gatewayFeatures = {
  cacheHitRate: 68.5,
  compressionRatio: 42,
  dataSaved: '1.2 GB',
  avgCompressionOverhead: 12,
}

const recentRequests = [
  { id: 'aura_8f2a3d7e', provider: 'openai', model: 'gpt-4o', status: 'completed', cost: 0.02, latency: 234 },
  { id: 'aura_7e1b2c9a', provider: 'anthropic', model: 'claude-3', status: 'completed', cost: 0.03, latency: 456 },
  { id: 'aura_6d0c8b1f', provider: 'openai', model: 'gpt-4o-mini', status: 'completed', cost: 0.01, latency: 123 },
  { id: 'aura_5c9d4e2a', provider: 'google', model: 'gemini-pro', status: 'failed', cost: 0, latency: 0 },
]

export function DashboardPage() {
  const statsRef = useRef<HTMLDivElement>(null)
  const numberRefs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    // Animate stats cards
    if (statsRef.current) {
      const cards = statsRef.current.querySelectorAll('.stats-card')
      animateStaggered(cards, 'fadeInUp', 80)
    }

    // Animate numbers
    numberRefs.current.forEach((ref, index) => {
      if (ref) {
        animateNumber(ref, stats[index].value, 1200, stats[index].format)
      }
    })
  }, [])

  return (
    <div className="flex flex-col">
      <Header title="Dashboard" description="Overview of your gateway usage and health" />

      <div className="flex-1 p-6 space-y-6">
        {/* Stats Grid */}
        <div ref={statsRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <Card key={stat.title} className="stats-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <stat.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div
                    className={cn(
                      'flex items-center gap-1 text-xs font-medium',
                      stat.trend === 'up' && stat.title !== 'Error Rate'
                        ? 'text-success'
                        : stat.trend === 'down' && stat.title === 'Error Rate'
                          ? 'text-success'
                          : stat.trend === 'up'
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
                  </div>
                </div>
                <div className="mt-4">
                  <span
                    ref={(el) => { numberRefs.current[index] = el }}
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
          {/* Chart Placeholder */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base font-medium">Request Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center justify-center border border-dashed rounded-lg">
                <p className="text-muted-foreground">Chart will be rendered here</p>
              </div>
            </CardContent>
          </Card>

          {/* Provider Health */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Provider Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {providers.map((provider) => (
                <div key={provider.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-2 w-2 rounded-full',
                        provider.status === 'healthy' ? 'bg-success' : 'bg-warning'
                      )}
                    />
                    <span className="font-medium">{provider.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {formatDuration(provider.latency)}
                    </span>
                    {provider.status === 'healthy' ? (
                      <CheckLine className="h-4 w-4 text-success" />
                    ) : (
                      <AlertLine className="h-4 w-4 text-warning" />
                    )}
                  </div>
                </div>
              ))}
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
              {routingStats.map((stat) => (
                <div key={stat.strategy} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize">{stat.strategy.replace('_', ' ')}</span>
                    <span className="text-muted-foreground">{stat.percentage}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${stat.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
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
              <div className="flex items-center justify-center">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
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
                      strokeDasharray={`${gatewayFeatures.cacheHitRate * 2.51} 251`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold">{gatewayFeatures.cacheHitRate}%</span>
                    <span className="text-xs text-muted-foreground">Hit Rate</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-center text-sm">
                <div>
                  <p className="font-semibold text-success">16,984</p>
                  <p className="text-xs text-muted-foreground">Cache Hits</p>
                </div>
                <div>
                  <p className="font-semibold text-muted-foreground">7,863</p>
                  <p className="text-xs text-muted-foreground">Cache Misses</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Compression Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <FileZipLine className="h-4 w-4 text-primary" />
                Compression Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-400">{gatewayFeatures.compressionRatio}%</p>
                  <p className="text-xs text-muted-foreground">Avg Ratio</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-2xl font-bold">{gatewayFeatures.dataSaved}</p>
                  <p className="text-xs text-muted-foreground">Data Saved</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Compression Overhead</span>
                <span className="font-mono">{gatewayFeatures.avgCompressionOverhead}ms avg</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Algorithm</span>
                <Badge variant="secondary">gzip</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Requests Compressed</span>
                <span className="font-mono">18,234</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Recent Requests</CardTitle>
            <a href="/logs" className="text-sm text-primary hover:underline">
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
                  {recentRequests.map((request) => (
                    <tr key={request.id} className="border-t border-border/50">
                      <td className="py-3 font-mono text-xs">{request.id}</td>
                      <td className="py-3 capitalize">{request.provider}</td>
                      <td className="py-3">{request.model}</td>
                      <td className="py-3">
                        <Badge
                          variant={request.status === 'completed' ? 'success' : 'destructive'}
                        >
                          {request.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-right font-mono">
                        {request.cost > 0 ? formatCurrency(request.cost) : '—'}
                      </td>
                      <td className="py-3 text-right font-mono">
                        {request.latency > 0 ? formatDuration(request.latency) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
