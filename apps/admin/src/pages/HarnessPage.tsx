import { useState } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Input } from '@/components/ui'
import { cn, formatDuration, formatCurrency } from '@/lib/utils'
import {
  AiLine,
  Message1Line,
  Settings1Line,
  BugLine,
  PlayLine,
  SearchLine,
  CheckLine,
  CloseLine,
  ClockLine,
  CoinLine,
} from '@mingcute/react'

type Tab = 'traces' | 'prompts' | 'tools' | 'guardrails'

interface TraceStep {
  id: string
  type: 'user' | 'reasoning' | 'tool_call' | 'tool_result' | 'assistant'
  content: string
  toolName?: string
  input?: object
  output?: object
  latency?: number
  tokens?: number
  status?: 'success' | 'error'
}

interface Trace {
  id: string
  sessionId: string
  status: 'completed' | 'failed'
  totalLatency: number
  totalCost: number
  steps: TraceStep[]
  createdAt: string
}

const mockTraces: Trace[] = [
  {
    id: '1',
    sessionId: 'aura_8f2a3d7e',
    status: 'completed',
    totalLatency: 2340,
    totalCost: 0.045,
    createdAt: new Date().toISOString(),
    steps: [
      { id: '1', type: 'user', content: 'What is the weather in Tokyo and convert to Celsius?' },
      { id: '2', type: 'reasoning', content: 'I need to get the weather and convert the temperature.', latency: 234, tokens: 45 },
      { id: '3', type: 'tool_call', content: 'get_weather', toolName: 'get_weather', input: { location: 'Tokyo, Japan' }, latency: 156, status: 'success' },
      { id: '4', type: 'tool_result', content: '{"temp": 72, "unit": "F", "condition": "Partly Cloudy"}' },
      { id: '5', type: 'tool_call', content: 'calculate', toolName: 'calculate', input: { expr: '(72 - 32) * 5/9' }, latency: 12, status: 'success' },
      { id: '6', type: 'tool_result', content: '{"result": 22.22}' },
      { id: '7', type: 'assistant', content: 'The current temperature in Tokyo is 22°C (72°F) with partly cloudy conditions.', latency: 189, tokens: 89 },
    ],
  },
  {
    id: '2',
    sessionId: 'aura_7e1b2c9a',
    status: 'failed',
    totalLatency: 12300,
    totalCost: 0.023,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    steps: [
      { id: '1', type: 'user', content: 'Book a table at the best restaurant in SF' },
      { id: '2', type: 'reasoning', content: 'I need to search for restaurants and then book.', latency: 340, tokens: 52 },
      { id: '3', type: 'tool_call', content: 'web_search', toolName: 'web_search', input: { query: 'best restaurants SF 2024' }, latency: 1200, status: 'success' },
      { id: '4', type: 'tool_result', content: '{"results": [...]}' },
      { id: '5', type: 'tool_call', content: 'book_restaurant', toolName: 'book_restaurant', input: { name: 'Atelier Crenn' }, latency: 30000, status: 'error' },
    ],
  },
]

const mockPrompts = [
  { id: '1', name: 'Customer Support v2.3', status: 'active', uses: 1234, lastEdited: '2 days ago' },
  { id: '2', name: 'Code Assistant v1.1', status: 'testing', uses: 567, lastEdited: '1 week ago' },
  { id: '3', name: 'Sales Agent', status: 'draft', uses: 0, lastEdited: 'just now' },
]

const mockTools = [
  { id: '1', name: 'web_search', enabled: true, calls: 4521, avgLatency: 890, successRate: 98.2 },
  { id: '2', name: 'calculate', enabled: true, calls: 2341, avgLatency: 12, successRate: 99.9 },
  { id: '3', name: 'get_weather', enabled: true, calls: 1567, avgLatency: 156, successRate: 95.1 },
  { id: '4', name: 'code_execute', enabled: false, calls: 823, avgLatency: 2340, successRate: 87.3 },
]

export function HarnessPage() {
  const [activeTab, setActiveTab] = useState<Tab>('traces')
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null)
  const [search, setSearch] = useState('')

  const tabs: { id: Tab; name: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'traces', name: 'Traces', icon: BugLine },
    { id: 'prompts', name: 'Prompts', icon: Message1Line },
    { id: 'tools', name: 'Tools', icon: Settings1Line },
    { id: 'guardrails', name: 'Guardrails', icon: AiLine },
  ]

  const getStepIcon = (type: TraceStep['type']) => {
    switch (type) {
      case 'user': return <span className="text-blue-500">👤</span>
      case 'reasoning': return <span className="text-purple-500">🧠</span>
      case 'tool_call': return <span className="text-orange-500">🔧</span>
      case 'tool_result': return <span className="text-green-500">📦</span>
      case 'assistant': return <span className="text-primary">✨</span>
    }
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
              <div className="w-96 border-r overflow-y-auto p-4 space-y-3">
                <Input
                  placeholder="Search traces..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  icon={<SearchLine className="h-4 w-4" />}
                />
                {mockTraces.map((trace) => (
                  <Card
                    key={trace.id}
                    onClick={() => setSelectedTrace(trace)}
                    className={cn(
                      'cursor-pointer transition-all',
                      selectedTrace?.id === trace.id && 'ring-2 ring-primary'
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <code className="text-xs font-mono">{trace.sessionId}</code>
                        <Badge variant={trace.status === 'completed' ? 'success' : 'destructive'}>
                          {trace.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <ClockLine className="h-3 w-3" />
                          {formatDuration(trace.totalLatency)}
                        </span>
                        <span className="flex items-center gap-1">
                          <CoinLine className="h-3 w-3" />
                          {formatCurrency(trace.totalCost)}
                        </span>
                        <span>{trace.steps.length} steps</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Trace Detail */}
              <div className="flex-1 overflow-y-auto p-6">
                {selectedTrace ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold">Trace: {selectedTrace.sessionId}</h2>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="gap-2">
                          <PlayLine className="h-4 w-4" />
                          Replay
                        </Button>
                        <Button variant="outline" size="sm">Export</Button>
                      </div>
                    </div>

                    {/* Trace Steps */}
                    <div className="space-y-2">
                      {selectedTrace.steps.map((step, index) => (
                        <div key={step.id} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-lg">
                              {getStepIcon(step.type)}
                            </div>
                            {index < selectedTrace.steps.length - 1 && (
                              <div className="w-px flex-1 bg-border my-1" />
                            )}
                          </div>
                          <Card className="flex-1">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between mb-2">
                                <Badge variant="secondary" className="capitalize">
                                  {step.type.replace('_', ' ')}
                                </Badge>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  {step.latency && <span>{formatDuration(step.latency)}</span>}
                                  {step.tokens && <span>{step.tokens} tokens</span>}
                                  {step.status && (
                                    step.status === 'success' ? (
                                      <CheckLine className="h-4 w-4 text-success" />
                                    ) : (
                                      <CloseLine className="h-4 w-4 text-destructive" />
                                    )
                                  )}
                                </div>
                              </div>
                              {step.toolName && (
                                <p className="text-sm font-mono text-primary mb-2">{step.toolName}()</p>
                              )}
                              {step.input && (
                                <pre className="text-xs bg-muted p-2 rounded mb-2 overflow-auto">
                                  {JSON.stringify(step.input, null, 2)}
                                </pre>
                              )}
                              <p className="text-sm whitespace-pre-wrap">{step.content}</p>
                            </CardContent>
                          </Card>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <BugLine className="h-12 w-12 mb-4" />
                    <p>Select a trace to view details</p>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'prompts' && (
            <div className="flex-1 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <Input placeholder="Search prompts..." className="max-w-sm" icon={<SearchLine className="h-4 w-4" />} />
                <Button className="gap-2">
                  <Message1Line className="h-4 w-4" />
                  New Prompt
                </Button>
              </div>
              <div className="grid gap-4">
                {mockPrompts.map((prompt) => (
                  <Card key={prompt.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{prompt.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {prompt.uses} uses · Last edited {prompt.lastEdited}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={prompt.status === 'active' ? 'success' : prompt.status === 'testing' ? 'warning' : 'muted'}>
                          {prompt.status}
                        </Badge>
                        <Button variant="outline" size="sm">Edit</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'tools' && (
            <div className="flex-1 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <Input placeholder="Search tools..." className="max-w-sm" icon={<SearchLine className="h-4 w-4" />} />
                <Button className="gap-2">
                  <Settings1Line className="h-4 w-4" />
                  Add Tool
                </Button>
              </div>
              <Card>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left text-sm text-muted-foreground">
                        <th className="p-4 font-medium">Tool</th>
                        <th className="p-4 font-medium">Status</th>
                        <th className="p-4 font-medium text-right">Calls</th>
                        <th className="p-4 font-medium text-right">Avg Latency</th>
                        <th className="p-4 font-medium text-right">Success Rate</th>
                        <th className="p-4 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockTools.map((tool) => (
                        <tr key={tool.id} className="border-b border-border/50">
                          <td className="p-4 font-mono text-sm">{tool.name}</td>
                          <td className="p-4">
                            <Badge variant={tool.enabled ? 'success' : 'muted'}>
                              {tool.enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </td>
                          <td className="p-4 text-right">{tool.calls.toLocaleString()}</td>
                          <td className="p-4 text-right">{formatDuration(tool.avgLatency)}</td>
                          <td className="p-4 text-right">{tool.successRate}%</td>
                          <td className="p-4">
                            <Button variant="ghost" size="sm">Configure</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'guardrails' && (
            <div className="flex-1 p-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Execution Limits</CardTitle>
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
                  <CardTitle className="text-base">Loop Detection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm">Detect repeated tool calls with same parameters</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm">Auto-terminate after 3 identical calls</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm">Log suspected infinite loops</span>
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
