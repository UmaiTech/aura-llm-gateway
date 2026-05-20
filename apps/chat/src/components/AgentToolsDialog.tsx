/**
 * Modal where the user enables Agent mode and picks which built-in
 * tools the model can call.
 *
 * Replaces the old Header button that just flipped `agentMode` on/off
 * — that exposed the feature but gave users no control over which
 * tools fired. With the dialog they can:
 *   - Toggle agent mode itself (master switch)
 *   - See every available built-in tool with a one-line description
 *   - Enable / disable individual tools
 *   - See a small hint about external tools (Tavily key etc.)
 *
 * App.tsx is responsible for actually filtering BUILT_IN_TOOLS by the
 * store's enabledTools list when building the request — the dialog
 * just writes the toggle state.
 */

import { useEffect } from 'react'
import { Calculator, Check, Clock, CloudSun, Search, Wrench, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { BUILT_IN_TOOLS } from '../lib/agent'

interface AgentToolsDialogProps {
  open: boolean
  onClose: () => void
  agentMode: boolean
  onAgentModeChange: (enabled: boolean) => void
  enabledTools: string[]
  onToggleTool: (toolName: string) => void
}

// Tool name → icon + short pitch. Keeps the dialog readable; the
// long-form `description` on each Tool object goes to the model, not
// to the user.
const TOOL_PRESENTATION: Record<
  string,
  { icon: React.ReactNode; label: string; blurb: string }
> = {
  get_current_time: {
    icon: <Clock className="h-4 w-4 text-aura-400" />,
    label: 'Current time',
    blurb: "Ask the model what time it is in any timezone.",
  },
  calculate: {
    icon: <Calculator className="h-4 w-4 text-aura-400" />,
    label: 'Calculator',
    blurb: "Lets the model run arithmetic and basic math functions.",
  },
  web_search: {
    icon: <Search className="h-4 w-4 text-aura-400" />,
    label: 'Web search',
    blurb:
      "Tavily-backed search. Set VITE_TAVILY_API_KEY for real results; otherwise simulated.",
  },
  get_weather: {
    icon: <CloudSun className="h-4 w-4 text-aura-400" />,
    label: 'Weather',
    blurb: "Simulated weather for a location. Demo data, not live.",
  },
}

export function AgentToolsDialog({
  open,
  onClose,
  agentMode,
  onAgentModeChange,
  enabledTools,
  onToggleTool,
}: AgentToolsDialogProps) {
  // Esc-to-close + body scroll lock while open. Same pattern as
  // BetaUpsellModal so the two modals feel consistent.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  // Empty enabledTools = "all enabled" by convention (matches what
  // App.tsx sends today when no filtering is wired). Once the user
  // touches any toggle the list becomes authoritative.
  const everyToolEnabled =
    enabledTools.length === 0 ||
    enabledTools.length === BUILT_IN_TOOLS.length

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-gray-950 border border-gray-800 shadow-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-aura-500/15 border border-aura-500/30">
              <Wrench className="h-4 w-4 text-aura-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-100">
                Agent tools
              </h2>
              <p className="text-xs text-gray-500">
                Let the model call functions during its response.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Master toggle */}
        <label
          className={cn(
            'flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
            agentMode
              ? 'border-aura-500/30 bg-aura-500/5'
              : 'border-gray-800 bg-gray-900/40 hover:bg-gray-900/60',
          )}
        >
          <div>
            <div className="text-sm font-medium text-gray-100">Agent mode</div>
            <div className="text-xs text-gray-500">
              {agentMode
                ? 'Tools below are available to the model.'
                : 'Standard chat — tools off.'}
            </div>
          </div>
          <input
            type="checkbox"
            checked={agentMode}
            onChange={(e) => onAgentModeChange(e.target.checked)}
            className="h-4 w-4 accent-aura-500"
          />
        </label>

        {/* Per-tool list. Disabled visually when agent mode is off,
            but the user can still toggle them so they're ready when
            they flip the master switch. */}
        <div
          className={cn(
            'space-y-2 transition-opacity',
            !agentMode && 'opacity-50',
          )}
        >
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
            Built-in tools
          </div>
          {BUILT_IN_TOOLS.map((t) => {
            const meta = TOOL_PRESENTATION[t.name] ?? {
              icon: <Wrench className="h-4 w-4 text-gray-500" />,
              label: t.name,
              blurb: t.description,
            }
            // "all enabled by default" means the explicit list is
            // empty OR the tool is explicitly in it.
            const enabled = everyToolEnabled || enabledTools.includes(t.name)
            return (
              <button
                key={t.name}
                type="button"
                onClick={() => onToggleTool(t.name)}
                className={cn(
                  'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                  enabled
                    ? 'border-aura-500/30 bg-aura-500/5'
                    : 'border-gray-800 bg-gray-900/40 hover:bg-gray-900/60',
                )}
              >
                <div className="mt-0.5">{meta.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-100">
                    {meta.label}
                  </div>
                  <div className="text-xs text-gray-500 leading-relaxed mt-0.5">
                    {meta.blurb}
                  </div>
                </div>
                <div
                  className={cn(
                    'h-5 w-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5',
                    enabled
                      ? 'border-aura-500 bg-aura-500'
                      : 'border-gray-700 bg-gray-900',
                  )}
                >
                  {enabled && <Check className="h-3 w-3 text-white" />}
                </div>
              </button>
            )
          })}
        </div>

        <p className="text-xs text-gray-500 text-center pt-1">
          Tools run client-side after the model picks them. Results stream back
          into the same conversation.
        </p>
      </div>
    </div>
  )
}
