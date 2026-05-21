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
  Refresh1Line,
} from '@mingcute/react'
import { getApiKeys } from '@/lib/api'
import { useOrgFilterStore } from '@/stores/orgFilterStore'
import { OrgFilter } from '@/components/OrgFilter'
import type { ApiKeySummary } from '@/lib/types'

export function KeysPage() {
  const selectedOrgId = useOrgFilterStore((s) => s.selectedOrgId)
  const [keys, setKeys] = useState<ApiKeySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyRateLimit, setNewKeyRateLimit] = useState('1000')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  const fetchKeys = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getApiKeys(selectedOrgId)
      setKeys(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch API keys')
    } finally {
      setLoading(false)
    }
  }

  // Re-fetch when org filter changes — same loading state, no flicker
  // beyond what we already show on page load.
  useEffect(() => {
    fetchKeys()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId])

  useEffect(() => {
    if (tableRef.current && !loading) {
      const rows = tableRef.current.querySelectorAll('.key-row')
      animateStaggered(rows, 'fadeInUp', 50)
    }
  }, [keys, loading])

  const filteredKeys = keys.filter(
    (key) =>
      key.name.toLowerCase().includes(search.toLowerCase()) ||
      key.key_id.toLowerCase().includes(search.toLowerCase())
  )

  const handleCopy = async (key: ApiKeySummary) => {
    await copyToClipboard(key.key_id)
    setCopiedId(key.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleCreate = () => {
    // TODO: Implement actual API call to create key
    const newKeyId = `aura_live_${Math.random().toString(36).substring(2, 14)}`
    setCreatedKey(newKeyId)
    setNewKeyName('')
    setNewKeyRateLimit('1000')
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>
      case 'inactive':
        return <Badge variant="muted">Inactive</Badge>
      case 'revoked':
        return <Badge variant="destructive">Revoked</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`
    return tokens.toString()
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="API Keys" description="Manage your gateway API keys" />
        <div className="flex-1 flex items-center justify-center">
          <Refresh1Line className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <Header title="API Keys" description="Manage your gateway API keys" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-red-400">{error}</p>
          <Button onClick={fetchKeys}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="API Keys"
        description="Manage your gateway API keys"
        actions={
          <div className="flex gap-2 items-center">
            <OrgFilter />
            <Button variant="outline" size="sm" onClick={fetchKeys}>
              <Refresh1Line className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <AddLine className="h-4 w-4" />
              Create Key
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
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
                    <th className="p-4 font-medium text-right">Tokens</th>
                    <th className="p-4 font-medium text-right">Cost</th>
                    <th className="p-4 font-medium">Last Used</th>
                    <th className="p-4 font-medium text-right">Rate Limit</th>
                    <th className="p-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKeys.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-muted-foreground">
                        {keys.length === 0
                          ? 'No API keys found. Create one to get started.'
                          : 'No keys match your search.'}
                      </td>
                    </tr>
                  ) : (
                    filteredKeys.map((key) => (
                      <tr key={key.id} className="key-row border-b border-border/50 hover:bg-muted/50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-primary/10 p-2">
                              <Key2Line className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{key.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Created {formatRelativeTime(key.created_at)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                              {key.key_id.substring(0, 15)}...
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
                          {formatNumber(key.total_requests)}
                        </td>
                        <td className="p-4 text-right font-mono text-sm">
                          {formatTokens(key.total_input_tokens + key.total_output_tokens)}
                        </td>
                        <td className="p-4 text-right font-mono text-sm">
                          {formatCurrency(key.total_cost)}
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {key.last_used_at ? formatRelativeTime(key.last_used_at) : 'Never'}
                        </td>
                        <td className="p-4 text-right font-mono text-sm">
                          {key.rate_limit_rpm ? `${formatNumber(key.rate_limit_rpm)}/min` : '-'}
                        </td>
                        <td className="p-4">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <DeleteLine className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Usage Progress for keys with limits */}
        {keys.some(k => k.monthly_token_limit) && (
          <Card>
            <CardHeader>
              <CardTitle>Token Limits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {keys
                  .filter(k => k.monthly_token_limit)
                  .map((key) => (
                    <div key={key.id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{key.name}</span>
                        <span className="text-muted-foreground">
                          {formatTokens(key.current_month_tokens)} / {formatTokens(key.monthly_token_limit || 0)}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            (key.usage_percentage || 0) > 90
                              ? 'bg-red-500'
                              : (key.usage_percentage || 0) > 75
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(key.usage_percentage || 0, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

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
                        fetchKeys() // Refresh the list
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
