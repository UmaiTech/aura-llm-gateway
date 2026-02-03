import { useState } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  AddLine,
  DirectionsLine,
  CheckLine,
  CloseLine,
  EditLine,
  DeleteLine,
  ChartBarLine,
  CoinLine,
  TimeLine,
  AiLine,
  Settings1Line,
} from '@mingcute/react'

interface RoutingRule {
  id: string
  name: string
  description: string
  strategy: 'round_robin' | 'cost_based' | 'latency_based' | 'intent_based' | 'fallback' | 'random' | 'weighted'
  priority: number
  enabled: boolean
  conditions: {
    type: string
    value: string
  }[]
  actions: {
    provider: string
    model: string
    weight?: number
  }[]
  stats: {
    requestsRouted: number
    costSaved: number
    avgLatency: number
  }
}

const mockRules: RoutingRule[] = [
  {
    id: 'rule_1',
    name: 'Cost Optimization',
    description: 'Route simple queries to cheaper models',
    strategy: 'cost_based',
    priority: 1,
    enabled: true,
    conditions: [
      { type: 'input_tokens', value: '< 500' },
      { type: 'complexity', value: 'simple' },
    ],
    actions: [
      { provider: 'openai', model: 'gpt-4o-mini', weight: 70 },
      { provider: 'anthropic', model: 'claude-3-haiku', weight: 30 },
    ],
    stats: {
      requestsRouted: 12500,
      costSaved: 345.67,
      avgLatency: 234,
    },
  },
  {
    id: 'rule_2',
    name: 'High Quality Routing',
    description: 'Route complex queries to best models',
    strategy: 'intent_based',
    priority: 2,
    enabled: true,
    conditions: [
      { type: 'complexity', value: 'complex' },
      { type: 'requires_reasoning', value: 'true' },
    ],
    actions: [
      { provider: 'anthropic', model: 'claude-3-opus', weight: 60 },
      { provider: 'openai', model: 'gpt-4o', weight: 40 },
    ],
    stats: {
      requestsRouted: 3400,
      costSaved: 0,
      avgLatency: 1250,
    },
  },
  {
    id: 'rule_3',
    name: 'Load Balancing',
    description: 'Distribute load across providers',
    strategy: 'round_robin',
    priority: 3,
    enabled: true,
    conditions: [],
    actions: [
      { provider: 'openai', model: 'gpt-4o', weight: 40 },
      { provider: 'anthropic', model: 'claude-3-sonnet', weight: 40 },
      { provider: 'google', model: 'gemini-pro', weight: 20 },
    ],
    stats: {
      requestsRouted: 8900,
      costSaved: 123.45,
      avgLatency: 456,
    },
  },
  {
    id: 'rule_4',
    name: 'Fallback Chain',
    description: 'Automatic fallback on provider failures',
    strategy: 'fallback',
    priority: 10,
    enabled: true,
    conditions: [{ type: 'on_error', value: 'true' }],
    actions: [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'anthropic', model: 'claude-3-sonnet' },
      { provider: 'google', model: 'gemini-pro' },
    ],
    stats: {
      requestsRouted: 156,
      costSaved: 0,
      avgLatency: 890,
    },
  },
  {
    id: 'rule_5',
    name: 'Weighted Distribution',
    description: 'Distribute traffic with custom weights',
    strategy: 'weighted',
    priority: 4,
    enabled: true,
    conditions: [],
    actions: [
      { provider: 'openai', model: 'gpt-4o', weight: 50 },
      { provider: 'anthropic', model: 'claude-3-sonnet', weight: 35 },
      { provider: 'google', model: 'gemini-pro', weight: 15 },
    ],
    stats: {
      requestsRouted: 4200,
      costSaved: 78.90,
      avgLatency: 380,
    },
  },
  {
    id: 'rule_6',
    name: 'Random Selection',
    description: 'Random provider for A/B testing',
    strategy: 'random',
    priority: 5,
    enabled: false,
    conditions: [{ type: 'tag', value: 'experiment' }],
    actions: [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'anthropic', model: 'claude-3-opus' },
    ],
    stats: {
      requestsRouted: 890,
      costSaved: 0,
      avgLatency: 560,
    },
  },
]

const strategyInfo: Record<string, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  round_robin: { label: 'Round Robin', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: <DirectionsLine className="w-4 h-4" />, description: 'Distribute requests evenly across providers' },
  cost_based: { label: 'Cost Based', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: <CoinLine className="w-4 h-4" />, description: 'Route to cheapest provider based on model pricing' },
  latency_based: { label: 'Latency Based', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: <TimeLine className="w-4 h-4" />, description: 'Route to fastest provider based on response times' },
  intent_based: { label: 'Intent Based', color: 'bg-violet-500/20 text-violet-400 border-violet-500/30', icon: <AiLine className="w-4 h-4" />, description: 'Route based on request complexity and intent' },
  fallback: { label: 'Fallback', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: <Settings1Line className="w-4 h-4" />, description: 'Try providers in sequence on failure' },
  random: { label: 'Random', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30', icon: <DirectionsLine className="w-4 h-4" />, description: 'Randomly select from available providers' },
  weighted: { label: 'Weighted', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: <ChartBarLine className="w-4 h-4" />, description: 'Route based on configured weights per provider' },
}

export function RoutingPage() {
  const [rules, setRules] = useState(mockRules)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null)

  const toggleRule = (id: string) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))
  }

  const totalRequestsRouted = rules.reduce((acc, r) => acc + r.stats.requestsRouted, 0)
  const totalCostSaved = rules.reduce((acc, r) => acc + r.stats.costSaved, 0)
  const avgLatency = Math.round(
    rules.reduce((acc, r) => acc + r.stats.avgLatency * r.stats.requestsRouted, 0) / totalRequestsRouted
  )

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Routing"
        description="Configure intelligent request routing strategies"
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <AddLine className="w-4 h-4 mr-2" />
            Create Rule
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                  <DirectionsLine className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{rules.length}</p>
                  <p className="text-sm text-muted-foreground">Active Rules</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <ChartBarLine className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totalRequestsRouted.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Requests Routed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <CoinLine className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">${totalCostSaved.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">Cost Saved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <TimeLine className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{avgLatency}ms</p>
                  <p className="text-sm text-muted-foreground">Avg Latency</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Routing Flow Diagram */}
        <Card>
          <CardHeader>
            <CardTitle>Routing Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 overflow-x-auto pb-4">
              <div className="flex-shrink-0 p-4 bg-violet-500/20 rounded-lg border border-violet-500/30 text-center min-w-[120px]">
                <p className="font-medium">Request</p>
                <p className="text-xs text-muted-foreground">Incoming</p>
              </div>
              <div className="text-2xl text-muted-foreground">→</div>
              {rules
                .filter((r) => r.enabled)
                .sort((a, b) => a.priority - b.priority)
                .map((rule, idx) => (
                  <div key={rule.id} className="flex items-center gap-4">
                    <div
                      className={cn(
                        'flex-shrink-0 p-4 rounded-lg border text-center min-w-[140px]',
                        strategyInfo[rule.strategy].color
                      )}
                    >
                      <div className="flex items-center justify-center gap-2 mb-1">
                        {strategyInfo[rule.strategy].icon}
                        <p className="font-medium text-sm">{rule.name}</p>
                      </div>
                      <p className="text-xs opacity-70">{strategyInfo[rule.strategy].label}</p>
                    </div>
                    {idx < rules.filter((r) => r.enabled).length - 1 && (
                      <div className="text-2xl text-muted-foreground">→</div>
                    )}
                  </div>
                ))}
              <div className="text-2xl text-muted-foreground">→</div>
              <div className="flex-shrink-0 p-4 bg-green-500/20 rounded-lg border border-green-500/30 text-center min-w-[120px]">
                <p className="font-medium">Provider</p>
                <p className="text-xs text-muted-foreground">Selected</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rules List */}
        <Card>
          <CardHeader>
            <CardTitle>Routing Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={cn(
                    'p-4 rounded-lg border transition-all',
                    rule.enabled
                      ? 'bg-card-alt border-border/50 hover:border-border'
                      : 'bg-muted/30 border-border/30 opacity-60'
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn('p-2 rounded-lg', strategyInfo[rule.strategy].color)}>
                        {strategyInfo[rule.strategy].icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{rule.name}</h3>
                          <Badge className={cn('text-xs', strategyInfo[rule.strategy].color)}>
                            {strategyInfo[rule.strategy].label}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Priority: {rule.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{rule.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={rule.enabled ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleRule(rule.id)}
                      >
                        {rule.enabled ? 'Enabled' : 'Disabled'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingRule(rule)}>
                        <EditLine className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <DeleteLine className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>

                  {/* Conditions */}
                  {rule.conditions.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground mb-1">Conditions:</p>
                      <div className="flex flex-wrap gap-2">
                        {rule.conditions.map((cond, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs font-mono">
                            {cond.type} {cond.value}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground mb-1">Route to:</p>
                    <div className="flex flex-wrap gap-2">
                      {rule.actions.map((action, idx) => (
                        <Badge key={idx} className="text-xs bg-muted/50">
                          {action.provider}/{action.model}
                          {action.weight && ` (${action.weight}%)`}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-6 pt-3 border-t border-border/50 text-sm">
                    <div>
                      <span className="text-muted-foreground">Routed:</span>{' '}
                      <span className="font-medium">{rule.stats.requestsRouted.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Saved:</span>{' '}
                      <span className="font-medium text-green-400">${rule.stats.costSaved.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg Latency:</span>{' '}
                      <span className="font-medium">{rule.stats.avgLatency}ms</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Create Routing Rule</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
                  <CloseLine className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <Input placeholder="Cost Optimization Rule" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Input placeholder="Route simple queries to cheaper models" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Strategy</label>
                <select className="w-full px-3 py-2 bg-background border border-border rounded-md">
                  <option value="round_robin">Round Robin</option>
                  <option value="weighted">Weighted</option>
                  <option value="random">Random</option>
                  <option value="cost_based">Cost Based</option>
                  <option value="latency_based">Latency Based</option>
                  <option value="intent_based">Intent Based</option>
                  <option value="fallback">Fallback Chain</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Priority</label>
                <Input type="number" placeholder="1" min="1" max="100" />
                <p className="text-xs text-muted-foreground mt-1">Lower number = higher priority</p>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setShowCreateModal(false)}>
                  <CheckLine className="w-4 h-4 mr-2" />
                  Create Rule
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Rule Modal */}
      {editingRule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Edit Routing Rule</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setEditingRule(null)}>
                  <CloseLine className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <Input defaultValue={editingRule.name} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Input defaultValue={editingRule.description} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Strategy</label>
                <select
                  className="w-full px-3 py-2 bg-background border border-border rounded-md"
                  defaultValue={editingRule.strategy}
                >
                  <option value="round_robin">Round Robin</option>
                  <option value="weighted">Weighted</option>
                  <option value="random">Random</option>
                  <option value="cost_based">Cost Based</option>
                  <option value="latency_based">Latency Based</option>
                  <option value="intent_based">Intent Based</option>
                  <option value="fallback">Fallback Chain</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Priority</label>
                <Input type="number" defaultValue={editingRule.priority} min="1" max="100" />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setEditingRule(null)}>
                  Cancel
                </Button>
                <Button onClick={() => setEditingRule(null)}>
                  <CheckLine className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
