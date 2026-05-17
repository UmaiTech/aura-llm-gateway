import { useState } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Badge } from '@/components/ui'
import { useSettingsStore } from '@/stores'
import { cn } from '@/lib/utils'
import {
  Settings1Line,
  ShieldLine,
  FlashLine,
  ServerLine,
  PaletteLine,
  SunLine,
  MoonLine,
  ComputerLine,
  CheckLine,
  FileZipLine,
  BalanceLine,
} from '@mingcute/react'

type Tab = 'general' | 'rate-limiting' | 'caching' | 'validation' | 'consistency' | 'compression' | 'security' | 'appearance'

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const { theme, setTheme } = useSettingsStore()

  const tabs: { id: Tab; name: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'general', name: 'General', icon: Settings1Line },
    { id: 'rate-limiting', name: 'Rate Limiting', icon: FlashLine },
    { id: 'caching', name: 'Caching', icon: ServerLine },
    { id: 'validation', name: 'Validation', icon: CheckLine },
    { id: 'consistency', name: 'Consistency', icon: BalanceLine },
    { id: 'compression', name: 'Compression', icon: FileZipLine },
    { id: 'security', name: 'Security', icon: ShieldLine },
    { id: 'appearance', name: 'Appearance', icon: PaletteLine },
  ]

  return (
    <div className="flex flex-col">
      <Header title="Settings" description="System-wide configuration" />

      <div className="flex-1 flex">
        {/* Tabs */}
        <div className="w-56 border-r bg-card/50 p-4 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
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
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-2xl space-y-6">
            {activeTab === 'general' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Gateway Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Gateway Name</label>
                      <Input defaultValue="Aura LLM Gateway" />
                      <p className="text-xs text-muted-foreground">Display name for your gateway instance</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Default Model</label>
                      <select className="w-full bg-muted border-0 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring">
                        <option value="gpt-5.4-mini">gpt-5.4-mini</option>
                        <option value="gpt-5.5">gpt-5.5</option>
                        <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                        <option value="claude-opus-4-7">claude-opus-4-7</option>
                        <option value="gemini-3-pro">gemini-3-pro</option>
                        <option value="gpt-4o">gpt-4o (legacy)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Request Timeout (seconds)</label>
                      <Input type="number" defaultValue="120" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Logging</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-sm">Enable request logging</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-sm">Log full request/response payloads</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="rounded" />
                      <span className="text-sm">Enable debug mode</span>
                    </label>
                  </CardContent>
                </Card>
              </>
            )}

            {activeTab === 'rate-limiting' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Rate Limiting</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Global Rate Limit (requests/minute)</label>
                    <Input type="number" defaultValue="1000" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Burst Size</label>
                    <Input type="number" defaultValue="50" />
                    <p className="text-xs text-muted-foreground">Maximum requests allowed in a burst</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Per-Key Rate Limit</label>
                    <Input type="number" defaultValue="100" />
                  </div>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm">Enable rate limiting</span>
                  </label>
                </CardContent>
              </Card>
            )}

            {activeTab === 'caching' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Response Caching</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm">Enable response caching</span>
                  </label>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Cache TTL (seconds)</label>
                    <Input type="number" defaultValue="3600" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Max Cache Size (MB)</label>
                    <Input type="number" defaultValue="512" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Cache Bypass Header</label>
                    <Input defaultValue="X-Cache-Bypass" />
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'validation' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Request Validation</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-sm">Enable request validation</span>
                    </label>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Validation Strategy</label>
                      <select className="w-full bg-muted border-0 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring">
                        <option value="strict">Strict - Reject invalid requests</option>
                        <option value="lenient">Lenient - Warn but allow</option>
                        <option value="none">None - No validation</option>
                      </select>
                      <p className="text-xs text-muted-foreground">How to handle requests that don't match the schema</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max Input Tokens</label>
                      <Input type="number" defaultValue="128000" />
                      <p className="text-xs text-muted-foreground">Maximum tokens allowed in a single request</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max Output Tokens</label>
                      <Input type="number" defaultValue="16000" />
                    </div>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-sm">Validate tool definitions</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-sm">Validate JSON schemas in tool parameters</span>
                    </label>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Content Filtering</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="rounded" />
                      <span className="text-sm">Enable content filtering</span>
                    </label>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Blocked Keywords</label>
                      <Input placeholder="Enter comma-separated keywords" />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {activeTab === 'consistency' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Response Consistency</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Consistency Strategy</label>
                    <select className="w-full bg-muted border-0 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring">
                      <option value="none">None - Default provider behavior</option>
                      <option value="deterministic">Deterministic - Force temperature=0</option>
                      <option value="seed">Seed-based - Use consistent seed values</option>
                    </select>
                    <p className="text-xs text-muted-foreground">Control response reproducibility across requests</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Default Seed</label>
                    <Input type="number" placeholder="12345" />
                    <p className="text-xs text-muted-foreground">Used when seed-based consistency is enabled</p>
                  </div>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="rounded" />
                    <span className="text-sm">Log seed values for reproducibility</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="rounded" />
                    <span className="text-sm">Override user-provided temperature when deterministic</span>
                  </label>

                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      <strong>Note:</strong> Consistency settings affect cacheability. Deterministic responses are more likely to cache effectively.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'compression' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Response Compression</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm">Enable response compression</span>
                  </label>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Compression Algorithm</label>
                    <select className="w-full bg-muted border-0 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring">
                      <option value="gzip">gzip (recommended)</option>
                      <option value="br">Brotli</option>
                      <option value="deflate">Deflate</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Compression Level</label>
                    <Input type="number" defaultValue="6" min="1" max="9" />
                    <p className="text-xs text-muted-foreground">1 (fastest) to 9 (best compression)</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Minimum Size (bytes)</label>
                    <Input type="number" defaultValue="1024" />
                    <p className="text-xs text-muted-foreground">Only compress responses larger than this</p>
                  </div>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm">Include compression metadata in response</span>
                  </label>

                  <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Compression Stats (24h)</span>
                      <Badge variant="success">Active</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-lg font-semibold">42%</p>
                        <p className="text-xs text-muted-foreground">Avg Ratio</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold">1.2 GB</p>
                        <p className="text-xs text-muted-foreground">Data Saved</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold">12ms</p>
                        <p className="text-xs text-muted-foreground">Avg Overhead</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'security' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">CORS Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Allowed Origins</label>
                      <Input defaultValue="*" />
                      <p className="text-xs text-muted-foreground">Comma-separated list of origins, or * for all</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Allowed Methods</label>
                      <Input defaultValue="GET, POST, OPTIONS" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Admin Authentication</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Admin Key</label>
                      <Input type="password" placeholder="••••••••••••••••" />
                      <p className="text-xs text-muted-foreground">Set via AURA_ADMIN_KEY environment variable</p>
                    </div>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-sm">Require admin key for admin endpoints</span>
                    </label>
                  </CardContent>
                </Card>
              </>
            )}

            {activeTab === 'appearance' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Theme</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3">
                    {[
                      { id: 'light' as const, name: 'Light', icon: SunLine },
                      { id: 'dark' as const, name: 'Dark', icon: MoonLine },
                      { id: 'system' as const, name: 'System', icon: ComputerLine },
                    ].map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setTheme(option.id)}
                        className={cn(
                          'flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors',
                          theme === option.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        <option.icon className="h-6 w-6" />
                        <span className="text-sm font-medium">{option.name}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Button variant="gradient">Save Changes</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
