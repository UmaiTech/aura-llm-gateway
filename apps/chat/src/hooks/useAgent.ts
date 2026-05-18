// Agent hook for handling tool-augmented conversations
// Uses the Aura Gateway with automatic tool execution

import { useState, useCallback, useRef } from 'react'
import { generateId } from '../lib/utils'
import { BUILT_IN_TOOLS, executeTool } from '../lib/agent'
import { calculateCost } from '../lib/pricing'
import { AuraApiError } from '../lib/api'
import type { Message, Tool, ToolInvocation, MessageUsage } from '../lib/types'

// In prod, requests flow through /api/proxy (the serverless function holds
// the per-user gateway API key). In local dev with `vercel dev`, same path.
// To bypass the proxy and hit a local gateway directly, set VITE_API_BASE_URL.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/proxy'

/**
 * Turn a raw error into a UI-friendly message. Surfaces special copy for
 * rate-limit (429) and auth (401) errors so the user knows what to do.
 */
function friendlyErrorMessage(err: unknown): string {
  if (err instanceof AuraApiError) {
    if (err.isRateLimit()) {
      const retryHint = err.retryAfter ? ` Try again in ${err.retryAfter}s.` : ''
      return `You've hit the free-tier limit (5 requests/min, 50K tokens/month).${retryHint} Star the repo on GitHub and let us know if you want a higher tier.`
    }
    if (err.isUnauthenticated()) {
      return 'Your session expired. Refresh the page to sign in again.'
    }
    return err.message
  }
  return err instanceof Error ? err.message : 'An unexpected error occurred'
}

interface UseAgentOptions {
  model: string
  systemPrompt?: string
  tools?: Tool[]
  maxToolRoundtrips?: number
}

interface UseAgentReturn {
  messages: Message[]
  isLoading: boolean
  error: string | null
  sendMessage: (content: string) => Promise<void>
  stop: () => void
  setMessages: (messages: Message[]) => void
}

interface StreamEvent {
  type: string
  delta?: string
  item?: {
    type: string
    id?: string
    name?: string
    call_id?: string
    arguments?: string
  }
  response?: {
    id: string
    status: string
    output?: Array<{
      type: string
      id?: string
      name?: string
      call_id?: string
      arguments?: string
      content?: Array<{ type: string; text?: string }>
    }>
    usage?: {
      input_tokens: number
      output_tokens: number
    }
  }
}

export function useAgent({
  model,
  systemPrompt,
  tools = BUILT_IN_TOOLS,
  maxToolRoundtrips = 5,
}: UseAgentOptions): UseAgentReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsLoading(false)
  }, [])

  const sendMessage = useCallback(
    async (content: string) => {
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

      const updatedMessages = [...messages, userMessage]
      setMessages(updatedMessages)

      // Create abort controller
      abortControllerRef.current = new AbortController()

      try {
        await runAgentLoop(
          updatedMessages,
          model,
          systemPrompt,
          tools,
          maxToolRoundtrips,
          abortControllerRef.current.signal,
          setMessages,
          setError
        )
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // User cancelled - don't show error
        } else {
          setError(friendlyErrorMessage(err))
        }
      } finally {
        setIsLoading(false)
        abortControllerRef.current = null
      }
    },
    [messages, model, systemPrompt, tools, maxToolRoundtrips, isLoading]
  )

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    stop,
    setMessages,
  }
}

async function runAgentLoop(
  messages: Message[],
  model: string,
  systemPrompt: string | undefined,
  tools: Tool[],
  maxRoundtrips: number,
  signal: AbortSignal,
  setMessages: (fn: (prev: Message[]) => Message[]) => void,
  setError: (error: string | null) => void
): Promise<void> {
  let currentMessages = [...messages]
  let roundtrip = 0

  while (roundtrip < maxRoundtrips) {
    roundtrip++

    // Create assistant message placeholder
    const assistantMessageId = generateId()
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      isStreaming: true,
      toolInvocations: [],
    }

    setMessages((prev) => [...prev, assistantMessage])

    // Build request
    const input = currentMessages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.toolInvocations?.some((t) => t.state === 'result')) {
          // This is a message with tool results - include them
          return m.toolInvocations
            .filter((t) => t.state === 'result')
            .map((t) => ({
              type: 'function_call_output' as const,
              call_id: t.toolCallId,
              output: t.result || '',
            }))
        }
        return {
          type: 'message' as const,
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }
      })
      .flat()

    const request = {
      model,
      input,
      instructions: systemPrompt,
      tools: tools.map((t) => ({
        type: 'function' as const,
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      stream: true,
    }

    // Make streaming request
    const response = await fetch(`${API_BASE}/v1/responses`, {
      method: 'POST',
      credentials: 'include', // Session cookie auth via /api/proxy
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || `Request failed: ${response.status}`)
    }

    // Process stream
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''
    let usage: MessageUsage | undefined
    const toolCalls: Array<{
      id: string
      name: string
      arguments: string
    }> = []

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            try {
              const event: StreamEvent = JSON.parse(data)

              // Handle text delta
              if (event.type === 'response.output_text.delta' && event.delta) {
                fullContent += event.delta
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId ? { ...m, content: fullContent } : m
                  )
                )
              }

              // Handle function call
              if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
                const toolCall = {
                  id: event.item.call_id || generateId(),
                  name: event.item.name || '',
                  arguments: event.item.arguments || '{}',
                }
                toolCalls.push(toolCall)

                // Update message with pending tool invocation
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          toolInvocations: [
                            ...(m.toolInvocations || []),
                            {
                              toolCallId: toolCall.id,
                              toolName: toolCall.name,
                              args: JSON.parse(toolCall.arguments),
                              state: 'pending' as const,
                            },
                          ],
                        }
                      : m
                  )
                )
              }

              // Handle function call arguments delta
              if (event.type === 'response.function_call_arguments.delta' && event.delta) {
                // Accumulate arguments for the current tool call
                if (toolCalls.length > 0) {
                  toolCalls[toolCalls.length - 1].arguments += event.delta
                }
              }

              // Handle completed response
              if (event.type === 'response.completed' && event.response) {
                // Extract any function calls from the completed response
                if (event.response.output) {
                  for (const item of event.response.output) {
                    if (item.type === 'function_call' && item.name && item.call_id) {
                      const existingCall = toolCalls.find((tc) => tc.id === item.call_id)
                      if (!existingCall) {
                        toolCalls.push({
                          id: item.call_id,
                          name: item.name,
                          arguments: item.arguments || '{}',
                        })
                      }
                    }
                  }
                }

                // Extract usage
                if (event.response.usage) {
                  const { input_tokens, output_tokens } = event.response.usage
                  usage = {
                    inputTokens: input_tokens,
                    outputTokens: output_tokens,
                    totalTokens: input_tokens + output_tokens,
                    cost: calculateCost(model, input_tokens, output_tokens),
                  }
                }
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    // Mark streaming complete with usage
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMessageId ? { ...m, isStreaming: false, usage } : m
      )
    )

    // If no tool calls, we're done
    if (toolCalls.length === 0) {
      return
    }

    // Execute tools
    const toolResults: ToolInvocation[] = []

    for (const toolCall of toolCalls) {
      try {
        const args = JSON.parse(toolCall.arguments)
        const result = await executeTool(toolCall.name, args)

        toolResults.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args,
          result,
          state: 'result',
        })

        // Update message with result
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  toolInvocations: m.toolInvocations?.map((ti) =>
                    ti.toolCallId === toolCall.id
                      ? { ...ti, result, state: 'result' as const }
                      : ti
                  ),
                }
              : m
          )
        )
      } catch (err) {
        const errorResult = JSON.stringify({
          error: err instanceof Error ? err.message : 'Tool execution failed',
        })

        toolResults.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args: JSON.parse(toolCall.arguments),
          result: errorResult,
          state: 'error',
        })

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  toolInvocations: m.toolInvocations?.map((ti) =>
                    ti.toolCallId === toolCall.id
                      ? { ...ti, result: errorResult, state: 'error' as const }
                      : ti
                  ),
                }
              : m
          )
        )
      }
    }

    // Add tool results as a new message for the next iteration
    const toolResultMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: fullContent,
      createdAt: new Date(),
      toolInvocations: toolResults,
    }

    // Update current messages for next loop
    currentMessages = [
      ...currentMessages,
      toolResultMessage,
    ]

    // Continue the loop to let the model respond to tool results
  }

  // Max roundtrips reached
  setError(`Agent stopped after ${maxRoundtrips} tool roundtrips`)
}
