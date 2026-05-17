// localStorage utilities for conversation persistence

import type { Message } from './types'

const STORAGE_KEYS = {
  CONVERSATIONS: 'aura-chat-conversations',
  SETTINGS: 'aura-chat-settings',
} as const

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  model: string
  systemPrompt?: string
  createdAt: Date
  updatedAt: Date
}

export interface ChatSettings {
  model: string
  systemPrompt: string
  agentMode: boolean
  enabledTools: string[]
}

const DEFAULT_SETTINGS: ChatSettings = {
  model: 'gpt-5.4-mini',
  systemPrompt: '',
  agentMode: false,
  enabledTools: [],
}

// Serialize dates properly
function serialize<T>(data: T): string {
  return JSON.stringify(data, (_key, value) => {
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() }
    }
    return value
  })
}

// Deserialize dates properly
function deserialize<T>(json: string): T {
  return JSON.parse(json, (_key, value) => {
    if (value && typeof value === 'object' && value.__type === 'Date') {
      return new Date(value.value)
    }
    return value
  })
}

export const storage = {
  // Conversations
  getConversations(): Conversation[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS)
      if (!data) return []
      return deserialize<Conversation[]>(data)
    } catch (e) {
      console.error('Failed to load conversations:', e)
      return []
    }
  },

  saveConversations(conversations: Conversation[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, serialize(conversations))
    } catch (e) {
      console.error('Failed to save conversations:', e)
    }
  },

  getConversation(id: string): Conversation | undefined {
    const conversations = this.getConversations()
    return conversations.find(c => c.id === id)
  },

  saveConversation(conversation: Conversation): void {
    const conversations = this.getConversations()
    const index = conversations.findIndex(c => c.id === conversation.id)

    if (index >= 0) {
      conversations[index] = conversation
    } else {
      conversations.unshift(conversation)
    }

    this.saveConversations(conversations)
  },

  deleteConversation(id: string): void {
    const conversations = this.getConversations()
    const filtered = conversations.filter(c => c.id !== id)
    this.saveConversations(filtered)
  },

  // Settings
  getSettings(): ChatSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS)
      if (!data) return DEFAULT_SETTINGS
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) }
    } catch (e) {
      console.error('Failed to load settings:', e)
      return DEFAULT_SETTINGS
    }
  },

  saveSettings(settings: Partial<ChatSettings>): void {
    try {
      const current = this.getSettings()
      const updated = { ...current, ...settings }
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated))
    } catch (e) {
      console.error('Failed to save settings:', e)
    }
  },

  // Clear all data
  clearAll(): void {
    localStorage.removeItem(STORAGE_KEYS.CONVERSATIONS)
    localStorage.removeItem(STORAGE_KEYS.SETTINGS)
  },
}
