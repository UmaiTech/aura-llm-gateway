import { useState } from 'react'
import { X, Settings, MessageSquare } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { AVAILABLE_MODELS } from '../lib/agent'
import { cn } from '../lib/utils'
import type {
  PaneConfig,
  RoutingStrategy,
  CompressionStrategy,
  ConsistencyStrategy,
  ValidationStrategy,
} from '../lib/types'

interface ComparePaneProps {
  pane: PaneConfig
  canRemove: boolean
  onChange: (patch: Partial<PaneConfig>) => void
  onRemove: () => void
}

/**
 * One column in Compare Mode. Renders:
 *   - Top: model picker + remove button + collapsed strategy chips
 *   - Middle: scrollable transcript (re-uses MessageBubble for fidelity)
 *   - Below the chips: an expandable system-prompt editor + strategy
 *     selectors (one click opens the config sheet inline)
 *
 * Per-pane config flows in via `pane`; changes flow out via `onChange`
 * — the parent CompareView owns the canonical state.
 */
export function ComparePane({
  pane,
  canRemove,
  onChange,
  onRemove,
}: ComparePaneProps) {
  const [configOpen, setConfigOpen] = useState(false)

  const totalCost = pane.messages.reduce<number>(
    (sum, m) => sum + (m.usage?.cost ?? 0),
    0
  )
  const totalTokens = pane.messages.reduce<number>(
    (sum, m) => sum + (m.usage?.totalTokens ?? 0),
    0
  )

  return (
    <div className="flex flex-col bg-background min-w-0 min-h-0">
      {/* Pane header: model picker + remove */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <select
          value={pane.model}
          onChange={(e) => onChange({ model: e.target.value })}
          disabled={pane.isStreaming}
          className="flex-1 min-w-0 truncate h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {AVAILABLE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.provider}
            </option>
          ))}
        </select>
        <button
          onClick={() => setConfigOpen((v) => !v)}
          className={cn(
            'p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors',
            configOpen && 'bg-muted/50 text-foreground'
          )}
          title="Configure pane"
        >
          <Settings className="h-4 w-4" />
        </button>
        {canRemove && (
          <button
            onClick={onRemove}
            disabled={pane.isStreaming}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            title="Remove pane"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Optional config sheet — inline above transcript so the
          user can see what they're changing without losing context */}
      {configOpen && (
        <div className="border-b border-border bg-muted/20 p-3 space-y-3">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
              System prompt
            </label>
            <textarea
              value={pane.systemPrompt}
              onChange={(e) => onChange({ systemPrompt: e.target.value })}
              placeholder="(none)"
              rows={2}
              className="w-full resize-none rounded border border-border bg-background px-2 py-1.5 text-xs font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <PaneSelect
              label="Routing"
              value={pane.routingStrategy}
              options={[
                ['round_robin', 'Round Robin'],
                ['cost_optimized', 'Cost Optimized'],
                ['quality_optimized', 'Quality Optimized'],
                ['latency_optimized', 'Latency'],
                ['weighted', 'Weighted'],
              ]}
              onChange={(v) =>
                onChange({ routingStrategy: v as RoutingStrategy })
              }
            />
            <PaneSelect
              label="Compression"
              value={pane.compressionStrategy}
              options={[
                ['none', 'None'],
                ['toon', 'TOON'],
                ['aisp', 'AISP'],
                ['yaml', 'YAML'],
                ['json_minify', 'JSON minify'],
              ]}
              onChange={(v) =>
                onChange({ compressionStrategy: v as CompressionStrategy })
              }
            />
            <PaneSelect
              label="Consistency"
              value={pane.consistencyStrategy}
              options={[
                ['none', 'None'],
                ['constitutional', 'Constitutional'],
                ['style_profile', 'Style Profile'],
                ['reference_anchoring', 'Reference'],
                ['few_shot_priming', 'Few-shot'],
                ['model_calibration', 'Calibration'],
              ]}
              onChange={(v) =>
                onChange({ consistencyStrategy: v as ConsistencyStrategy })
              }
            />
            <PaneSelect
              label="Validation"
              value={pane.validationStrategy}
              options={[
                ['none', 'None'],
                ['logprobs', 'Logprobs (preview)'],
                ['best_of_n', 'Best of N (preview)'],
                ['self_consistency', 'Self-consistency (preview)'],
                ['confidence_threshold', 'Threshold (preview)'],
              ]}
              onChange={(v) =>
                onChange({ validationStrategy: v as ValidationStrategy })
              }
            />
          </div>
        </div>
      )}

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4 min-h-0">
        {pane.messages.length === 0 && !pane.error && (
          <div className="flex flex-col items-center justify-center h-full text-center px-2">
            <MessageSquare className="h-6 w-6 text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground font-mono">
              Send a prompt to compare
            </p>
          </div>
        )}
        {pane.messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            isStreaming={pane.isStreaming && m.role === 'assistant'}
          />
        ))}
        {pane.error && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2 font-mono">
            {pane.error}
          </div>
        )}
      </div>

      {/* Pane footer: usage + cost roll-up */}
      <div className="border-t border-border px-3 py-1.5 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>{pane.messages.length} msg</span>
        <span>
          {totalTokens.toLocaleString()} tok · ${totalCost.toFixed(4)}
        </span>
      </div>
    </div>
  )
}

interface PaneSelectProps<T extends string> {
  label: string
  value: T
  options: ReadonlyArray<readonly [T, string]>
  onChange: (value: T) => void
}

function PaneSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: PaneSelectProps<T>) {
  return (
    <label className="block">
      <span className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full h-7 rounded border border-border bg-background px-2 text-xs"
      >
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}
