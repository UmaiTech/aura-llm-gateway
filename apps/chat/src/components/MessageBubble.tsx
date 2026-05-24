import {
  User, Sparkles, Copy, Check, Wrench, Loader2,
  ChevronDown, Coins, Search, Calculator, Clock, Cloud,
  Zap, Server, Timer, ThumbsUp, ThumbsDown, X, Send, Code2,
  Gauge
} from 'lucide-react'
import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '../lib/utils'
import { useChatStore } from '../stores/chatStore'
import type { Message, ToolInvocation } from '../lib/types'

// Tool-specific icons and colors
const TOOL_CONFIG: Record<string, { icon: typeof Wrench; color: string; bgColor: string }> = {
  web_search: { icon: Search, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  calculate: { icon: Calculator, color: 'text-green-400', bgColor: 'bg-green-500/10' },
  get_current_time: { icon: Clock, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  get_weather: { icon: Cloud, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10' },
  default: { icon: Wrench, color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
}

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  // Debug logging for usage data
  if (!isUser && !isStreaming) {
    console.log('[MessageBubble] Message:', {
      id: message.id,
      hasUsage: !!message.usage,
      usage: message.usage,
      hasAura: !!message.aura,
      aura: message.aura,
    })
  }

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        'flex gap-3 group/message',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar — small, mono-tone, no gradient. User gets a filled
          dot, assistant gets an outlined square. The visual mass of
          a chat is in the prose; the avatar is a tag, not a face. */}
      <div
        className={cn(
          'flex-shrink-0 h-7 w-7 rounded-md flex items-center justify-center',
          isUser
            ? 'bg-foreground text-background'
            : 'border border-border bg-background text-foreground'
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Message content */}
      <div
        className={cn(
          'flex-1 min-w-0 max-w-[85%]',
          isUser && 'flex flex-col items-end'
        )}
      >
        <div className="relative">
          {/* User: solid neutral pill on the right.
              Assistant: hanging prose with a thin left rule.
              No gradient, no backdrop-blur, no fake shadows. */}
          <div
            className={cn(
              isUser
                ? 'rounded-2xl rounded-tr-sm px-4 py-2.5 bg-muted text-foreground'
                : 'pl-4 border-l-2 border-border'
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            ) : (
            <div className="space-y-3">
              {/* Tool Invocations - only render when present */}
              {message.toolInvocations && message.toolInvocations.length > 0 && (
                <div className="animate-in fade-in duration-200">
                  <ToolInvocations invocations={message.toolInvocations} />
                </div>
              )}

              {/* Message Content - stable container */}
              <div className={cn(
                "markdown-content prose prose-sm dark:prose-invert max-w-none",
                !message.content && isStreaming && "min-h-[24px]"
              )}>
                {message.content && (
                  <ReactMarkdown
                    // GFM unlocks tables, strikethrough, task lists,
                    // and autolinks — all of which models emit
                    // routinely. Without this plugin, table syntax
                    // ("| a | b |...") renders as raw pipes.
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // Tables — default browser styling is cramped
                      // and borderless. Use bordered cells with a
                      // muted header band.
                      table: ({ children }) => (
                        <div className="my-4 overflow-x-auto rounded-lg border border-border">
                          <table className="w-full text-sm border-collapse">
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="bg-muted/40">{children}</thead>
                      ),
                      th: ({ children }) => (
                        <th className="px-3 py-2 text-left font-medium border-b border-border">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="px-3 py-2 border-b border-border/50 align-top">
                          {children}
                        </td>
                      ),
                      // Lists need spacing — without it, multi-item
                      // responses run together.
                      ul: ({ children }) => (
                        <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>
                      ),
                      // Headings inside chat answers — small but
                      // visually distinct from body.
                      h1: ({ children }) => (
                        <h1 className="font-display text-xl font-semibold mt-4 mb-2">{children}</h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="font-display text-lg font-semibold mt-3 mb-2">{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-base font-semibold mt-3 mb-1">{children}</h3>
                      ),
                      // Block quotes — left rule, muted text.
                      blockquote: ({ children }) => (
                        <blockquote className="my-2 pl-3 border-l-2 border-border text-muted-foreground">
                          {children}
                        </blockquote>
                      ),
                      a: ({ children, href }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {children}
                        </a>
                      ),
                      code({ className, children, ...props }) {
                        const inline = !className
                        const match = /language-(\w+)/.exec(className || '')
                        const language = match ? match[1] : ''

                        if (inline) {
                          return (
                            <code
                              className="bg-muted text-foreground px-1.5 py-0.5 rounded text-sm font-mono"
                              {...props}
                            >
                              {children}
                            </code>
                          )
                        }

                        return (
                          <CodeBlock language={language}>
                            {String(children).replace(/\n$/, '')}
                          </CodeBlock>
                        )
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                )}
                {isStreaming && <TypingIndicator />}
              </div>
            </div>
          )}
          </div>

          {/* Copy button - appears on hover */}
          {message.content && !isStreaming && (
            <button
              onClick={handleCopyMessage}
              className={cn(
                "absolute top-2 opacity-0 group-hover/message:opacity-100 transition-opacity",
                "p-1.5 rounded-md bg-gray-800/80 hover:bg-gray-700/80 text-gray-400 hover:text-gray-200",
                isUser ? "left-2" : "right-2"
              )}
              title="Copy message"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Usage info (tokens, cost, and Aura metadata) */}
        {!isUser && message.usage && !message.isStreaming && (
          <UsageDisplay
            usage={message.usage}
            aura={message.aura}
            responseId={message.aura?.requestId}
            rawResponse={message.rawResponse}
          />
        )}
      </div>
    </div>
  )
}

interface CodeBlockProps {
  language: string
  children: string
}

function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  // Theme-aware syntax highlighting: oneDark in dark mode, oneLight
  // in light. Read the `dark` class that ThemeToggle puts on
  // <html> — that's the single source of truth for the applied
  // theme. Re-running matchMedia here was wrong because it ignored
  // an explicit user override of the system preference (e.g. system
  // dark, page set to light → matchMedia said dark, but the page is
  // actually light, so we rendered a navy code block on a white
  // message background).
  //
  // Subscribe to store.theme so we re-render on the toggle even
  // though we don't read its value directly — the class update
  // happens in the ThemeToggle effect.
  useChatStore((s) => s.theme)
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Compose the code surface from a single themed background. The
  // header sits inline with the code (same background, just a
  // mono label + copy button hung on top). No outer border, no
  // bg-muted/40 secondary band — those layered up to produce the
  // "black band around the code" + invisible header text bug seen
  // in 2026-05-22 screenshots.
  const surfaceBg = isDark ? '#282c34' : '#fafafa' // matches oneDark/oneLight body bg
  const surfaceFg = isDark ? '#abb2bf' : '#383a42' // muted text on each theme

  return (
    <div
      className="relative group my-4 -mx-4 sm:mx-0 sm:rounded-lg overflow-hidden"
      style={{ background: surfaceBg }}
    >
      {/* Header — same background as the code body so they read as
          one surface. Mono label + copy button hang on top in
          a muted colour that contrasts the surface in both themes. */}
      <div
        className="flex items-center justify-between px-4 pt-3 pb-2"
        style={{ color: surfaceFg }}
      >
        <span className="text-xs font-mono uppercase tracking-wider">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs font-mono hover:opacity-70 transition-opacity"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code — theme's background lives on the SyntaxHighlighter pre.
          We pad sides+bottom to match the header's pt-3; the
          highlighter handles font/colors via the prism theme. */}
      <SyntaxHighlighter
        style={isDark ? oneDark : oneLight}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: '0 1rem 1rem 1rem',
          background: 'transparent',
          fontSize: '0.875rem',
        }}
        lineProps={{ style: { backgroundColor: 'transparent' } }}
        wrapLongLines={true}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current opacity-60" />
    </span>
  )
}

interface ToolInvocationsProps {
  invocations: ToolInvocation[]
}

function ToolInvocations({ invocations }: ToolInvocationsProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const getToolConfig = (toolName: string) => {
    return TOOL_CONFIG[toolName] || TOOL_CONFIG.default
  }

  return (
    <div className="space-y-2">
      {invocations.map((invocation, index) => {
        const config = getToolConfig(invocation.toolName)
        const ToolIcon = config.icon
        const isExpanded = expandedTools.has(invocation.toolCallId)

        // Editorial card: a single rounded-lg surface with a
        // hairline border, no shadow/blur/colored tile. Status is a
        // dot + label on the right, not a coloured background. Tool
        // name is monospace because it's a code-ish identifier.
        const stateLabel =
          invocation.state === 'pending'
            ? 'running'
            : invocation.state === 'result'
              ? 'ok'
              : 'error'
        const stateDot =
          invocation.state === 'pending'
            ? 'bg-muted-foreground/50 animate-pulse'
            : invocation.state === 'result'
              ? 'bg-green-500'
              : 'bg-red-500'

        return (
          <div
            key={invocation.toolCallId}
            className="rounded-lg border border-border overflow-hidden bg-background animate-in fade-in slide-in-from-top-1"
            style={{
              animationDelay: `${index * 50}ms`,
              animationFillMode: 'backwards',
            }}
          >
            {/* Tool Card Header */}
            <button
              onClick={() => toggleTool(invocation.toolCallId)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
            >
              {/* Tool icon — small, single-tone, no coloured tile */}
              <ToolIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />

              {/* Tool name — mono, since it's an identifier */}
              <span className="font-mono text-xs text-foreground min-w-0 truncate">
                {invocation.toolName}
              </span>

              {/* Args preview when collapsed */}
              {!isExpanded && Object.keys(invocation.args).length > 0 && (
                <span className="text-xs text-muted-foreground/70 truncate min-w-0 flex-1">
                  {formatArgsPreview(invocation.args)}
                </span>
              )}

              {/* Status: dot + label */}
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-shrink-0 ml-auto">
                {invocation.state === 'pending' && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                <span className={cn('h-1.5 w-1.5 rounded-full', stateDot)} />
                <span className="font-mono uppercase tracking-wide">
                  {stateLabel}
                </span>
              </span>

              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 text-muted-foreground/70 transition-transform flex-shrink-0',
                  isExpanded && 'rotate-180'
                )}
              />
            </button>

            {/* Expanded Content — themed via tokens so it works in
                both light and dark mode. Previously hardcoded
                bg-black/20 + bg-gray-900/80 which produced a dark
                slab on light-mode message backgrounds. */}
            {isExpanded && (
              <div className="border-t border-border px-3 py-3 space-y-3 bg-muted/20">
                {/* Arguments Section */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Zap className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      Input
                    </span>
                  </div>
                  <pre className="text-xs bg-background border border-border rounded p-2.5 overflow-x-auto font-mono text-foreground">
                    {JSON.stringify(invocation.args, null, 2)}
                  </pre>
                </div>

                {/* Result Section */}
                {invocation.result && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Server className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        Output
                      </span>
                    </div>
                    <pre className="text-xs bg-background border border-border rounded p-2.5 overflow-x-auto max-h-48 overflow-y-auto font-mono text-foreground">
                      {formatToolResult(invocation.result)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// formatToolName removed in 2026-05-21 polish — tool names now
// render in monospace as the raw identifier (e.g. `web_search`),
// matching how the API reports them. Reinstate if a humanized name
// is needed elsewhere.

function formatArgsPreview(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return ''
  if (entries.length === 1) {
    const [key, value] = entries[0]
    const strValue = typeof value === 'string' ? value : JSON.stringify(value)
    return `${key}: ${strValue.slice(0, 50)}${strValue.length > 50 ? '...' : ''}`
  }
  return `${entries.length} parameters`
}

function formatToolResult(result: string): string {
  try {
    const parsed = JSON.parse(result)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return result
  }
}

interface UsageDisplayProps {
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cost?: number
  }
  aura?: {
    provider: string
    gatewayVersion: string
    latencyMs?: number
    requestId?: string
    compression?: {
      original_tokens?: number
      compressed_tokens?: number
      ratio?: number
      savings_percent?: number
      strategies?: string[]
      latency_ms?: number
    }
    consistency?: {
      strategy?: string
      has_principles?: boolean
      principles_count?: number
    }
    validation?: {
      strategy?: string
      confidence?: number
      min_confidence?: number
      n?: number
      selection?: string
      include_logprobs?: boolean
    }
  }
  responseId?: string
  rawResponse?: unknown
}

type FeedbackState = 'none' | 'pending_up' | 'pending_down' | 'up' | 'down' | 'submitting'

function UsageDisplay({ usage, aura, responseId, rawResponse }: UsageDisplayProps) {
  const [feedback, setFeedback] = useState<FeedbackState>('none')
  const [reason, setReason] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const [rawCopied, setRawCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleCopyRaw = async () => {
    if (rawResponse) {
      await navigator.clipboard.writeText(JSON.stringify(rawResponse, null, 2))
      setRawCopied(true)
      setTimeout(() => setRawCopied(false), 2000)
    }
  }

  // Focus textarea when modal opens
  useEffect(() => {
    if ((feedback === 'pending_up' || feedback === 'pending_down') && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [feedback])

  const handleFeedbackClick = (signal: 'up' | 'down') => {
    if (feedback !== 'none') return
    setFeedback(signal === 'up' ? 'pending_up' : 'pending_down')
    setReason('')
  }

  const cancelFeedback = () => {
    setFeedback('none')
    setReason('')
  }

  const submitFeedback = useCallback(async () => {
    if (!responseId) return

    const signal = feedback === 'pending_up' ? 'thumbs_up' : 'thumbs_down'
    setFeedback('submitting')

    try {
      // Same-origin proxy in prod; VITE_PROXY_BASE_URL is the local-dev escape hatch.
      const apiBaseUrl = import.meta.env.VITE_PROXY_BASE_URL || '/api/proxy'
      const response = await fetch(`${apiBaseUrl}/v1/feedback`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          response_id: responseId,
          signal,
          reason: reason.trim() || undefined,
        }),
      })

      if (response.ok) {
        setFeedback(signal === 'thumbs_up' ? 'up' : 'down')
        setReason('')
      } else {
        console.error('Failed to submit feedback:', await response.text())
        setFeedback('none')
      }
    } catch (error) {
      console.error('Error submitting feedback:', error)
      setFeedback('none')
    }
  }, [responseId, feedback, reason])
  // Format latency for display
  const formatLatency = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`
    } else if (ms < 60000) {
      const seconds = (ms / 1000).toFixed(1)
      return `${seconds}s (${ms}ms)`
    } else {
      const minutes = Math.floor(ms / 60000)
      const seconds = Math.floor((ms % 60000) / 1000)
      return `${minutes}m ${seconds}s (${ms}ms)`
    }
  }

  return (
    <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
      {/* Provider badge */}
      {aura?.provider && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/50">
          <Server className="h-3 w-3" />
          <span className="capitalize">{aura.provider}</span>
        </span>
      )}

      {/* Latency */}
      {aura?.latencyMs !== undefined && (
        <span className="flex items-center gap-1">
          <Timer className="h-3 w-3" />
          <span>{formatLatency(aura.latencyMs)}</span>
        </span>
      )}

      {/* Token counts */}
      <span className="flex items-center gap-1">
        <span className="font-medium">{usage.inputTokens.toLocaleString()}</span>
        <span>in</span>
        <span className="mx-0.5">→</span>
        <span className="font-medium">{usage.outputTokens.toLocaleString()}</span>
        <span>out</span>
      </span>

      {/* Cost */}
      {usage.cost !== undefined && usage.cost > 0 && (
        <span className="flex items-center gap-1 text-green-400">
          <Coins className="h-3 w-3" />
          <span>${usage.cost.toFixed(4)}</span>
        </span>
      )}

      {/* Compression stats */}
      {aura?.compression && aura.compression.savings_percent !== undefined && aura.compression.savings_percent > 0 && (
        <span
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400"
          title={aura.compression.strategies ? `Strategies: ${aura.compression.strategies.join(', ')}` : undefined}
        >
          <Zap className="h-3 w-3" />
          <span className="font-medium">{aura.compression.savings_percent.toFixed(1)}%</span>
          <span>saved</span>
          {aura.compression.original_tokens && aura.compression.compressed_tokens && (
            <span className="text-muted-foreground ml-1">
              ({aura.compression.original_tokens} → {aura.compression.compressed_tokens})
            </span>
          )}
        </span>
      )}

      {/* Consistency chip — only renders when a non-none strategy
          actually ran on this response. */}
      {aura?.consistency?.strategy && aura.consistency.strategy !== 'none' && (
        <span
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400"
          title={
            aura.consistency.has_principles
              ? `Strategy: ${aura.consistency.strategy} · ${aura.consistency.principles_count ?? 0} principles`
              : `Strategy: ${aura.consistency.strategy}`
          }
        >
          <Sparkles className="h-3 w-3" />
          <span className="font-medium capitalize">{aura.consistency.strategy.replace(/_/g, ' ')}</span>
        </span>
      )}

      {/* Validation chip — color-coded if confidence dipped below the
          configured threshold. */}
      {aura?.validation?.strategy && aura.validation.strategy !== 'none' && (
        <span
          className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded",
            aura.validation.confidence !== undefined &&
              aura.validation.min_confidence !== undefined &&
              aura.validation.confidence < aura.validation.min_confidence
              ? "bg-red-500/10 text-red-400"
              : "bg-blue-500/10 text-blue-400",
          )}
          title={
            aura.validation.min_confidence !== undefined
              ? `Strategy: ${aura.validation.strategy} · min ${aura.validation.min_confidence.toFixed(2)}`
              : `Strategy: ${aura.validation.strategy}`
          }
        >
          <Gauge className="h-3 w-3" />
          <span className="font-medium capitalize">{aura.validation.strategy.replace(/_/g, ' ')}</span>
          {aura.validation.confidence !== undefined && (
            <span className="ml-0.5">{aura.validation.confidence.toFixed(2)}</span>
          )}
        </span>
      )}

      {/* Feedback buttons */}
      {responseId && (
        <span className="relative flex items-center gap-1 ml-2 border-l border-border/50 pl-2">
          <button
            onClick={() => handleFeedbackClick('up')}
            disabled={feedback !== 'none'}
            className={cn(
              "p-1 rounded transition-colors",
              feedback === 'up'
                ? "text-green-400 bg-green-500/20"
                : feedback === 'pending_up'
                  ? "text-green-400 bg-green-500/20"
                  : feedback === 'none'
                    ? "hover:text-green-400 hover:bg-green-500/10"
                    : "text-muted-foreground/30 cursor-not-allowed"
            )}
            title="This response was helpful"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleFeedbackClick('down')}
            disabled={feedback !== 'none'}
            className={cn(
              "p-1 rounded transition-colors",
              feedback === 'down'
                ? "text-red-400 bg-red-500/20"
                : feedback === 'pending_down'
                  ? "text-red-400 bg-red-500/20"
                  : feedback === 'none'
                    ? "hover:text-red-400 hover:bg-red-500/10"
                    : "text-muted-foreground/30 cursor-not-allowed"
            )}
            title="This response wasn't helpful"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
          {feedback === 'submitting' && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}

          {/* Feedback Modal */}
          {(feedback === 'pending_up' || feedback === 'pending_down') && (
            <div className="absolute bottom-full right-0 mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="bg-secondary border border-border rounded-lg shadow-lg p-3 min-w-[280px]">
                <div className="flex items-center justify-between mb-2">
                  <span className={cn(
                    "text-sm font-medium flex items-center gap-1.5",
                    feedback === 'pending_up' ? "text-green-400" : "text-red-400"
                  )}>
                    {feedback === 'pending_up' ? (
                      <><ThumbsUp className="h-4 w-4" /> Helpful</>
                    ) : (
                      <><ThumbsDown className="h-4 w-4" /> Not helpful</>
                    )}
                  </span>
                  <button
                    onClick={cancelFeedback}
                    className="p-1 hover:bg-secondary-foreground/10 rounded transition-colors"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <textarea
                  ref={textareaRef}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Tell us more (optional)..."
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      submitFeedback()
                    }
                    if (e.key === 'Escape') {
                      cancelFeedback()
                    }
                  }}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">
                    Press ⌘+Enter to submit
                  </span>
                  <button
                    onClick={submitFeedback}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      feedback === 'pending_up'
                        ? "bg-green-500 hover:bg-green-600 text-white"
                        : "bg-red-500 hover:bg-red-600 text-white"
                    )}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Submit
                  </button>
                </div>
              </div>
            </div>
          )}
        </span>
      )}

      {/* Raw Response Button */}
      {rawResponse !== undefined && (
        <button
          onClick={() => setShowRaw(!showRaw)}
          className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ml-2 border-l border-border/50 pl-2",
            showRaw
              ? "text-aura-400 bg-aura-500/10"
              : "hover:text-aura-400 hover:bg-aura-500/10"
          )}
          title="View raw API response"
        >
          <Code2 className="h-3 w-3" />
          <span className="text-xs">Raw</span>
        </button>
      )}

      {/* Raw Response Panel */}
      {showRaw && rawResponse !== undefined && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="bg-gray-900 border border-border rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground">Raw API Response</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyRaw}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                  title="Copy JSON"
                >
                  {rawCopied ? (
                    <>
                      <Check className="h-3 w-3 text-green-400" />
                      <span className="text-green-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowRaw(false)}
                  className="p-1 hover:bg-secondary-foreground/10 rounded transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>
            <pre className="text-xs p-3 overflow-x-auto max-h-80 overflow-y-auto text-gray-300 font-mono">
              {JSON.stringify(rawResponse, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
