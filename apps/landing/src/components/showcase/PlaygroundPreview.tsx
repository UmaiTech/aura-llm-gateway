import { ArrowRight } from 'lucide-react'
import { BrandMark } from '@aura/ui/brand/Brand.tsx'
import { DecisionRows, TierScale } from './DecisionSummary'
import { FEATURED_REQUEST, SAMPLE_LABEL, rawExchange } from './sampleData'

const req = FEATURED_REQUEST

/** The sample conversation: prompt, answer, and the model that answered. */
export function SampleConversation({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="ml-auto max-w-[88%] rounded-lg bg-aura-surface-2 px-4 py-3 text-sm text-aura-text">{req.prompt}</div>
      <div className="flex gap-3">
        <BrandMark size={22} className="mt-0.5 shrink-0" />
        <div className="min-w-0 space-y-2">
          <p className="text-sm leading-relaxed text-aura-text">{compact ? req.answer?.split('. ')[0] + '.' : req.answer}</p>
          <p className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-aura-dim">
            <span>
              answered by <span className="text-aura-text">{req.model}</span>
            </span>
            <span>requested {req.requestedModel}</span>
            <span>
              {req.inputTokens.toLocaleString('en-US')} in · {req.outputTokens} out
            </span>
            <span>{req.cost}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

export function SampleRouting() {
  const d = req.routing!
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="eyebrow">Auto · applied</div>
          <div className="mt-1 font-mono text-lg text-aura-text">{d.selected}</div>
        </div>
        <span className="text-[11px] text-aura-muted">answered this request</span>
      </div>
      <TierScale decision={d} />
      <DecisionRows decision={d} />
    </div>
  )
}

export function SampleRaw() {
  return (
    <pre className="max-h-80 overflow-auto rounded-control border border-aura-border !bg-aura-bg p-4 font-mono text-[11px] leading-relaxed text-aura-muted">
      {JSON.stringify(rawExchange(req), null, 2)}
    </pre>
  )
}

/** Compact playground card for the hero switcher. */
export function PlaygroundGlance() {
  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="text-aura-muted">Playground / {req.requestedModel}</span>
        <span className="sample-tag">{SAMPLE_LABEL}</span>
      </div>
      <div className="mt-5">
        <SampleConversation compact />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-control border border-aura-border bg-aura-bg px-3 py-2 font-mono text-[11px] text-aura-muted">
        <span>
          tier <span className="text-aura-text">{req.routing!.tier}</span> · score {req.routing!.score.toFixed(2)}
        </span>
        <span>{req.routing!.hard_filters[0]}</span>
      </div>
      <a href="#playground" className="mt-4 inline-flex items-center gap-1.5 text-xs text-aura-accent hover:underline">
        See why this model answered
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  )
}
