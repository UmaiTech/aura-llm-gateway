import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Square, Paperclip, ChevronDown, Check, Route, Shield, Sparkles, FileArchive, Lock, Wand2 } from 'lucide-react'
import { cn } from '../lib/utils'
import type { Model, RoutingStrategy, ValidationStrategy, ConsistencyStrategy, CompressionStrategy, Tone, Formality, Verbosity, AutoRoutingSettings, AutoRoutingTier } from '../lib/types'
import { useQuotaStore } from '../stores/quotaStore'
import { ROUTING_STRATEGIES, VALIDATION_STRATEGIES, CONSISTENCY_STRATEGIES, COMPRESSION_STRATEGIES, AUTO_ROUTING_TIERS, AUTO_ROUTING_CLASSIFIERS, isAutoModel } from '../lib/types'
import { DEFAULT_CONSTITUTIONAL_PRINCIPLES } from '../stores/chatStore'

interface ChatInputProps {
  onSendMessage: (content: string) => Promise<void>
  onStopGeneration: () => void
  isLoading: boolean
  disabled?: boolean
  placeholder?: string
  model: Model
  models: Model[]
  onModelChange: (model: Model) => void
  /**
   * Fires when the user taps a model marked `tier: 'beta'`. The parent
   * is expected to surface the join-the-beta CTA (modal / inline panel /
   * navigation) rather than swap the model. Optional: if absent, locked
   * models are simply non-clickable.
   */
  onLockedModelClick?: (model: Model) => void
  routingStrategy: RoutingStrategy
  onRoutingStrategyChange: (strategy: RoutingStrategy) => void
  validationStrategy: ValidationStrategy
  onValidationStrategyChange: (strategy: ValidationStrategy) => void
  consistencyStrategy: ConsistencyStrategy
  onConsistencyStrategyChange: (strategy: ConsistencyStrategy) => void
  // Parametric consistency controls — surfaced inside the consistency
  // popover when the chosen strategy needs configuration.
  consistencyPrinciples: string[]
  onConsistencyPrinciplesChange: (principles: string[]) => void
  consistencyStyleTone: Tone
  onConsistencyStyleToneChange: (tone: Tone) => void
  consistencyStyleFormality: Formality
  onConsistencyStyleFormalityChange: (formality: Formality) => void
  consistencyStyleVerbosity: Verbosity
  onConsistencyStyleVerbosityChange: (verbosity: Verbosity) => void
  compressionStrategy: CompressionStrategy
  onCompressionStrategyChange: (strategy: CompressionStrategy) => void
  // Auto router options — shown only while an `auto*` model is selected.
  autoRouting: AutoRoutingSettings
  onAutoRoutingChange: (updates: Partial<AutoRoutingSettings>) => void
}

export function ChatInput({
  onSendMessage,
  onStopGeneration,
  isLoading,
  disabled,
  placeholder = "Message Aura...",
  model,
  models,
  onModelChange,
  onLockedModelClick,
  routingStrategy,
  onRoutingStrategyChange,
  validationStrategy,
  onValidationStrategyChange,
  consistencyStrategy,
  onConsistencyStrategyChange,
  consistencyPrinciples,
  onConsistencyPrinciplesChange,
  consistencyStyleTone,
  onConsistencyStyleToneChange,
  consistencyStyleFormality,
  onConsistencyStyleFormalityChange,
  consistencyStyleVerbosity,
  onConsistencyStyleVerbosityChange,
  compressionStrategy,
  onCompressionStrategyChange,
  autoRouting,
  onAutoRoutingChange,
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<'routing' | 'validation' | 'consistency' | 'compression' | 'auto' | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const strategyDropdownRef = useRef<HTMLDivElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [input])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false)
      }
      if (strategyDropdownRef.current && !strategyDropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null)
      }
    }

    if (modelDropdownOpen || activeDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [modelDropdownOpen, activeDropdown])

  // Hard cutoff: when the user's daily quota is exhausted (server
  // told us so on the last response or 429), block sends client-side
  // instead of letting the user hit 429 again and again. Reads from
  // quotaStore which is hydrated from response headers + persisted to
  // localStorage so a refresh doesn't re-enable the input until the
  // gateway grants fresh quota.
  const quotaExhausted = useQuotaStore((s) => s.isExhausted())
  const effectiveDisabled = disabled || quotaExhausted
  const effectivePlaceholder = quotaExhausted
    ? "You've used your daily free messages — join the beta for more."
    : placeholder

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading || effectiveDisabled) return

    const message = input.trim()
    setInput('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    await onSendMessage(message)
  }, [input, isLoading, effectiveDisabled, onSendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  // Group models by provider
  const groupedModels = models.reduce((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = []
    acc[m.provider].push(m)
    return acc
  }, {} as Record<string, Model[]>)

  const providerOrder: Array<'aura' | 'openai' | 'anthropic' | 'google'> = ['aura', 'openai', 'anthropic', 'google']
  const providerLabels = { aura: 'Auto routing', openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google' }

  const currentRouting = ROUTING_STRATEGIES.find(s => s.id === routingStrategy) || ROUTING_STRATEGIES[0]
  const currentValidation = VALIDATION_STRATEGIES.find(s => s.id === validationStrategy) || VALIDATION_STRATEGIES[0]
  const currentConsistency = CONSISTENCY_STRATEGIES.find(s => s.id === consistencyStrategy) || CONSISTENCY_STRATEGIES[0]
  const currentCompression = COMPRESSION_STRATEGIES.find(s => s.id === compressionStrategy) || COMPRESSION_STRATEGIES[0]

  // Auto router: the model alias carries the mode; everything else is
  // sent as the request's `routing` object.
  const autoActive = isAutoModel(model.id)
  const autoMode = model.id === 'auto:cost' ? 'cost' : model.id === 'auto:quality' ? 'quality' : 'balanced'
  const autoModels = models.filter((m) => isAutoModel(m.id))
  const autoTweaks =
    (autoRouting.minTier ? 1 : 0) +
    (autoRouting.maxTier ? 1 : 0) +
    (autoRouting.classifier ? 1 : 0) +
    (autoRouting.maxCostUsd !== null && autoRouting.maxCostUsd > 0 ? 1 : 0) +
    (autoRouting.sticky ? 0 : 1)
  const tierIndex = (t: AutoRoutingTier | null) => (t ? AUTO_ROUTING_TIERS.indexOf(t) : -1)

  return (
    <div className="border-t border-border/50 glass p-4">
      <div className="max-w-3xl mx-auto">
        {/* Strategy options row */}
        <div className="flex items-center gap-2 mb-3 flex-wrap" ref={strategyDropdownRef}>
          {/* Auto router — only while an auto alias is the model. Switch
              to a concrete model to turn the router off; pick "Auto"
              in the model picker to turn it back on. */}
          {autoActive && (
            <div className="relative">
              <button
                onClick={() => setActiveDropdown(activeDropdown === 'auto' ? null : 'auto')}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors",
                  "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                )}
                title="Auto router options"
              >
                <Wand2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Auto · {autoMode}</span>
                {autoTweaks > 0 && (
                  <span className="px-1 rounded bg-emerald-500/20 text-[10px] font-semibold">{autoTweaks}</span>
                )}
                <ChevronDown className={cn("h-3 w-3", activeDropdown === 'auto' && "rotate-180")} />
              </button>
              {activeDropdown === 'auto' && (
                <div className="absolute bottom-full left-0 mb-2 w-80 rounded-xl glass-card shadow-premium-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="p-3 space-y-3 text-xs">
                    <div className="flex items-center justify-between border-b border-border pb-1.5">
                      <span className="font-medium text-muted-foreground uppercase tracking-wider">Auto router</span>
                      <button
                        onClick={() => onAutoRoutingChange({ minTier: null, maxTier: null, classifier: null, maxCostUsd: null, sticky: true })}
                        className="text-muted-foreground hover:text-foreground"
                        title="Reset to gateway defaults"
                      >
                        reset
                      </button>
                    </div>

                    {/* Mode = which auto alias is selected */}
                    <div>
                      <div className="text-muted-foreground mb-1">Mode</div>
                      <div className="grid grid-cols-3 gap-1">
                        {(['cost', 'balanced', 'quality'] as const).map((mode) => {
                          const target = autoModels.find((m) => m.id === (mode === 'balanced' ? 'auto' : `auto:${mode}`))
                          return (
                            <button
                              key={mode}
                              disabled={!target}
                              onClick={() => target && onModelChange(target)}
                              className={cn(
                                "px-2 py-1 rounded-lg border transition-colors capitalize",
                                autoMode === mode
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                  : "border-transparent hover:bg-secondary text-muted-foreground"
                              )}
                            >
                              {mode}
                            </button>
                          )
                        })}
                      </div>
                      <div className="text-muted-foreground mt-1">Shifts the complexity score before it maps to a tier.</div>
                    </div>

                    {/* Tier clamps */}
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <div className="text-muted-foreground mb-1">Min tier</div>
                        <select
                          value={autoRouting.minTier ?? ''}
                          onChange={(e) => {
                            const v = (e.target.value || null) as AutoRoutingTier | null
                            onAutoRoutingChange({
                              minTier: v,
                              maxTier: v && tierIndex(autoRouting.maxTier) >= 0 && tierIndex(autoRouting.maxTier) < tierIndex(v) ? v : autoRouting.maxTier,
                            })
                          }}
                          className="w-full h-7 rounded-md border border-input bg-background px-1.5"
                        >
                          <option value="">default</option>
                          {AUTO_ROUTING_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <div className="text-muted-foreground mb-1">Max tier</div>
                        <select
                          value={autoRouting.maxTier ?? ''}
                          onChange={(e) => {
                            const v = (e.target.value || null) as AutoRoutingTier | null
                            onAutoRoutingChange({
                              maxTier: v,
                              minTier: v && tierIndex(autoRouting.minTier) > tierIndex(v) ? v : autoRouting.minTier,
                            })
                          }}
                          className="w-full h-7 rounded-md border border-input bg-background px-1.5"
                        >
                          <option value="">default</option>
                          {AUTO_ROUTING_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                    </div>

                    {/* Classifier */}
                    <label className="block">
                      <div className="text-muted-foreground mb-1">Classifier</div>
                      <select
                        value={autoRouting.classifier ?? ''}
                        onChange={(e) => onAutoRoutingChange({ classifier: (e.target.value || null) as AutoRoutingSettings['classifier'] })}
                        className="w-full h-7 rounded-md border border-input bg-background px-1.5"
                      >
                        <option value="">gateway default</option>
                        {AUTO_ROUTING_CLASSIFIERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {autoRouting.classifier && (
                        <div className="text-muted-foreground mt-1">
                          {AUTO_ROUTING_CLASSIFIERS.find((c) => c.id === autoRouting.classifier)?.description}
                        </div>
                      )}
                    </label>

                    {/* Budget */}
                    <label className="block">
                      <div className="text-muted-foreground mb-1">Max cost per request (USD)</div>
                      <input
                        type="number"
                        min={0}
                        step={0.001}
                        placeholder="no budget"
                        value={autoRouting.maxCostUsd ?? ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? null : Number(e.target.value)
                          onAutoRoutingChange({ maxCostUsd: v !== null && Number.isFinite(v) && v > 0 ? v : null })
                        }}
                        className="w-full h-7 rounded-md border border-input bg-background px-1.5 font-mono"
                      />
                      <div className="text-muted-foreground mt-1">Needs an active cost model; candidates predicted above this are skipped.</div>
                    </label>

                    {/* Sticky */}
                    <label className="flex items-center justify-between gap-2 cursor-pointer">
                      <span>
                        <div>Sticky tool loops</div>
                        <div className="text-muted-foreground">Keep the previous model while an agent turn continues.</div>
                      </span>
                      <input
                        type="checkbox"
                        checked={autoRouting.sticky}
                        onChange={(e) => onAutoRoutingChange({ sticky: e.target.checked })}
                        className="h-4 w-4 accent-emerald-500"
                      />
                    </label>

                    <div className="text-muted-foreground border-t border-border pt-2">
                      Every answer gets an <span className="text-emerald-400">auto · tier · model</span> chip; click it to see the score, candidates and reason. Pinned models still show a <span className="text-amber-400">shadow</span> chip with what auto would have done.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Routing */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'routing' ? null : 'routing')}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors",
                routingStrategy !== 'round_robin'
                  ? "bg-primary-500/10 text-primary-400 border border-primary-500/30"
                  : "text-muted-foreground hover:bg-secondary border border-transparent"
              )}
              title={`Routing: ${currentRouting.name}`}
            >
              <Route className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{currentRouting.name}</span>
              <ChevronDown className={cn("h-3 w-3", activeDropdown === 'routing' && "rotate-180")} />
            </button>
            {activeDropdown === 'routing' && (
              <div className="absolute bottom-full left-0 mb-2 w-64 max-h-72 overflow-y-auto rounded-xl glass-card shadow-premium-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="p-2">
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
                    Routing Strategy
                  </div>
                  {ROUTING_STRATEGIES.map((strategy) => (
                    <button
                      key={strategy.id}
                      onClick={() => {
                        onRoutingStrategyChange(strategy.id)
                        setActiveDropdown(null)
                      }}
                      className={cn(
                        "w-full flex items-start gap-2 px-3 py-1.5 rounded-lg text-left text-xs hover:bg-secondary transition-colors",
                        strategy.id === routingStrategy && "bg-primary-500/10"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className={cn("font-medium", strategy.id === routingStrategy && "text-primary-400")}>
                          {strategy.name}
                        </div>
                        <div className="text-muted-foreground truncate">{strategy.description}</div>
                      </div>
                      {strategy.id === routingStrategy && <Check className="h-3.5 w-3.5 text-primary-400 mt-0.5" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Compression */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'compression' ? null : 'compression')}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors",
                compressionStrategy !== 'none'
                  ? "bg-aura-500/10 text-aura-400 border border-aura-500/30"
                  : "text-muted-foreground hover:bg-secondary border border-transparent"
              )}
              title={`Compression: ${currentCompression.name}`}
            >
              <FileArchive className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{currentCompression.name}</span>
              <ChevronDown className={cn("h-3 w-3", activeDropdown === 'compression' && "rotate-180")} />
            </button>
            {activeDropdown === 'compression' && (
              <div className="absolute bottom-full left-0 mb-2 w-72 max-h-72 overflow-y-auto rounded-xl glass-card shadow-premium-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="p-2">
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
                    Prompt Compression
                  </div>
                  {COMPRESSION_STRATEGIES.map((strategy) => (
                    <button
                      key={strategy.id}
                      onClick={() => {
                        onCompressionStrategyChange(strategy.id)
                        setActiveDropdown(null)
                      }}
                      className={cn(
                        "w-full flex items-start gap-2 px-3 py-1.5 rounded-lg text-left text-xs hover:bg-secondary transition-colors",
                        strategy.id === compressionStrategy && "bg-aura-500/10"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn("font-medium", strategy.id === compressionStrategy && "text-aura-400")}>
                            {strategy.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {strategy.savings}
                          </span>
                        </div>
                        <div className="text-muted-foreground">{strategy.description}</div>
                      </div>
                      {strategy.id === compressionStrategy && <Check className="h-3.5 w-3.5 text-aura-400 mt-0.5" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Validation */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'validation' ? null : 'validation')}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors",
                validationStrategy !== 'none'
                  ? "bg-green-500/10 text-green-400 border border-green-500/30"
                  : "text-muted-foreground hover:bg-secondary border border-transparent"
              )}
              title={`Validation: ${currentValidation.name}`}
            >
              <Shield className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{currentValidation.name}</span>
              <ChevronDown className={cn("h-3 w-3", activeDropdown === 'validation' && "rotate-180")} />
            </button>
            {activeDropdown === 'validation' && (
              <div className="absolute bottom-full left-0 mb-2 w-64 max-h-72 overflow-y-auto rounded-xl glass-card shadow-premium-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="p-2">
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
                    Response Validation
                  </div>
                  {VALIDATION_STRATEGIES.map((strategy) => (
                    <button
                      key={strategy.id}
                      onClick={() => {
                        onValidationStrategyChange(strategy.id)
                        setActiveDropdown(null)
                      }}
                      className={cn(
                        "w-full flex items-start gap-2 px-3 py-1.5 rounded-lg text-left text-xs hover:bg-secondary transition-colors",
                        strategy.id === validationStrategy && "bg-green-500/10"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("font-medium", strategy.id === validationStrategy && "text-green-400")}>
                            {strategy.name}
                          </span>
                          {strategy.preview && (
                            <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground bg-muted px-1 py-0.5 rounded">
                              preview
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground truncate">{strategy.description}</div>
                      </div>
                      {strategy.id === validationStrategy && <Check className="h-3.5 w-3.5 text-green-400 mt-0.5" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Consistency */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'consistency' ? null : 'consistency')}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors",
                consistencyStrategy !== 'none'
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                  : "text-muted-foreground hover:bg-secondary border border-transparent"
              )}
              title={`Consistency: ${currentConsistency.name}`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{currentConsistency.name}</span>
              <ChevronDown className={cn("h-3 w-3", activeDropdown === 'consistency' && "rotate-180")} />
            </button>
            {activeDropdown === 'consistency' && (
              <div className="absolute bottom-full left-0 mb-2 w-80 max-h-[28rem] overflow-y-auto rounded-xl glass-card shadow-premium-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="p-2">
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
                    Response Consistency
                  </div>
                  {CONSISTENCY_STRATEGIES.map((strategy) => (
                    <button
                      key={strategy.id}
                      onClick={() => {
                        onConsistencyStrategyChange(strategy.id)
                        // Keep popover open if the new strategy has
                        // params the user might want to tweak.
                        if (strategy.id !== 'constitutional' && strategy.id !== 'style_profile') {
                          setActiveDropdown(null)
                        }
                      }}
                      className={cn(
                        "w-full flex items-start gap-2 px-3 py-1.5 rounded-lg text-left text-xs hover:bg-secondary transition-colors",
                        strategy.id === consistencyStrategy && "bg-amber-500/10"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className={cn("font-medium", strategy.id === consistencyStrategy && "text-amber-400")}>
                          {strategy.name}
                        </div>
                        <div className="text-muted-foreground">{strategy.description}</div>
                      </div>
                      {strategy.id === consistencyStrategy && <Check className="h-3.5 w-3.5 text-amber-400 mt-0.5" />}
                    </button>
                  ))}

                  {/* Constitutional: editable principles. Empty value
                      = fall back to gateway defaults (see chatStore
                      getConsistencyConfig). */}
                  {consistencyStrategy === 'constitutional' && (
                    <div className="mt-2 pt-2 border-t border-border px-1">
                      <div className="px-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        Principles · one per line
                      </div>
                      <textarea
                        value={consistencyPrinciples.join('\n')}
                        onChange={(e) => {
                          const lines = e.target.value
                            .split('\n')
                            .map((l) => l.trim())
                            .filter((l) => l.length > 0)
                          onConsistencyPrinciplesChange(lines)
                        }}
                        placeholder={DEFAULT_CONSTITUTIONAL_PRINCIPLES.join('\n')}
                        rows={5}
                        className="w-full px-2 py-1.5 rounded-md bg-secondary/50 border border-border text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/40"
                      />
                      <div className="px-2 pt-1 text-[10px] text-muted-foreground">
                        Empty = use {DEFAULT_CONSTITUTIONAL_PRINCIPLES.length} sensible defaults.
                      </div>
                    </div>
                  )}

                  {/* Style Profile: tone/formality/verbosity dropdowns. */}
                  {consistencyStrategy === 'style_profile' && (
                    <div className="mt-2 pt-2 border-t border-border px-1 space-y-2">
                      <ConsistencyStyleSelect
                        label="Tone"
                        value={consistencyStyleTone}
                        onChange={onConsistencyStyleToneChange}
                        options={['professional', 'friendly', 'neutral', 'authoritative', 'empathetic']}
                      />
                      <ConsistencyStyleSelect
                        label="Formality"
                        value={consistencyStyleFormality}
                        onChange={onConsistencyStyleFormalityChange}
                        options={['formal', 'standard', 'casual']}
                      />
                      <ConsistencyStyleSelect
                        label="Verbosity"
                        value={consistencyStyleVerbosity}
                        onChange={onConsistencyStyleVerbosityChange}
                        options={['concise', 'balanced', 'detailed']}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main input area */}
        <div className={cn(
          "relative flex items-end gap-2 rounded-2xl border border-border bg-secondary/50 p-2 transition-all shadow-premium",
          "focus-within:border-primary-500/50 focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:shadow-premium-lg"
        )}>
          {/* Model selector dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-secondary transition-colors whitespace-nowrap",
                modelDropdownOpen && "bg-secondary",
              )}
              aria-label={`Model: ${model.name}`}
            >
              <span className="hidden sm:inline">{model.name}</span>
              <span className="sm:hidden">{model.id.split('-')[0]}</span>
              {model.tier === 'beta' && (
                // Mirror the row badge so the user can SEE that the
                // currently-selected model is locked. Otherwise their
                // sends would silently fail and they'd have no idea why.
                <Lock className="h-3 w-3 text-aura-400" aria-label="Beta-locked" />
              )}
              <ChevronDown className={cn(
                "h-3.5 w-3.5 transition-transform",
                modelDropdownOpen && "rotate-180"
              )} />
            </button>

            {/* Dropdown menu — opens upward, solid background so the
                chat behind it doesn't show through. `bg-popover` falls
                back to a near-opaque dark in dark mode + near-opaque
                white in light mode; w-72 gives badges room without
                wrapping. */}
            {modelDropdownOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-72 max-h-96 overflow-y-auto rounded-xl border border-border bg-popover shadow-premium-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                {providerOrder.map((provider) => {
                  const providerModels = groupedModels[provider]
                  if (!providerModels || providerModels.length === 0) return null

                  return (
                    <div key={provider} className="py-1.5">
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {providerLabels[provider]}
                      </div>
                      {providerModels.map((m) => {
                        const locked = m.tier === 'beta'
                        const selected = m.id === model.id
                        return (
                          <button
                            key={m.id}
                            onClick={() => {
                              if (locked) {
                                onLockedModelClick?.(m)
                              } else {
                                onModelChange(m)
                              }
                              setModelDropdownOpen(false)
                            }}
                            className={cn(
                              "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors text-left",
                              "hover:bg-secondary",
                              selected && !locked && "bg-primary-500/10 text-primary-400",
                              selected && locked && "bg-aura-500/10",
                              locked && !selected && "text-muted-foreground",
                            )}
                          >
                            <span className="truncate min-w-0 flex-1">{m.name}</span>
                            <span className="flex items-center gap-1.5 flex-shrink-0">
                              {locked && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-aura-500/15 text-aura-300 border border-aura-500/30">
                                  <Lock className="h-2.5 w-2.5" />
                                  Beta
                                </span>
                              )}
                              {selected && !locked && (
                                <Check className="h-4 w-4" />
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Attachment button (placeholder) */}
          <button
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Attach file (coming soon)"
            disabled
          >
            <Paperclip className="h-5 w-5" />
          </button>

          {/* Input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={effectivePlaceholder}
            disabled={effectiveDisabled}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent text-foreground placeholder:text-muted-foreground",
              "focus:outline-none text-sm leading-relaxed py-2",
              "min-h-[40px] max-h-[200px]",
              quotaExhausted && "cursor-not-allowed"
            )}
          />

          {/* Send/Stop button */}
          {isLoading ? (
            <button
              onClick={onStopGeneration}
              className="p-2.5 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              title="Stop generation"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || effectiveDisabled}
              className={cn(
                "p-2.5 rounded-xl transition-colors",
                input.trim() && !effectiveDisabled
                  ? "bg-primary-500 text-white hover:bg-primary-600"
                  : "bg-secondary text-muted-foreground cursor-not-allowed"
              )}
              title={
                quotaExhausted
                  ? "Daily free-tier limit reached. Join the beta for more."
                  : "Send message"
              }
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Footer text */}
        <p className="text-center text-xs text-muted-foreground mt-3">
          Aura can make mistakes. Consider checking important information.
        </p>
      </div>
    </div>
  )
}

function ConsistencyStyleSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: readonly T[]
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="text-xs bg-secondary/50 border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:border-amber-500/40 capitalize"
      >
        {options.map((opt) => (
          <option key={opt} value={opt} className="capitalize">
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}
