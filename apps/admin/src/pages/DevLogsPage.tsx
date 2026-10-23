import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Badge, Input, ErrorState, SkeletonPage, StatusPill } from '@/components/ui'
import { cn, formatDuration, formatCurrency, formatRelativeTime, formatNumber } from '@/lib/utils'
import { animateStaggered, animateExpand, animateCollapse } from '@/lib/animations'
import {
  SearchLine,
  FilterLine,
  Refresh1Line,
  DownloadLine,
  ArrowDownLine,
  CopyLine,
  DirectionsLine,
  ToolLine,
  BrainLine,
  FileZipLine,
  Table2Line,
  CodeLine,
  CheckLine,
} from '@mingcute/react'
import { getRecentLogs, type RecentLog } from '@/lib/api'

type ViewMode = 'table' | 'json'
type DetailTab = 'details' | 'json'

// JSON Syntax Highlighter component
function JsonHighlight({ data }: { data: unknown }) {
  const json = JSON.stringify(data, null, 2)

  // Simple syntax highlighting
  const highlighted = json
    .replace(/"([^"]+)":/g, '<span class="text-purple-600 dark:text-purple-400">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="text-success">"$1"</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span class="text-cyan-600 dark:text-cyan-400">$1</span>')
    .replace(/: (true|false)/g, ': <span class="text-warning">$1</span>')
    .replace(/: (null)/g, ': <span class="text-gray-500">$1</span>')

  return (
    <pre
      className="text-xs font-mono whitespace-pre overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  )
}

export function DevLogsPage() {
  // Honor ?focus=<response_id> coming from the Dashboard's Recent
  // Requests row link (C1 in #175). When set, we pre-expand the
  // matching row once logs load and scroll it into view.
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('focus')

  const [logs, setLogs] = useState<RecentLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [detailTab, setDetailTab] = useState<DetailTab>('details')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const expandedRef = useRef<HTMLDivElement>(null)

  // Fetch logs on mount and when refreshing
  const fetchLogs = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getRecentLogs({ limit: 100 })
      setLogs(data)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  // When ?focus=<response_id> is in the URL, expand + scroll to that
  // row once logs land. Runs once per change of focusId/logs.length so
  // the live-polling cycle doesn't keep stealing scroll position.
  useEffect(() => {
    if (!focusId || logs.length === 0) return
    const match = logs.find((l) => l.response_id === focusId)
    if (!match) return
    setExpandedId(match.id)
    // Defer the scroll until the expand transition has a chance to
    // queue the row in the DOM at its new height.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-log-id="${match.id}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, logs.length])

  // Live polling
  useEffect(() => {
    if (!isLive) return

    const interval = setInterval(() => {
      fetchLogs()
    }, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [isLive])

  useEffect(() => {
    if (!loading && tableRef.current) {
      const rows = tableRef.current.querySelectorAll('.log-row')
      animateStaggered(rows, 'fadeInUp', 30)
    }
  }, [loading, logs])

  const filteredLogs = logs.filter(
    (log) =>
      log.response_id.toLowerCase().includes(search.toLowerCase()) ||
      log.provider_name.toLowerCase().includes(search.toLowerCase()) ||
      log.model_id.toLowerCase().includes(search.toLowerCase())
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

  const handleCopy = (text: string, id?: string) => {
    navigator.clipboard.writeText(text)
    if (id) {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const handleExport = () => {
    const dataStr = JSON.stringify(filteredLogs, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dev-logs-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading && logs.length === 0) {
    return (
      <div className="flex flex-col">
        <Header
          title="Dev Logs"
          description="Raw request and response data for debugging"
        />
        <div className="flex-1 p-4 sm:p-6">
          <SkeletonPage stats={0} rows={10} />
        </div>
      </div>
    )
  }

  if (error && logs.length === 0) {
    return (
      <div className="flex flex-col">
        <Header
          title="Dev Logs"
          description="Raw request and response data for debugging"
        />
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState variant="page" error={error} what="request logs" onRetry={fetchLogs} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:h-screen">
      <Header
        title="Dev Logs"
        description="Raw request and response data for debugging"
        actions={
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-0.5 rounded-md border bg-muted/50 p-0.5" role="radiogroup" aria-label="View mode">
              <button
                onClick={() => setViewMode('table')}
                role="radio"
                aria-checked={viewMode === 'table'}
                className={cn(
                  'focus-ring rounded-[5px] p-1.5 transition-colors',
                  viewMode === 'table'
                    ? 'bg-card text-foreground shadow-[0_0_0_1px_hsl(var(--border))]'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Table view"
                aria-label="Table view"
              >
                <Table2Line className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('json')}
                role="radio"
                aria-checked={viewMode === 'json'}
                className={cn(
                  'focus-ring rounded-[5px] p-1.5 transition-colors',
                  viewMode === 'json'
                    ? 'bg-card text-foreground shadow-[0_0_0_1px_hsl(var(--border))]'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="JSON view"
                aria-label="JSON view"
              >
                <CodeLine className="h-4 w-4" />
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsLive(!isLive)}
              className="gap-2"
              aria-pressed={isLive}
            >
              <span className={cn('h-2 w-2 rounded-full', isLive ? 'bg-success' : 'bg-muted-foreground/60')} />
              {isLive ? 'Live' : 'Paused'}
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
              <DownloadLine className="h-4 w-4" />
              Export
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col space-y-4 p-4 sm:p-6 lg:overflow-hidden">
        {/* Filters */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:gap-3">
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
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={fetchLogs}
            disabled={loading}
          >
            <Refresh1Line className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* Logs Display */}
        <Card className="min-h-[24rem] flex-1 overflow-hidden">
          <CardContent className="h-full overflow-auto p-0 sm:p-0">
            {viewMode === 'table' ? (
              /* Table View */
              <div ref={tableRef}>
                <table className="w-full">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="w-8 p-3" aria-label="Expand"></th>
                      <th className="p-3 eyebrow">Timestamp</th>
                      <th className="p-3 eyebrow">Request ID</th>
                      <th className="p-3 eyebrow">Provider</th>
                      <th className="p-3 eyebrow">Model</th>
                      <th className="p-3 eyebrow">Routing</th>
                      <th className="p-3 eyebrow">Status</th>
                      <th className="p-3 eyebrow text-center">Features</th>
                      <th className="p-3 eyebrow text-right">Tokens</th>
                      <th className="p-3 eyebrow text-right">Cost</th>
                      <th className="p-3 eyebrow text-right">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-muted-foreground">
                          {search ? 'No logs match your search' : 'No logs available'}
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((log) => (
                        <>
                          <tr
                            key={log.id}
                            data-log-id={log.id}
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
                              {formatRelativeTime(log.created_at)}
                            </td>
                            <td className="p-3 font-mono text-xs">
                              {log.response_id.slice(0, 16)}...
                            </td>
                            <td className="p-3 capitalize">{log.provider_name}</td>
                            <td className="p-3">{log.model_id}</td>
                            <td className="p-3">
                              <Badge variant="outline" className="text-xs font-mono">
                                {log.routing_strategy?.replace(/_/g, ' ') || 'default'}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <StatusPill status={log.status} />
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                {log.cache_hit && (
                                  <span title="Cache Hit" className="p-1 rounded bg-success/20 text-success">
                                    <DirectionsLine className="h-3 w-3" />
                                  </span>
                                )}
                                {log.has_tool_calls && (
                                  <span title={`Tool Calls: ${log.tools_used?.join(', ') || 'unknown'}`} className="p-1 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400">
                                    <ToolLine className="h-3 w-3" />
                                  </span>
                                )}
                                {log.has_reasoning && (
                                  <span title="Reasoning" className="p-1 rounded bg-violet-500/20 text-violet-600 dark:text-violet-400">
                                    <BrainLine className="h-3 w-3" />
                                  </span>
                                )}
                                {log.compressed && (
                                  <span title="Compressed" className="p-1 rounded bg-orange-500/20 text-orange-600 dark:text-orange-400">
                                    <FileZipLine className="h-3 w-3" />
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-right font-mono text-xs">
                              {log.input_tokens ?? 0} / {log.output_tokens ?? 0}
                            </td>
                            <td className="p-3 text-right font-mono text-xs">
                              {log.cost_usd ? formatCurrency(log.cost_usd) : '—'}
                            </td>
                            <td className="p-3 text-right font-mono text-xs">
                              {log.latency_ms ? formatDuration(log.latency_ms) : '—'}
                            </td>
                          </tr>
                          {expandedId === log.id && (
                            <tr>
                              <td colSpan={11} className="p-0">
                                <div ref={expandedRef} className="bg-muted/30 border-b overflow-hidden">
                                  {/* Tab Navigation */}
                                  <div className="flex items-center gap-1 p-2 border-b border-border/50 bg-muted/20">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setDetailTab('details') }}
                                      className={cn(
                                        'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                                        detailTab === 'details'
                                          ? 'bg-background text-foreground shadow-sm'
                                          : 'text-muted-foreground hover:text-foreground'
                                      )}
                                    >
                                      Details
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setDetailTab('json') }}
                                      className={cn(
                                        'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                                        detailTab === 'json'
                                          ? 'bg-background text-foreground shadow-sm'
                                          : 'text-muted-foreground hover:text-foreground'
                                      )}
                                    >
                                      Raw JSON
                                    </button>
                                  </div>

                                  {detailTab === 'details' ? (
                                    <>
                                      {/* Gateway Metadata Summary */}
                                      <div className="p-4 border-b border-border/50">
                                        <h4 className="text-sm font-medium mb-3">Request Details</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-xs">
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Response ID</p>
                                            <p className="font-mono text-xs break-all">{log.response_id}</p>
                                          </div>
                                          {log.conversation_id && (
                                            <div className="space-y-1">
                                              <p className="text-muted-foreground">Conversation ID</p>
                                              <p className="font-mono text-xs break-all">{log.conversation_id}</p>
                                            </div>
                                          )}
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Provider</p>
                                            <p className="font-medium capitalize">{log.provider_name}</p>
                                          </div>
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Model</p>
                                            <p className="font-medium">{log.model_id}</p>
                                          </div>
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Routing Strategy</p>
                                            <p className="font-medium">{log.routing_strategy?.replace(/_/g, ' ') || 'default'}</p>
                                          </div>
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Status</p>
                                            <StatusPill status={log.status} />
                                          </div>
                                        </div>
                                      </div>

                                      {/* Token & Cost Details */}
                                      <div className="p-4 border-b border-border/50">
                                        <h4 className="text-sm font-medium mb-3">Usage & Performance</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 text-xs">
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Input Tokens</p>
                                            <p className="font-medium font-mono">{formatNumber(log.input_tokens ?? 0)}</p>
                                          </div>
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Output Tokens</p>
                                            <p className="font-medium font-mono">{formatNumber(log.output_tokens ?? 0)}</p>
                                          </div>
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Cached Tokens</p>
                                            <p className="font-medium font-mono">{formatNumber(log.cached_tokens ?? 0)}</p>
                                          </div>
                                          {log.reasoning_tokens && log.reasoning_tokens > 0 && (
                                            <div className="space-y-1">
                                              <p className="text-muted-foreground">Reasoning Tokens</p>
                                              <p className="font-medium font-mono">{formatNumber(log.reasoning_tokens)}</p>
                                            </div>
                                          )}
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Total Cost</p>
                                            <p className="font-medium font-mono">{log.cost_usd ? formatCurrency(log.cost_usd) : '—'}</p>
                                          </div>
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Latency</p>
                                            <p className="font-medium font-mono">{log.latency_ms ? formatDuration(log.latency_ms) : '—'}</p>
                                          </div>
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Cache</p>
                                            <p className={cn('font-medium', log.cache_hit ? 'text-success' : 'text-muted-foreground')}>
                                              {log.cache_hit ? 'Hit' : 'Miss'}
                                            </p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Tool Calls */}
                                      {log.has_tool_calls && (
                                        <div className="p-4 border-b border-border/50">
                                          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                            <ToolLine className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                            Tool Calls ({log.tool_calls_count})
                                          </h4>
                                          <div className="flex flex-wrap gap-2">
                                            {log.tools_used?.map((tool, idx) => (
                                              <Badge key={idx} variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
                                                {tool}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Additional Info */}
                                      <div className="p-4 border-b border-border/50">
                                        <h4 className="text-sm font-medium mb-3">Additional Information</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                          {log.user_id && (
                                            <div className="space-y-1">
                                              <p className="text-muted-foreground">User ID</p>
                                              <p className="font-mono text-xs">{log.user_id}</p>
                                            </div>
                                          )}
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Timestamp</p>
                                            <p className="font-medium">{new Date(log.created_at).toLocaleString()}</p>
                                          </div>
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Has Reasoning</p>
                                            <p className="font-medium">{log.has_reasoning ? 'Yes' : 'No'}</p>
                                          </div>
                                          <div className="space-y-1">
                                            <p className="text-muted-foreground">Compressed</p>
                                            <p className="font-medium">{log.compressed ? 'Yes' : 'No'}</p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Error Information */}
                                      {(log.error_code || log.error_message) && (
                                        <div className="p-4 border-b border-border/50">
                                          <h4 className="text-sm font-medium mb-3 text-destructive">Error Information</h4>
                                          <div className="p-3 bg-destructive/10 rounded-lg space-y-2">
                                            {log.error_code && (
                                              <div className="flex items-center gap-2 text-xs">
                                                <span className="text-muted-foreground">Code:</span>
                                                <span className="font-mono text-destructive">{log.error_code}</span>
                                              </div>
                                            )}
                                            {log.error_message && (
                                              <p className="text-xs text-destructive">{log.error_message}</p>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    /* Raw JSON View */
                                    <div className="p-4">
                                      <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-medium">Raw JSON</h4>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="gap-2 h-7 text-xs"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleCopy(JSON.stringify(log, null, 2), `json-${log.id}`)
                                          }}
                                        >
                                          {copiedId === `json-${log.id}` ? (
                                            <>
                                              <CheckLine className="h-3 w-3 text-success" />
                                              Copied!
                                            </>
                                          ) : (
                                            <>
                                              <CopyLine className="h-3 w-3" />
                                              Copy JSON
                                            </>
                                          )}
                                        </Button>
                                      </div>
                                      <div className="bg-background/50 border rounded-lg p-4 max-h-[400px] overflow-y-auto overflow-x-auto">
                                        <JsonHighlight data={log} />
                                      </div>
                                    </div>
                                  )}

                                  {/* Actions */}
                                  <div className="p-4 flex items-center gap-4 bg-muted/20">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="gap-2"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleCopy(log.response_id, `resp-${log.id}`)
                                      }}
                                    >
                                      {copiedId === `resp-${log.id}` ? (
                                        <>
                                          <CheckLine className="h-3 w-3 text-success" />
                                          Copied!
                                        </>
                                      ) : (
                                        <>
                                          <CopyLine className="h-3 w-3" />
                                          Copy Response ID
                                        </>
                                      )}
                                    </Button>
                                    {log.conversation_id && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-2"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleCopy(log.conversation_id!, `conv-${log.id}`)
                                        }}
                                      >
                                        {copiedId === `conv-${log.id}` ? (
                                          <>
                                            <CheckLine className="h-3 w-3 text-success" />
                                            Copied!
                                          </>
                                        ) : (
                                          <>
                                            <CopyLine className="h-3 w-3" />
                                            Copy Conversation ID
                                          </>
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* JSON View */
              <div className="p-4 space-y-2" ref={tableRef}>
                {filteredLogs.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    {search ? 'No logs match your search' : 'No logs available'}
                  </div>
                ) : (
                  filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className={cn(
                        'log-row border rounded-lg overflow-hidden transition-colors',
                        expandedId === log.id ? 'border-brand/50 bg-muted/30' : 'border-border hover:border-border/80'
                      )}
                    >
                      {/* Collapsed Header */}
                      <div
                        onClick={() => handleExpand(log.id)}
                        className="flex items-center gap-4 p-3 cursor-pointer hover:bg-muted/30"
                      >
                        <ArrowDownLine
                          className={cn(
                            'h-4 w-4 text-muted-foreground transition-transform flex-shrink-0',
                            expandedId === log.id && 'rotate-180'
                          )}
                        />
                        <StatusPill status={log.status} className="flex-shrink-0" />
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatRelativeTime(log.created_at)}
                        </span>
                        <span className="font-mono text-xs truncate flex-1">
                          {log.response_id}
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0 capitalize">
                          {log.provider_name}
                        </span>
                        <span className="text-xs flex-shrink-0">
                          {log.model_id}
                        </span>
                      </div>

                      {/* Expanded JSON */}
                      {expandedId === log.id && (
                        <div ref={expandedRef} className="border-t border-border/50">
                          <div className="flex items-center justify-between p-3 bg-muted/20">
                            <span className="text-xs font-medium text-muted-foreground">Raw JSON Data</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2 h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopy(JSON.stringify(log, null, 2), `json-${log.id}`)
                              }}
                            >
                              {copiedId === `json-${log.id}` ? (
                                <>
                                  <CheckLine className="h-3 w-3 text-success" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <CopyLine className="h-3 w-3" />
                                  Copy
                                </>
                              )}
                            </Button>
                          </div>
                          <div className="p-4 max-h-[500px] overflow-y-auto overflow-x-auto bg-background/30">
                            <JsonHighlight data={log} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-sm text-muted-foreground flex-shrink-0">
          Showing {filteredLogs.length} of {logs.length} requests
          {loading && <span className="ml-2">(updating...)</span>}
        </div>
      </div>
    </div>
  )
}
