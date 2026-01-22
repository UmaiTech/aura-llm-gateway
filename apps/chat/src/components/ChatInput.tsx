import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Square, Paperclip } from 'lucide-react'
import { cn } from '../lib/utils'

interface ChatInputProps {
  onSendMessage: (content: string) => Promise<void>
  onStopGeneration: () => void
  isLoading: boolean
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({
  onSendMessage,
  onStopGeneration,
  isLoading,
  disabled,
  placeholder = "Message Aura...",
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [input])

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

  return (
    <div className="border-t border-border bg-background/80 backdrop-blur-sm p-4">
      <div className="max-w-3xl mx-auto">
        <div className={cn(
          "relative flex items-end gap-2 rounded-2xl border border-border bg-secondary/50 p-2 transition-all",
          "focus-within:border-primary-500/50 focus-within:ring-2 focus-within:ring-primary-500/20"
        )}>
          {/* Attachment button (placeholder) */}
          <button
            aria-label="Attach file (coming soon)"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Attach file (coming soon)"
            disabled
          >
            <Paperclip className="h-5 w-5" aria-hidden="true" />
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
            aria-label="Message input"
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
              aria-label="Stop generation"
              className="p-2.5 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              title="Stop generation"
            >
              <Square className="h-4 w-4 fill-current" aria-hidden="true" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || disabled}
              aria-label="Send message"
              className={cn(
                "p-2.5 rounded-xl transition-colors",
                input.trim() && !disabled
                  ? "bg-primary-500 text-white hover:bg-primary-600"
                  : "bg-secondary text-muted-foreground cursor-not-allowed"
              )}
              title="Send message"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
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
