import { useState, useCallback, useRef } from 'react'
import { api, messagesToInput } from '../lib/api'
import { generateId } from '../lib/utils'
import type { Message } from '../lib/types'

interface UseChatOptions {
  model: string
  conversationId: string | null
  systemPrompt?: string
}

interface UseChatReturn {
  messages: Message[]
  isLoading: boolean
  error: string | null
  sendMessage: (content: string) => Promise<void>
  stopGeneration: () => void
  clearMessages: () => void
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
}

export function useChat({ model, systemPrompt }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    setError(null)
    setIsLoading(true)

    // Add user message
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      createdAt: new Date(),
    }

    // Create placeholder for assistant message
    const assistantMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      isStreaming: true,
    }

    setMessages(prev => [...prev, userMessage, assistantMessage])

    try {
      // Build conversation history
      const allMessages = [...messages, userMessage]
      const input = messagesToInput(allMessages)

      // Stream the response
      let fullContent = ''

      for await (const event of api.createResponseStream({
        model,
        input,
        instructions: systemPrompt,
        stream: true,
      })) {
        // Handle different event types
        if (event.type === 'response.output_text.delta' && event.delta) {
          fullContent += event.delta
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessage.id
                ? { ...m, content: fullContent }
                : m
            )
          )
        } else if (event.type === 'response.completed') {
          // Mark streaming as complete
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessage.id
                ? { ...m, isStreaming: false }
                : m
            )
          )
        } else if (event.type === 'response.failed' || event.type === 'error') {
          const errorMessage = event.error?.message || event.response?.error?.message || 'Generation failed'
          throw new Error(errorMessage)
        }
      }

      // Ensure streaming flag is removed
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMessage.id
            ? { ...m, isStreaming: false }
            : m
        )
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)

      // Remove the empty assistant message on error
      setMessages(prev => prev.filter(m => m.id !== assistantMessage.id))
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [messages, model, systemPrompt, isLoading])

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsLoading(false)

    // Mark any streaming messages as complete
    setMessages(prev =>
      prev.map(m =>
        m.isStreaming ? { ...m, isStreaming: false } : m
      )
    )
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
    clearMessages,
    setMessages,
  }
}
