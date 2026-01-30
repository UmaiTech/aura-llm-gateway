import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Conversation, Message, RoutingStrategy } from '../lib/types'
import { generateId } from '../lib/utils'

interface ChatState {
  // Conversations
  conversations: Conversation[]
  currentConversationId: string | null

  // Settings
  model: string
  systemPrompt: string
  agentMode: boolean
  enabledTools: string[]
  theme: 'light' | 'dark' | 'system'
  routingStrategy: RoutingStrategy

  // Actions
  createConversation: () => string
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => void
  updateConversation: (id: string, updates: Partial<Conversation>) => void

  // Message actions
  addMessage: (message: Message) => void
  updateMessage: (messageId: string, updates: Partial<Message>) => void
  clearMessages: () => void

  // Settings actions
  setModel: (model: string) => void
  setSystemPrompt: (prompt: string) => void
  setAgentMode: (enabled: boolean) => void
  toggleTool: (toolName: string) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setRoutingStrategy: (strategy: RoutingStrategy) => void

  // Computed
  getCurrentConversation: () => Conversation | null
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      conversations: [],
      currentConversationId: null,
      model: 'gpt-4o-mini',
      systemPrompt: '',
      agentMode: false,
      enabledTools: [],
      theme: 'system',
      routingStrategy: 'round_robin',

      // Conversation actions
      createConversation: () => {
        const { model, systemPrompt } = get()
        const id = generateId()
        const newConversation: Conversation = {
          id,
          title: 'New conversation',
          model,
          systemPrompt,
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        set((state) => ({
          conversations: [newConversation, ...state.conversations],
          currentConversationId: id,
        }))

        return id
      },

      selectConversation: (id) => {
        const conversation = get().conversations.find((c) => c.id === id)
        if (conversation) {
          set({
            currentConversationId: id,
            model: conversation.model,
            systemPrompt: conversation.systemPrompt || '',
          })
        }
      },

      deleteConversation: (id) => {
        set((state) => {
          const filtered = state.conversations.filter((c) => c.id !== id)
          const newCurrentId =
            state.currentConversationId === id
              ? filtered.length > 0
                ? filtered[0].id
                : null
              : state.currentConversationId

          return {
            conversations: filtered,
            currentConversationId: newCurrentId,
          }
        })
      },

      updateConversation: (id, updates) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, ...updates, updatedAt: new Date() } : c
          ),
        }))
      },

      // Message actions
      addMessage: (message) => {
        const { currentConversationId } = get()
        if (!currentConversationId) return

        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== currentConversationId) return c

            const messages = [...c.messages, message]

            // Auto-generate title from first user message
            let title = c.title
            if (c.title === 'New conversation' && message.role === 'user') {
              title =
                message.content.slice(0, 50) +
                (message.content.length > 50 ? '...' : '')
            }

            return { ...c, messages, title, updatedAt: new Date() }
          }),
        }))
      },

      updateMessage: (messageId, updates) => {
        const { currentConversationId } = get()
        if (!currentConversationId) return

        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== currentConversationId) return c

            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, ...updates } : m
              ),
              updatedAt: new Date(),
            }
          }),
        }))
      },

      clearMessages: () => {
        const { currentConversationId } = get()
        if (!currentConversationId) return

        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === currentConversationId
              ? { ...c, messages: [], title: 'New conversation', updatedAt: new Date() }
              : c
          ),
        }))
      },

      // Settings actions
      setModel: (model) => {
        const { currentConversationId } = get()
        set({ model })

        if (currentConversationId) {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === currentConversationId
                ? { ...c, model, updatedAt: new Date() }
                : c
            ),
          }))
        }
      },

      setSystemPrompt: (systemPrompt) => {
        const { currentConversationId } = get()
        set({ systemPrompt })

        if (currentConversationId) {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === currentConversationId
                ? { ...c, systemPrompt, updatedAt: new Date() }
                : c
            ),
          }))
        }
      },

      setAgentMode: (agentMode) => set({ agentMode }),

      toggleTool: (toolName) => {
        set((state) => ({
          enabledTools: state.enabledTools.includes(toolName)
            ? state.enabledTools.filter((t) => t !== toolName)
            : [...state.enabledTools, toolName],
        }))
      },

      setTheme: (theme) => set({ theme }),

      setRoutingStrategy: (routingStrategy) => set({ routingStrategy }),

      // Computed
      getCurrentConversation: () => {
        const { conversations, currentConversationId } = get()
        return conversations.find((c) => c.id === currentConversationId) || null
      },
    }),
    {
      name: 'aura-chat-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        conversations: state.conversations,
        currentConversationId: state.currentConversationId,
        model: state.model,
        systemPrompt: state.systemPrompt,
        agentMode: state.agentMode,
        enabledTools: state.enabledTools,
        theme: state.theme,
        routingStrategy: state.routingStrategy,
      }),
    }
  )
)
