import { useState } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui'
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
} from '@mingcute/react'

type Tab = 'general' | 'rate-limiting' | 'caching' | 'security' | 'appearance'

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const { theme, setTheme } = useSettingsStore()

  const tabs: { id: Tab; name: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'general', name: 'General', icon: Settings1Line },
    { id: 'rate-limiting', name: 'Rate Limiting', icon: FlashLine },
    { id: 'caching', name: 'Caching', icon: ServerLine },
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
                        <option value="gpt-4o">gpt-4o</option>
                        <option value="claude-3-opus">claude-3-opus</option>
                        <option value="gemini-pro">gemini-pro</option>
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
