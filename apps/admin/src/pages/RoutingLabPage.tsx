import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '@/components/layout'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui'
import { runRoutingLab, scoreRoutingRequest } from '@/lib/api'
import type {
  ClassifierKind,
  LabResponsesRequest,
  LabRunResult,
  RoutingDecision,
  RoutingTier,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { RoutingInspector } from '@aura/ui/routing/RoutingInspector.tsx'
import { fromResponseDecision } from '@aura/ui/routing/decision.ts'
import { ArrowRightLine, CheckLine, DownloadLine, FlashLine, ShieldLine } from '@mingcute/react'

/**
 * Routing lab — battle-test the auto router from the admin app.
 *
 * Runs a batch of prompts through `auto`, `auto:cost`, `auto:quality`
 * and optionally a pinned model, and shows per prompt the tier, score,
 * signals, candidates, selected model, predicted vs actual cost, latency
 * and the answer.
 *
 * - Dry run: POST /admin/routing/score. Heuristic classifier, dispatches
 *   nothing, costs nothing.
 * - Live run: POST /admin/routing/lab/run. The full /v1/responses
 *   pipeline on the admin path: no per-key rate limit, no organization
 *   override (tier clamps, allow / deny, max_cost_usd), cache bypassed.
 *   Only the routing options set on this page apply. Runs are audited on
 *   the gateway and, with "synthetic" on, kept out of routing stats,
 *   rewards and gold sampling.
 *
 * Live runs spend real provider money, so they are estimated first (from
 * a free dry run) and need confirmation above a threshold; a hard cap
 * stops the batch once actual spend reaches it.
 */

type Kind = 'simple' | 'medium' | 'complex' | 'reasoning' | 'tools' | 'image' | 'long' | 'custom'

interface LabPrompt {
  id: string
  label: string
  kind: Kind
  text: string
}

const SAMPLE_IMAGE =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png'

const WEATHER_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Current weather for a city',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' }, unit: { type: 'string', enum: ['c', 'f'] } },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_flights',
      description: 'Search flights between two airports on a date',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['from', 'to', 'date'],
      },
    },
  },
]

// ~20k tokens of filler so the long-context prompts trip the token
// signals and the context-window filter. Built once, never sent on dry
// runs beyond the request body itself.
const LONG_DOC = Array.from(
  { length: 400 },
  (_, i) =>
    `Section ${i + 1}. The quarterly operations log records shipment ${1000 + i} leaving warehouse ${
      (i % 7) + 1
    } with ${(i * 37) % 500} units; ${i % 5 === 0 ? 'a delay was reported due to customs inspection' : 'no incidents were reported'}, and the receiving team confirmed the count against invoice ${
      7000 + i * 3
    }.`
).join('\n')

const SUITES: { id: Kind; name: string; prompts: string[] }[] = [
  {
    id: 'simple',
    name: 'Simple',
    prompts: [
      'What is the capital of France?',
      'Translate "good morning, see you tomorrow" into Spanish.',
      'Rewrite this more politely: "send me the report now".',
    ],
  },
  {
    id: 'medium',
    name: 'Medium',
    prompts: [
      'Write a Python function that removes duplicate dictionaries from a list, keeping the first occurrence.',
      'Summarise the trade-offs between REST and GraphQL for a mobile app backend in five bullet points.',
      'Draft a short, friendly email asking a customer to update their billing details.',
    ],
  },
  {
    id: 'complex',
    name: 'Complex',
    prompts: [
      'Design a multi-tenant rate limiter for an API gateway backed by Redis: data model, the Lua script for an atomic token bucket, failure modes when Redis is unavailable, and how to test it.',
      'This Rust code deadlocks under load: a tokio task holds a std::sync::Mutex guard across an .await while another task waits on the same lock. Explain why, and refactor it with a step-by-step migration plan.',
    ],
  },
  {
    id: 'reasoning',
    name: 'Reasoning',
    prompts: [
      'Prove that there are infinitely many primes of the form 4k + 3. Think step by step and justify every claim.',
      'Three boxes are labelled apples, oranges and mixed, and every label is wrong. You may draw one fruit from one box. Derive the minimal strategy to relabel all boxes and prove it is optimal.',
    ],
  },
  {
    id: 'tools',
    name: 'Tool calls',
    prompts: [
      "What's the weather in Lisbon right now, in celsius?",
      'Find me a flight from SFO to JFK on 2026-12-03 and tell me if I need a coat when I land.',
    ],
  },
  {
    id: 'image',
    name: 'Images',
    prompts: ['Describe this image in one sentence.', 'What colours dominate this picture?'],
  },
  {
    id: 'long',
    name: 'Long context',
    prompts: [
      'Using the log above, list every shipment that reported a customs delay.',
      'Using the log above, which warehouse shipped the most units in total?',
    ],
  },
]

const KIND_STYLE: Record<Kind, string> = {
  simple: 'bg-emerald-500/10 text-emerald-500',
  medium: 'bg-sky-500/10 text-sky-500',
  complex: 'bg-violet-500/10 text-violet-500',
  reasoning: 'bg-rose-500/10 text-rose-500',
  tools: 'bg-amber-500/10 text-amber-500',
  image: 'bg-fuchsia-500/10 text-fuchsia-500',
  long: 'bg-cyan-500/10 text-cyan-500',
  custom: 'bg-muted text-muted-foreground',
}

const TIER_STYLE: Record<RoutingTier, { chip: string }> = {
  simple: { chip: 'bg-emerald-500/10 text-emerald-500' },
  medium: { chip: 'bg-sky-500/10 text-sky-500' },
  complex: { chip: 'bg-violet-500/10 text-violet-500' },
  reasoning: { chip: 'bg-rose-500/10 text-rose-500' },
}
const TIERS: RoutingTier[] = ['simple', 'medium', 'complex', 'reasoning']

const AUTO_LANES = ['auto', 'auto:cost', 'auto:quality'] as const
const isAutoLane = (lane: string) => lane === 'auto' || lane.startsWith('auto:')

const selectClass = 'w-full bg-muted border-0 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring'

const usd = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v === 0 ? '$0' : v < 0.0001 ? `$${v.toExponential(1)}` : `$${v.toFixed(4)}`

let promptSeq = 0
const newPrompt = (kind: Kind, text: string, label?: string): LabPrompt => ({
  id: `p${++promptSeq}`,
  kind,
  text,
  label: label ?? (text.length > 60 ? `${text.slice(0, 57)}…` : text),
})

interface LabOptions {
  classifier: '' | ClassifierKind
  maxOutputTokens: number
  maxCostUsd: string
  synthetic: boolean
}

function buildRequest(p: LabPrompt, model: string, o: LabOptions): LabResponsesRequest {
  const text = p.kind === 'long' ? `${LONG_DOC}\n\n${p.text}` : p.text
  const content =
    p.kind === 'image'
      ? [
          { type: 'text', text },
          { type: 'image', url: SAMPLE_IMAGE },
        ]
      : text
  const routing: LabResponsesRequest['routing'] = {}
  if (o.classifier) routing.classifier = o.classifier
  const budget = Number(o.maxCostUsd)
  if (o.maxCostUsd.trim() !== '' && Number.isFinite(budget) && budget > 0) routing.max_cost_usd = budget
  return {
    model,
    input: [{ type: 'message', role: 'user', content }],
    max_output_tokens: o.maxOutputTokens,
    ...(p.kind === 'tools' ? { tools: WEATHER_TOOLS } : {}),
    ...(Object.keys(routing).length ? { routing } : {}),
  }
}

/** Text of a live answer, or a summary of the tool calls it made. */
function answerOf(r: LabRunResult): string {
  if (r.output_text) return r.output_text
  const output = (r.response?.output as Array<Record<string, unknown>> | undefined) ?? []
  const calls = output
    .filter((item) => item.type === 'function_call')
    .map((item) => `${String(item.name)}(${String(item.arguments ?? '')})`)
  return calls.length ? `tool calls: ${calls.join(', ')}` : ''
}

/**
 * Pre-run cost estimate for one cell: the cost model's prediction when
 * one is loaded, else list price x (estimated input + max output tokens),
 * an upper-ish bound. `null` when the model's price is unknown.
 */
function estimateUsd(decision: RoutingDecision | undefined, model: string, maxOut: number): number | null {
  if (!decision) return null
  const cand = decision.candidates?.find((c) => c.model === model)
  if (!decision.shadow && model === decision.selected && decision.predicted_cost_usd != null) {
    return decision.predicted_cost_usd
  }
  if (cand?.predicted_cost_usd != null) return cand.predicted_cost_usd
  if (cand?.cost_per_million == null) return null
  const inTok = Number(decision.features?.est_input_tokens ?? 0)
  return (cand.cost_per_million * (inTok + maxOut)) / 1_000_000
}

/** `error.code` from a gateway error body, e.g. `no_eligible_model`. */
function errorCode(err: unknown): string {
  const inner = (err as { error?: { code?: unknown } } | null)?.error
  return typeof inner?.code === 'string' ? inner.code : 'error'
}

type CellStatus = 'idle' | 'scoring' | 'queued' | 'running' | 'done' | 'error' | 'skipped'

interface Cell {
  status: CellStatus
  dry?: RoutingDecision
  dryError?: string
  live?: LabRunResult
  liveError?: string
  estimate?: number | null
  note?: string
}

const cellKey = (promptId: string, lane: string) => `${promptId}|${lane}`

function TierChip({ tier }: { tier: RoutingTier }) {
  return <span className={cn('px-1.5 py-0.5 rounded text-2xs font-medium', TIER_STYLE[tier]?.chip)}>{tier}</span>
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input type="checkbox" className="h-4 w-4 accent-current" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function RoutingLabPage() {
  const [prompts, setPrompts] = useState<LabPrompt[]>(() =>
    SUITES.flatMap((s) => (['simple', 'medium', 'complex', 'reasoning'].includes(s.id) ? s.prompts.slice(0, 1) : []).map((t) => newPrompt(s.id, t)))
  )
  const [paste, setPaste] = useState('')
  const [lanes, setLanes] = useState<Record<string, boolean>>({ auto: true, 'auto:cost': true, 'auto:quality': true })
  const [pinned, setPinned] = useState('')
  const [options, setOptions] = useState<LabOptions>({
    classifier: '',
    maxOutputTokens: 512,
    maxCostUsd: '',
    synthetic: true,
  })
  const [confirmAbove, setConfirmAbove] = useState(0.25)
  const [hardCap, setHardCap] = useState(2)
  const [concurrency, setConcurrency] = useState(2)

  const [cells, setCells] = useState<Record<string, Cell>>({})
  const [busy, setBusy] = useState<null | 'dry' | 'estimating' | 'live'>(null)
  const [pending, setPending] = useState<null | { total: number; unpriced: number; runs: number }>(null)
  const [spent, setSpent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const stopRef = useRef(false)
  const spentRef = useRef(0)

  const activeLanes = useMemo(() => {
    const out: string[] = AUTO_LANES.filter((l) => lanes[l])
    if (pinned.trim()) out.push(pinned.trim())
    return out
  }, [lanes, pinned])

  const patchCell = (key: string, patch: Partial<Cell>) =>
    setCells((c) => ({ ...c, [key]: { ...(c[key] ?? { status: 'idle' }), ...patch } }))

  const addSuite = (kind: Kind) => {
    const suite = SUITES.find((s) => s.id === kind)
    if (suite) setPrompts((p) => [...p, ...suite.prompts.map((t) => newPrompt(kind, t))])
  }

  const addPasted = () => {
    const raw = paste.trim()
    if (!raw) return
    // Prompts are separated by lines holding only "---"; without any
    // separator, every non-empty line is its own prompt.
    const parts = /^---$/m.test(raw) ? raw.split(/^---$/m) : raw.split('\n')
    const added = parts.map((t) => t.trim()).filter(Boolean).map((t) => newPrompt('custom', t))
    setPrompts((p) => [...p, ...added])
    setPaste('')
  }

  /** Free dry-run scoring of every (prompt, lane) cell. Returns the decisions. */
  const scoreAll = async (): Promise<Record<string, RoutingDecision | undefined>> => {
    const out: Record<string, RoutingDecision | undefined> = {}
    await Promise.all(
      prompts.flatMap((p) =>
        activeLanes.map(async (lane) => {
          const key = cellKey(p.id, lane)
          patchCell(key, { status: 'scoring', dryError: undefined })
          try {
            const d = await scoreRoutingRequest(buildRequest(p, lane, options))
            const model = d.shadow ? lane : d.selected
            const estimate = estimateUsd(d, model, options.maxOutputTokens)
            out[key] = d
            patchCell(key, { status: 'done', dry: d, estimate })
          } catch (e) {
            patchCell(key, { status: 'error', dryError: e instanceof Error ? e.message : String(e) })
          }
        })
      )
    )
    return out
  }

  const dryRun = async () => {
    setError(null)
    setBusy('dry')
    try {
      await scoreAll()
    } finally {
      setBusy(null)
    }
  }

  const prepareLive = async () => {
    setError(null)
    setBusy('estimating')
    try {
      const decisions = await scoreAll()
      let total = 0
      let unpriced = 0
      for (const p of prompts) {
        for (const lane of activeLanes) {
          const d = decisions[cellKey(p.id, lane)]
          const est = d ? estimateUsd(d, d.shadow ? lane : d.selected, options.maxOutputTokens) : null
          if (est === null) unpriced += 1
          else total += est
        }
      }
      const runs = prompts.length * activeLanes.length
      if (total >= confirmAbove || unpriced > 0) {
        setPending({ total, unpriced, runs })
        setBusy(null)
        return
      }
      await runLive()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(null)
    }
  }

  const runLive = async () => {
    setPending(null)
    setBusy('live')
    stopRef.current = false
    spentRef.current = 0
    setSpent(0)
    const queue = prompts.flatMap((p) => activeLanes.map((lane) => ({ p, lane })))
    for (const { p, lane } of queue) patchCell(cellKey(p.id, lane), { status: 'queued', live: undefined, liveError: undefined, note: undefined })

    const worker = async () => {
      for (;;) {
        const job = queue.shift()
        if (!job) return
        const key = cellKey(job.p.id, job.lane)
        if (stopRef.current) {
          patchCell(key, { status: 'skipped', note: 'stopped' })
          continue
        }
        if (spentRef.current >= hardCap) {
          patchCell(key, { status: 'skipped', note: `spend cap ${usd(hardCap)} reached` })
          continue
        }
        patchCell(key, { status: 'running' })
        try {
          const r = await runRoutingLab({
            request: buildRequest(job.p, job.lane, options),
            synthetic: options.synthetic,
            label: `${job.p.kind}:${job.p.id}`,
          })
          spentRef.current += r.cost_usd ?? 0
          setSpent(spentRef.current)
          patchCell(key, { status: r.ok ? 'done' : 'error', live: r })
        } catch (e) {
          patchCell(key, { status: 'error', liveError: e instanceof Error ? e.message : String(e) })
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.max(1, Math.min(8, concurrency)) }, worker))
    } finally {
      setBusy(null)
    }
  }

  const exportJson = () => {
    const rows = prompts.map((p) => ({
      prompt: p,
      lanes: Object.fromEntries(activeLanes.map((lane) => [lane, cells[cellKey(p.id, lane)] ?? null])),
    }))
    const blob = new Blob([JSON.stringify({ options, lanes: activeLanes, rows }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `routing-lab-${new Date().toISOString().slice(0, 19)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Per-lane totals over what has run.
  const summary = useMemo(
    () =>
      activeLanes.map((lane) => {
        const laneCells = prompts.map((p) => cells[cellKey(p.id, lane)]).filter(Boolean) as Cell[]
        const live = laneCells.map((c) => c.live).filter(Boolean) as LabRunResult[]
        const ok = live.filter((r) => r.ok)
        const tiers: Record<string, number> = {}
        for (const c of laneCells) {
          const d = c.live?.routing ?? c.dry
          if (d && !d.shadow) tiers[d.tier] = (tiers[d.tier] ?? 0) + 1
        }
        return {
          lane,
          runs: live.length,
          ok: ok.length,
          cost: ok.reduce((s, r) => s + (r.cost_usd ?? 0), 0),
          estimate: laneCells.reduce((s, c) => s + (c.estimate ?? 0), 0),
          latency: ok.length ? ok.reduce((s, r) => s + r.latency_ms, 0) / ok.length : null,
          tiers,
        }
      }),
    [activeLanes, prompts, cells]
  )
  const pinnedSummary = pinned.trim() ? summary.find((s) => s.lane === pinned.trim()) : undefined

  const selectedCell = selected ? cells[selected] : undefined
  const [selPrompt, selLane] = selected ? selected.split('|') : [null, null]
  const selPromptObj = prompts.find((p) => p.id === selPrompt)

  return (
    <div className="flex flex-col">
      <Header
        title="Routing Lab"
        description="Battle-test the auto router on the admin path, with no tenant limits"
        actions={
          <Button variant="ghost" size="sm" onClick={exportJson} disabled={Object.keys(cells).length === 0}>
            <DownloadLine className="h-4 w-4 mr-1" /> Export
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        <div className="p-3 rounded-lg bg-warning/10 text-warning text-sm flex gap-2">
          <ShieldLine className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            Live runs call real providers with your admin key and skip per-key rate limits, organization overrides
            and budgets; only the options on this page apply. Every run is audited on the gateway. Dry runs are free.
          </p>
        </div>

        {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Prompts */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Prompts ({prompts.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {SUITES.map((s) => (
                  <Button key={s.id} variant="outline" size="sm" onClick={() => addSuite(s.id)}>
                    + {s.name}
                  </Button>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setPrompts([])} disabled={!prompts.length}>
                  Clear
                </Button>
              </div>
              <div className="space-y-2">
                <textarea
                  className="w-full min-h-[80px] bg-muted rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-ring border-0"
                  placeholder={'Paste prompts: one per line, or separate multi-line prompts with a line holding only ---'}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                />
                <Button size="sm" variant="secondary" onClick={addPasted} disabled={!paste.trim()}>
                  Add pasted prompts
                </Button>
              </div>
              <ul className="divide-y divide-border/40 max-h-64 overflow-y-auto">
                {prompts.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className={cn('px-1.5 py-0.5 rounded text-2xs font-medium', KIND_STYLE[p.kind])}>{p.kind}</span>
                    <span className="flex-1 truncate" title={p.text}>
                      {p.label}
                    </span>
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => setPrompts((all) => all.filter((x) => x.id !== p.id))}
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Run options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Modes</p>
                <div className="flex flex-wrap gap-4">
                  {AUTO_LANES.map((l) => (
                    <Toggle key={l} label={l} checked={!!lanes[l]} onChange={(v) => setLanes((s) => ({ ...s, [l]: v }))} />
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Compare with pinned model</label>
                <Input value={pinned} placeholder="e.g. claude-sonnet-5 (optional)" onChange={(e) => setPinned(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Classifier</label>
                  <select
                    className={selectClass}
                    value={options.classifier}
                    onChange={(e) => setOptions((o) => ({ ...o, classifier: e.target.value as LabOptions['classifier'] }))}
                  >
                    <option value="">Gateway default</option>
                    <option value="heuristic">Heuristic</option>
                    <option value="learned">Learned</option>
                    <option value="llm">LLM</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Max output tokens</label>
                  <Input
                    type="number"
                    min={1}
                    value={options.maxOutputTokens}
                    onChange={(e) => setOptions((o) => ({ ...o, maxOutputTokens: Math.max(1, Number(e.target.value) || 1) }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Request budget (routing.max_cost_usd)</label>
                <Input
                  type="number"
                  min={0}
                  step={0.001}
                  value={options.maxCostUsd}
                  placeholder="none"
                  onChange={(e) => setOptions((o) => ({ ...o, maxCostUsd: e.target.value }))}
                />
              </div>
              <Toggle
                label="Mark as synthetic (keep out of stats, rewards and gold)"
                checked={options.synthetic}
                onChange={(v) => setOptions((o) => ({ ...o, synthetic: v }))}
              />
              <p className="text-2xs text-muted-foreground">
                Dry runs always use the heuristic classifier; learned and LLM classifiers apply on live runs.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Spend guard + actions */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1 w-40">
                <label className="text-xs font-medium">Confirm above (USD)</label>
                <Input type="number" min={0} step={0.05} value={confirmAbove} onChange={(e) => setConfirmAbove(Math.max(0, Number(e.target.value) || 0))} />
              </div>
              <div className="space-y-1 w-40">
                <label className="text-xs font-medium">Hard stop at (USD)</label>
                <Input type="number" min={0} step={0.5} value={hardCap} onChange={(e) => setHardCap(Math.max(0, Number(e.target.value) || 0))} />
              </div>
              <div className="space-y-1 w-28">
                <label className="text-xs font-medium">Concurrency</label>
                <Input type="number" min={1} max={8} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value) || 1)} />
              </div>
              <div className="flex-1" />
              <div className="text-sm text-right">
                <p className="text-muted-foreground text-xs">Spent this run</p>
                <p className={cn('font-mono text-lg', spent >= hardCap && hardCap > 0 && 'text-destructive')}>{usd(spent)}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => void dryRun()}
                loading={busy === 'dry'}
                disabled={!!busy || !prompts.length || !activeLanes.length}
              >
                <CheckLine className="h-4 w-4 mr-1" /> Dry run (free)
              </Button>
              {busy === 'live' ? (
                <Button variant="destructive" onClick={() => (stopRef.current = true)}>
                  Stop
                </Button>
              ) : (
                <Button
                  variant="gradient"
                  onClick={() => void prepareLive()}
                  loading={busy === 'estimating'}
                  disabled={!!busy || !prompts.length || !activeLanes.length}
                >
                  <FlashLine className="h-4 w-4 mr-1" /> Run live ({prompts.length * activeLanes.length})
                </Button>
              )}
            </div>
            {pending && (
              <div className="p-3 rounded-lg border border-warning/40 bg-warning/5 text-sm flex flex-wrap items-center gap-3">
                <p className="flex-1">
                  {pending.runs} live runs, estimated <span className="font-mono">{usd(pending.total)}</span>
                  {pending.unpriced > 0 && <> plus {pending.unpriced} without a price estimate</>}. The batch stops once
                  actual spend reaches <span className="font-mono">{usd(hardCap)}</span>.
                </p>
                <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
                  Cancel
                </Button>
                <Button variant="gradient" size="sm" onClick={() => void runLive()}>
                  Spend it
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lane summary */}
        {summary.some((s) => s.runs > 0 || s.estimate > 0) && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summary.map((s) => (
              <Card key={s.lane}>
                <CardContent className="pt-5 space-y-1 text-sm">
                  <p className="font-mono font-medium">{s.lane}</p>
                  <p className="text-muted-foreground text-xs">
                    {s.runs ? `${s.ok}/${s.runs} ok · ${usd(s.cost)} actual` : `${usd(s.estimate)} estimated`}
                    {s.latency !== null && ` · ${Math.round(s.latency)} ms avg`}
                  </p>
                  {pinnedSummary && s.lane !== pinnedSummary.lane && pinnedSummary.cost > 0 && s.runs > 0 && (
                    <p className="text-xs">
                      {((s.cost / pinnedSummary.cost) * 100).toFixed(0)}% of the pinned model's cost
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {TIERS.filter((t) => s.tiers[t]).map((t) => (
                      <span key={t} className={cn('px-1.5 py-0.5 rounded text-2xs', TIER_STYLE[t].chip)}>
                        {t} {s.tiers[t]}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Results grid */}
        {prompts.length > 0 && activeLanes.length > 0 && (
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="font-normal pb-2 pr-4 min-w-[220px]">prompt</th>
                    {activeLanes.map((lane) => (
                      <th key={lane} className="font-normal pb-2 pr-4 font-mono min-w-[200px]">
                        {lane}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {prompts.map((p) => (
                    <tr key={p.id} className="align-top">
                      <td className="py-2 pr-4">
                        <span className={cn('px-1.5 py-0.5 rounded text-2xs font-medium mr-2', KIND_STYLE[p.kind])}>{p.kind}</span>
                        <span title={p.text}>{p.label}</span>
                      </td>
                      {activeLanes.map((lane) => {
                        const key = cellKey(p.id, lane)
                        const c = cells[key]
                        const d = c?.live?.routing ?? c?.dry
                        return (
                          <td key={lane} className="py-2 pr-4">
                            <button
                              className={cn(
                                'w-full text-left rounded-md p-2 border transition-colors',
                                selected === key ? 'border-aura-400 bg-accent/40' : 'border-transparent hover:bg-accent/30'
                              )}
                              onClick={() => setSelected(selected === key ? null : key)}
                              disabled={!c}
                            >
                              {!c && <span className="text-xs text-muted-foreground">—</span>}
                              {c && ['scoring', 'queued', 'running'].includes(c.status) && (
                                <span className="text-xs text-muted-foreground">{c.status}…</span>
                              )}
                              {c && c.status === 'skipped' && <span className="text-xs text-muted-foreground">skipped · {c.note}</span>}
                              {c && (c.liveError || (c.live && !c.live.ok)) && (
                                <span className="text-xs text-destructive">{c.liveError ?? `${c.live?.status} ${errorCode(c.live?.error)}`}</span>
                              )}
                              {/* A pinned model is dispatched as asked even
                                  when auto's shadow scoring finds nothing. */}
                              {c && c.dryError && !c.live && !c.liveError && (
                                <span className={cn('text-xs', isAutoLane(lane) ? 'text-destructive' : 'text-muted-foreground')}>
                                  {isAutoLane(lane) ? c.dryError : `pinned · no shadow decision (${c.dryError})`}
                                </span>
                              )}
                              {!d && c?.live?.ok && (
                                <div className="space-y-1">
                                  <Badge variant="muted">pinned</Badge>
                                  <p className="font-mono text-xs truncate">{c.live.model}</p>
                                  <p className="text-2xs text-muted-foreground font-mono">
                                    actual {usd(c.live.cost_usd)} · {c.live.latency_ms} ms
                                  </p>
                                </div>
                              )}
                              {d && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    {d.shadow ? <Badge variant="muted">pinned</Badge> : <TierChip tier={d.tier} />}
                                    <span className="text-2xs text-muted-foreground font-mono">{d.score.toFixed(2)}</span>
                                    {d.escalations && d.escalations.length > 0 && <Badge variant="warning">escalated</Badge>}
                                  </div>
                                  <p className="font-mono text-xs truncate">{c?.live?.model ?? (d.shadow ? lane : d.selected)}</p>
                                  <p className="text-2xs text-muted-foreground font-mono">
                                    est {usd(c?.estimate)}
                                    {c?.live?.ok && (
                                      <>
                                        {' '}
                                        · actual {usd(c.live.cost_usd)} · {c.live.latency_ms} ms
                                      </>
                                    )}
                                  </p>
                                </div>
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Detail */}
        {selectedCell && selPromptObj && (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">
                <span className="font-mono">{selLane}</span> · {selPromptObj.label}
              </CardTitle>
              {typeof selectedCell.live?.response?.id === 'string' && (
                <Link to={`/routing/decisions/${encodeURIComponent(selectedCell.live.response.id)}`}>
                  <Button size="sm" variant="outline">
                    Open decision
                    <ArrowRightLine className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedCell.live && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                  <div>
                    <p className="text-2xs text-muted-foreground">answered by</p>
                    <p className="font-mono">{selectedCell.live.model ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-2xs text-muted-foreground">tokens in / out</p>
                    <p className="font-mono">
                      {selectedCell.live.input_tokens ?? '—'} / {selectedCell.live.output_tokens ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs text-muted-foreground">predicted</p>
                    <p className="font-mono">
                      {usd(selectedCell.live.routing?.predicted_cost_usd ?? selectedCell.estimate ?? null)}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs text-muted-foreground">actual</p>
                    <p className="font-mono">{usd(selectedCell.live.cost_usd)}</p>
                  </div>
                  <div>
                    <p className="text-2xs text-muted-foreground">latency</p>
                    <p className="font-mono">{selectedCell.live.latency_ms} ms</p>
                  </div>
                </div>
              )}
              {(selectedCell.live?.routing ?? selectedCell.dry) && (
                <RoutingInspector
                  key={selected ?? undefined}
                  view={fromResponseDecision((selectedCell.live?.routing ?? selectedCell.dry) as RoutingDecision, {
                    model: selectedCell.live?.model,
                  })}
                  raw={selectedCell.live?.response ?? selectedCell.dry}
                  initialTab="routing"
                />
              )}
              {selectedCell.live?.ok && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">answer</p>
                  <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-3 max-h-80 overflow-y-auto font-sans">
                    {answerOf(selectedCell.live) || '(empty)'}
                  </pre>
                </div>
              )}
              {selectedCell.live && !selectedCell.live.ok && (
                <pre className="text-xs bg-destructive/5 text-destructive rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(selectedCell.live.error, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
