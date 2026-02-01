import { useState, useEffect, useRef } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Badge, Input } from '@/components/ui'
import { cn, formatDuration, formatCurrency } from '@/lib/utils'
import { animateStaggered, animateExpand, animateCollapse } from '@/lib/animations'
import {
  SearchLine,
  FilterLine,
  Refresh1Line,
  DownloadLine,
  ArrowDownLine,
  CopyLine,
} from '@mingcute/react'

interface LogEntry {
  id: string
  timestamp: string
  requestId: string
  provider: string
  model: string
  status: 'completed' | 'failed' | 'in_progress'
  inputTokens: number
  outputTokens: number
  cost: number
  latency: number
  toolCalls: number
  error?: string
  request?: object
  response?: object
}

// Mock data
const mockLogs: LogEntry[] = Array.from({ length: 50 }, (_, i) => ({
  id: String(i + 1),
  timestamp: new Date(Date.now() - i * 60000 * Math.random() * 10).toISOString(),
  requestId: `aura_${Math.random().toString(36).substring(2, 10)}`,
  provider: ['openai', 'anthropic', 'google'][Math.floor(Math.random() * 3)],
  model: ['gpt-4o', 'claude-3-opus', 'gemini-pro', 'gpt-4o-mini'][Math.floor(Math.random() * 4)],
  status: Math.random() > 0.1 ? 'completed' : 'failed',
  inputTokens: Math.floor(Math.random() * 2000) + 100,
  outputTokens: Math.floor(Math.random() * 1000) + 50,
  cost: Math.random() * 0.1,
  latency: Math.floor(Math.random() * 2000) + 100,
  toolCalls: Math.floor(Math.random() * 5),
  error: Math.random() > 0.9 ? 'Rate limit exceeded' : undefined,
  request: {
    model: 'gpt-4o',
    input: [{ role: 'user', content: 'Hello, how are you?' }],
    temperature: 0.7,
  },
  response: {
    id: 'resp_xxx',
    status: 'completed',
    output: [{ type: 'message', content: 'I am doing well, thank you!' }],
  },
}))

export function DevLogsPage() {
  const [logs] = useState<LogEntry[]>(mockLogs)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(false)
  const tableRef = useRef<HTMLDivElement>(null)
  const expandedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tableRef.current) {
      const rows = tableRef.current.querySelectorAll('.log-row')
      animateStaggered(rows, 'fadeInUp', 30)
    }
  }, [])

  const filteredLogs = logs.filter(
    (log) =>
      log.requestId.toLowerCase().includes(search.toLowerCase()) ||
      log.provider.toLowerCase().includes(search.toLowerCase()) ||
      log.model.toLowerCase().includes(search.toLowerCase())
  )

  const handleExpand = (id: string) => {
    if (expandedId === id) {
      if (expandedRef.current) {
        animateCollapse(expandedRef.current)
      }
      setTimeout(() => setExpandedId(null), 200)
    } else {
      setExpandedId(id)
    }
  }

  useEffect(() => {
    if (expandedId && expandedRef.current) {
      animateExpand(expandedRef.current)
    }
  }, [expandedId])

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Dev Logs"
        description="Raw request and response data for debugging"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={isLive ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsLive(!isLive)}
              className={cn('gap-2', isLive && 'animate-pulse-glow')}
            >
              <span className={cn('w-2 h-2 rounded-full', isLive ? 'bg-success' : 'bg-muted-foreground')} />
              {isLive ? 'Live' : 'Paused'}
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <DownloadLine className="h-4 w-4" />
              Export
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6 space-y-4 overflow-hidden flex flex-col">
        {/* Filters */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <Input
            placeholder="Search by request ID, provider, or model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<SearchLine className="h-4 w-4" />}
            className="max-w-md"
          />
          <Button variant="outline" size="sm" className="gap-2">
            <FilterLine className="h-4 w-4" />
            Filters
          </Button>
          <Button variant="ghost" size="sm" className="gap-2">
            <Refresh1Line className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Logs Table */}
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0 h-full overflow-auto">
            <div ref={tableRef}>
              <table className="w-full">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium w-8"></th>
                    <th className="p-3 font-medium">Timestamp</th>
                    <th className="p-3 font-medium">Request ID</th>
                    <th className="p-3 font-medium">Provider</th>
                    <th className="p-3 font-medium">Model</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium text-right">Tokens</th>
                    <th className="p-3 font-medium text-right">Cost</th>
                    <th className="p-3 font-medium text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredLogs.map((log) => (
                    <>
                      <tr
                        key={log.id}
                        onClick={() => handleExpand(log.id)}
                        className={cn(
                          'log-row border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer',
                          expandedId === log.id && 'bg-muted/50'
                        )}
                      >
                        <td className="p-3">
                          <ArrowDownLine
                            className={cn(
                              'h-4 w-4 text-muted-foreground transition-transform',
                              expandedId === log.id && 'rotate-180'
                            )}
                          />
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-3 font-mono text-xs">{log.requestId}</td>
                        <td className="p-3 capitalize">{log.provider}</td>
                        <td className="p-3">{log.model}</td>
                        <td className="p-3">
                          <Badge variant={log.status === 'completed' ? 'success' : 'destructive'}>
                            {log.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-mono text-xs">
                          {log.inputTokens} / {log.outputTokens}
                        </td>
                        <td className="p-3 text-right font-mono text-xs">
                          {formatCurrency(log.cost)}
                        </td>
                        <td className="p-3 text-right font-mono text-xs">
                          {formatDuration(log.latency)}
                        </td>
                      </tr>
                      {expandedId === log.id && (
                        <tr>
                          <td colSpan={9} className="p-0">
                            <div ref={expandedRef} className="bg-muted/30 border-b overflow-hidden">
                              <div className="p-4 grid grid-cols-2 gap-4">
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-medium">Request</h4>
                                    <Button variant="ghost" size="icon-sm">
                                      <CopyLine className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  <pre className="text-xs bg-card p-3 rounded-lg overflow-auto max-h-48 font-mono">
                                    {JSON.stringify(log.request, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-medium">Response</h4>
                                    <Button variant="ghost" size="icon-sm">
                                      <CopyLine className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  <pre className="text-xs bg-card p-3 rounded-lg overflow-auto max-h-48 font-mono">
                                    {JSON.stringify(log.response, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="text-sm text-muted-foreground flex-shrink-0">
          Showing {filteredLogs.length} of {logs.length} requests
        </div>
      </div>
    </div>
  )
}
