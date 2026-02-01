import { useState } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Input } from '@/components/ui'
import { formatDuration } from '@/lib/utils'
import {
  ServerLine,
  AddLine,
  CheckLine,
  AlertLine,
  Refresh1Line,
  Settings1Line,
  EyeLine,
  EyeCloseLine,
} from '@mingcute/react'

interface Provider {
  id: string
  name: string
  type: 'openai' | 'anthropic' | 'google'
  status: 'healthy' | 'degraded' | 'offline'
  apiKey: string
  models: string[]
  latency: number
  requests24h: number
  cost24h: number
  lastChecked: Date
}

const mockProviders: Provider[] = [
  {
    id: '1',
    name: 'OpenAI Production',
    type: 'openai',
    status: 'healthy',
    apiKey: 'sk-proj-xxxxxxxxxxxxxxxxxxxx',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
    latency: 234,
    requests24h: 12847,
    cost24h: 127.43,
    lastChecked: new Date(),
  },
  {
    id: '2',
    name: 'Anthropic',
    type: 'anthropic',
    status: 'healthy',
    apiKey: 'sk-ant-xxxxxxxxxxxxxxxxxxxx',
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
    latency: 456,
    requests24h: 5432,
    cost24h: 89.21,
    lastChecked: new Date(),
  },
  {
    id: '3',
    name: 'Google AI',
    type: 'google',
    status: 'degraded',
    apiKey: 'AI-xxxxxxxxxxxxxxxxxxxx',
    models: ['gemini-pro', 'gemini-pro-vision'],
    latency: 892,
    requests24h: 2341,
    cost24h: 34.56,
    lastChecked: new Date(),
  },
]

export function ProvidersPage() {
  const [providers] = useState<Provider[]>(mockProviders)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [showAddDialog, setShowAddDialog] = useState(false)

  const getStatusBadge = (status: Provider['status']) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="success" className="gap-1"><CheckLine className="h-3 w-3" /> Healthy</Badge>
      case 'degraded':
        return <Badge variant="warning" className="gap-1"><AlertLine className="h-3 w-3" /> Degraded</Badge>
      case 'offline':
        return <Badge variant="destructive" className="gap-1"><AlertLine className="h-3 w-3" /> Offline</Badge>
    }
  }

  const getProviderLogo = (type: Provider['type']) => {
    const colors = {
      openai: 'bg-emerald-500/10 text-emerald-500',
      anthropic: 'bg-orange-500/10 text-orange-500',
      google: 'bg-blue-500/10 text-blue-500',
    }
    return (
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[type]}`}>
        <ServerLine className="h-5 w-5" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <Header
        title="Providers"
        description="Configure and monitor LLM providers"
        actions={
          <Button onClick={() => setShowAddDialog(true)} className="gap-2">
            <AddLine className="h-4 w-4" />
            Add Provider
          </Button>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Provider Cards */}
        <div className="grid gap-6">
          {providers.map((provider) => (
            <Card key={provider.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {getProviderLogo(provider.type)}
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold">{provider.name}</h3>
                        {getStatusBadge(provider.status)}
                      </div>
                      <p className="text-sm text-muted-foreground capitalize mb-3">{provider.type}</p>

                      {/* API Key */}
                      <div className="flex items-center gap-2 mb-3">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {showKeys[provider.id]
                            ? provider.apiKey
                            : provider.apiKey.slice(0, 10) + '•'.repeat(15)}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setShowKeys({ ...showKeys, [provider.id]: !showKeys[provider.id] })}
                        >
                          {showKeys[provider.id] ? (
                            <EyeCloseLine className="h-4 w-4" />
                          ) : (
                            <EyeLine className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {/* Models */}
                      <div className="flex flex-wrap gap-2">
                        {provider.models.map((model) => (
                          <Badge key={model} variant="secondary">{model}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="text-right space-y-1">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Latency:</span>{' '}
                      <span className="font-mono">{formatDuration(provider.latency)}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">24h Requests:</span>{' '}
                      <span className="font-mono">{provider.requests24h.toLocaleString()}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">24h Cost:</span>{' '}
                      <span className="font-mono">${provider.cost24h.toFixed(2)}</span>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Refresh1Line className="h-4 w-4" />
                        Test
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Settings1Line className="h-4 w-4" />
                        Configure
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add Provider Dialog */}
        {showAddDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <Card className="w-full max-w-md animate-scale-in">
              <CardHeader>
                <CardTitle>Add Provider</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Provider Type</label>
                  <select className="w-full bg-muted border-0 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring">
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google AI</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input placeholder="Production API" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">API Key</label>
                  <Input type="password" placeholder="sk-..." />
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button className="flex-1">Add Provider</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
