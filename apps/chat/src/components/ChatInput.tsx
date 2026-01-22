import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Square, Paperclip, ChevronDown, Check } from 'lucide-react'
import { cn } from '../lib/utils'
import type { Model } from '../lib/types'

interface ChatInputProps {
  onSendMessage: (content: string) => Promise<void>
  onStopGeneration: () => void
  isLoading: boolean
  disabled?: boolean
  placeholder?: string
  model: Model
  models: Model[]
  onModelChange: (model: Model) => void
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
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [input])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false)
      }
    }

    if (modelDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [modelDropdownOpen])

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading || disabled) return

    const message = input.trim()
    setInput('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    await onSendMessage(message)
  }, [input, isLoading, disabled, onSendMessage])

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

  return (
    <div className="border-t border-border/50 glass p-4">
      <div className="max-w-3xl mx-auto">
        <div className={cn(
          "relative flex items-end gap-2 rounded-2xl border border-border bg-secondary/50 p-2 transition-all shadow-premium",
          "focus-within:border-primary-500/50 focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:shadow-premium-lg"
        )}>
          {/* Model selector dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
              title={`Current model: ${model.name}`}
            >
              <span className="hidden sm:inline">{model.name}</span>
              <span className="sm:hidden">{model.id.split('-')[0]}</span>
              <ChevronDown className={cn(
                "h-3.5 w-3.5 transition-transform",
                modelDropdownOpen && "rotate-180"
              )} />
            </button>

            {/* Dropdown menu (overlays upward) */}
            {modelDropdownOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-64 max-h-96 overflow-y-auto rounded-xl glass-card shadow-premium-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                {providerOrder.map((provider) => {
                  const providerModels = groupedModels[provider]
                  if (!providerModels || providerModels.length === 0) return null

                  return (
                    <div key={provider} className="py-2">
                      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {providerLabels[provider]}
                      </div>
                      {providerModels.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            onModelChange(m)
                            setModelDropdownOpen(false)
                          }}
                          className={cn(
                            "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors",
                            m.id === model.id && "bg-primary-500/10 text-primary-400"
                          )}
                        >
                          <span className="truncate">{m.name}</span>
                          {m.id === model.id && (
                            <Check className="h-4 w-4 flex-shrink-0" />
                          )}
                        </button>
                      ))}
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
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent text-foreground placeholder:text-muted-foreground",
              "focus:outline-none text-sm leading-relaxed py-2",
              "min-h-[40px] max-h-[200px]"
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
              disabled={!input.trim() || disabled}
              className={cn(
                "p-2.5 rounded-xl transition-colors",
                input.trim() && !disabled
                  ? "bg-primary-500 text-white hover:bg-primary-600"
                  : "bg-secondary text-muted-foreground cursor-not-allowed"
              )}
              title="Send message"
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
