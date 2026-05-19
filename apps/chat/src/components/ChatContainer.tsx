import { useRef, useEffect } from 'react'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { WelcomeScreen } from './WelcomeScreen'
import { RateLimitNotice } from './RateLimitNotice'
import { RATE_LIMIT_SENTINEL } from '../hooks/useAgent'
import type { Message, Model, RoutingStrategy, ValidationStrategy, ConsistencyStrategy, CompressionStrategy } from '../lib/types'

interface ChatContainerProps {
  messages: Message[]
  isLoading: boolean
  error: string | null
  onSendMessage: (content: string) => Promise<void>
  onStopGeneration: () => void
  model: Model
  models: Model[]
  onModelChange: (model: Model) => void
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

export function ChatContainer({
  messages,
  isLoading,
  error,
  onSendMessage,
  onStopGeneration,
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
}: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Messages area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
      >
        {messages.length === 0 ? (
          <WelcomeScreen model={model} onSendMessage={onSendMessage} />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={message.isStreaming}
              />
            ))}
            {error && error.startsWith(RATE_LIMIT_SENTINEL) ? (
              <RateLimitNotice
                message={error.slice(RATE_LIMIT_SENTINEL.length)}
              />
            ) : error ? (
              <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">{error}</p>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <ChatInput
        onSendMessage={onSendMessage}
        onStopGeneration={onStopGeneration}
        isLoading={isLoading}
        disabled={false}
        model={model}
        models={models}
        onModelChange={onModelChange}
        onLockedModelClick={onLockedModelClick}
        routingStrategy={routingStrategy}
        onRoutingStrategyChange={onRoutingStrategyChange}
        validationStrategy={validationStrategy}
        onValidationStrategyChange={onValidationStrategyChange}
        consistencyStrategy={consistencyStrategy}
        onConsistencyStrategyChange={onConsistencyStrategyChange}
        compressionStrategy={compressionStrategy}
        onCompressionStrategyChange={onCompressionStrategyChange}
      />
    </div>
  )
}
