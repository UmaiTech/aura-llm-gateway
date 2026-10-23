import { useState, useCallback, useRef, useEffect } from 'react'
import { createThrottledSetter } from './lib/streamFlush'
import { BetaUpsellModal } from './components/BetaUpsellModal'
import { ChatContainer } from './components/ChatContainer'
import { CompareView } from './components/CompareView'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { useChatStore } from './stores/chatStore'
import { generateId } from './lib/utils'
import { AuraAPI } from './lib/api'
import { BUILT_IN_TOOLS, executeTool, AGENT_SYSTEM_PROMPTS } from './lib/agent'
import { calculateCost } from './lib/pricing'
import { parseCompletedResponse } from './lib/responseMetadata'
import { isAutoModel } from './lib/types'
import { useRuntimeModels } from './hooks/useRuntimeModels'
import type { Model, Message, ToolInvocation, MessageUsage, AuraMetadata } from './lib/types'

// In production the chat hits same-origin /api/proxy (a serverless
// function that holds the per-user gateway API key).
// VITE_PROXY_BASE_URL is only used for local-dev to talk directly to a
// running gateway. NOTE: chat uses VITE_PROXY_BASE_URL, NOT
// VITE_API_BASE_URL — the latter is the admin app's gateway URL on
// Vercel prod, and if chat read it we'd bypass the proxy and try to
// hit api.aura-llm.dev with credentials:'include', which strict-mode
// CORS rejects.
const API_BASE = import.meta.env.VITE_PROXY_BASE_URL || '/api/proxy'
const API_KEY = '' // Frontend never holds the API key; session cookie is the credential

export default function App() {
  // Start with the sidebar closed on small screens, where it overlays
  // the conversation.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches,
  )
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
    consistencyPrinciples,
    setConsistencyPrinciples,
    consistencyStyleTone,
    setConsistencyStyleTone,
    consistencyStyleFormality,
    setConsistencyStyleFormality,
    consistencyStyleVerbosity,
    setConsistencyStyleVerbosity,
    compressionStrategy,
    autoRouting,
    setAutoRouting,
    setCompressionStrategy,
    enabledTools,
    createConversation,
    selectConversation,
    deleteConversation,
    addMessage,
    updateMessage,
    setModel,
    getCurrentConversation,
    compareMode,
  } = useChatStore()

  // Picker models: auto aliases follow the gateway's runtime catalog.
  const { models: availableModels, catalog } = useRuntimeModels()

  // Get configs from store
  const validationConfig = getValidationConfig()
  const consistencyConfig = useChatStore.getState().getConsistencyConfig()
  const compressionConfig = useChatStore.getState().getCompressionConfig()

  // Create API instance with all strategy configs.
  // Defaults to the same-origin proxy at /api/proxy/v1 in prod; can be
  // overridden via VITE_PROXY_BASE_URL for local-dev against a direct
  // gateway.
  const api = new AuraAPI({
    baseUrl: import.meta.env.VITE_PROXY_BASE_URL
      ? `${import.meta.env.VITE_PROXY_BASE_URL}/v1`
      : '/api/proxy/v1',
    apiKey: API_KEY,
    routingStrategy,
    validationConfig,
    consistencyConfig,
    compressionConfig,
  })

  const currentConversation = getCurrentConversation()
  const messages = currentConversation?.messages || []

  // Find the selected model. If the stored id no longer exists, or it
  // points at a beta-locked model (e.g. localStorage from before the
  // tier split, like a user who picked Sonnet 4.6 yesterday), fall
  // back to the first FREE-tier model. Last-resort AVAILABLE_MODELS[0]
  // handles the (impossible-but-typecheckable) case of zero free
  // models in the list.
  const selectedModel =
    availableModels.find((m) => m.id === model && m.tier !== 'beta') ??
    availableModels.find((m) => m.tier !== 'beta') ??
    availableModels[0]

  // If the stored model id was beta-locked, write the freed-up
  // selection back to the store so the picker label, the API client
  // base URL, and any downstream consumers all reflect the safe
  // fallback. Without this, the store keeps a dangling beta id and
  // the visual mismatch (Header shows the right model, picker
  // tooltip still says the locked one) confuses users.
  useEffect(() => {
    if (model !== selectedModel.id) {
      // Say why when the gateway turned auto routing off under us.
      if (catalog && !catalog.autoEnabled && isAutoModel(model)) {
        setError(
          `Auto routing is turned off on this gateway, so "${model}" isn't available. ` +
            `Switched to ${selectedModel.name}; pick another model to continue.`,
        )
      }
      setModel(selectedModel.id)
    }
  }, [model, selectedModel.id, selectedModel.name, setModel, catalog])

  // Links from the landing page (`?model=auto&prompt=…&inspect=routing`)
  // prefill a fresh draft — never send it — and remember to open the
  // routing inspector on the answer. The parameters are dropped from the
  // URL straight away so a reload or a shared link can't replay them.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const linkedModel = params.get('model')
    const prompt = params.get('prompt')
    const inspect = params.get('inspect')
    if (!linkedModel && !prompt && !inspect) return
    const store = useChatStore.getState()
    const known = availableModels.find((m) => m.id === linkedModel && m.tier !== 'beta')
    if (known) store.setModel(known.id)
    if (prompt) {
      if ((store.getCurrentConversation()?.messages.length ?? 0) > 0) store.createConversation()
      store.setDraft(prompt.slice(0, 4000))
    }
    if (inspect === 'routing') store.setInspectRoutingAfter(Date.now())
    for (const key of ['model', 'prompt', 'inspect']) params.delete(key)
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
    // Once, on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

      // Send the full conversation history. We *also* set
      // previous_response_id, but the gateway doesn't currently
      // replay context from prior responses (tracked in issue
      // #156), so relying on threading alone leaves the model
      // amnesic between turns. Including history in `input` is
      // belt-and-braces: it works today, and remains correct once
      // the gateway-side replay lands.
      const previousAssistantMessages = conversationMessages
        .filter(m => m.role === 'assistant' && m.responseId)
      const previousResponseId = previousAssistantMessages.length > 0
        ? previousAssistantMessages[previousAssistantMessages.length - 1].responseId
        : undefined

      const input = conversationMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .filter(m => m.content && m.content.trim().length > 0)
        .map(m => ({
          type: 'message' as const,
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))

      let fullContent = ''
      let responseId: string | undefined
      let usage: MessageUsage | undefined
      const contentSink = createThrottledSetter((content) =>
        updateMessage(assistantMessageId, { content })
      )

      const routing = useChatStore.getState().getRoutingOptions()
      for await (const event of api.createResponseStream({
        model,
        input,
        instructions: systemPrompt || undefined,
        stream: true,
        previous_response_id: previousResponseId,
        ...(routing && { routing }),
      })) {
        if (event.type === 'response.output_text.delta' && event.delta) {
          fullContent += event.delta
          contentSink.set(fullContent)
        } else if (event.type === 'response.completed') {
          contentSink.flush()
          // Usage, the model that answered and Aura metadata (cost,
          // provider, strategy outcomes, auto-routing decision).
          const completed = parseCompletedResponse(event.response, (i, o) => calculateCost(model, i, o))
          responseId = completed.responseId
          usage = completed.usage
          const { aura, model: answeredBy } = completed

          updateMessage(assistantMessageId, { isStreaming: false, usage, aura, responseId, model: answeredBy, rawResponse: event.response })
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

        // Filter built-in tools by the user's selection in
        // AgentToolsDialog. Convention: empty enabledTools = "all
        // enabled by default" (which matches the original behavior
        // before the dialog landed). Once the user touches any
        // checkbox the list is authoritative.
        const activeTools =
          enabledTools.length === 0
            ? BUILT_IN_TOOLS
            : BUILT_IN_TOOLS.filter((t) => enabledTools.includes(t.name))

        const routingOptions = useChatStore.getState().getRoutingOptions()
        const request = {
          model,
          input,
          instructions: effectiveSystemPrompt,
          tools: activeTools.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          })),
          stream: true,
          ...(lastResponseId && { previous_response_id: lastResponseId }),
          ...(routingOptions && { routing: routingOptions }),
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
        const contentSink = createThrottledSetter((content) =>
          updateMessage(assistantMessageId, { content })
        )
        const toolCalls: Array<{ id: string; name: string; arguments: string }> = []
        let usage: MessageUsage | undefined
        let aura: AuraMetadata | undefined
        let responseId: string | undefined
        let answeredBy: string | undefined
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
                    contentSink.set(fullContent)
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
                    contentSink.flush()
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

                    // Usage (gateway enriches with cost_usd), the model
                    // that answered and Aura metadata. Includes the
                    // compression / consistency / validation outcomes the
                    // MessageBubble footer renders as chips, and the
                    // auto-routing decision for the inspector.
                    const completed = parseCompletedResponse(event.response, (i, o) => calculateCost(model, i, o))
                    usage = completed.usage ?? usage
                    aura = completed.aura ?? aura
                    answeredBy = completed.model ?? answeredBy

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

        updateMessage(assistantMessageId, { isStreaming: false, usage, aura, responseId, model: answeredBy, rawResponse })

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

        // Carry the response that contained the tool_use blocks forward
        // into the next roundtrip's previous_response_id. Without this the
        // Anthropic adapter sees a `tool_result` block with no prior
        // `tool_use` (because intra-turn roundtrips weren't being chained)
        // and returns: "unexpected tool_use_id found in tool_result
        // blocks ... Each tool_result block must have a corresponding
        // tool_use block in the previous message."
        if (responseId) {
          lastResponseId = responseId
        }
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

        {/* Chat area — CompareView takes over when the header
            toggle is on. The single-pane ChatContainer's
            conversation state is left untouched in the store, so
            toggling back restores the previous chat. */}
        {compareMode ? (
          <CompareView />
        ) : (
          <ChatContainer
            messages={messages}
            isLoading={isLoading}
            error={error}
            onSendMessage={handleSendMessage}
            onStopGeneration={handleStopGeneration}
            model={selectedModel}
            models={availableModels}
            onModelChange={handleModelChange}
            onLockedModelClick={(m) => setLockedModelPrompt(m)}
            routingStrategy={routingStrategy}
            onRoutingStrategyChange={setRoutingStrategy}
            validationStrategy={validationStrategy}
            onValidationStrategyChange={setValidationStrategy}
            consistencyStrategy={consistencyStrategy}
            onConsistencyStrategyChange={setConsistencyStrategy}
            consistencyPrinciples={consistencyPrinciples}
            onConsistencyPrinciplesChange={setConsistencyPrinciples}
            consistencyStyleTone={consistencyStyleTone}
            onConsistencyStyleToneChange={setConsistencyStyleTone}
            consistencyStyleFormality={consistencyStyleFormality}
            onConsistencyStyleFormalityChange={setConsistencyStyleFormality}
            consistencyStyleVerbosity={consistencyStyleVerbosity}
            onConsistencyStyleVerbosityChange={setConsistencyStyleVerbosity}
            compressionStrategy={compressionStrategy}
            autoRouting={autoRouting}
            onAutoRoutingChange={setAutoRouting}
            onCompressionStrategyChange={setCompressionStrategy}
          />
        )}
      </div>

      <BetaUpsellModal
        open={lockedModelPrompt !== null}
        model={lockedModelPrompt}
        onClose={() => setLockedModelPrompt(null)}
      />
    </div>
  )
}
