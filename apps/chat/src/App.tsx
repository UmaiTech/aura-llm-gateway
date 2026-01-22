import { useState, useCallback } from 'react'
import { ChatContainer } from './components/ChatContainer'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { useChat } from './hooks/useChat'
import type { Model, Conversation } from './lib/types'

const AVAILABLE_MODELS: Model[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: 'Most capable model' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', description: 'Fast and efficient' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', description: '128K context window' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', description: 'Cost effective' },
  { id: 'o1', name: 'o1', provider: 'openai', description: 'Advanced reasoning' },
  { id: 'o1-mini', name: 'o1 Mini', provider: 'openai', description: 'Efficient reasoning' },
]

export default function App() {
  const [selectedModel, setSelectedModel] = useState<Model>(AVAILABLE_MODELS[0])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Find current conversation (used for future features like title display)
  const _currentConversation = conversations.find(c => c.id === currentConversationId)
  void _currentConversation // Suppress unused warning

  const {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
    clearMessages,
  } = useChat({
    model: selectedModel.id,
    conversationId: currentConversationId,
  })

  const handleNewConversation = useCallback(() => {
    const newId = `conv_${Date.now()}`
    const newConversation: Conversation = {
      id: newId,
      title: 'New Chat',
      createdAt: new Date(),
      model: selectedModel.id,
    }
    setConversations(prev => [newConversation, ...prev])
    setCurrentConversationId(newId)
    clearMessages()
  }, [selectedModel.id, clearMessages])

  const handleSelectConversation = useCallback((id: string) => {
    setCurrentConversationId(id)
    // In a real app, you'd load messages for this conversation
    clearMessages()
  }, [clearMessages])

  const handleDeleteConversation = useCallback((id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id))
    if (currentConversationId === id) {
      setCurrentConversationId(null)
      clearMessages()
    }
  }, [currentConversationId, clearMessages])

  const handleSendMessage = useCallback(async (content: string) => {
    // Create conversation if needed
    if (!currentConversationId) {
      handleNewConversation()
    }

    // Update conversation title with first message
    if (messages.length === 0) {
      setConversations(prev =>
        prev.map(c =>
          c.id === currentConversationId
            ? { ...c, title: content.slice(0, 50) + (content.length > 50 ? '...' : '') }
            : c
        )
      )
    }

    await sendMessage(content)
  }, [currentConversationId, messages.length, sendMessage, handleNewConversation])

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        conversations={conversations}
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
          onModelChange={setSelectedModel}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          sidebarOpen={sidebarOpen}
        />

        {/* Chat area */}
        <ChatContainer
          messages={messages}
          isLoading={isLoading}
          error={error}
          onSendMessage={handleSendMessage}
          onStopGeneration={stopGeneration}
          model={selectedModel}
        />
      </div>
    </div>
  )
}
