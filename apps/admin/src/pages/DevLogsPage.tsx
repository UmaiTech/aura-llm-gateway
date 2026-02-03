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
  DirectionsLine,
  ToolLine,
  BrainLine,
  FileZipLine,
} from '@mingcute/react'

interface GatewayMetadata {
  request_id: string
  model: string
  provider: string
  gateway_version: string
  latency_ms: number
  routing_strategy?: string
  cache_hit?: boolean
  compression?: {
    algorithm: string
    original_size: number
    compressed_size: number
    ratio: number
  }
  agentic: {
    output_items_count: number
    has_tool_calls: boolean
    tool_calls_count?: number
    tools_used?: string[]
    requires_action?: boolean
    has_reasoning?: boolean
    reasoning_tokens?: number
  }
  tenant?: {
    api_key_id: string
    organization_id?: string
    organization_name?: string
    team_id?: string
    project_id?: string
  }
}

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
  routingStrategy?: string
  cacheHit?: boolean
  hasReasoning?: boolean
  compressed?: boolean
  error?: string
  request?: object
  response?: {
    id: string
    status: string
    output: object[]
    usage?: {
      input_tokens: number
      output_tokens: number
      total_tokens: number
      cost_usd: number
    }
    metadata?: {
      aura: GatewayMetadata
    }
  }
}

const routingStrategies = ['round_robin', 'cost_based', 'latency_based', 'random', 'weighted', 'fallback']
const tools = ['web_search', 'calculator', 'code_interpreter', 'file_browser']

// Mock data with full gateway metadata
const mockLogs: LogEntry[] = Array.from({ length: 50 }, (_, i) => {
  const provider = ['openai', 'anthropic', 'google'][Math.floor(Math.random() * 3)]
  const model = ['gpt-4o', 'claude-3-opus', 'gemini-pro', 'gpt-4o-mini'][Math.floor(Math.random() * 4)]
  const inputTokens = Math.floor(Math.random() * 2000) + 100
  const outputTokens = Math.floor(Math.random() * 1000) + 50
  const latency = Math.floor(Math.random() * 2000) + 100
  const cost = Math.random() * 0.1
  const hasToolCalls = Math.random() > 0.7
  const toolCallCount = hasToolCalls ? Math.floor(Math.random() * 3) + 1 : 0
  const usedTools = hasToolCalls ? tools.slice(0, toolCallCount) : []
  const hasReasoning = Math.random() > 0.8
  const cacheHit = Math.random() > 0.7
  const routingStrategy = routingStrategies[Math.floor(Math.random() * routingStrategies.length)]
  const compressed = Math.random() > 0.6
  const requestId = `aura_${Math.random().toString(36).substring(2, 10)}`

  return {
    id: String(i + 1),
    timestamp: new Date(Date.now() - i * 60000 * Math.random() * 10).toISOString(),
    requestId,
    provider,
    model,
    status: Math.random() > 0.1 ? 'completed' : 'failed',
    inputTokens,
    outputTokens,
    cost,
    latency,
    toolCalls: toolCallCount,
    routingStrategy,
    cacheHit,
    hasReasoning,
    compressed,
    error: Math.random() > 0.9 ? 'Rate limit exceeded' : undefined,
    request: {
      model,
      input: [{ type: 'message', role: 'user', content: 'Hello, how are you?' }],
      temperature: 0.7,
      tools: hasToolCalls ? usedTools.map(t => ({ type: 'function', name: t })) : undefined,
    },
    response: {
      id: `resp_${Math.random().toString(36).substring(2, 10)}`,
      status: 'completed',
      output: [
        { type: 'message', role: 'assistant', content: [{ type: 'text', text: 'I am doing well, thank you!' }] },
        ...(hasToolCalls ? usedTools.map(t => ({ type: 'function_call', name: t, call_id: `call_${Math.random().toString(36).substring(2, 6)}`, arguments: '{}' })) : []),
      ],
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        cost_usd: cost,
      },
      metadata: {
        aura: {
          request_id: requestId,
          model,
          provider,
          gateway_version: '0.3.0',
          latency_ms: latency,
          routing_strategy: routingStrategy,
          cache_hit: cacheHit,
          compression: compressed ? {
            algorithm: 'gzip',
            original_size: 2048,
            compressed_size: 512,
            ratio: 0.25,
          } : undefined,
          agentic: {
            output_items_count: 1 + toolCallCount,
            has_tool_calls: hasToolCalls,
            tool_calls_count: hasToolCalls ? toolCallCount : undefined,
            tools_used: hasToolCalls ? usedTools : undefined,
            requires_action: hasToolCalls,
            has_reasoning: hasReasoning,
            reasoning_tokens: hasReasoning ? Math.floor(Math.random() * 500) + 100 : undefined,
          },
          tenant: {
            api_key_id: `key_${Math.random().toString(36).substring(2, 8)}`,
            organization_id: `org_${Math.random().toString(36).substring(2, 8)}`,
            organization_name: 'Acme Corp',
          },
        },
      },
    },
  }
})

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
                    <th className="p-3 font-medium">Routing</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium text-center">Features</th>
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
                          <Badge variant="outline" className="text-xs font-mono">
                            {log.routingStrategy?.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant={log.status === 'completed' ? 'success' : 'destructive'}>
                            {log.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1">
                            {log.cacheHit && (
                              <span title="Cache Hit" className="p-1 rounded bg-green-500/20 text-green-400">
                                <DirectionsLine className="h-3 w-3" />
                              </span>
                            )}
                            {log.toolCalls > 0 && (
                              <span title={`${log.toolCalls} tool calls`} className="p-1 rounded bg-blue-500/20 text-blue-400">
                                <ToolLine className="h-3 w-3" />
                              </span>
                            )}
                            {log.hasReasoning && (
                              <span title="Reasoning" className="p-1 rounded bg-violet-500/20 text-violet-400">
                                <BrainLine className="h-3 w-3" />
                              </span>
                            )}
                            {log.compressed && (
                              <span title="Compressed" className="p-1 rounded bg-orange-500/20 text-orange-400">
                                <FileZipLine className="h-3 w-3" />
                              </span>
                            )}
                          </div>
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
                          <td colSpan={11} className="p-0">
                            <div ref={expandedRef} className="bg-muted/30 border-b overflow-hidden">
                              {/* Gateway Metadata Summary */}
                              {log.response?.metadata?.aura && (
                                <div className="p-4 border-b border-border/50">
                                  <h4 className="text-sm font-medium mb-3">Gateway Metadata</h4>
                                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-xs">
                                    <div className="space-y-1">
                                      <p className="text-muted-foreground">Routing Strategy</p>
                                      <p className="font-medium">{log.response.metadata.aura.routing_strategy || 'default'}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-muted-foreground">Cache</p>
                                      <p className="font-medium">{log.response.metadata.aura.cache_hit ? 'Hit' : 'Miss'}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-muted-foreground">Gateway Version</p>
                                      <p className="font-medium">v{log.response.metadata.aura.gateway_version}</p>
                                    </div>
                                    {log.response.metadata.aura.compression && (
                                      <>
                                        <div className="space-y-1">
                                          <p className="text-muted-foreground">Compression</p>
                                          <p className="font-medium">{log.response.metadata.aura.compression.algorithm}</p>
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-muted-foreground">Compression Ratio</p>
                                          <p className="font-medium">{(log.response.metadata.aura.compression.ratio * 100).toFixed(0)}%</p>
                                        </div>
                                      </>
                                    )}
                                    {log.response.metadata.aura.agentic.has_tool_calls && (
                                      <div className="space-y-1">
                                        <p className="text-muted-foreground">Tools Used</p>
                                        <p className="font-medium">{log.response.metadata.aura.agentic.tools_used?.join(', ')}</p>
                                      </div>
                                    )}
                                    {log.response.metadata.aura.agentic.has_reasoning && (
                                      <div className="space-y-1">
                                        <p className="text-muted-foreground">Reasoning Tokens</p>
                                        <p className="font-medium">{log.response.metadata.aura.agentic.reasoning_tokens}</p>
                                      </div>
                                    )}
                                    {log.response.metadata.aura.tenant && (
                                      <div className="space-y-1">
                                        <p className="text-muted-foreground">Organization</p>
                                        <p className="font-medium">{log.response.metadata.aura.tenant.organization_name || log.response.metadata.aura.tenant.organization_id}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {/* Request/Response JSON */}
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
