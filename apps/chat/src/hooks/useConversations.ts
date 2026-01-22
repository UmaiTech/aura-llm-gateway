import { useState, useCallback, useEffect } from 'react'
import { storage, type Conversation } from '../lib/storage'
import { generateId } from '../lib/utils'
import type { Message } from '../lib/types'

interface UseConversationsReturn {
  conversations: Conversation[]
  currentConversation: Conversation | null
  createConversation: (model: string, systemPrompt?: string) => Conversation
  selectConversation: (id: string) => void
  updateConversation: (id: string, updates: Partial<Conversation>) => void
  deleteConversation: (id: string) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void
  clearCurrentConversation: () => void
}

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)

  // Load conversations on mount
  useEffect(() => {
    const loaded = storage.getConversations()
    setConversations(loaded)

    // Select the most recent conversation if any
    if (loaded.length > 0) {
      setCurrentId(loaded[0].id)
    }
  }, [])

  const currentConversation = conversations.find(c => c.id === currentId) || null

  const createConversation = useCallback((model: string, systemPrompt?: string): Conversation => {
    const conversation: Conversation = {
      id: generateId(),
      title: 'New conversation',
      messages: [],
      model,
      systemPrompt,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    setConversations(prev => {
      const updated = [conversation, ...prev]
      storage.saveConversations(updated)
      return updated
    })

    setCurrentId(conversation.id)
    return conversation
  }, [])

  const selectConversation = useCallback((id: string) => {
    setCurrentId(id)
  }, [])

  const updateConversation = useCallback((id: string, updates: Partial<Conversation>) => {
    setConversations(prev => {
      const updated = prev.map(c =>
        c.id === id
          ? { ...c, ...updates, updatedAt: new Date() }
          : c
      )
      storage.saveConversations(updated)
      return updated
    })
  }, [])

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id)
      storage.saveConversations(updated)

      // If we deleted the current conversation, select another
      if (id === currentId) {
        setCurrentId(updated.length > 0 ? updated[0].id : null)
      }

      return updated
    })
  }, [currentId])

  const addMessage = useCallback((conversationId: string, message: Message) => {
    setConversations(prev => {
      const updated = prev.map(c => {
        if (c.id !== conversationId) return c

        const messages = [...c.messages, message]

        // Auto-generate title from first user message
        let title = c.title
        if (c.title === 'New conversation' && message.role === 'user') {
          title = message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
        }

        return { ...c, messages, title, updatedAt: new Date() }
      })

      storage.saveConversations(updated)
      return updated
    })
  }, [])

  const updateMessage = useCallback((conversationId: string, messageId: string, updates: Partial<Message>) => {
    setConversations(prev => {
      const updated = prev.map(c => {
        if (c.id !== conversationId) return c

        const messages = c.messages.map(m =>
          m.id === messageId ? { ...m, ...updates } : m
        )

        return { ...c, messages, updatedAt: new Date() }
      })

      storage.saveConversations(updated)
      return updated
    })
  }, [])

  const clearCurrentConversation = useCallback(() => {
    if (!currentId) return

    setConversations(prev => {
      const updated = prev.map(c =>
        c.id === currentId
          ? { ...c, messages: [], title: 'New conversation', updatedAt: new Date() }
          : c
      )
      storage.saveConversations(updated)
      return updated
    })
  }, [currentId])

  return {
    conversations,
    currentConversation,
    createConversation,
    selectConversation,
    updateConversation,
    deleteConversation,
    addMessage,
    updateMessage,
    clearCurrentConversation,
  }
}
