import { useId, useMemo, useState } from 'react'
import { ArrowRight, Filter, GitCompareArrows, Repeat } from 'lucide-react'
import {
  DEMO_PROVIDERS,
  MODES,
  PROVIDER_LABEL,
  SCENARIOS,
  TIERS,
  simulateAuto,
  type DemoProvider,
  type DemoScenario,
  type Mode,
  type Tier,
} from '../../lib/autoRouterDemo'
import { LINKS, playgroundSampleUrl } from '../../lib/links'
import { DecisionRows, TierScale } from './DecisionSummary'

const PINNED = 'gpt-5.4-mini'

const MODE_LABEL: Record<Mode, string> = { cost: 'Cost', balanced: 'Balanced', quality: 'Quality' }

/**
 * "The right tier. A reason you can read." Interactive, deterministic
 * walk through the auto router's rules. Runs entirely in the browser on
 * fixed request shapes (lib/autoRouterDemo.ts); nothing is sent anywhere.
 */
export function AutoRouterSection() {
  const [scenario, setScenario] = useState<DemoScenario['id']>('rewrite')
  const [mode, setMode] = useState<Mode>('balanced')
  const [minTier, setMinTier] = useState<Tier>('simple')
  const [maxTier, setMaxTier] = useState<Tier>('reasoning')
  const [providers, setProviders] = useState<Record<DemoProvider, boolean>>({ openai: true, anthropic: true, google: true })
  const [shadow, setShadow] = useState(false)
  const uid = useId()

  const decision = useMemo(
    () => simulateAuto({ scenario, mode, minTier, maxTier, providers, shadow, pinned: PINNED }),
    [scenario, mode, minTier, maxTier, providers, shadow],
  )
  const current = SCENARIOS.find((s) => s.id === scenario)!
  const requestBody = {
    model: decision.requested_model,
    input: current.prompt,
    ...(current.tools ? { tools: ['…'] } : {}),
    ...(minTier !== 'simple' || maxTier !== 'reasoning'
      ? { routing: { ...(minTier !== 'simple' && { min_tier: minTier }), ...(maxTier !== 'reasoning' && { max_tier: maxTier }) } }
      : {}),
  }
  const playHref = playgroundSampleUrl({ model: decision.requested_model, prompt: current.prompt, inspect: 'routing' })

  const announce = decision.error
    ? 'No eligible model: the gateway would answer 503 no_eligible_model.'
    : decision.shadow
      ? `${PINNED} answers. Auto would have picked ${decision.selected} in ${decision.tier}.`
      : `${decision.selected} answers, in the ${decision.tier} tier.`

  return (
    <section id="auto-router" aria-labelledby="auto-heading" className="border-b border-aura-border py-20">
      <div className="grid gap-8 lg:grid-cols-2 lg:items-end lg:gap-12">
        <div>
          <p className="eyebrow">03 / Auto model routing</p>
          <h2 id="auto-heading" className="mt-4 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.03em] text-aura-text sm:text-[42px]">
            The right tier.
            <br />A reason you can read.
          </h2>
        </div>
        <div className="max-w-[480px]">
          <p className="leading-relaxed text-aura-muted">
            Send <code className="font-mono text-aura-text">model: "auto"</code>. Aura scores the request's complexity,
            picks a tier, applies your constraints and chooses an eligible model in that tier. Every response says
            why.
          </p>
          <a href={LINKS.autoRoutingDocs} className="mt-3 inline-flex items-center gap-1.5 text-sm text-aura-accent hover:underline">
            Read the auto-routing guide
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>

      <div className="mt-10 grid overflow-hidden rounded-panel border border-aura-border bg-aura-surface lg:grid-cols-2">
        {/* Controls */}
        <div className="min-w-0 space-y-7 border-b border-aura-border p-5 sm:p-7 lg:border-b-0 lg:border-r">
          <fieldset>
            <legend className="eyebrow">Try a request shape</legend>
            <div className="mt-4 divide-y divide-aura-border">
              {SCENARIOS.map((s, i) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center gap-4 px-3 py-3.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-aura-accent ${
                    s.id === scenario ? 'bg-aura-accent/10' : 'hover:bg-aura-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name={`${uid}-scenario`}
                    value={s.id}
                    checked={s.id === scenario}
                    onChange={() => setScenario(s.id)}
                    className="sr-only"
                  />
                  <span className="font-mono text-[11px] text-aura-dim">0{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${s.id === scenario ? 'font-medium text-aura-accent' : 'text-aura-text'}`}>{s.name}</span>
                    <span className="mt-0.5 block text-xs text-aura-dim">{s.hint}</span>
                  </span>
                  <span aria-hidden className={`text-xs ${s.id === scenario ? 'text-aura-accent' : 'text-transparent'}`}>
                    ●
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs text-aura-muted">Cost / quality preference</legend>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-[9px] border border-aura-border bg-aura-bg p-1">
              {MODES.map((m) => (
                <label
                  key={m}
                  className={`cursor-pointer rounded-control py-2 text-center text-[13px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-aura-accent ${
                    m === mode ? 'bg-aura-surface-2 font-medium text-aura-accent shadow-[inset_0_0_0_1px_rgb(var(--aura-rgb-border))]' : 'text-aura-muted hover:text-aura-text'
                  }`}
                >
                  <input type="radio" name={`${uid}-mode`} value={m} checked={m === mode} onChange={() => setMode(m)} className="sr-only" />
                  {MODE_LABEL[m]}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-aura-dim">
              Modes shift the score ({'cost −0.10, quality +0.15'}); they do not mean "cheapest model anywhere".
            </p>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <fieldset>
              <legend className="text-xs text-aura-muted">Tier bounds</legend>
              <div className="mt-2 flex items-center gap-2">
                <label className="sr-only" htmlFor={`${uid}-min`}>
                  Minimum tier
                </label>
                <select
                  id={`${uid}-min`}
                  value={minTier}
                  onChange={(e) => setMinTier(e.target.value as Tier)}
                  className="min-w-0 flex-1 rounded-control border border-aura-border bg-aura-bg px-2 py-2 text-xs text-aura-text"
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      min {t}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor={`${uid}-max`}>
                  Maximum tier
                </label>
                <select
                  id={`${uid}-max`}
                  value={maxTier}
                  onChange={(e) => setMaxTier(e.target.value as Tier)}
                  className="min-w-0 flex-1 rounded-control border border-aura-border bg-aura-bg px-2 py-2 text-xs text-aura-text"
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      max {t}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-xs text-aura-muted">Providers available</legend>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {DEMO_PROVIDERS.map((p) => (
                  <label key={p} className="inline-flex cursor-pointer items-center gap-2 text-xs text-aura-text">
                    <input
                      type="checkbox"
                      checked={providers[p]}
                      onChange={(e) => setProviders((prev) => ({ ...prev, [p]: e.target.checked }))}
                      className="h-3.5 w-3.5 accent-[rgb(var(--aura-rgb-action))]"
                    />
                    {PROVIDER_LABEL[p]}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="flex items-start justify-between gap-6">
            <div>
              <div id={`${uid}-shadow`} className="text-sm text-aura-text">
                Shadow a pinned model
              </div>
              <p id={`${uid}-shadow-desc`} className="mt-0.5 text-xs text-aura-dim">
                Keep <span className="font-mono">{PINNED}</span> answering; record what auto would pick.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={shadow}
              aria-labelledby={`${uid}-shadow`}
              aria-describedby={`${uid}-shadow-desc`}
              onClick={() => setShadow((v) => !v)}
              className={`relative mt-1 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                shadow ? 'bg-aura-action' : 'bg-aura-border'
              }`}
            >
              <span className={`h-4 w-4 rounded-full bg-white transition-transform ${shadow ? 'translate-x-4' : ''}`} />
            </button>
          </div>

          <pre className="whitespace-pre-wrap rounded-control border border-aura-border !bg-aura-bg !p-4 font-mono text-[11px] leading-relaxed text-aura-muted [overflow-wrap:anywhere]">
            {JSON.stringify(requestBody, null, 2)}
          </pre>

          <a href={playHref} className="btn-primary">
            Try this in the playground
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>

        {/* Result */}
        <div className="min-w-0 space-y-6 bg-aura-surface-2/40 p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="eyebrow">{decision.shadow ? 'Shadow · pinned model answers' : 'Auto · applied in demo'}</span>
            <span className="rounded border border-aura-amber/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-aura-amber">
              Demo
            </span>
          </div>

          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {announce}
          </div>

          {decision.error ? (
            <div className="rounded-control border border-aura-red/40 bg-aura-red/5 p-4">
              <div className="font-mono text-sm text-aura-red">503 no_eligible_model</div>
              <p className="mt-1.5 text-xs text-aura-muted">
                No model in the allowed tiers is available. The gateway returns this error instead of silently picking
                something outside your constraints.
              </p>
            </div>
          ) : decision.shadow ? (
            <div className="space-y-1.5">
              <div className="text-[11px] text-aura-muted">Answered by (pinned)</div>
              <div className="break-all font-mono text-2xl text-aura-text">{PINNED}</div>
              <div className="text-xs text-aura-muted">
                Auto would have picked{' '}
                <span className="font-mono text-aura-amber">{decision.selected ?? 'nothing eligible'}</span>
                {decision.selected && <> in {decision.tier}</>} — recorded, not used.
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-[11px] text-aura-muted">Answered by</div>
              <div className="break-all font-mono text-2xl text-aura-text">{decision.selected}</div>
              <div className="text-xs text-aura-muted">{PROVIDER_LABEL[decision.selected_provider!]} · first eligible in config order</div>
            </div>
          )}

          <TierScale decision={decision} />
          <DecisionRows decision={decision} />

          <details className="group">
            <summary className="cursor-pointer text-xs text-aura-muted hover:text-aura-text">
              Candidates considered ({decision.candidates.length})
            </summary>
            <ul className="mt-3 space-y-1.5">
              {decision.candidates.map((c) => (
                <li key={`${c.tier}-${c.model}`} className="flex items-center justify-between gap-3 font-mono text-[11px]">
                  <span className={c.eligible ? 'text-aura-text' : 'text-aura-dim line-through'}>
                    {c.model === decision.selected ? '▸ ' : ''}
                    {c.model}
                  </span>
                  <span className="text-aura-dim">
                    {c.tier}
                    {c.excluded ? ` · ${c.excluded}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </details>

          <p className="border-t border-aura-border pt-4 text-xs leading-relaxed text-aura-dim">
            Demo, run in your browser. Scores are illustrative inputs, not classifier output; the tier lists, boundaries
            and mode offsets are the gateway's shipped defaults. No request is sent and no savings are measured.
          </p>
        </div>
      </div>

      <ul className="mt-6 flex flex-col gap-3 text-xs text-aura-muted sm:flex-row sm:justify-between">
        <li className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-aura-accent" aria-hidden />
          Capability, provider and allow/deny filters
        </li>
        <li className="flex items-center gap-2">
          <Repeat className="h-3.5 w-3.5 text-aura-accent" aria-hidden />
          Tool loops keep their model while it still fits
        </li>
        <li className="flex items-center gap-2">
          <GitCompareArrows className="h-3.5 w-3.5 text-aura-accent" aria-hidden />
          Shadow-score pinned traffic before switching
        </li>
      </ul>
    </section>
  )
}
