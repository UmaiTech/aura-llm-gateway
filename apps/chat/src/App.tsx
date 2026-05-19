import { useState, useCallback, useRef } from 'react'
import { BetaUpsellModal } from './components/BetaUpsellModal'
import { ChatContainer } from './components/ChatContainer'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { useChatStore } from './stores/chatStore'
import { generateId } from './lib/utils'
import { AuraAPI } from './lib/api'
import { AVAILABLE_MODELS, BUILT_IN_TOOLS, executeTool, AGENT_SYSTEM_PROMPTS } from './lib/agent'
import { calculateCost } from './lib/pricing'
import type { Model, Message, ToolInvocation, MessageUsage, AuraMetadata } from './lib/types'

// In production the chat hits same-origin /api/proxy (a serverless function
// that holds the per-user gateway API key). VITE_API_BASE_URL is only used
// for local-dev to talk directly to a running gateway.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/proxy'
const API_KEY = '' // Frontend never holds the API key; session cookie is the credential

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // When the user taps a beta-locked model in the picker, store it so
  // BetaUpsellModal can show the model name. Null = modal closed.
  const [lockedModelPrompt, setLockedModelPrompt] = useState<Model | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const {
    conversations,
    currentConversationId,
    model,
    systemPrompt,
    agentMode,
    setAgentMode,
    routingStrategy,
    setRoutingStrategy,
    validationStrategy,
    setValidationStrategy,
    getValidationConfig,
    consistencyStrategy,
    setConsistencyStrategy,
    compressionStrategy,
    setCompressionStrategy,
    createConversation,
    selectConversation,
    deleteConversation,
    addMessage,
    updateMessage,
    setModel,
    getCurrentConversation,
  } = useChatStore()

  // Get configs from store
  const validationConfig = getValidationConfig()
  const consistencyConfig = useChatStore.getState().getConsistencyConfig()
  const compressionConfig = useChatStore.getState().getCompressionConfig()

  // Create API instance with all strategy configs.
  // Defaults to the same-origin proxy at /api/proxy/v1 in prod; can be
  // overridden via VITE_API_BASE_URL for local-dev against a direct gateway.
  const api = new AuraAPI({
    baseUrl: import.meta.env.VITE_API_BASE_URL
      ? `${import.meta.env.VITE_API_BASE_URL}/v1`
      : '/api/proxy/v1',
    apiKey: API_KEY,
    routingStrategy,
    validationConfig,
    consistencyConfig,
    compressionConfig,
  })

  const currentConversation = getCurrentConversation()
  const messages = currentConversation?.messages || []

  // Find selected model object
  const selectedModel = AVAILABLE_MODELS.find((m) => m.id === model) || AVAILABLE_MODELS[0]

  const handleModelChange = useCallback(
    (newModel: Model) => {
      setModel(newModel.id)
    },
    [setModel]
  )

  const handleNewConversation = useCallback(() => {
    createConversation()
  }, [createConversation])

  const handleSelectConversation = useCallback(
    (id: string) => {
      selectConversation(id)
    },
    [selectConversation]
  )

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversation(id)
    },
    [deleteConversation]
  )

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsLoading(false)
  }, [])

  // Standard chat (no tools)
  const handleSendMessageStandard = useCallback(
    async (_content: string, conversationMessages: Message[]) => {
      const assistantMessageId = generateId()
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        isStreaming: true,
      }
      addMessage(assistantMessage)

      // Get the latest user message and previous assistant response ID for threading
      const userMessage = conversationMessages[conversationMessages.length - 1]
      const previousAssistantMessages = conversationMessages
        .filter(m => m.role === 'assistant' && m.responseId)
      const previousResponseId = previousAssistantMessages.length > 0
        ? previousAssistantMessages[previousAssistantMessages.length - 1].responseId
        : undefined

      // Send only the latest user message with conversation threading
      const input = [{
        type: 'message' as const,
        role: userMessage.role,
        content: userMessage.content,
      }]

      let fullContent = ''
      let responseId: string | undefined
      let usage: MessageUsage | undefined

      for await (const event of api.createResponseStream({
        model,
        input,
        instructions: systemPrompt || undefined,
        stream: true,
        previous_response_id: previousResponseId,
      })) {
        // Log ALL events to debug
        console.log('[Stream Event]', event.type, event)

        if (event.type === 'response.output_text.delta' && event.delta) {
          fullContent += event.delta
          updateMessage(assistantMessageId, { content: fullContent })
        } else if (event.type === 'response.completed') {
          // Extract usage and metadata from completed response (gateway enriches with cost_usd and aura metadata)
          const response = event.response as {
            id?: string
            usage?: {
              input_tokens?: number
              output_tokens?: number
              total_tokens?: number
              cost_usd?: number
            }
            metadata?: { aura?: {
              provider?: string
              gateway_version?: string
              latency_ms?: number
            } }
          }

          console.log('[Standard Chat] Raw event.response:', response)
          console.log('[Standard Chat] Response keys:', Object.keys(response || {}))
          console.log('[Standard Chat] Usage property:', response?.usage)
          console.log('[Standard Chat] Full event:', event)

          // Store response ID for conversation threading
          responseId = response?.id

          // Parse usage with better null checks
          if (response?.usage &&
              typeof response.usage.input_tokens === 'number' &&
              typeof response.usage.output_tokens === 'number') {
            usage = {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              totalTokens: response.usage.input_tokens + response.usage.output_tokens,
              cost: response.usage.cost_usd ?? calculateCost(model, response.usage.input_tokens, response.usage.output_tokens),
            }
            console.log('[Standard Chat] Parsed usage:', usage)
          } else {
            console.warn('[Standard Chat] No valid usage data in response:', response?.usage)
          }

          // Extract Aura metadata
          const auraMetadata = response?.metadata?.aura
          const aura = auraMetadata ? {
            provider: auraMetadata.provider || 'unknown',
            gatewayVersion: auraMetadata.gateway_version || '',
            latencyMs: auraMetadata.latency_ms,
          } : undefined

          console.log('[Standard Chat] Response completed:', {
            responseId,
            usage,
            aura,
            fullResponse: response
          })

          updateMessage(assistantMessageId, { isStreaming: false, usage, aura, responseId, rawResponse: event.response })
        } else if (event.type === 'response.failed' || event.type === 'error') {
          const errorMessage =
            event.error?.message ||
            (event.response as { error?: { message?: string } })?.error?.message ||
            'Generation failed'
          throw new Error(errorMessage)
        }
      }
    },
    [model, systemPrompt, addMessage, updateMessage]
  )

  // Agent chat with tools
  const handleSendMessageAgent = useCallback(
    async (_content: string, conversationMessages: Message[], signal: AbortSignal) => {
      const maxRoundtrips = 5
      let roundtrip = 0
      let currentMessages = [...conversationMessages]

      // Use agent system prompt if no custom prompt set
      const effectiveSystemPrompt = systemPrompt || AGENT_SYSTEM_PROMPTS.assistant

      // Get previous response ID from conversation for first roundtrip
      const previousAssistantMessages = conversationMessages
        .filter(m => m.role === 'assistant' && m.responseId)
      let lastResponseId = previousAssistantMessages.length > 0
        ? previousAssistantMessages[previousAssistantMessages.length - 1].responseId
        : undefined

      while (roundtrip < maxRoundtrips) {
        roundtrip++

        const assistantMessageId = generateId()
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          createdAt: new Date(),
          isStreaming: true,
          toolInvocations: [],
        }
        addMessage(assistantMessage)

        // Build input with tool results for tool roundtrips
        // For first roundtrip, send only latest user message
        type InputItem =
          | { type: 'function_call_output'; call_id: string; output: string }
          | { type: 'message'; role: 'user' | 'assistant'; content: string }

        const input: InputItem[] = roundtrip === 1
          ? [{
              type: 'message',
              role: conversationMessages[conversationMessages.length - 1].role as 'user' | 'assistant',
              content: conversationMessages[conversationMessages.length - 1].content,
            }]
          : currentMessages
              .slice(-1) // Only include the last message with tool results
              .filter((m) => m.role !== 'system')
              .flatMap((m): InputItem[] => {
                // Include tool results
                if (m.toolInvocations?.some((t) => t.state === 'result' || t.state === 'error')) {
                  return m.toolInvocations
                    .filter((t) => t.state === 'result' || t.state === 'error')
                    .map((t): InputItem => ({
                      type: 'function_call_output',
                      call_id: t.toolCallId,
                      output: t.result || '',
                    }))
                }
                return [{
                  type: 'message',
                  role: m.role as 'user' | 'assistant',
                  content: m.content,
                }]
              })

        const request = {
          model,
          input,
          instructions: effectiveSystemPrompt,
          tools: BUILT_IN_TOOLS.map((t) => ({
            type: 'function' as const,
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
          stream: true,
          ...(lastResponseId && { previous_response_id: lastResponseId }),
        }

        const response = await fetch(`${API_BASE}/v1/responses`, {
          method: 'POST',
          credentials: 'include', // Session cookie auth via /api/proxy
          headers: {
            'Content-Type': 'application/json',
            'X-Routing-Strategy': routingStrategy,
          },
          body: JSON.stringify(request),
          signal,
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error?.message || `Request failed: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''
        let fullContent = ''
        const toolCalls: Array<{ id: string; name: string; arguments: string }> = []
        let usage: MessageUsage | undefined
        let aura: AuraMetadata | undefined
        let responseId: string | undefined
        let rawResponse: unknown

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
                  const event = JSON.parse(data)

                  // Text delta
                  if (event.type === 'response.output_text.delta' && event.delta) {
                    fullContent += event.delta
                    updateMessage(assistantMessageId, { content: fullContent })
                  }

                  // Function call added
                  if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
                    const toolCall = {
                      id: event.item.call_id || generateId(),
                      name: event.item.name || '',
                      arguments: event.item.arguments || '{}',
                    }
                    toolCalls.push(toolCall)

                    updateMessage(assistantMessageId, {
                      toolInvocations: [
                        ...(currentMessages.find(m => m.id === assistantMessageId)?.toolInvocations || []),
                        {
                          toolCallId: toolCall.id,
                          toolName: toolCall.name,
                          args: {},
                          state: 'pending' as const,
                        },
                      ],
                    })
                  }

                  // Function call arguments delta
                  if (event.type === 'response.function_call_arguments.delta' && event.delta && toolCalls.length > 0) {
                    toolCalls[toolCalls.length - 1].arguments += event.delta
                  }

                  // Response completed - extract function calls and usage
                  if (event.type === 'response.completed' && event.response) {
                    // Store response ID for next roundtrip
                    responseId = event.response.id
                    lastResponseId = responseId

                    // Extract function calls
                    if (event.response.output) {
                      for (const item of event.response.output) {
                        if (item.type === 'function_call' && item.name && item.call_id) {
                          const existing = toolCalls.find((tc) => tc.id === item.call_id)
                          if (!existing) {
                            toolCalls.push({
                              id: item.call_id,
                              name: item.name,
                              arguments: item.arguments || '{}',
                            })
                          } else {
                            existing.arguments = item.arguments || existing.arguments
                          }
                        }
                      }
                    }

                    // Extract usage (gateway enriches with cost_usd)
                    const responseUsage = event.response.usage as { input_tokens?: number; output_tokens?: number; cost_usd?: number } | undefined
                    if (responseUsage?.input_tokens !== undefined && responseUsage?.output_tokens !== undefined) {
                      usage = {
                        inputTokens: responseUsage.input_tokens,
                        outputTokens: responseUsage.output_tokens,
                        totalTokens: responseUsage.input_tokens + responseUsage.output_tokens,
                        cost: responseUsage.cost_usd ?? calculateCost(model, responseUsage.input_tokens, responseUsage.output_tokens),
                      }
                    }

                    // Extract Aura metadata
                    const metadata = event.response.metadata as { aura?: { provider?: string; gateway_version?: string; latency_ms?: number } } | undefined
                    if (metadata?.aura) {
                      aura = {
                        provider: metadata.aura.provider || 'unknown',
                        gatewayVersion: metadata.aura.gateway_version || '',
                        latencyMs: metadata.aura.latency_ms,
                      }
                    }

                    // Capture raw response for debugging
                    rawResponse = event.response
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

        updateMessage(assistantMessageId, { isStreaming: false, usage, aura, responseId, rawResponse })

        // No tool calls - we're done
        if (toolCalls.length === 0) {
          return
        }

        // Execute tools
        const toolInvocations: ToolInvocation[] = []

        for (const toolCall of toolCalls) {
          try {
            const args = JSON.parse(toolCall.arguments)
            const result = await executeTool(toolCall.name, args)

            toolInvocations.push({
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              args,
              result,
              state: 'result',
            })
          } catch (err) {
            const errorResult = JSON.stringify({
              error: err instanceof Error ? err.message : 'Tool execution failed',
            })

            toolInvocations.push({
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              args: JSON.parse(toolCall.arguments),
              result: errorResult,
              state: 'error',
            })
          }
        }

        // Update message with tool results
        updateMessage(assistantMessageId, { toolInvocations })

        // Add to current messages for next iteration
        currentMessages = [
          ...currentMessages,
          {
            id: assistantMessageId,
            role: 'assistant' as const,
            content: fullContent,
            createdAt: new Date(),
            toolInvocations,
            responseId,
          },
        ]
      }

      setError(`Agent stopped after ${maxRoundtrips} tool roundtrips`)
    },
    [model, systemPrompt, routingStrategy, addMessage, updateMessage]
  )

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return

      // Create conversation if needed
      let conversationId = currentConversationId
      if (!conversationId) {
        conversationId = createConversation()
      }

      setError(null)
      setIsLoading(true)

      // Create abort controller
      abortControllerRef.current = new AbortController()

      // Add user message
      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        createdAt: new Date(),
      }
      addMessage(userMessage)

      const conversationMessages = [...messages, userMessage]

      try {
        if (agentMode) {
          await handleSendMessageAgent(content, conversationMessages, abortControllerRef.current.signal)
        } else {
          await handleSendMessageStandard(content, conversationMessages)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // User cancelled
        } else {
          const errorMessage = err instanceof Error ? err.message : 'An error occurred'
          setError(errorMessage)
        }
      } finally {
        setIsLoading(false)
        abortControllerRef.current = null
      }
    },
    [
      currentConversationId,
      createConversation,
      messages,
      agentMode,
      isLoading,
      addMessage,
      handleSendMessageStandard,
      handleSendMessageAgent,
    ]
  )

  // Map conversations to sidebar format
  const sidebarConversations = conversations.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    model: c.model,
    messages: c.messages,
  }))

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        conversations={sidebarConversations}
        currentConversationId={currentConversationId}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <Header
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          sidebarOpen={sidebarOpen}
          agentMode={agentMode}
          onAgentModeChange={setAgentMode}
        />

        {/* The always-on BetaBanner was removed — beta CTAs now appear
            only in context: as the RateLimitNotice when the user hits
            429, and as BetaUpsellModal when they tap a beta-locked
            model in the picker. */}

        {/* Chat area */}
        <ChatContainer
          messages={messages}
          isLoading={isLoading}
          error={error}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          model={selectedModel}
          models={AVAILABLE_MODELS}
          onModelChange={handleModelChange}
          onLockedModelClick={(m) => setLockedModelPrompt(m)}
          routingStrategy={routingStrategy}
          onRoutingStrategyChange={setRoutingStrategy}
          validationStrategy={validationStrategy}
          onValidationStrategyChange={setValidationStrategy}
          consistencyStrategy={consistencyStrategy}
          onConsistencyStrategyChange={setConsistencyStrategy}
          compressionStrategy={compressionStrategy}
          onCompressionStrategyChange={setCompressionStrategy}
        />
      </div>

      <BetaUpsellModal
        open={lockedModelPrompt !== null}
        model={lockedModelPrompt}
        onClose={() => setLockedModelPrompt(null)}
      />
    </div>
  )
}
