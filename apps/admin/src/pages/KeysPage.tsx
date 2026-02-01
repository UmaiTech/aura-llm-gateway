import { useState, useEffect, useRef } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Input } from '@/components/ui'
import { formatRelativeTime, copyToClipboard, formatNumber } from '@/lib/utils'
import { animateStaggered } from '@/lib/animations'
import {
  AddLine,
  Key2Line,
  CopyLine,
  DeleteLine,
  CheckLine,
  SearchLine,
} from '@mingcute/react'

interface ApiKey {
  id: string
  name: string
  key: string
  prefix: string
  createdAt: string
  lastUsed: string | null
  requests: number
  status: 'active' | 'inactive' | 'rate_limited'
  rateLimit: number
  permissions: string[]
}

// Mock data
const mockKeys: ApiKey[] = [
  {
    id: '1',
    name: 'Production API',
    key: 'sk-aura-prod-xxxxxxxxxxxxxxxxxxxx',
    prefix: 'sk-aura-prod',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastUsed: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    requests: 12847,
    status: 'active',
    rateLimit: 1000,
    permissions: ['read', 'write', 'stream'],
  },
  {
    id: '2',
    name: 'Staging API',
    key: 'sk-aura-stage-xxxxxxxxxxxxxxxxxxxx',
    prefix: 'sk-aura-stage',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    lastUsed: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    requests: 3421,
    status: 'active',
    rateLimit: 500,
    permissions: ['read', 'write', 'stream'],
  },
  {
    id: '3',
    name: 'Development',
    key: 'sk-aura-dev-xxxxxxxxxxxxxxxxxxxx',
    prefix: 'sk-aura-dev',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    lastUsed: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    requests: 842,
    status: 'rate_limited',
    rateLimit: 100,
    permissions: ['read', 'write'],
  },
  {
    id: '4',
    name: 'Old Integration',
    key: 'sk-aura-old-xxxxxxxxxxxxxxxxxxxx',
    prefix: 'sk-aura-old',
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    lastUsed: null,
    requests: 0,
    status: 'inactive',
    rateLimit: 1000,
    permissions: ['read'],
  },
]

export function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>(mockKeys)
  const [search, setSearch] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyRateLimit, setNewKeyRateLimit] = useState('1000')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tableRef.current) {
      const rows = tableRef.current.querySelectorAll('.key-row')
      animateStaggered(rows, 'fadeInUp', 50)
    }
  }, [keys])

  const filteredKeys = keys.filter(
    (key) =>
      key.name.toLowerCase().includes(search.toLowerCase()) ||
      key.prefix.toLowerCase().includes(search.toLowerCase())
  )

  const handleCopy = async (key: ApiKey) => {
    await copyToClipboard(key.key)
    setCopiedId(key.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleCreate = () => {
    const newKey: ApiKey = {
      id: String(Date.now()),
      name: newKeyName || 'New API Key',
      key: `sk-aura-${Math.random().toString(36).substring(2, 10)}-${'x'.repeat(20)}`,
      prefix: `sk-aura-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      requests: 0,
      status: 'active',
      rateLimit: parseInt(newKeyRateLimit) || 1000,
      permissions: ['read', 'write', 'stream'],
    }
    setKeys([newKey, ...keys])
    setCreatedKey(newKey.key)
    setNewKeyName('')
    setNewKeyRateLimit('1000')
  }

  const handleDelete = (id: string) => {
    setKeys(keys.filter((key) => key.id !== id))
  }

  const getStatusBadge = (status: ApiKey['status']) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>
      case 'inactive':
        return <Badge variant="muted">Inactive</Badge>
      case 'rate_limited':
        return <Badge variant="warning">Rate Limited</Badge>
    }
  }

  return (
    <div className="flex flex-col">
      <Header
        title="API Keys"
        description="Manage your gateway API keys"
        actions={
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <AddLine className="h-4 w-4" />
            Create Key
          </Button>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Search */}
        <div className="flex items-center gap-4">
          <Input
            placeholder="Search keys..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<SearchLine className="h-4 w-4" />}
            className="max-w-sm"
          />
        </div>

        {/* Keys Table */}
        <Card>
          <CardContent className="p-0">
            <div ref={tableRef} className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="p-4 font-medium">Name</th>
                    <th className="p-4 font-medium">Key</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium text-right">Requests</th>
                    <th className="p-4 font-medium">Last Used</th>
                    <th className="p-4 font-medium text-right">Rate Limit</th>
                    <th className="p-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKeys.map((key) => (
                    <tr key={key.id} className="key-row border-b border-border/50 hover:bg-muted/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-primary/10 p-2">
                            <Key2Line className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{key.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Created {formatRelativeTime(key.createdAt)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                            {key.prefix}...
                          </code>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleCopy(key)}
                            className="text-muted-foreground"
                          >
                            {copiedId === key.id ? (
                              <CheckLine className="h-4 w-4 text-success" />
                            ) : (
                              <CopyLine className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                      <td className="p-4">{getStatusBadge(key.status)}</td>
                      <td className="p-4 text-right font-mono text-sm">
                        {formatNumber(key.requests)}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {key.lastUsed ? formatRelativeTime(key.lastUsed) : 'Never'}
                      </td>
                      <td className="p-4 text-right font-mono text-sm">
                        {formatNumber(key.rateLimit)}/min
                      </td>
                      <td className="p-4">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(key.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <DeleteLine className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Create Key Dialog */}
        {showCreateDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <Card className="w-full max-w-md animate-scale-in">
              <CardHeader>
                <CardTitle>Create API Key</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {createdKey ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Your API key has been created. Copy it now - you won't be able to see it again.
                    </p>
                    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                      <code className="flex-1 text-sm font-mono break-all">{createdKey}</code>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => copyToClipboard(createdKey)}
                      >
                        <CopyLine className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => {
                        setShowCreateDialog(false)
                        setCreatedKey(null)
                      }}
                    >
                      Done
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Name</label>
                      <Input
                        placeholder="Production API"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Rate Limit (requests/min)</label>
                      <Input
                        type="number"
                        placeholder="1000"
                        value={newKeyRateLimit}
                        onChange={(e) => setNewKeyRateLimit(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setShowCreateDialog(false)}
                      >
                        Cancel
                      </Button>
                      <Button className="flex-1" onClick={handleCreate}>
                        Create Key
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
