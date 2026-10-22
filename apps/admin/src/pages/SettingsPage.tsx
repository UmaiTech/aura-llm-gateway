import { useCallback, useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Badge } from '@/components/ui'
import { useSettingsStore } from '@/stores'
import { getGatewaySettings, updateGatewaySettings } from '@/lib/api'
import type {
  ClassifierKind,
  GatewaySettingsOverrides,
  GatewaySettingsResponse,
  RoutingMode,
  RuntimeValues,
  TierModels,
  WithinTierStrategy,
} from '@/lib/types'
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
  BalanceLine,
  Loading3Line,
  Refresh1Line,
} from '@mingcute/react'

/**
 * Settings — system-wide configuration.
 *
 * Backed by GET/PUT /admin/settings. The gateway boots from its YAML file
 * and environment; this page edits a small override document layered on
 * top (auto routing, feature flags, cache, rate limiting) that the
 * gateway applies immediately and stores in Postgres. Everything the
 * process cannot change at runtime (listen address, provider keys,
 * connections, admin auth, CORS) is shown read-only with the environment
 * variable that controls it.
 *
 * Every editable field is tri-state: "Inherit" keeps the boot value (shown
 * next to it), anything else becomes an override. Empty number fields mean
 * inherit as well.
 */

type Tab =
  | 'general'
  | 'routing'
  | 'caching'
  | 'rate-limiting'
  | 'security'
  | 'request-features'
  | 'appearance'

type Tri = 'inherit' | 'on' | 'off'

const TIERS: (keyof TierModels)[] = ['simple', 'medium', 'complex', 'reasoning']

const MODES: { value: RoutingMode; label: string }[] = [
  { value: 'cost', label: 'Cost' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'quality', label: 'Quality' },
]
const CLASSIFIERS: { value: ClassifierKind; label: string }[] = [
  { value: 'heuristic', label: 'Heuristic (rules, < 1 ms)' },
  { value: 'llm', label: 'LLM (small model call)' },
  { value: 'learned', label: 'Learned (trained weights)' },
]
const STRATEGIES: { value: WithinTierStrategy; label: string }[] = [
  { value: 'cheapest', label: 'Cheapest list price' },
  { value: 'predicted_cost', label: 'Lowest predicted cost' },
  { value: 'thompson', label: 'Thompson sampling (learned)' },
  { value: 'config_order', label: 'Config order' },
  { value: 'round_robin', label: 'Round robin' },
]

const onOff = (v: boolean) => (v ? 'on' : 'off')
const triOf = (v: boolean | undefined): Tri => (v === undefined ? 'inherit' : v ? 'on' : 'off')
const boolOf = (t: Tri): boolean | undefined => (t === 'inherit' ? undefined : t === 'on')

/** Drop empty sections so the stored document only holds real overrides. */
function prune(o: GatewaySettingsOverrides): GatewaySettingsOverrides {
  const out: GatewaySettingsOverrides = {}
  for (const key of ['routing', 'features', 'cache', 'rate_limit'] as const) {
    const section = o[key]
    if (!section) continue
    const entries = Object.entries(section).filter(([, v]) => v !== undefined)
    if (entries.length) {
      // Each section has its own shape; the filter above only removes
      // unset keys, so the cast is safe.
      out[key] = Object.fromEntries(entries) as never
    }
  }
  return out
}

function tiersEqual(a: TierModels, b: TierModels): boolean {
  return TIERS.every((t) => a[t].length === b[t].length && a[t].every((m, i) => m === b[t][i]))
}

const selectClass =
  'w-full bg-muted border-0 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring'

function TriSelect({
  value,
  boot,
  onChange,
}: {
  value: Tri
  boot: boolean
  onChange: (t: Tri) => void
}) {
  return (
    <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value as Tri)}>
      <option value="inherit">Inherit ({onOff(boot)})</option>
      <option value="on">On</option>
      <option value="off">Off</option>
    </select>
  )
}

function Field({
  label,
  hint,
  overridden,
  children,
}: {
  label: string
  hint?: React.ReactNode
  overridden?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">{label}</label>
        {overridden && (
          <Badge variant="warning" className="text-2xs">
            override
          </Badge>
        )}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ReadOnly({ label, value, env }: { label: string; value: React.ReactNode; env?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/40 last:border-0">
      <div>
        <p className="text-sm">{label}</p>
        {env && <p className="text-2xs font-mono text-muted-foreground mt-0.5">{env}</p>}
      </div>
      <div className="text-sm text-right font-mono break-all max-w-[60%]">{value}</div>
    </div>
  )
}

function StatusPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={cn('h-2 w-2 rounded-full', on ? 'bg-success' : 'bg-muted-foreground/40')} />
      {label}
    </span>
  )
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const { theme, setTheme } = useSettingsStore()

  const [data, setData] = useState<GatewaySettingsResponse | null>(null)
  const [draft, setDraft] = useState<GatewaySettingsOverrides>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getGatewaySettings()
      setData(res)
      setDraft(prune(res.overrides))
      setWarnings(res.warnings ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const boot: RuntimeValues | null = data?.boot ?? null
  const effective: RuntimeValues | null = data?.effective ?? null

  const dirty = useMemo(
    () => (data ? JSON.stringify(prune(draft)) !== JSON.stringify(prune(data.overrides)) : false),
    [draft, data]
  )

  const save = async (overrides: GatewaySettingsOverrides) => {
    setSaving(true)
    setError(null)
    try {
      const res = await updateGatewaySettings(prune(overrides))
      setData(res)
      setDraft(prune(res.overrides))
      setWarnings(res.warnings ?? [])
      setSavedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // Section updaters keep the draft tidy: setting a value to undefined
  // removes the override.
  const setRouting = (patch: NonNullable<GatewaySettingsOverrides['routing']>) =>
    setDraft((d) => ({ ...d, routing: { ...d.routing, ...patch } }))
  const setFeatures = (patch: NonNullable<GatewaySettingsOverrides['features']>) =>
    setDraft((d) => ({ ...d, features: { ...d.features, ...patch } }))
  const setCache = (patch: NonNullable<GatewaySettingsOverrides['cache']>) =>
    setDraft((d) => ({ ...d, cache: { ...d.cache, ...patch } }))
  const setRateLimit = (patch: NonNullable<GatewaySettingsOverrides['rate_limit']>) =>
    setDraft((d) => ({ ...d, rate_limit: { ...d.rate_limit, ...patch } }))

  const numberField = (
    raw: number | undefined,
    onChange: (v: number | undefined) => void,
    bootValue: number,
    opts?: { min?: number; step?: number }
  ) => (
    <Input
      type="number"
      min={opts?.min}
      step={opts?.step}
      value={raw ?? ''}
      placeholder={`Inherit (${bootValue})`}
      onChange={(e) => {
        const v = e.target.value.trim()
        if (v === '') return onChange(undefined)
        const n = Number(v)
        onChange(Number.isFinite(n) ? n : undefined)
      }}
    />
  )

  const tabs: { id: Tab; name: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'general', name: 'General', icon: Settings1Line },
    { id: 'routing', name: 'Auto Routing', icon: BalanceLine },
    { id: 'caching', name: 'Caching', icon: ServerLine },
    { id: 'rate-limiting', name: 'Rate Limiting', icon: FlashLine },
    { id: 'security', name: 'Security', icon: ShieldLine },
    { id: 'request-features', name: 'Request Features', icon: CheckLine },
    { id: 'appearance', name: 'Appearance', icon: PaletteLine },
  ]

  const editable = activeTab !== 'appearance' && activeTab !== 'security' && activeTab !== 'request-features'

  const routingTiers: TierModels | undefined = draft.routing?.tiers
  const tiersCustomized = routingTiers !== undefined

  return (
    <div className="flex flex-col">
      <Header
        title="Settings"
        description="System-wide configuration"
        actions={
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <Refresh1Line className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        }
      />

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

          {effective && (
            <div className="mt-6 pt-4 border-t border-border/40 space-y-2 px-1">
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">Live</p>
              <StatusPill on={effective.routing.enabled && effective.routing.available} label="Auto routing" />
              <StatusPill on={effective.features.payload_capture} label="Payload capture" />
              <StatusPill on={effective.cache.available && effective.cache.enabled} label="Response cache" />
              <StatusPill on={effective.rate_limit.available && effective.rate_limit.enabled} label="Rate limiting" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-2xl space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
            )}
            {warnings.length > 0 && (
              <div className="p-3 rounded-lg bg-warning/10 text-warning text-sm space-y-1">
                {warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            )}
            {data && !data.persisted && activeTab !== 'appearance' && (
              <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                No database is configured, so overrides saved here last until the gateway restarts.
              </div>
            )}

            {loading && !data && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loading3Line className="h-4 w-4 animate-spin" /> Loading gateway settings...
              </div>
            )}

            {activeTab === 'general' && data && boot && effective && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Gateway</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ReadOnly label="Version" value={data.environment.version} />
                    <ReadOnly
                      label="Listen address"
                      value={`${data.environment.host}:${data.environment.port}`}
                      env="AURA_HOST / AURA_PORT"
                    />
                    <ReadOnly
                      label="Config file"
                      value={data.environment.config_file ?? <span className="text-muted-foreground">none (environment only)</span>}
                      env="AURA_CONFIG_FILE"
                    />
                    <ReadOnly label="Log level" value={data.environment.log_level} env="RUST_LOG" />
                    <ReadOnly
                      label="Database"
                      value={
                        <Badge variant={data.environment.database_connected ? 'success' : 'muted'}>
                          {data.environment.database_connected ? 'connected' : 'not configured'}
                        </Badge>
                      }
                      env="DATABASE_URL"
                    />
                    <ReadOnly
                      label="Redis"
                      value={
                        <Badge variant={data.environment.redis_connected ? 'success' : 'muted'}>
                          {data.environment.redis_connected ? 'connected' : 'not configured'}
                        </Badge>
                      }
                      env="REDIS_URL"
                    />
                    <ReadOnly
                      label="Providers"
                      value={
                        data.environment.providers.length
                          ? `${data.environment.providers.join(', ')} · ${data.environment.model_count} models`
                          : 'none'
                      }
                      env="*_API_KEY"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Features</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Field
                      label="Payload capture"
                      overridden={draft.features?.payload_capture !== undefined}
                      hint={
                        <>
                          Top-level switch for storing raw request/response bodies. Organizations still
                          opt in on their own page. Boot value from{' '}
                          <code className="font-mono">AURA_PAYLOAD_CAPTURE</code>.
                        </>
                      }
                    >
                      <TriSelect
                        value={triOf(draft.features?.payload_capture)}
                        boot={boot.features.payload_capture}
                        onChange={(t) => setFeatures({ payload_capture: boolOf(t) })}
                      />
                    </Field>
                    <Field
                      label="Tool-context replay"
                      overridden={draft.features?.replay_tool_context !== undefined}
                      hint={
                        <>
                          Re-synthesize prior assistant tool calls from{' '}
                          <code className="font-mono">previous_response_id</code> on tool roundtrips.
                          Boot value from <code className="font-mono">AURA_REPLAY_TOOL_CONTEXT</code>.
                        </>
                      }
                    >
                      <TriSelect
                        value={triOf(draft.features?.replay_tool_context)}
                        boot={boot.features.replay_tool_context}
                        onChange={(t) => setFeatures({ replay_tool_context: boolOf(t) })}
                      />
                    </Field>
                  </CardContent>
                </Card>
              </>
            )}

            {activeTab === 'routing' && data && boot && effective && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>Auto model routing</span>
                      <Badge variant={effective.routing.enabled && effective.routing.available ? 'success' : 'muted'}>
                        {!effective.routing.available
                          ? 'no servable models'
                          : effective.routing.enabled
                            ? 'live'
                            : effective.routing.shadow_for_pinned_models
                              ? 'shadow only'
                              : 'off'}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                      <code className="font-mono">model: "auto"</code> scores each request and dispatches to the
                      cheapest capable model in a tier. Gateway-wide values here; organizations can override them
                      on their own page and requests can override both.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field
                        label="Enabled"
                        overridden={draft.routing?.enabled !== undefined}
                        hint={
                          <>
                            Accept <code className="font-mono">model: "auto"</code>. Boot value from{' '}
                            <code className="font-mono">AURA_AUTO_ROUTING</code>.
                          </>
                        }
                      >
                        <TriSelect
                          value={triOf(draft.routing?.enabled)}
                          boot={boot.routing.enabled}
                          onChange={(t) => setRouting({ enabled: boolOf(t) })}
                        />
                      </Field>
                      <Field
                        label="Shadow-score pinned models"
                        overridden={draft.routing?.shadow_for_pinned_models !== undefined}
                        hint="Record what auto would have picked for pinned-model traffic (savings report)."
                      >
                        <TriSelect
                          value={triOf(draft.routing?.shadow_for_pinned_models)}
                          boot={boot.routing.shadow_for_pinned_models}
                          onChange={(t) => setRouting({ shadow_for_pinned_models: boolOf(t) })}
                        />
                      </Field>
                      <Field label="Default mode" overridden={draft.routing?.default_mode !== undefined}>
                        <select
                          className={selectClass}
                          value={draft.routing?.default_mode ?? 'inherit'}
                          onChange={(e) =>
                            setRouting({
                              default_mode:
                                e.target.value === 'inherit' ? undefined : (e.target.value as RoutingMode),
                            })
                          }
                        >
                          <option value="inherit">Inherit ({boot.routing.default_mode})</option>
                          {MODES.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Default classifier" overridden={draft.routing?.default_classifier !== undefined}>
                        <select
                          className={selectClass}
                          value={draft.routing?.default_classifier ?? 'inherit'}
                          onChange={(e) =>
                            setRouting({
                              default_classifier:
                                e.target.value === 'inherit' ? undefined : (e.target.value as ClassifierKind),
                            })
                          }
                        >
                          <option value="inherit">Inherit ({boot.routing.default_classifier})</option>
                          {CLASSIFIERS.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Within-tier selection" overridden={draft.routing?.within_tier !== undefined}>
                        <select
                          className={selectClass}
                          value={draft.routing?.within_tier ?? 'inherit'}
                          onChange={(e) =>
                            setRouting({
                              within_tier:
                                e.target.value === 'inherit' ? undefined : (e.target.value as WithinTierStrategy),
                            })
                          }
                        >
                          <option value="inherit">Inherit ({boot.routing.within_tier})</option>
                          {STRATEGIES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field
                        label="Sticky tool loops"
                        overridden={draft.routing?.sticky_tool_loops !== undefined}
                        hint="Keep the previous turn's model while a tool loop is running."
                      >
                        <TriSelect
                          value={triOf(draft.routing?.sticky_tool_loops)}
                          boot={boot.routing.sticky_tool_loops}
                          onChange={(t) => setRouting({ sticky_tool_loops: boolOf(t) })}
                        />
                      </Field>
                      <Field
                        label="Escalation on provider failure"
                        overridden={draft.routing?.escalation_enabled !== undefined}
                        hint="Retry the next candidate, then one tier up, after a provider error."
                      >
                        <TriSelect
                          value={triOf(draft.routing?.escalation_enabled)}
                          boot={boot.routing.escalation_enabled}
                          onChange={(t) => setRouting({ escalation_enabled: boolOf(t) })}
                        />
                      </Field>
                      <Field
                        label="LLM classifier model"
                        overridden={draft.routing?.llm_classifier_model !== undefined}
                        hint="Used when the classifier is llm."
                      >
                        <Input
                          value={draft.routing?.llm_classifier_model ?? ''}
                          placeholder={`Inherit (${boot.routing.llm_classifier_model})`}
                          onChange={(e) =>
                            setRouting({ llm_classifier_model: e.target.value === '' ? undefined : e.target.value })
                          }
                        />
                      </Field>
                      <Field
                        label="Gold sample rate"
                        overridden={draft.routing?.gold_sample_rate !== undefined}
                        hint="Share of requests (0–1) answered by the cheapest and strongest tier and judged, for training labels. Costs two extra completions per sample."
                      >
                        {numberField(
                          draft.routing?.gold_sample_rate,
                          (v) => setRouting({ gold_sample_rate: v }),
                          boot.routing.gold_sample_rate,
                          { min: 0, step: 0.001 }
                        )}
                      </Field>
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      Boundaries {boot.routing.boundaries.simple_medium} / {boot.routing.boundaries.medium_complex} /{' '}
                      {boot.routing.boundaries.complex_reasoning}, mode offsets cost {boot.routing.mode_offsets.cost} ·
                      quality +{boot.routing.mode_offsets.quality}. Scorer weights and boundaries are set in the config
                      file.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>Tier candidates</span>
                      <div className="flex items-center gap-2">
                        {tiersCustomized && (
                          <Badge variant="warning" className="text-2xs">
                            override
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setRouting({
                              tiers: tiersCustomized ? undefined : structuredClone(boot.routing.tiers),
                            })
                          }
                        >
                          {tiersCustomized ? 'Use boot lists' : 'Customize'}
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Models per tier in preference order, one per line. Models this gateway cannot serve
                      (no provider key) are dropped when the router is rebuilt and listed below.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {TIERS.map((tier) => {
                        const list = tiersCustomized ? routingTiers[tier] : effective.routing.tiers[tier]
                        return (
                          <div key={tier} className="space-y-1">
                            <label className="text-xs uppercase tracking-wide text-muted-foreground">{tier}</label>
                            <textarea
                              className={cn(selectClass, 'font-mono text-xs min-h-[88px] disabled:opacity-70')}
                              value={list.join('\n')}
                              disabled={!tiersCustomized}
                              onChange={(e) => {
                                if (!routingTiers) return
                                setRouting({
                                  tiers: { ...routingTiers, [tier]: e.target.value.split('\n') },
                                })
                              }}
                              onBlur={(e) => {
                                if (!routingTiers) return
                                setRouting({
                                  tiers: {
                                    ...routingTiers,
                                    [tier]: e.target.value
                                      .split('\n')
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  },
                                })
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>
                    {data.environment.dropped_tier_models.length > 0 && (
                      <p className="text-xs text-warning">
                        Not servable here: {data.environment.dropped_tier_models.join(', ')}
                      </p>
                    )}
                    {!tiersCustomized && !tiersEqual(boot.routing.tiers, effective.routing.tiers) && (
                      <p className="text-2xs text-muted-foreground">
                        Showing the pruned lists in use; the boot config lists more models than this gateway can serve.
                      </p>
                    )}
                    <p className="text-2xs text-muted-foreground">
                      Learned classifier: {data.environment.learned_classifier ?? 'none'} · cost model:{' '}
                      {data.environment.cost_model ?? 'none'}. Train and activate them under Routing.
                    </p>
                  </CardContent>
                </Card>
              </>
            )}

            {activeTab === 'caching' && data && boot && effective && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Response caching</span>
                    <Badge variant={effective.cache.available ? (effective.cache.enabled ? 'success' : 'muted') : 'warning'}>
                      {!effective.cache.available ? 'needs Redis' : effective.cache.enabled ? 'on' : 'off'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Identical non-streaming requests are answered from Redis. Requests with{' '}
                    <code className="font-mono">temperature &gt; 0</code>, tools or the{' '}
                    <code className="font-mono">X-Cache-Bypass</code> header skip the cache. Requires{' '}
                    <code className="font-mono">REDIS_URL</code>.
                  </p>
                  <Field label="Enabled" overridden={draft.cache?.enabled !== undefined}>
                    <TriSelect
                      value={triOf(draft.cache?.enabled)}
                      boot={boot.cache.enabled}
                      onChange={(t) => setCache({ enabled: boolOf(t) })}
                    />
                  </Field>
                  <Field
                    label="Cache TTL (seconds)"
                    overridden={draft.cache?.default_ttl_secs !== undefined}
                    hint="How long a cached response is served. 1 second to 7 days."
                  >
                    {numberField(
                      draft.cache?.default_ttl_secs,
                      (v) => setCache({ default_ttl_secs: v }),
                      boot.cache.default_ttl_secs,
                      { min: 1, step: 1 }
                    )}
                  </Field>
                  {!effective.cache.available && (
                    <p className="text-xs text-warning">
                      Redis is not connected, so caching is inactive regardless of these values.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {activeTab === 'rate-limiting' && data && boot && effective && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Rate limiting</span>
                    <Badge
                      variant={
                        effective.rate_limit.available ? (effective.rate_limit.enabled ? 'success' : 'muted') : 'warning'
                      }
                    >
                      {!effective.rate_limit.available ? 'needs Redis' : effective.rate_limit.enabled ? 'on' : 'off'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Limits are per API key: requests per minute and an optional daily message cap, both set on
                    the key under API Keys. These values apply to keys without their own limit. Requires{' '}
                    <code className="font-mono">REDIS_URL</code>.
                  </p>
                  <Field label="Enabled" overridden={draft.rate_limit?.enabled !== undefined}>
                    <TriSelect
                      value={triOf(draft.rate_limit?.enabled)}
                      boot={boot.rate_limit.enabled}
                      onChange={(t) => setRateLimit({ enabled: boolOf(t) })}
                    />
                  </Field>
                  <Field
                    label="Default requests per minute"
                    overridden={draft.rate_limit?.default_rpm !== undefined}
                    hint="For keys with no rate_limit_rpm of their own."
                  >
                    {numberField(
                      draft.rate_limit?.default_rpm,
                      (v) => setRateLimit({ default_rpm: v }),
                      boot.rate_limit.default_rpm,
                      { min: 1, step: 1 }
                    )}
                  </Field>
                  {!effective.rate_limit.available && (
                    <p className="text-xs text-warning">
                      Redis is not connected, so no limits are enforced regardless of these values.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {activeTab === 'security' && data && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Admin authentication</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ReadOnly
                      label="Mode"
                      value={
                        <Badge
                          variant={
                            data.environment.admin_auth === 'key'
                              ? 'success'
                              : data.environment.admin_auth === 'open'
                                ? 'destructive'
                                : 'warning'
                          }
                        >
                          {data.environment.admin_auth === 'key'
                            ? 'bearer key'
                            : data.environment.admin_auth === 'open'
                              ? 'unauthenticated (dev only)'
                              : 'blocked — no key set'}
                        </Badge>
                      }
                      env="AURA_ADMIN_KEY / AURA_ADMIN_NO_AUTH"
                    />
                    <p className="text-xs text-muted-foreground pt-3">
                      The admin key is a deployment secret and cannot be changed from here. Rotate it in the
                      environment and sign in again.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">CORS</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ReadOnly
                      label="Allowed origins"
                      value={
                        data.environment.cors_allowed_origins.length ? (
                          <div className="space-y-0.5">
                            {data.environment.cors_allowed_origins.map((o) => (
                              <div key={o}>{o}</div>
                            ))}
                          </div>
                        ) : (
                          <Badge variant="warning">any origin (permissive)</Badge>
                        )
                      }
                      env="AURA_CORS_ALLOWED_ORIGINS"
                    />
                    <p className="text-xs text-muted-foreground pt-3">
                      The CORS layer is built once at start-up from a comma-separated origin list. Change the
                      variable and redeploy.
                    </p>
                  </CardContent>
                </Card>
              </>
            )}

            {activeTab === 'request-features' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Validation, consistency and compression</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    These are per-request opt-ins, not gateway-wide switches. A client turns them on by sending{' '}
                    <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">validation</code>,{' '}
                    <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">consistency</code> or{' '}
                    <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">compression</code> objects on{' '}
                    <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">POST /v1/responses</code>; the
                    gateway has no default that would add cost or latency to requests that did not ask for it.
                  </p>
                  <p>
                    Live usage of each feature is on the{' '}
                    <a href="/features" className="text-primary hover:underline">
                      Features
                    </a>{' '}
                    page. Reference:{' '}
                    <a
                      href="https://docs.aura-llm.dev"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      docs.aura-llm.dev
                    </a>
                    .
                  </p>
                </CardContent>
              </Card>
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
                  <p className="text-xs text-muted-foreground pt-3">Stored in this browser only.</p>
                </CardContent>
              </Card>
            )}

            {editable && data && (
              <div className="flex items-center gap-3">
                <Button variant="gradient" onClick={() => void save(draft)} disabled={saving || !dirty}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void save({})}
                  disabled={saving || Object.keys(prune(data.overrides)).length === 0}
                >
                  Reset all overrides
                </Button>
                {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
                {!dirty && savedAt && (
                  <span className="text-xs text-success">Saved and applied · {new Date(savedAt).toLocaleTimeString()}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
