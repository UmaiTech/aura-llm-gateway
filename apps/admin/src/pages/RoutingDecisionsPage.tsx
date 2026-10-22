import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Input } from '@/components/ui'
import { cn, formatDuration } from '@/lib/utils'
import { ArrowLeftLine, Loading3Line, Refresh1Line, SearchLine } from '@mingcute/react'
import {
  DECISION_FILTER_KEYS,
  ROUTING_TIERS,
  listRoutingDecisions,
  type RoutingDecisionFilters,
  type RoutingDecisionRow,
} from '@/lib/routing'
import { DecisionDrawer } from '@/components/routing/DecisionDrawer'
import {
  OUTCOME_LABELS,
  TIER_TONE,
  formatReward,
  formatTimestamp,
  formatUsd,
  rewardTone,
} from '@/components/routing/format'

const PAGE_SIZE = 50
const PERIODS = ['1h', '24h', '7d', '30d', 'all']
const DEFAULT_PERIOD = '24h'

const selectClass = 'h-9 rounded-md border border-border bg-background px-2 text-sm'
const inputClass = 'h-9 text-sm'

function readFilters(params: URLSearchParams): RoutingDecisionFilters {
  const f: RoutingDecisionFilters = {}
  for (const key of DECISION_FILTER_KEYS) {
    const v = params.get(key)
    if (v) f[key] = v
  }
  if (!f.period && !f.from) f.period = DEFAULT_PERIOD
  return f
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
  options: Array<[string, string]>
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select className={selectClass} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Text input that commits on blur / Enter so typing doesn't refetch per key. */
function TextFilter({
  label,
  value,
  placeholder,
  onCommit,
  className,
}: {
  label: string
  value: string | undefined
  placeholder?: string
  onCommit: (v: string) => void
  className?: string
}) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])
  const commit = () => {
    if (draft.trim() !== (value ?? '')) onCommit(draft.trim())
  }
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        className={inputClass}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  )
}

const anyOpt: [string, string] = ['', 'Any']
const boolOptions: Array<[string, string]> = [anyOpt, ['true', 'Yes'], ['false', 'No']]

/**
 * Auto-router decisions explorer: every decision the router recorded,
 * filterable and paged by cursor, with a drawer explaining each one.
 * Filters live in the query string so views can be linked; the open
 * decision lives in the path (/routing/decisions/:responseId).
 */
export function RoutingDecisionsPage() {
  const { responseId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readFilters(params), [params])
  const filterKey = params.toString()

  const [rows, setRows] = useState<RoutingDecisionRow[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jumpId, setJumpId] = useState('')
  const requestSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const page = await listRoutingDecisions(filters, null, PAGE_SIZE)
      if (seq !== requestSeq.current) return
      setRows(page.decisions)
      setNextCursor(page.next_cursor)
    } catch (e) {
      if (seq !== requestSeq.current) return
      setRows([])
      setNextCursor(null)
      setError(e instanceof Error ? e.message : 'Failed to load decisions')
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
    // filterKey captures every filter value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  useEffect(() => {
    load()
  }, [load])

  const loadMore = async () => {
    if (!nextCursor) return
    const seq = requestSeq.current
    setLoadingMore(true)
    try {
      const page = await listRoutingDecisions(filters, nextCursor, PAGE_SIZE)
      if (seq !== requestSeq.current) return
      setRows((r) => [...r, ...page.decisions])
      setNextCursor(page.next_cursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more decisions')
    } finally {
      setLoadingMore(false)
    }
  }

  const setFilter = (key: keyof RoutingDecisionFilters, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'period') {
      next.delete('from')
      next.delete('to')
    }
    setParams(next, { replace: true })
  }

  const activeCount = DECISION_FILTER_KEYS.filter(
    (k) => k !== 'period' && filters[k] !== undefined,
  ).length

  const search = params.toString() ? `?${params.toString()}` : ''
  const openDecision = (id: string) => navigate(`/routing/decisions/${encodeURIComponent(id)}${search}`)
  const closeDecision = useCallback(
    () => navigate(`/routing/decisions${search}`),
    [navigate, search],
  )

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Routing decisions"
        description="Every auto-router decision, with its candidates and outcome"
        actions={
          <>
            <Link to="/routing">
              <Button variant="ghost" size="sm">
                <ArrowLeftLine className="mr-2 h-4 w-4" />
                Routing
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <Refresh1Line className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </>
        }
      />

      <div className="flex-1 space-y-4 overflow-auto p-6">
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                {PERIODS.map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={filters.period === p && !filters.from ? 'secondary' : 'ghost'}
                    onClick={() => setFilter('period', p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (jumpId.trim()) openDecision(jumpId.trim())
                }}
              >
                <Input
                  className="h-9 w-72 text-sm"
                  icon={<SearchLine className="h-4 w-4" />}
                  placeholder="Open by aura_… or resp_… id"
                  value={jumpId}
                  onChange={(e) => setJumpId(e.target.value)}
                />
                <Button type="submit" size="sm" variant="outline" disabled={!jumpId.trim()}>
                  Open
                </Button>
              </form>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
              <Select
                label="Kind"
                value={filters.shadow}
                onChange={(v) => setFilter('shadow', v)}
                options={[anyOpt, ['false', 'Applied'], ['true', 'Shadow']]}
              />
              <Select
                label="Mode"
                value={filters.mode}
                onChange={(v) => setFilter('mode', v)}
                options={[anyOpt, ['cost', 'cost'], ['balanced', 'balanced'], ['quality', 'quality']]}
              />
              <Select
                label="Final tier"
                value={filters.tier}
                onChange={(v) => setFilter('tier', v)}
                options={[anyOpt, ...ROUTING_TIERS.map((t): [string, string] => [t, t])]}
              />
              <Select
                label="Classified tier"
                value={filters.classified_tier}
                onChange={(v) => setFilter('classified_tier', v)}
                options={[anyOpt, ...ROUTING_TIERS.map((t): [string, string] => [t, t])]}
              />
              <Select
                label="Classified ≠ final"
                value={filters.tier_changed}
                onChange={(v) => setFilter('tier_changed', v)}
                options={boolOptions}
              />
              <Select
                label="Outcome"
                value={filters.outcome}
                onChange={(v) => setFilter('outcome', v)}
                options={[
                  anyOpt,
                  ...Object.entries(OUTCOME_LABELS),
                  ['unscored', 'not scored yet'],
                ]}
              />
              <Select
                label="Status"
                value={filters.status}
                onChange={(v) => setFilter('status', v)}
                options={[
                  anyOpt,
                  ['completed', 'completed'],
                  ['failed', 'failed'],
                  ['incomplete', 'incomplete'],
                  ['pending', 'no request log'],
                ]}
              />
              <Select
                label="Feedback"
                value={filters.feedback}
                onChange={(v) => setFilter('feedback', v)}
                options={[anyOpt, ['approved', 'approved'], ['rejected', 'rejected']]}
              />
              <Select
                label="Escalated"
                value={filters.escalated}
                onChange={(v) => setFilter('escalated', v)}
                options={boolOptions}
              />
              <Select
                label="Sticky"
                value={filters.sticky}
                onChange={(v) => setFilter('sticky', v)}
                options={boolOptions}
              />
              <Select
                label="Synthetic"
                value={filters.synthetic}
                onChange={(v) => setFilter('synthetic', v)}
                options={[
                  ['', 'Exclude'],
                  ['include', 'Include'],
                  ['only', 'Only'],
                ]}
              />
              <TextFilter
                label="Selected model"
                value={filters.model}
                placeholder="gpt-4o-mini"
                onCommit={(v) => setFilter('model', v)}
                className="xl:col-span-2"
              />
              <TextFilter
                label="Cost ≥ ($)"
                value={filters.min_cost}
                placeholder="0.001"
                onCommit={(v) => setFilter('min_cost', v)}
              />
              <TextFilter
                label="Cost ≤ ($)"
                value={filters.max_cost}
                onCommit={(v) => setFilter('max_cost', v)}
              />
              <TextFilter
                label="Reward ≥"
                value={filters.min_reward}
                placeholder="-1"
                onCommit={(v) => setFilter('min_reward', v)}
              />
              <TextFilter
                label="Reward ≤"
                value={filters.max_reward}
                placeholder="1"
                onCommit={(v) => setFilter('max_reward', v)}
              />
              <TextFilter
                label="Organization id"
                value={filters.organization_id}
                placeholder="uuid"
                onCommit={(v) => setFilter('organization_id', v)}
                className="xl:col-span-2"
              />
              <TextFilter
                label="API key id"
                value={filters.api_key_id}
                placeholder="uuid"
                onCommit={(v) => setFilter('api_key_id', v)}
                className="xl:col-span-2"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {loading
                  ? 'Loading…'
                  : `${rows.length}${nextCursor ? '+' : ''} decision${rows.length === 1 ? '' : 's'}`}
                {filters.from && ` since ${formatTimestamp(filters.from)}`}
                {filters.synthetic === undefined && ' · synthetic traces hidden'}
              </span>
              {activeCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const next = new URLSearchParams()
                    if (filters.period) next.set('period', filters.period)
                    setParams(next, { replace: true })
                  }}
                >
                  Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="space-y-3 p-6">
              <div className="text-sm font-medium text-destructive">Failed to load decisions</div>
              <div className="text-sm text-muted-foreground">{error}</div>
              <Button size="sm" onClick={load}>
                <Refresh1Line className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Time</th>
                      <th className="px-3 py-2 text-left font-medium">Mode</th>
                      <th className="px-3 py-2 text-left font-medium">Tier</th>
                      <th className="px-3 py-2 text-right font-medium">Score</th>
                      <th className="px-3 py-2 text-left font-medium">Selected model</th>
                      <th className="px-3 py-2 text-right font-medium" title="eligible / considered">
                        Cands
                      </th>
                      <th className="px-3 py-2 text-right font-medium" title="Cost model prediction for the selected model">
                        Predicted
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Actual</th>
                      <th className="px-3 py-2 text-right font-medium">Latency</th>
                      <th className="px-3 py-2 text-left font-medium">Outcome</th>
                      <th className="px-3 py-2 text-right font-medium">Reward</th>
                      <th className="px-3 py-2 text-left font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && rows.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-12 text-center text-muted-foreground">
                          <Loading3Line className="mr-2 inline h-4 w-4 animate-spin" />
                          Loading decisions…
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-12 text-center text-sm text-muted-foreground">
                          No decisions match these filters.
                        </td>
                      </tr>
                    ) : (
                      rows.map((d) => (
                        <tr
                          key={d.id}
                          onClick={() => openDecision(d.response_id)}
                          className={cn(
                            'cursor-pointer border-b border-border/20 last:border-0 hover:bg-muted/40',
                            responseId === d.response_id && 'bg-muted/60',
                          )}
                        >
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground tabular-nums">
                            {formatTimestamp(d.created_at)}
                          </td>
                          <td className="px-3 py-2 text-xs">{d.mode}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {d.classified_tier !== d.tier && (
                              <span
                                className="mr-1 text-xs text-muted-foreground"
                                title={`Classified ${d.classified_tier}`}
                              >
                                {d.classified_tier} →
                              </span>
                            )}
                            <span
                              className={cn(
                                'inline-block rounded px-1.5 py-0.5 text-xs font-medium',
                                TIER_TONE[d.tier] ?? 'bg-muted text-muted-foreground',
                              )}
                            >
                              {d.tier}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{d.score.toFixed(2)}</td>
                          <td className="max-w-[16rem] px-3 py-2">
                            <div className="truncate font-mono text-xs" title={d.selected_model}>
                              {d.selected_model}
                            </div>
                            {d.shadow && (
                              <div className="truncate text-[11px] text-muted-foreground">
                                pinned {d.requested_model}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">
                            {d.eligible_count} / {d.candidates_count}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">
                            {formatUsd(d.predicted_cost_usd)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">
                            {formatUsd(d.cost_usd)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">
                            {d.latency_ms != null ? formatDuration(d.latency_ms) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs">
                            {d.status && d.status !== 'completed' && (
                              <span className="mr-1 text-destructive/80">{d.status}</span>
                            )}
                            {d.next_turn ? (
                              OUTCOME_LABELS[d.next_turn] ?? d.next_turn
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            {d.feedback && (
                              <span
                                className={cn(
                                  'ml-1',
                                  d.feedback === 'approved' ? 'text-emerald-400' : 'text-destructive/80',
                                )}
                              >
                                · {d.feedback}
                              </span>
                            )}
                          </td>
                          <td className={cn('px-3 py-2 text-right text-xs tabular-nums', rewardTone(d.reward))}>
                            {formatReward(d.reward)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {d.shadow && (
                                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-400">
                                  shadow
                                </span>
                              )}
                              {d.escalated && (
                                <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[11px] text-orange-300">
                                  escalated
                                </span>
                              )}
                              {d.synthetic && (
                                <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] text-sky-300">
                                  synthetic
                                </span>
                              )}
                              {d.sticky && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  sticky
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {nextCursor && (
                <div className="flex justify-center border-t border-border/40 p-3">
                  <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore && <Loading3Line className="mr-2 h-4 w-4 animate-spin" />}
                    Load {PAGE_SIZE} more
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {responseId && <DecisionDrawer responseId={responseId} onClose={closeDecision} />}
    </div>
  )
}
