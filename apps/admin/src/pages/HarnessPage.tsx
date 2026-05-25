import { useState, useEffect } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Input } from '@/components/ui'
import { cn, formatDuration, formatCurrency, formatNumber, formatRelativeTime, formatStrategy } from '@/lib/utils'
import {
  AiLine,
  Message1Line,
  BugLine,
  PlayLine,
  SearchLine,
  CheckLine,
  CloseLine,
  ClockLine,
  CoinLine,
  User2Line,
  BrainLine,
  ToolLine,
  Package2Line,
  Sparkles2Line,
  Loading3Line,
  Refresh1Line,
  ShieldLine,
  ArrowDownLine,
  InformationLine,
} from '@mingcute/react'
import { getRecentLogs, getToolUsage, type RecentLog, type ToolUsageStats } from '@/lib/api'

type Tab = 'traces' | 'prompts' | 'tools' | 'guardrails'

interface TraceStep {
  id: string
  type:
    | 'user'
    | 'reasoning'
    | 'compression'
    | 'validation'
    | 'consistency'
    | 'tool_call'
    | 'tool_result'
    | 'assistant'
  content: string
  toolName?: string
  input?: object
  output?: object
  latency?: number
  tokens?: number
  status?: 'success' | 'error'
  // Free-form metadata bag for strategy events (compression /
  // validation / consistency). Rendered as a small inline chip
  // row in the timeline when present.
  meta?: Record<string, string | number | boolean | undefined>
}

interface Trace {
  id: string
  sessionId: string
  status: 'completed' | 'failed'
  provider: string
  model: string
  totalLatency: number
  totalCost: number
  inputTokens: number
  outputTokens: number
  steps: TraceStep[]
  createdAt: string
  // Tool call info
  hasToolCalls: boolean
  toolCallsCount: number
  toolsUsed: string[]
}

// Convert RecentLog to Trace format
function logToTrace(log: RecentLog): Trace {
  const steps: TraceStep[] = []

  // Simulate a user message step
  steps.push({
    id: `${log.id}-user`,
    type: 'user',
    content: 'User request (content not stored)',
  })

  // Strategy events: compression / validation / consistency. These run
  // BEFORE the model sees the prompt (compression, consistency
  // augmentation) and AFTER it returns (validation), but rendering all
  // three in sequence here keeps the timeline readable without
  // claiming finer-grained timing than we actually store.
  if (log.compression_meta) {
    const c = log.compression_meta
    const strategyRaw = c.strategies?.[0] ?? 'compression'
    const strategyLabel = formatStrategy(strategyRaw)
    const savings =
      typeof c.savings_percent === 'number' ? `${c.savings_percent.toFixed(1)}%` : undefined
    steps.push({
      id: `${log.id}-compression`,
      type: 'compression',
      content: `Compression: ${strategyLabel}${savings ? ` (${savings} saved)` : ''}`,
      latency: c.latency_ms,
      meta: {
        strategy: strategyLabel,
        savings_percent: c.savings_percent,
        original_tokens: c.original_tokens,
        compressed_tokens: c.compressed_tokens,
      },
    })
  }
  if (log.consistency_meta && log.consistency_meta.strategy && log.consistency_meta.strategy !== 'none') {
    const c = log.consistency_meta
    const label = formatStrategy(c.strategy)
    steps.push({
      id: `${log.id}-consistency`,
      type: 'consistency',
      content: `Consistency: ${label}${c.principles_count ? ` · ${c.principles_count} principles` : ''}`,
      meta: {
        strategy: label,
        principles_count: c.principles_count,
        has_style_profile: c.has_style_profile,
        examples_count: c.examples_count,
      },
    })
  }
  if (log.validation_meta && log.validation_meta.strategy && log.validation_meta.strategy !== 'none') {
    const v = log.validation_meta
    const label = formatStrategy(v.strategy)
    const score =
      typeof v.confidence === 'number' ? ` · confidence ${v.confidence.toFixed(2)}` : ''
    const fanout =
      typeof v.candidates_generated === 'number' && v.candidates_generated > 1
        ? ` · ${v.candidates_generated} candidates`
        : ''
    steps.push({
      id: `${log.id}-validation`,
      type: 'validation',
      content: `Validation: ${label}${score}${fanout}`,
      // Color the step red when confidence dropped below the gate.
      status:
        typeof v.confidence === 'number' &&
        typeof v.min_confidence === 'number' &&
        v.confidence < v.min_confidence
          ? 'error'
          : 'success',
      meta: {
        strategy: v.strategy,
        confidence: v.confidence,
        min_confidence: v.min_confidence,
        candidates_generated: v.candidates_generated,
        selected_index: v.selected_index,
      },
    })
  }

  // If there's reasoning
  if (log.has_reasoning && log.reasoning_tokens && log.reasoning_tokens > 0) {
    steps.push({
      id: `${log.id}-reasoning`,
      type: 'reasoning',
      content: 'Model reasoning (content not stored)',
      tokens: log.reasoning_tokens,
    })
  }

  // Add tool call steps if tools were used
  if (log.has_tool_calls && log.tool_calls_data && log.tool_calls_data.length > 0) {
    log.tool_calls_data.forEach((toolCall, index) => {
      // Tool call step with arguments
      steps.push({
        id: `${log.id}-tool-call-${index}`,
        type: 'tool_call',
        content: `Calling ${toolCall.name}`,
        toolName: toolCall.name,
        input: toolCall.arguments as object,
        status: 'success',
      })
      // Tool result step (results not stored)
      steps.push({
        id: `${log.id}-tool-result-${index}`,
        type: 'tool_result',
        content: `Result from ${toolCall.name}`,
        toolName: toolCall.name,
        status: 'success',
      })
    })
  } else if (log.has_tool_calls && log.tools_used && log.tools_used.length > 0) {
    // Fallback for logs without tool_calls_data
    log.tools_used.forEach((toolName, index) => {
      steps.push({
        id: `${log.id}-tool-call-${index}`,
        type: 'tool_call',
        content: `Calling ${toolName}`,
        toolName: toolName,
        status: 'success',
      })
      steps.push({
        id: `${log.id}-tool-result-${index}`,
        type: 'tool_result',
        content: `Result from ${toolName}`,
        toolName: toolName,
        status: 'success',
      })
    })
  }

  // Assistant response
  steps.push({
    id: `${log.id}-assistant`,
    type: 'assistant',
    content: log.has_tool_calls
      ? `Response after ${log.tool_calls_count} tool call${log.tool_calls_count > 1 ? 's' : ''}`
      : 'Assistant response (content not stored)',
    latency: log.latency_ms ?? undefined,
    tokens: log.output_tokens ?? undefined,
  })

  return {
    id: log.id,
    sessionId: log.response_id,
    status: log.status === 'completed' ? 'completed' : 'failed',
    provider: log.provider_name,
    model: log.model_id,
    totalLatency: log.latency_ms ?? 0,
    totalCost: log.cost_usd ?? 0,
    inputTokens: log.input_tokens ?? 0,
    outputTokens: log.output_tokens ?? 0,
    steps,
    createdAt: log.created_at,
    hasToolCalls: log.has_tool_calls,
    toolCallsCount: log.tool_calls_count,
    toolsUsed: log.tools_used ?? [],
  }
}

// Step icon component
function StepIcon({ type }: { type: TraceStep['type'] }) {
  switch (type) {
    case 'user':
      return <User2Line className="h-4 w-4 text-blue-400" />
    case 'reasoning':
      return <BrainLine className="h-4 w-4 text-purple-400" />
    case 'compression':
      // Reuse FileZip glyph isn't imported here — use AI line as a
      // visually distinct icon. Color = same purple family as compression
      // chip on Dashboard.
      return <AiLine className="h-4 w-4 text-purple-300" />
    case 'validation':
      return <ShieldLine className="h-4 w-4 text-blue-300" />
    case 'consistency':
      // Sparkles2 is already used for the assistant; pick Information so
      // the trace doesn't get confused with the final model response.
      return <InformationLine className="h-4 w-4 text-amber-400" />
    case 'tool_call':
      return <ToolLine className="h-4 w-4 text-orange-400" />
    case 'tool_result':
      return <Package2Line className="h-4 w-4 text-green-400" />
    case 'assistant':
      return <Sparkles2Line className="h-4 w-4 text-primary" />
  }
}

export function HarnessPage() {
  const [activeTab, setActiveTab] = useState<Tab>('traces')
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null)
  const [search, setSearch] = useState('')
  const [filterToolCalls, setFilterToolCalls] = useState<'all' | 'with-tools' | 'no-tools'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'failed'>('all')
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  // Tool drill-down drawer (B8 in #175). Holds the tool name when a
  // row in the Tools tab is clicked; null otherwise. Detail data is
  // computed from the in-memory traces so no backend call is needed.
  const [selectedTool, setSelectedTool] = useState<string | null>(null)
  const [toolSearch, setToolSearch] = useState('')

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(stepId)) {
        next.delete(stepId)
      } else {
        next.add(stepId)
      }
      return next
    })
  }

  // API state
  const [loading, setLoading] = useState(true)
  const [traces, setTraces] = useState<Trace[]>([])
  const [tools, setTools] = useState<ToolUsageStats[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Fetch data
  const fetchData = async () => {
    try {
      const [logs, toolStats] = await Promise.all([
        getRecentLogs({ limit: 50 }).catch(() => []),
        getToolUsage('7d').catch(() => []),
      ])

      // Convert logs to traces
      setTraces(logs.map(logToTrace))
      setTools(toolStats)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchData()
  }

  const tabs: { id: Tab; name: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'traces', name: 'Traces', icon: BugLine },
    { id: 'prompts', name: 'Prompts', icon: Message1Line },
    { id: 'tools', name: 'Tools', icon: ToolLine },
    { id: 'guardrails', name: 'Guardrails', icon: ShieldLine },
  ]

  // Calculate summary stats
  const stats = {
    totalTraces: traces.length,
    withToolCalls: traces.filter(t => t.hasToolCalls).length,
    totalToolCalls: traces.reduce((acc, t) => acc + t.toolCallsCount, 0),
    uniqueTools: [...new Set(traces.flatMap(t => t.toolsUsed))].length,
    successRate: traces.length > 0
      ? (traces.filter(t => t.status === 'completed').length / traces.length * 100).toFixed(1)
      : '0',
    avgLatency: traces.length > 0
      ? Math.round(traces.reduce((acc, t) => acc + t.totalLatency, 0) / traces.length)
      : 0,
    totalCost: traces.reduce((acc, t) => acc + t.totalCost, 0),
    totalTokens: traces.reduce((acc, t) => acc + t.inputTokens + t.outputTokens, 0),
  }

  // Filter traces by search and filters
  const filteredTraces = traces.filter((trace) => {
    const matchesSearch =
      trace.sessionId.toLowerCase().includes(search.toLowerCase()) ||
      trace.provider.toLowerCase().includes(search.toLowerCase()) ||
      trace.model.toLowerCase().includes(search.toLowerCase()) ||
      trace.toolsUsed.some(t => t.toLowerCase().includes(search.toLowerCase()))

    const matchesToolFilter =
      filterToolCalls === 'all' ||
      (filterToolCalls === 'with-tools' && trace.hasToolCalls) ||
      (filterToolCalls === 'no-tools' && !trace.hasToolCalls)

    const matchesStatus =
      filterStatus === 'all' || trace.status === filterStatus

    return matchesSearch && matchesToolFilter && matchesStatus
  })

  if (loading) {
    return (
      <div className="flex flex-col h-screen">
        <Header title="Agentic Harness" description="Debug and tune your AI agent workflows" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loading3Line className="h-5 w-5 animate-spin" />
            <span>Loading harness data...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <Header title="Agentic Harness" description="Debug and tune your AI agent workflows" />

      <div className="flex-1 flex overflow-hidden">
        {/* Tabs */}
        <div className="w-48 border-r bg-card/50 p-3 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.name}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {activeTab === 'traces' && (
            <>
              {/* Trace List */}
              <div className="w-[420px] border-r overflow-y-auto p-4 space-y-3">
                {/* Summary Stats */}
                <div className="grid grid-cols-4 gap-2 p-3 bg-muted/30 rounded-lg">
                  <div className="text-center">
                    <p className="text-lg font-semibold">{stats.totalTraces}</p>
                    <p className="text-xs text-muted-foreground">Traces</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-orange-400">{stats.withToolCalls}</p>
                    <p className="text-xs text-muted-foreground">With Tools</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-green-400">{stats.successRate}%</p>
                    <p className="text-xs text-muted-foreground">Success</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">{formatCurrency(stats.totalCost)}</p>
                    <p className="text-xs text-muted-foreground">Cost</p>
                  </div>
                </div>

                {/* Search and Filters */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Search traces or tools..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      icon={<SearchLine className="h-4 w-4" />}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                    >
                      <Refresh1Line className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={filterToolCalls}
                      onChange={(e) => setFilterToolCalls(e.target.value as typeof filterToolCalls)}
                      className="flex-1 text-xs px-2 py-1.5 bg-background border border-border rounded-md"
                    >
                      <option value="all">All Traces</option>
                      <option value="with-tools">With Tool Calls</option>
                      <option value="no-tools">No Tool Calls</option>
                    </select>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                      className="flex-1 text-xs px-2 py-1.5 bg-background border border-border rounded-md"
                    >
                      <option value="all">All Status</option>
                      <option value="completed">Completed</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Showing {filteredTraces.length} of {traces.length} traces
                </p>

                {filteredTraces.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BugLine className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No traces found</p>
                  </div>
                ) : (
                  filteredTraces.map((trace) => (
                    <Card
                      key={trace.id}
                      onClick={() => setSelectedTrace(trace)}
                      className={cn(
                        'cursor-pointer transition-all hover:border-primary/50',
                        selectedTrace?.id === trace.id && 'ring-2 ring-primary'
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <code className="text-xs font-mono truncate max-w-[180px]">
                            {trace.sessionId.slice(0, 20)}...
                          </code>
                          <div className="flex items-center gap-2">
                            {trace.hasToolCalls && (
                              <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-xs">
                                <ToolLine className="h-3 w-3 mr-1" />
                                {trace.toolCallsCount}
                              </Badge>
                            )}
                            <Badge variant={trace.status === 'completed' ? 'success' : 'destructive'}>
                              {trace.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                          <span className="capitalize">{trace.provider}</span>
                          <span>·</span>
                          <span>{trace.model}</span>
                        </div>
                        {trace.hasToolCalls && trace.toolsUsed.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {trace.toolsUsed.map((tool, idx) => (
                              <span key={idx} className="text-xs px-1.5 py-0.5 bg-muted rounded font-mono">
                                {tool}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <ClockLine className="h-3 w-3" />
                            {formatDuration(trace.totalLatency)}
                          </span>
                          <span className="flex items-center gap-1">
                            <CoinLine className="h-3 w-3" />
                            {formatCurrency(trace.totalCost)}
                          </span>
                          <span className="flex items-center gap-1">
                            <AiLine className="h-3 w-3" />
                            {formatNumber(trace.inputTokens + trace.outputTokens)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {formatRelativeTime(trace.createdAt)}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {/* Trace Detail */}
              <div className="flex-1 overflow-y-auto p-6">
                {selectedTrace ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold">Trace Details</h2>
                        <p className="text-sm text-muted-foreground font-mono">{selectedTrace.sessionId}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="gap-2">
                          <PlayLine className="h-4 w-4" />
                          Replay
                        </Button>
                        <Button variant="outline" size="sm">Export</Button>
                      </div>
                    </div>

                    {/* Trace Metadata */}
                    <Card>
                      <CardContent className="p-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Provider</p>
                            <p className="font-medium capitalize">{selectedTrace.provider}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Model</p>
                            <p className="font-medium">{selectedTrace.model}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Total Latency</p>
                            <p className="font-medium font-mono">{formatDuration(selectedTrace.totalLatency)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Total Cost</p>
                            <p className="font-medium font-mono">{formatCurrency(selectedTrace.totalCost)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Input Tokens</p>
                            <p className="font-medium font-mono">{formatNumber(selectedTrace.inputTokens)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Output Tokens</p>
                            <p className="font-medium font-mono">{formatNumber(selectedTrace.outputTokens)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Status</p>
                            <Badge variant={selectedTrace.status === 'completed' ? 'success' : 'destructive'}>
                              {selectedTrace.status}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Created</p>
                            <p className="font-medium">{new Date(selectedTrace.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Tool Calls Summary */}
                    {selectedTrace.hasToolCalls && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <ToolLine className="h-4 w-4 text-orange-400" />
                            Tool Calls ({selectedTrace.toolCallsCount})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex flex-wrap gap-2">
                            {selectedTrace.toolsUsed.map((tool, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 border border-orange-500/20 rounded-lg"
                              >
                                <ToolLine className="h-4 w-4 text-orange-400" />
                                <span className="font-mono text-sm">{tool}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Trace Steps */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        Execution Steps ({selectedTrace.steps.length})
                      </h3>
                      {selectedTrace.steps.map((step, index) => {
                        const isExpanded = expandedSteps.has(step.id)
                        const isToolStep = step.type === 'tool_call' || step.type === 'tool_result'

                        return (
                          <div key={step.id} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center',
                                step.type === 'tool_call' ? 'bg-orange-500/20' :
                                step.type === 'tool_result' ? 'bg-green-500/20' :
                                step.type === 'reasoning' ? 'bg-purple-500/20' :
                                step.type === 'compression' ? 'bg-purple-500/10' :
                                step.type === 'validation' ? 'bg-blue-500/10' :
                                step.type === 'consistency' ? 'bg-amber-500/20' :
                                step.type === 'user' ? 'bg-blue-500/20' :
                                'bg-primary/20'
                              )}>
                                <StepIcon type={step.type} />
                              </div>
                              {index < selectedTrace.steps.length - 1 && (
                                <div className="w-px flex-1 bg-border my-1" />
                              )}
                            </div>
                            <Card
                              className={cn(
                                'flex-1 transition-all',
                                isToolStep && 'cursor-pointer hover:border-primary/50'
                              )}
                              onClick={() => isToolStep && toggleStep(step.id)}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        'capitalize',
                                        step.type === 'tool_call' && 'bg-orange-500/20 text-orange-400',
                                        step.type === 'tool_result' && 'bg-green-500/20 text-green-400',
                                        step.type === 'reasoning' && 'bg-purple-500/20 text-purple-400',
                                        step.type === 'compression' && 'bg-purple-500/10 text-purple-300',
                                        step.type === 'validation' && 'bg-blue-500/10 text-blue-300',
                                        step.type === 'consistency' && 'bg-amber-500/20 text-amber-400',
                                      )}
                                    >
                                      {step.type.replace('_', ' ')}
                                    </Badge>
                                    {step.toolName && (
                                      <code className="text-sm font-mono text-primary">{step.toolName}()</code>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    {step.latency && (
                                      <span className="flex items-center gap-1">
                                        <ClockLine className="h-3 w-3" />
                                        {formatDuration(step.latency)}
                                      </span>
                                    )}
                                    {step.tokens && (
                                      <span className="flex items-center gap-1">
                                        <AiLine className="h-3 w-3" />
                                        {step.tokens} tokens
                                      </span>
                                    )}
                                    {step.status && (
                                      step.status === 'success' ? (
                                        <CheckLine className="h-4 w-4 text-success" />
                                      ) : (
                                        <CloseLine className="h-4 w-4 text-destructive" />
                                      )
                                    )}
                                    {isToolStep && (
                                      <ArrowDownLine className={cn(
                                        'h-4 w-4 transition-transform',
                                        isExpanded && 'rotate-180'
                                      )} />
                                    )}
                                  </div>
                                </div>

                                <p className="text-sm text-muted-foreground">{step.content}</p>

                                {/* Meta chips for strategy steps. Filter out
                                    undefined/null/empty values so we don't
                                    render misleading "field: undefined" pills. */}
                                {step.meta && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {Object.entries(step.meta)
                                      .filter(([, v]) => v !== undefined && v !== null && v !== '')
                                      .map(([k, v]) => (
                                        <span
                                          key={k}
                                          className="text-2xs font-mono px-2 py-0.5 rounded bg-muted/50 text-muted-foreground"
                                        >
                                          {k.replace(/_/g, ' ')}: {String(v)}
                                        </span>
                                      ))}
                                  </div>
                                )}

                                {/* Expanded content for tool steps */}
                                {isExpanded && isToolStep && (
                                  <div className="mt-4 space-y-3 border-t pt-4">
                                    {step.type === 'tool_call' && (
                                      <>
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Input Arguments</p>
                                          {step.input ? (
                                            <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto font-mono">
                                              {JSON.stringify(step.input, null, 2)}
                                            </pre>
                                          ) : (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                                              <InformationLine className="h-4 w-4" />
                                              <span>Input arguments not stored. Enable response logging to capture tool inputs.</span>
                                            </div>
                                          )}
                                        </div>
                                      </>
                                    )}
                                    {step.type === 'tool_result' && (
                                      <>
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Output Result</p>
                                          {step.output ? (
                                            <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto font-mono">
                                              {JSON.stringify(step.output, null, 2)}
                                            </pre>
                                          ) : (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                                              <InformationLine className="h-4 w-4" />
                                              <span>Tool results not stored. Results are returned to the client but not persisted.</span>
                                            </div>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <BugLine className="h-12 w-12 mb-4 opacity-50" />
                    <p>Select a trace to view details</p>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'prompts' && (
            <div className="flex-1 p-6">
              <Card className="max-w-2xl mx-auto mt-8">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Message1Line className="h-5 w-5" />
                    Prompt Management — on the roadmap
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <p>
                    Versioned prompts (commit messages, A/B variants,
                    rollback) aren&apos;t implemented yet. For now,
                    prompts live in your application code — the
                    gateway logs the rendered <code className="text-xs bg-muted px-1 py-0.5 rounded">input</code>{' '}
                    on every request so you can inspect what was
                    actually sent under{' '}
                    <a href="/dev-logs" className="text-primary hover:underline">
                      Dev Logs
                    </a>.
                  </p>
                  <p>
                    Tracked in the public roadmap. If you want this
                    sooner, open a feature request on{' '}
                    <a
                      href="https://github.com/UmaiTech/aura-llm-gateway/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      GitHub
                    </a>.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'tools' && (
            <div className="flex-1 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <Input
                  placeholder="Search tools..."
                  className="max-w-sm"
                  icon={<SearchLine className="h-4 w-4" />}
                  value={toolSearch}
                  onChange={(e) => setToolSearch(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                  >
                    <Refresh1Line className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                  </Button>
                </div>
              </div>

              {tools.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <ToolLine className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-1">No Tool Usage Data</p>
                  <p className="text-sm">Tool usage statistics will appear here once tools are used</p>
                </div>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b text-left text-sm text-muted-foreground">
                          <th className="p-4 font-medium">Tool</th>
                          <th className="p-4 font-medium text-right">Calls</th>
                          <th className="p-4 font-medium text-right">Usage %</th>
                          <th className="p-4 font-medium">Distribution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tools
                          .filter((t) =>
                            t.tool_name.toLowerCase().includes(toolSearch.toLowerCase()),
                          )
                          .map((tool) => (
                          <tr
                            key={tool.tool_name}
                            className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                            onClick={() => setSelectedTool(tool.tool_name)}
                          >
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <ToolLine className="h-4 w-4 text-muted-foreground" />
                                <span className="font-mono text-sm">{tool.tool_name}</span>
                              </div>
                            </td>
                            <td className="p-4 text-right font-mono">{formatNumber(tool.call_count)}</td>
                            <td className="p-4 text-right font-mono">{tool.percentage.toFixed(1)}%</td>
                            <td className="p-4">
                              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${tool.percentage}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Per-tool drill-down drawer. Aggregates invocations from
              traces already in memory — recent calls, args + the parent
              trace ID for jumping back to the timeline. */}
          {selectedTool && (() => {
            const invocations = traces.flatMap((t) =>
              t.steps
                .filter((s) => s.type === 'tool_call' && s.toolName === selectedTool)
                .map((s) => ({
                  traceId: t.id,
                  sessionId: t.sessionId,
                  provider: t.provider,
                  model: t.model,
                  args: s.input,
                  createdAt: t.createdAt,
                })),
            )
            const totalCalls = invocations.length
            const tracesWithTool = traces.filter((t) =>
              t.toolsUsed.includes(selectedTool),
            )
            const avgPerTrace =
              tracesWithTool.length > 0 ? totalCalls / tracesWithTool.length : 0
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ToolLine className="h-5 w-5 text-orange-400" />
                        <CardTitle className="font-mono">{selectedTool}()</CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTool(null)}
                      >
                        <CloseLine className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="overflow-y-auto space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold tabular-nums">{totalCalls}</p>
                        <p className="text-xs text-muted-foreground">Total Calls</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold tabular-nums">
                          {tracesWithTool.length}
                        </p>
                        <p className="text-xs text-muted-foreground">Traces Using</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold tabular-nums">
                          {avgPerTrace.toFixed(1)}
                        </p>
                        <p className="text-xs text-muted-foreground">Avg Calls / Trace</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Recent Invocations
                      </h4>
                      {invocations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No invocations in the loaded traces.
                        </p>
                      ) : (
                        invocations.slice(0, 20).map((inv, i) => (
                          <div
                            key={`${inv.traceId}-${i}`}
                            className="border border-border/40 rounded-md p-3 space-y-2 cursor-pointer hover:border-primary/40"
                            onClick={() => {
                              // Jump to the trace this invocation came from.
                              const t = traces.find((x) => x.id === inv.traceId)
                              if (t) {
                                setSelectedTrace(t)
                                setSelectedTool(null)
                                setActiveTab('traces')
                              }
                            }}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono text-muted-foreground">
                                {inv.sessionId.slice(0, 16)}…
                              </span>
                              <span className="text-muted-foreground">
                                {inv.provider} · {inv.model}
                              </span>
                              <span className="text-muted-foreground">
                                {formatRelativeTime(inv.createdAt)}
                              </span>
                            </div>
                            {inv.args ? (
                              <pre className="text-2xs bg-muted/50 p-2 rounded font-mono overflow-x-auto">
                                {JSON.stringify(inv.args, null, 2)}
                              </pre>
                            ) : (
                              <p className="text-2xs text-muted-foreground italic">
                                args not stored
                              </p>
                            )}
                          </div>
                        ))
                      )}
                      {invocations.length > 20 && (
                        <p className="text-xs text-muted-foreground text-center">
                          Showing 20 of {invocations.length} invocations.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )
          })()}

          {activeTab === 'guardrails' && (
            <div className="flex-1 p-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClockLine className="h-4 w-4" />
                    Execution Limits
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max Tool Calls</label>
                      <Input type="number" defaultValue="10" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max Execution Time (s)</label>
                      <Input type="number" defaultValue="60" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max Tokens</label>
                      <Input type="number" defaultValue="8000" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max Cost ($)</label>
                      <Input type="number" defaultValue="1.00" step="0.01" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldLine className="h-4 w-4" />
                    Loop Detection
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded border-border" />
                    <span className="text-sm">Detect repeated tool calls with same parameters</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded border-border" />
                    <span className="text-sm">Auto-terminate after 3 identical calls</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded border-border" />
                    <span className="text-sm">Log suspected infinite loops</span>
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BrainLine className="h-4 w-4" />
                    Content Safety
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded border-border" />
                    <span className="text-sm">Enable content moderation</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="rounded border-border" />
                    <span className="text-sm">Block sensitive data in tool outputs</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="rounded border-border" />
                    <span className="text-sm">Require human approval for certain actions</span>
                  </label>
                </CardContent>
              </Card>

              <Button variant="gradient">Save Configuration</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
