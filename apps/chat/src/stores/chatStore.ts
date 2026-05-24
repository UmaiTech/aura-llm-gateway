import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Conversation, Message, RoutingStrategy, ValidationStrategy, SelectionCriteria, ValidationConfig, ConsistencyStrategy, ConsistencyConfig, Tone, Formality, Verbosity, CompressionStrategy, CompressionConfig } from '../lib/types'
import { generateId } from '../lib/utils'

/**
 * Default principles for the Constitutional consistency strategy.
 * Used when the user selects "Constitutional" without customizing
 * the list. Without these, the gateway sees `principles: []` and
 * the strategy is a silent no-op (see
 * crates/aura-proxy/src/routes/responses.rs around the
 * ConsistencyStrategy::Constitutional match arm — augmentation is
 * gated on principles being non-empty).
 *
 * Kept short and broadly useful. The user can override by setting
 * consistencyPrinciples explicitly.
 */
export const DEFAULT_CONSTITUTIONAL_PRINCIPLES = [
  'Be honest about uncertainty and limitations.',
  'Cite sources or label content as opinion when the answer is contested.',
  'Refuse to fabricate facts, numbers, citations, or quotes.',
  'Prefer concise, direct answers over hedging or filler.',
]

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
  validationStrategy: ValidationStrategy
  validationN: number
  validationMinConfidence: number
  validationSelection: SelectionCriteria
  consistencyStrategy: ConsistencyStrategy
  consistencyPrinciples: string[]
  consistencyStyleTone: Tone
  consistencyStyleFormality: Formality
  consistencyStyleVerbosity: Verbosity
  consistencyApplyCalibration: boolean
  compressionStrategy: CompressionStrategy

  // Compare Mode — see `PaneConfig` in lib/types.ts for the full
  // rationale. Ephemeral: not persisted; clears on toggle-off.
  compareMode: boolean

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
  setValidationStrategy: (strategy: ValidationStrategy) => void
  setValidationN: (n: number) => void
  setValidationMinConfidence: (confidence: number) => void
  setValidationSelection: (selection: SelectionCriteria) => void
  getValidationConfig: () => ValidationConfig | undefined
  setConsistencyStrategy: (strategy: ConsistencyStrategy) => void
  setConsistencyPrinciples: (principles: string[]) => void
  setConsistencyStyleTone: (tone: Tone) => void
  setConsistencyStyleFormality: (formality: Formality) => void
  setConsistencyStyleVerbosity: (verbosity: Verbosity) => void
  setConsistencyApplyCalibration: (apply: boolean) => void
  getConsistencyConfig: () => ConsistencyConfig | undefined
  setCompressionStrategy: (strategy: CompressionStrategy) => void
  getCompressionConfig: () => CompressionConfig | undefined

  // Compare mode actions
  setCompareMode: (enabled: boolean) => void

  // Computed
  getCurrentConversation: () => Conversation | null
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      conversations: [],
      currentConversationId: null,
      model: 'gpt-5.4-mini',
      systemPrompt: '',
      agentMode: false,
      enabledTools: [],
      theme: 'system',
      compareMode: false,
      routingStrategy: 'round_robin',
      validationStrategy: 'none',
      validationN: 3,
      validationMinConfidence: 0.7,
      validationSelection: 'highest_confidence',
      consistencyStrategy: 'none',
      consistencyPrinciples: [],
      consistencyStyleTone: 'neutral',
      consistencyStyleFormality: 'standard',
      consistencyStyleVerbosity: 'balanced',
      consistencyApplyCalibration: false,
      compressionStrategy: 'none',

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

      setValidationStrategy: (validationStrategy) => set({ validationStrategy }),

      setValidationN: (validationN) => set({ validationN }),

      setValidationMinConfidence: (validationMinConfidence) => set({ validationMinConfidence }),

      setValidationSelection: (validationSelection) => set({ validationSelection }),

      getValidationConfig: () => {
        const { validationStrategy, validationN, validationMinConfidence, validationSelection } = get()
        if (validationStrategy === 'none') {
          return undefined
        }
        return {
          strategy: validationStrategy,
          n: validationN,
          min_confidence: validationMinConfidence,
          selection: validationSelection,
          include_logprobs: validationStrategy === 'logprobs',
          top_logprobs: validationStrategy === 'logprobs' ? 5 : undefined,
        }
      },

      setConsistencyStrategy: (consistencyStrategy) => set({ consistencyStrategy }),

      setConsistencyPrinciples: (consistencyPrinciples) => set({ consistencyPrinciples }),

      setConsistencyStyleTone: (consistencyStyleTone) => set({ consistencyStyleTone }),

      setConsistencyStyleFormality: (consistencyStyleFormality) => set({ consistencyStyleFormality }),

      setConsistencyStyleVerbosity: (consistencyStyleVerbosity) => set({ consistencyStyleVerbosity }),

      setConsistencyApplyCalibration: (consistencyApplyCalibration) => set({ consistencyApplyCalibration }),

      getConsistencyConfig: () => {
        const {
          consistencyStrategy,
          consistencyPrinciples,
          consistencyStyleTone,
          consistencyStyleFormality,
          consistencyStyleVerbosity,
          consistencyApplyCalibration,
        } = get()

        if (consistencyStrategy === 'none') {
          return undefined
        }

        const config: ConsistencyConfig = {
          strategy: consistencyStrategy,
          apply_calibration: consistencyApplyCalibration,
        }

        if (consistencyStrategy === 'constitutional') {
          // Default constitutional principles so selecting the chip
          // actually does something out of the box. Gateway gates
          // augmentation on principles being non-empty (responses.rs
          // around line 268), so passing [] = silent no-op.
          // Users can still override via setConsistencyPrinciples
          // from a settings panel (none built yet).
          config.principles =
            consistencyPrinciples.length > 0
              ? consistencyPrinciples
              : DEFAULT_CONSTITUTIONAL_PRINCIPLES
        }

        if (consistencyStrategy === 'style_profile') {
          config.style_profile = {
            tone: consistencyStyleTone,
            formality: consistencyStyleFormality,
            verbosity: consistencyStyleVerbosity,
            use_markdown: true,
            use_bullet_points: true,
            format_code: true,
          }
        }

        return config
      },

      setCompressionStrategy: (compressionStrategy) => set({ compressionStrategy }),

      // Compare mode toggle. Persisted in localStorage like other UI
      // state, but the panes themselves live in component state so
      // they don't pollute storage.
      setCompareMode: (enabled) => set({ compareMode: enabled }),

      getCompressionConfig: () => {
        const { compressionStrategy } = get()
        if (compressionStrategy === 'none') {
          return undefined
        }

        // Map UI strategy to backend CompressionConfig format
        const baseConfig = {
          enabled: true,
          token_cleanup: true,
          minify_json: true,
        }

        switch (compressionStrategy) {
          case 'auto':
            return { ...baseConfig, auto_select: true }
          case 'json':
            return { ...baseConfig, data_format: 'json_compact' as const }
          case 'toon':
            return { ...baseConfig, data_format: 'toon' as const }
          case 'yaml':
            return { ...baseConfig, data_format: 'yaml' as const }
          case 'aisp':
            return { ...baseConfig, semantic_format: 'aisp' as const }
          default:
            return baseConfig
        }
      },

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
        validationStrategy: state.validationStrategy,
        validationN: state.validationN,
        validationMinConfidence: state.validationMinConfidence,
        validationSelection: state.validationSelection,
        consistencyStrategy: state.consistencyStrategy,
        consistencyPrinciples: state.consistencyPrinciples,
        consistencyStyleTone: state.consistencyStyleTone,
        consistencyStyleFormality: state.consistencyStyleFormality,
        consistencyStyleVerbosity: state.consistencyStyleVerbosity,
        consistencyApplyCalibration: state.consistencyApplyCalibration,
        compressionStrategy: state.compressionStrategy,
      }),
    }
  )
)
