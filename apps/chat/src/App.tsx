import { useState, useCallback } from 'react'
import { ChatContainer } from './components/ChatContainer'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { useChatStore } from './stores/chatStore'
import { generateId } from './lib/utils'
import { api, messagesToInput } from './lib/api'
import type { Model, Message } from './lib/types'
import { AVAILABLE_MODELS } from './lib/agent'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    conversations,
    currentConversationId,
    model,
    systemPrompt,
    createConversation,
    selectConversation,
    deleteConversation,
    addMessage,
    updateMessage,
    setModel,
    getCurrentConversation,
  } = useChatStore()

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

      // Add user message
      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        createdAt: new Date(),
      }
      addMessage(userMessage)

      // Create placeholder for assistant message
      const assistantMessageId = generateId()
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        isStreaming: true,
      }
      addMessage(assistantMessage)

      try {
        // Build conversation history
        const allMessages = [...messages, userMessage]
        const input = messagesToInput(allMessages)

        // Stream the response
        let fullContent = ''

        for await (const event of api.createResponseStream({
          model,
          input,
          instructions: systemPrompt || undefined,
          stream: true,
        })) {
          // Handle different event types
          if (event.type === 'response.output_text.delta' && event.delta) {
            fullContent += event.delta
            updateMessage(assistantMessageId, { content: fullContent })
          } else if (event.type === 'response.completed') {
            updateMessage(assistantMessageId, { isStreaming: false })
          } else if (event.type === 'response.failed' || event.type === 'error') {
            const errorMessage =
              event.error?.message ||
              (event.response as { error?: { message?: string } })?.error?.message ||
              'Generation failed'
            throw new Error(errorMessage)
          }
        }

        // Ensure streaming flag is removed
        updateMessage(assistantMessageId, { isStreaming: false })
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'An error occurred'
        setError(errorMessage)

        // Update the assistant message to show error
        updateMessage(assistantMessageId, {
          content: `Error: ${errorMessage}`,
          isStreaming: false,
        })
      } finally {
        setIsLoading(false)
      }
    },
    [
      currentConversationId,
      createConversation,
      messages,
      model,
      systemPrompt,
      isLoading,
      addMessage,
      updateMessage,
    ]
  )

  const handleStopGeneration = useCallback(() => {
    // TODO: Implement abort controller
    setIsLoading(false)
  }, [])

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
          model={selectedModel}
          models={AVAILABLE_MODELS}
          onModelChange={handleModelChange}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          sidebarOpen={sidebarOpen}
        />

        {/* Chat area */}
        <ChatContainer
          messages={messages}
          isLoading={isLoading}
          error={error}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          model={selectedModel}
        />
      </div>
    </div>
  )
}
