import { useState, useEffect, useRef } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Badge, Input } from '@/components/ui'
import { formatRelativeTime, formatDuration, formatCurrency } from '@/lib/utils'
import { animateStaggered } from '@/lib/animations'
import {
  SearchLine,
  DownloadLine,
  ArrowLeftLine,
  ArrowRightLine,
} from '@mingcute/react'

interface LogEntry {
  id: string
  timestamp: string
  requestId: string
  provider: string
  model: string
  status: 'completed' | 'failed'
  inputTokens: number
  outputTokens: number
  cost: number
  latency: number
}

// Mock data
const mockLogs: LogEntry[] = Array.from({ length: 100 }, (_, i) => ({
  id: String(i + 1),
  timestamp: new Date(Date.now() - i * 300000).toISOString(),
  requestId: `aura_${Math.random().toString(36).substring(2, 10)}`,
  provider: ['openai', 'anthropic', 'google'][Math.floor(Math.random() * 3)],
  model: ['gpt-4o', 'claude-3-opus', 'gemini-pro', 'gpt-4o-mini'][Math.floor(Math.random() * 4)],
  status: Math.random() > 0.1 ? 'completed' : 'failed',
  inputTokens: Math.floor(Math.random() * 2000) + 100,
  outputTokens: Math.floor(Math.random() * 1000) + 50,
  cost: Math.random() * 0.1,
  latency: Math.floor(Math.random() * 2000) + 100,
}))

export function LogsPage() {
  const [logs] = useState<LogEntry[]>(mockLogs)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [providerFilter, setProviderFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const pageSize = 20
  const tableRef = useRef<HTMLDivElement>(null)

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.requestId.toLowerCase().includes(search.toLowerCase()) ||
      log.model.toLowerCase().includes(search.toLowerCase())
    const matchesProvider = providerFilter === 'all' || log.provider === providerFilter
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter
    return matchesSearch && matchesProvider && matchesStatus
  })

  const paginatedLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize)
  const totalPages = Math.ceil(filteredLogs.length / pageSize)

  useEffect(() => {
    if (tableRef.current) {
      const rows = tableRef.current.querySelectorAll('.log-row')
      animateStaggered(rows, 'fadeInUp', 30)
    }
  }, [page, providerFilter, statusFilter])

  return (
    <div className="flex flex-col">
      <Header
        title="Request Logs"
        description="View and search request history"
        actions={
          <Button variant="outline" size="sm" className="gap-2">
            <DownloadLine className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="flex-1 p-6 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <Input
            placeholder="Search by request ID or model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<SearchLine className="h-4 w-4" />}
            className="max-w-sm"
          />
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="bg-muted border-0 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Providers</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-muted border-0 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Logs Table */}
        <Card>
          <CardContent className="p-0">
            <div ref={tableRef} className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="p-4 font-medium">Time</th>
                    <th className="p-4 font-medium">Request ID</th>
                    <th className="p-4 font-medium">Provider</th>
                    <th className="p-4 font-medium">Model</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium text-right">Tokens</th>
                    <th className="p-4 font-medium text-right">Cost</th>
                    <th className="p-4 font-medium text-right">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map((log) => (
                    <tr key={log.id} className="log-row border-b border-border/50 hover:bg-muted/50 transition-colors">
                      <td className="p-4 text-sm text-muted-foreground">
                        {formatRelativeTime(log.timestamp)}
                      </td>
                      <td className="p-4 font-mono text-xs">{log.requestId}</td>
                      <td className="p-4 text-sm capitalize">{log.provider}</td>
                      <td className="p-4 text-sm">{log.model}</td>
                      <td className="p-4">
                        <Badge variant={log.status === 'completed' ? 'success' : 'destructive'}>
                          {log.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-right font-mono text-sm">
                        {log.inputTokens + log.outputTokens}
                      </td>
                      <td className="p-4 text-right font-mono text-sm">
                        {formatCurrency(log.cost)}
                      </td>
                      <td className="p-4 text-right font-mono text-sm">
                        {formatDuration(log.latency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredLogs.length)} of{' '}
            {filteredLogs.length} results
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              <ArrowLeftLine className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
            >
              <ArrowRightLine className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
