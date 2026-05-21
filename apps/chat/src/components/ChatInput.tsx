import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Square, Paperclip, ChevronDown, Check, Route, Shield, Sparkles, FileArchive, Lock } from 'lucide-react'
import { cn } from '../lib/utils'
import type { Model, RoutingStrategy, ValidationStrategy, ConsistencyStrategy, CompressionStrategy } from '../lib/types'
import { useQuotaStore } from '../stores/quotaStore'
import { ROUTING_STRATEGIES, VALIDATION_STRATEGIES, CONSISTENCY_STRATEGIES, COMPRESSION_STRATEGIES } from '../lib/types'

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
  compressionStrategy: CompressionStrategy
  onCompressionStrategyChange: (strategy: CompressionStrategy) => void
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
  compressionStrategy,
  onCompressionStrategyChange,
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<'routing' | 'validation' | 'consistency' | 'compression' | null>(null)
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

  const providerOrder: Array<'openai' | 'anthropic' | 'google'> = ['openai', 'anthropic', 'google']
  const providerLabels = { openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google' }

  const currentRouting = ROUTING_STRATEGIES.find(s => s.id === routingStrategy) || ROUTING_STRATEGIES[0]
  const currentValidation = VALIDATION_STRATEGIES.find(s => s.id === validationStrategy) || VALIDATION_STRATEGIES[0]
  const currentConsistency = CONSISTENCY_STRATEGIES.find(s => s.id === consistencyStrategy) || CONSISTENCY_STRATEGIES[0]
  const currentCompression = COMPRESSION_STRATEGIES.find(s => s.id === compressionStrategy) || COMPRESSION_STRATEGIES[0]

  return (
    <div className="border-t border-border/50 glass p-4">
      <div className="max-w-3xl mx-auto">
        {/* Strategy options row */}
        <div className="flex items-center gap-2 mb-3 flex-wrap" ref={strategyDropdownRef}>
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
              <div className="absolute bottom-full left-0 mb-2 w-72 max-h-72 overflow-y-auto rounded-xl glass-card shadow-premium-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="p-2">
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
                    Response Consistency
                  </div>
                  {CONSISTENCY_STRATEGIES.map((strategy) => (
                    <button
                      key={strategy.id}
                      onClick={() => {
                        onConsistencyStrategyChange(strategy.id)
                        setActiveDropdown(null)
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
