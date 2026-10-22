import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { cn, formatCurrency, formatNumber, formatRelativeTime } from '@/lib/utils'
import { Loading3Line, Refresh1Line } from '@mingcute/react'
import {
  activateRouterModel,
  deactivateRouterModels,
  getRouterModels,
  getRoutingArms,
  getRoutingGold,
  getRoutingTimeline,
  reloadRouterModels,
  type RouterModelSummary,
  type RouterModelsResponse,
  type RoutingArmStat,
  type RoutingGoldSummary,
  type RoutingTimeline,
  type RoutingTimelinePoint,
} from '@/lib/routing'
import { TIER_ORDER, TIER_TONE, formatReward } from './format'

const MODEL_KIND_LABEL: Record<string, string> = {
  learned_lr: 'Tier classifier',
  cost_lr: 'Cost model',
}

function bucketLabel(iso: string, bucket: 'hour' | 'day'): string {
  const d = new Date(iso)
  if (bucket === 'hour') return `${d.getHours().toString().padStart(2, '0')}:00`
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
}

/**
 * Minimal bar chart in the admin app's existing div-based style: one
 * baseline, thin bars, hover tooltip per bucket. Values may be negative
 * (bars hang below a zero line).
 */
function BarChart({
  points,
  bucket,
  series,
  tooltip,
  height = 120,
}: {
  points: RoutingTimelinePoint[]
  bucket: 'hour' | 'day'
  series: Array<{ key: string; value: (p: RoutingTimelinePoint) => number | null; className: string }>
  tooltip: (p: RoutingTimelinePoint) => React.ReactNode
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  // Stacked totals for positive values; negative values are drawn alone.
  const totals = points.map((p) => series.reduce((acc, s) => acc + Math.max(0, s.value(p) ?? 0), 0))
  const negatives = points.map((p) => series.reduce((acc, s) => acc + Math.min(0, s.value(p) ?? 0), 0))
  const maxPos = Math.max(0, ...totals)
  const maxNeg = Math.max(0, ...negatives.map((v) => -v))
  const range = maxPos + maxNeg || 1
  const zero = (maxPos / range) * height
  const labelEvery = Math.max(1, Math.ceil(points.length / 8))

  return (
    <div>
      <div className="relative flex items-stretch gap-[2px]" style={{ height }}>
        {maxNeg > 0 && (
          <div className="pointer-events-none absolute inset-x-0 border-t border-border" style={{ top: zero }} />
        )}
        {points.map((p, i) => (
          <div
            key={p.bucket}
            className="relative flex-1"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2">
                <div className="whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                  <div className="mb-1 font-medium">{new Date(p.bucket).toLocaleString()}</div>
                  <div className="space-y-0.5 text-muted-foreground">{tooltip(p)}</div>
                </div>
              </div>
            )}
            {/* positive stack, anchored on the zero line */}
            <div
              className={cn(
                'absolute inset-x-0 flex flex-col-reverse gap-[2px] transition-opacity',
                hover !== null && hover !== i && 'opacity-40',
              )}
              style={{ bottom: height - zero }}
            >
              {series.map((s) => {
                const v = s.value(p) ?? 0
                if (v <= 0) return null
                return (
                  <div
                    key={s.key}
                    className={cn('w-full first:rounded-b-none last:rounded-t', s.className)}
                    style={{ height: Math.max(1, (v / range) * height) }}
                  />
                )
              })}
            </div>
            {/* negative values hang below the zero line */}
            <div
              className={cn('absolute inset-x-0', hover !== null && hover !== i && 'opacity-40')}
              style={{ top: zero }}
            >
              {series.map((s) => {
                const v = s.value(p) ?? 0
                if (v >= 0) return null
                return (
                  <div
                    key={s.key}
                    className={cn('w-full rounded-b', s.className)}
                    style={{ height: Math.max(1, (-v / range) * height) }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-muted-foreground">
        {points.map((p, i) => (
          <div key={p.bucket} className="flex-1 overflow-visible whitespace-nowrap text-center">
            {i % labelEvery === 0 ? bucketLabel(p.bucket, bucket) : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

function Legend({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      {items.map(([label, cls]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-sm', cls)} />
          {label}
        </span>
      ))}
    </div>
  )
}

function TimelinePanels({ timeline }: { timeline: RoutingTimeline }) {
  const pts = timeline.points
  if (pts.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No live auto-router decisions in this window.
      </p>
    )
  }
  const scored = pts.reduce((a, p) => a + p.scored, 0)
  const weightedReward = scored
    ? pts.reduce((a, p) => a + (p.avg_reward ?? 0) * p.scored, 0) / scored
    : null
  const savings = pts.reduce((a, p) => a + p.estimated_savings, 0)
  const applied = pts.reduce((a, p) => a + p.applied, 0)
  const shadow = pts.reduce((a, p) => a + p.shadow, 0)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-medium">Decisions</div>
          <Legend items={[['applied', 'bg-primary'], ['shadow', 'bg-amber-400']]} />
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {formatNumber(applied)} applied · {formatNumber(shadow)} shadow
        </div>
        <BarChart
          points={pts}
          bucket={timeline.bucket}
          series={[
            { key: 'applied', value: (p) => p.applied, className: 'bg-primary' },
            { key: 'shadow', value: (p) => p.shadow, className: 'bg-amber-400' },
          ]}
          tooltip={(p) => (
            <>
              <div>Applied: {formatNumber(p.applied)}</div>
              <div>Shadow: {formatNumber(p.shadow)}</div>
              <div>Escalated: {formatNumber(p.escalated)}</div>
              <div>Applied cost: {formatCurrency(p.applied_cost)}</div>
            </>
          )}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Mean outcome reward</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {weightedReward === null
            ? 'no scored applied decisions yet'
            : `${formatReward(weightedReward)} over ${formatNumber(scored)} scored (−1 to +1)`}
        </div>
        <BarChart
          points={pts}
          bucket={timeline.bucket}
          series={[
            {
              key: 'reward',
              value: (p) => (p.scored > 0 ? p.avg_reward : null),
              className: 'bg-emerald-400/80',
            },
          ]}
          tooltip={(p) => (
            <>
              <div>Mean reward: {p.scored > 0 ? formatReward(p.avg_reward) : '—'}</div>
              <div>Scored: {formatNumber(p.scored)}</div>
              <div>
                move on / retry / correction / escalation: {p.move_on} / {p.retry} / {p.correction} /{' '}
                {p.escalation}
              </div>
            </>
          )}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Estimated shadow savings</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {formatCurrency(savings)} if pinned-model traffic had used auto
        </div>
        <BarChart
          points={pts}
          bucket={timeline.bucket}
          series={[{ key: 'savings', value: (p) => p.estimated_savings, className: 'bg-emerald-400' }]}
          tooltip={(p) => (
            <>
              <div>Est. savings: {formatCurrency(p.estimated_savings)}</div>
              <div>Shadow decisions: {formatNumber(p.shadow)}</div>
            </>
          )}
        />
      </div>
    </div>
  )
}

function ArmsPanel({ arms }: { arms: RoutingArmStat[] }) {
  if (arms.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No arm statistics yet. They are recomputed by the outcome rollup from scored applied decisions and
        drive <code className="text-foreground">within_tier: thompson</code>.
      </p>
    )
  }
  const byTier = TIER_ORDER.map((tier) => ({
    tier,
    arms: arms
      .filter((a) => a.tier === tier)
      .sort((a, b) => b.alpha / (b.alpha + b.beta) - a.alpha / (a.alpha + a.beta)),
  })).filter((g) => g.arms.length > 0)

  const updated = arms.reduce((a, b) => (a > b.updated_at ? a : b.updated_at), arms[0].updated_at)
  return (
    <div className="overflow-x-auto">
      <div className="mb-2 text-xs text-muted-foreground">Recomputed {formatRelativeTime(updated)}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40 text-xs text-muted-foreground">
            <th className="py-2 pr-3 text-left font-medium">Tier</th>
            <th className="py-2 pr-3 text-left font-medium">Model</th>
            <th className="min-w-[10rem] py-2 pr-3 text-left font-medium" title="Posterior mean α/(α+β) ± 1 sd">
              Posterior mean
            </th>
            <th className="py-2 pr-3 text-right font-medium">α</th>
            <th className="py-2 pr-3 text-right font-medium">β</th>
            <th className="py-2 text-right font-medium">Obs.</th>
          </tr>
        </thead>
        <tbody>
          {byTier.flatMap((g) =>
            g.arms.map((a, i) => {
              const n = a.alpha + a.beta
              const mean = a.alpha / n
              const sd = Math.sqrt((a.alpha * a.beta) / (n * n * (n + 1)))
              return (
                <tr key={`${a.tier}:${a.model}`} className="border-b border-border/20 last:border-0">
                  <td className="py-2 pr-3">
                    {i === 0 && (
                      <span
                        className={cn(
                          'inline-block rounded px-2 py-0.5 text-xs font-medium',
                          TIER_TONE[a.tier] ?? 'bg-muted text-muted-foreground',
                        )}
                      >
                        {a.tier}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs">{a.model}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="relative h-1.5 flex-1 rounded bg-muted">
                        <div
                          className="absolute inset-y-0 rounded bg-primary/30"
                          style={{
                            left: `${Math.max(0, mean - sd) * 100}%`,
                            width: `${(Math.min(1, mean + sd) - Math.max(0, mean - sd)) * 100}%`,
                          }}
                        />
                        <div
                          className="absolute -top-0.5 h-2.5 w-0.5 bg-primary"
                          style={{ left: `calc(${mean * 100}% - 1px)` }}
                        />
                      </div>
                      <span className="w-20 text-right text-xs tabular-nums">
                        {mean.toFixed(2)} ± {sd.toFixed(2)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right text-xs tabular-nums">{a.alpha.toFixed(1)}</td>
                  <td className="py-2 pr-3 text-right text-xs tabular-nums">{a.beta.toFixed(1)}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(a.observations)}</td>
                </tr>
              )
            }),
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Show the headline metrics a trainer script records, whatever their names. */
function MetricChips({ metrics }: { metrics: Record<string, unknown> }) {
  const entries = Object.entries(metrics ?? {}).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string',
  )
  if (entries.length === 0) return <span className="text-xs text-muted-foreground">no metrics</span>
  return (
    <div className="flex flex-wrap gap-1">
      {entries.slice(0, 6).map(([k, v]) => (
        <span key={k} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
          {k} {typeof v === 'number' ? (Number.isInteger(v) ? formatNumber(v) : v.toFixed(3)) : String(v)}
        </span>
      ))}
    </div>
  )
}

type PendingAction =
  | { kind: 'activate'; model: RouterModelSummary }
  | { kind: 'deactivate'; modelKind: string }

function ModelsPanel({
  models,
  onChanged,
}: {
  models: RouterModelsResponse
  onChanged: () => void
}) {
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setPending(null)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const kinds = ['learned_lr', 'cost_lr']
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {kinds.map((kind) => {
          const loaded = kind === 'learned_lr' ? models.loaded : models.loaded_cost_model
          const active = models.models.find((m) => m.kind === kind && m.is_active)
          return (
            <div key={kind} className="space-y-2 rounded-lg border border-border/40 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{MODEL_KIND_LABEL[kind]}</div>
                {loaded ? <Badge variant="success">loaded</Badge> : <Badge variant="muted">not loaded</Badge>}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {loaded ?? (kind === 'learned_lr' ? 'heuristic classifier only' : 'list prices only')}
              </div>
              {active && !loaded && (
                <div className="text-xs text-amber-400">
                  {active.name}@{active.version} is marked active but not loaded. Reload, or check the gateway
                  logs if it fails validation.
                </div>
              )}
              {active && <MetricChips metrics={active.metrics} />}
              {(loaded || active) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setPending({ kind: 'deactivate', modelKind: kind })}
                >
                  Deactivate
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {models.models.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No trained models stored. Upload one with{' '}
          <code className="text-foreground">POST /admin/routing/models</code> (see scripts/router/train.py).
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-xs text-muted-foreground">
                <th className="py-2 pr-3 text-left font-medium">Kind</th>
                <th className="py-2 pr-3 text-left font-medium">Name / version</th>
                <th className="py-2 pr-3 text-left font-medium">Metrics</th>
                <th className="py-2 pr-3 text-left font-medium">Stored</th>
                <th className="py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {models.models.map((m) => (
                <tr key={m.id} className="border-b border-border/20 last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 text-xs">{MODEL_KIND_LABEL[m.kind] ?? m.kind}</td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs">
                    {m.name}
                    <div className="text-muted-foreground">{m.version}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <MetricChips metrics={m.metrics} />
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{formatRelativeTime(m.created_at)}</td>
                  <td className="py-2 text-right">
                    {m.is_active ? (
                      <Badge variant="success">active</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setPending({ kind: 'activate', model: m })}>
                        Activate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">
                {pending.kind === 'activate' ? 'Activate model?' : 'Deactivate model?'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {pending.kind === 'activate' ? (
                  <>
                    <span className="font-mono text-foreground">
                      {pending.model.name}@{pending.model.version}
                    </span>{' '}
                    becomes the active {MODEL_KIND_LABEL[pending.model.kind]?.toLowerCase() ?? pending.model.kind}{' '}
                    and is loaded into the running gateway immediately. The currently active one of this kind is
                    deactivated.
                  </>
                ) : (
                  <>
                    The {MODEL_KIND_LABEL[pending.modelKind]?.toLowerCase()} is unloaded right away.{' '}
                    {pending.modelKind === 'learned_lr'
                      ? 'Requests asking for the learned classifier fall back to the heuristic.'
                      : 'Predicted costs and max_cost_usd fall back to list prices.'}
                  </>
                )}
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPending(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant={pending.kind === 'deactivate' ? 'destructive' : 'default'}
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      pending.kind === 'activate'
                        ? activateRouterModel(pending.model.id)
                        : deactivateRouterModels(pending.modelKind),
                    )
                  }
                >
                  {busy && <Loading3Line className="mr-2 h-4 w-4 animate-spin" />}
                  {pending.kind === 'activate' ? 'Activate' : 'Deactivate'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function GoldPanel({ gold }: { gold: RoutingGoldSummary }) {
  if (gold.total === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No gold labels yet. Live pairs are sampled from traffic when gold sampling is on; synthetic batches come
        from scripts/router/synth.py.
      </p>
    )
  }
  const judged = gold.total - gold.failed
  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(0)}%` : '—')
  const tiles: Array<[string, string, string?]> = [
    ['Total pairs', formatNumber(gold.total)],
    ['Live', formatNumber(gold.live)],
    ['Synthetic', formatNumber(gold.synthetic), `${gold.synthetic_train} train · ${gold.synthetic_holdout} holdout`],
    [
      'Synthetic agreement',
      pct(gold.synthetic_agreed, gold.synthetic),
      'ladder label = intended tier',
    ],
    ['Cheap sufficed', pct(gold.cheap_sufficed, judged), `${formatNumber(gold.ties)} ties`],
    ['Strong better', pct(gold.strong_better, judged)],
    ['Judge failures', formatNumber(gold.failed)],
  ]
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
      {tiles.map(([label, value, hint]) => (
        <div key={label}>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
          {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
        </div>
      ))}
    </div>
  )
}

function PanelError({ message }: { message: string }) {
  return <p className="py-4 text-sm text-muted-foreground">Unavailable: {message}</p>
}

/**
 * Router health: outcome / volume / savings trends, Thompson arm
 * posteriors, learned model status and gold-label coverage. Each panel
 * loads independently so one missing table doesn't blank the others.
 */
export function RouterHealth() {
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d')
  const [timeline, setTimeline] = useState<RoutingTimeline | null>(null)
  const [arms, setArms] = useState<RoutingArmStat[] | null>(null)
  const [models, setModels] = useState<RouterModelsResponse | null>(null)
  const [gold, setGold] = useState<RoutingGoldSummary | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [reloading, setReloading] = useState(false)

  const settle = <T,>(key: string, p: Promise<T>, set: (v: T) => void) =>
    p
      .then((v) => {
        set(v)
        setErrors((e) => {
          const { [key]: _drop, ...rest } = e
          return rest
        })
      })
      .catch((err) => setErrors((e) => ({ ...e, [key]: err instanceof Error ? err.message : 'failed' })))

  const loadModels = useCallback(() => settle('models', getRouterModels(), setModels), [])

  const loadStatic = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([
      settle('arms', getRoutingArms(), setArms),
      loadModels(),
      settle('gold', getRoutingGold(), (g) => setGold(g.summary)),
    ])
    setRefreshing(false)
  }, [loadModels])

  useEffect(() => {
    loadStatic()
  }, [loadStatic])

  useEffect(() => {
    settle('timeline', getRoutingTimeline(period), setTimeline)
  }, [period])

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base font-medium">Router health</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Live traffic only. Rewards come from outcome signals scored by the rollup.
            </p>
          </div>
          <div className="flex items-center gap-1">
            {(['24h', '7d', '30d'] as const).map((p) => (
              <Button key={p} size="sm" variant={period === p ? 'secondary' : 'ghost'} onClick={() => setPeriod(p)}>
                {p}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {errors.timeline ? (
            <PanelError message={errors.timeline} />
          ) : timeline ? (
            <TimelinePanels timeline={timeline} />
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-medium">Thompson arms</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Beta(α, β) per tier and model from recent applied rewards.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={loadStatic} disabled={refreshing}>
              <Refresh1Line className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </Button>
          </CardHeader>
          <CardContent>
            {errors.arms ? <PanelError message={errors.arms} /> : arms ? <ArmsPanel arms={arms} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-medium">Learned models</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                One active classifier and one active cost model at a time.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={reloading}
              onClick={async () => {
                setReloading(true)
                await reloadRouterModels().catch((e) =>
                  setErrors((er) => ({ ...er, models: e instanceof Error ? e.message : 'reload failed' })),
                )
                await loadModels()
                setReloading(false)
              }}
              title="Re-read the active models from the database"
            >
              <Refresh1Line className={cn('mr-2 h-4 w-4', reloading && 'animate-spin')} />
              Reload
            </Button>
          </CardHeader>
          <CardContent>
            {errors.models ? (
              <PanelError message={errors.models} />
            ) : models ? (
              <ModelsPanel models={models} onChanged={loadModels} />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Gold labels</CardTitle>
          <p className="text-xs text-muted-foreground">
            Judge-graded cheap vs strong answers used to train the classifier.
          </p>
        </CardHeader>
        <CardContent>
          {errors.gold ? <PanelError message={errors.gold} /> : gold ? <GoldPanel gold={gold} /> : null}
        </CardContent>
      </Card>
    </>
  )
}
