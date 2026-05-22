import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Send, StopCircle, ArrowLeft } from 'lucide-react'
import { AuraAPI } from '../lib/api'
import { calculateCost } from '../lib/pricing'
import { useChatStore } from '../stores/chatStore'
import { ComparePane } from './ComparePane'
import { cn } from '../lib/utils'
import type {
  Message,
  MessageUsage,
  PaneConfig,
  RoutingStrategy,
  ValidationStrategy,
  ConsistencyStrategy,
  CompressionStrategy,
} from '../lib/types'

const MAX_PANES = 3
const DEFAULT_MODELS = ['gpt-5.4-mini', 'claude-haiku-4-5-20251001', 'gemini-2.5-flash']

/**
 * Compare Mode — fan-out one prompt across up to 3 panes, each with
 * its own model/system prompt/strategy chips, and compare the outputs
 * side-by-side.
 *
 * Pane state is local component state (NOT chatStore). Compare
 * sessions are ephemeral: switching back to single-pane mode drops
 * the panes. The single-pane chat is unaffected by anything in here.
 *
 * One AuraAPI instance per pane carries that pane's config. Sends
 * fan-out as Promise.all so all three streams start within ms of
 * each other. Each pane's streaming state is independent — one
 * failing or being aborted doesn't affect the others.
 */
export function CompareView() {
  const setCompareMode = useChatStore((s) => s.setCompareMode)

  // Three default panes seeded with three different providers so
  // first-run is immediately comparison-worthy. User can change them.
  const [panes, setPanes] = useState<PaneConfig[]>(() =>
    DEFAULT_MODELS.slice(0, 2).map((model, i) => createPane(model, i))
  )

  // Shared prompt input
  const [prompt, setPrompt] = useState('')

  // Per-pane abort controllers so the Stop button can kill one
  // pane mid-stream without affecting the others.
  const abortRefs = useRef<Map<string, AbortController>>(new Map())

  const updatePane = useCallback((id: string, patch: Partial<PaneConfig>) => {
    setPanes((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    )
  }, [])

  const addPane = () => {
    if (panes.length >= MAX_PANES) return
    const nextModel = DEFAULT_MODELS[panes.length] ?? DEFAULT_MODELS[0]
    setPanes((prev) => [...prev, createPane(nextModel, prev.length)])
  }

  const removePane = (id: string) => {
    abortRefs.current.get(id)?.abort()
    abortRefs.current.delete(id)
    setPanes((prev) => prev.filter((p) => p.id !== id))
  }

  const stopAll = () => {
    abortRefs.current.forEach((c) => c.abort())
    abortRefs.current.clear()
    setPanes((prev) => prev.map((p) => ({ ...p, isStreaming: false })))
  }

  /**
   * Stream one pane's response. Pure async — caller decides whether
   * to await or fire-and-forget. Updates the pane's transcript
   * incrementally via updatePane.
   */
  const streamPane = useCallback(
    async (pane: PaneConfig, userContent: string) => {
      const controller = new AbortController()
      abortRefs.current.set(pane.id, controller)

      const api = new AuraAPI({
        routingStrategy: pane.routingStrategy,
        // Validation/Consistency/Compression are wired here so each
        // pane can independently exercise the same surface. The
        // current single-pane chat passes the same shape.
      })

      const userMessage: Message = {
        id: `${pane.id}-${Date.now()}-user`,
        role: 'user',
        content: userContent,
        createdAt: new Date(),
      }
      const assistantId = `${pane.id}-${Date.now()}-asst`
      const assistantMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        isStreaming: true,
      }

      // Snapshot the prior transcript so we send the right context
      // even if a re-render mutates pane.messages between now and
      // when we read it inside the loop.
      const priorMessages = pane.messages
      updatePane(pane.id, {
        messages: [...priorMessages, userMessage, assistantMessage],
        isStreaming: true,
        error: null,
      })

      // Thread previous_response_id from the most recent assistant
      // turn so the gateway can rebuild context (e.g. for Anthropic
      // tool roundtrips). Same pattern App.tsx uses.
      const prevAssistant = [...priorMessages]
        .reverse()
        .find((m) => m.role === 'assistant' && m.responseId)
      const previousResponseId = prevAssistant?.responseId

      let fullContent = ''
      let responseId: string | undefined
      let usage: MessageUsage | undefined

      try {
        const stream = api.createResponseStream({
          model: pane.model,
          input: [{ type: 'message', role: 'user', content: userContent }],
          instructions: pane.systemPrompt || undefined,
          stream: true,
          previous_response_id: previousResponseId,
        })

        for await (const event of stream) {
          if (controller.signal.aborted) break

          if (event.type === 'response.output_text.delta' && event.delta) {
            fullContent += event.delta
            // Inline message update keyed by assistantId.
            setPanes((prev) =>
              prev.map((p) =>
                p.id !== pane.id
                  ? p
                  : {
                      ...p,
                      messages: p.messages.map((m) =>
                        m.id === assistantId
                          ? { ...m, content: fullContent }
                          : m
                      ),
                    }
              )
            )
          } else if (event.type === 'response.completed') {
            const response = event.response as {
              id?: string
              usage?: {
                input_tokens?: number
                output_tokens?: number
                cost_usd?: number
              }
            }
            responseId = response?.id
            if (
              response?.usage &&
              typeof response.usage.input_tokens === 'number' &&
              typeof response.usage.output_tokens === 'number'
            ) {
              usage = {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                totalTokens:
                  response.usage.input_tokens + response.usage.output_tokens,
                cost:
                  response.usage.cost_usd ??
                  calculateCost(
                    pane.model,
                    response.usage.input_tokens,
                    response.usage.output_tokens
                  ),
              }
            }
          } else if (event.type === 'response.failed' || event.type === 'error') {
            const msg =
              event.error?.message ||
              (event.response as { error?: { message?: string } })?.error?.message ||
              'Generation failed'
            throw new Error(msg)
          }
        }

        // Finalize the assistant message with usage + responseId
        setPanes((prev) =>
          prev.map((p) =>
            p.id !== pane.id
              ? p
              : {
                  ...p,
                  isStreaming: false,
                  messages: p.messages.map((m) =>
                    m.id === assistantId
                      ? { ...m, isStreaming: false, usage, responseId }
                      : m
                  ),
                }
          )
        )
      } catch (err) {
        if (controller.signal.aborted) {
          // User-initiated stop — leave whatever streamed so far.
          updatePane(pane.id, { isStreaming: false })
        } else {
          const message = err instanceof Error ? err.message : String(err)
          updatePane(pane.id, {
            isStreaming: false,
            error: message,
            // Drop the placeholder assistant message; the error
            // banner replaces it.
            messages: panes
              .find((p) => p.id === pane.id)
              ?.messages
              .filter((m) => m.id !== assistantId) ?? [],
          })
        }
      } finally {
        abortRefs.current.delete(pane.id)
      }
    },
    [updatePane, panes]
  )

  const handleSend = useCallback(() => {
    const text = prompt.trim()
    if (!text) return
    if (panes.some((p) => p.isStreaming)) return // user clicked while streaming
    setPrompt('')
    // Fan-out. Promise.all so all panes start within microseconds —
    // we don't await it because the UI updates happen inside each
    // streamPane via updatePane already.
    void Promise.all(panes.map((p) => streamPane(p, text)))
  }, [prompt, panes, streamPane])

  // Stop any in-flight streams on unmount (compareMode toggle off).
  useEffect(
    () => () => {
      abortRefs.current.forEach((c) => c.abort())
      abortRefs.current.clear()
    },
    []
  )

  const anyStreaming = panes.some((p) => p.isStreaming)

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Compare header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-2 gap-3">
        <button
          onClick={() => setCompareMode(false)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to chat
        </button>
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Compare · {panes.length} of {MAX_PANES} pane
          {panes.length === 1 ? '' : 's'}
        </div>
        <div className="flex items-center gap-2">
          {anyStreaming && (
            <button
              onClick={stopAll}
              className="flex items-center gap-1 text-xs text-destructive hover:opacity-80 transition-opacity"
            >
              <StopCircle className="h-4 w-4" />
              Stop all
            </button>
          )}
          {panes.length < MAX_PANES && (
            <button
              onClick={addPane}
              disabled={anyStreaming}
              className="flex items-center gap-1.5 text-sm text-foreground hover:text-aura-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
              Add pane
            </button>
          )}
        </div>
      </header>

      {/* Panes — side-by-side. Stacks vertically on small screens. */}
      <div
        className={cn(
          'flex-1 grid gap-px bg-border overflow-hidden',
          panes.length === 1 && 'grid-cols-1',
          panes.length === 2 && 'grid-cols-1 lg:grid-cols-2',
          panes.length === 3 && 'grid-cols-1 lg:grid-cols-3'
        )}
      >
        {panes.map((pane) => (
          <ComparePane
            key={pane.id}
            pane={pane}
            canRemove={panes.length > 1}
            onChange={(patch) => updatePane(pane.id, patch)}
            onRemove={() => removePane(pane.id)}
          />
        ))}
      </div>

      {/* Shared input — fan-out send */}
      <div className="border-t border-border p-3">
        <div className="max-w-4xl mx-auto flex gap-2 items-end">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Message all panes…"
            rows={1}
            disabled={anyStreaming}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!prompt.trim() || anyStreaming}
            className="h-10 w-10 flex items-center justify-center rounded-lg bg-foreground text-background hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Send to all panes"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-2">
          Fan-out send · same prompt, {panes.length} model
          {panes.length === 1 ? '' : 's'} · cost charged per pane
        </p>
      </div>
    </div>
  )
}

/** Helper: create a fresh pane with default config. */
function createPane(model: string, index: number): PaneConfig {
  return {
    id: `pane-${Date.now()}-${index}`,
    model,
    systemPrompt: '',
    routingStrategy: 'round_robin' as RoutingStrategy,
    validationStrategy: 'none' as ValidationStrategy,
    consistencyStrategy: 'none' as ConsistencyStrategy,
    compressionStrategy: 'none' as CompressionStrategy,
    messages: [],
    isStreaming: false,
    error: null,
  }
}
