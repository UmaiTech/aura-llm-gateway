import {
  User, Sparkles, Copy, Check, Wrench, Loader2, CheckCircle2, XCircle,
  ChevronDown, Coins, Search, Calculator, Clock, Cloud,
  Zap, Server, Timer, ThumbsUp, ThumbsDown, X, Send, Code2
} from 'lucide-react'
import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '../lib/utils'
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
        "flex gap-4 group/message",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
          isUser
            ? "bg-primary-500"
            : "bg-gradient-to-br from-aura-400 to-primary-500"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Sparkles className="h-4 w-4 text-white" />
        )}
      </div>

      {/* Message content */}
      <div
        className={cn(
          "flex-1 min-w-0 max-w-[85%]",
          isUser && "flex flex-col items-end"
        )}
      >
        <div className="relative">
          <div
            className={cn(
              "rounded-2xl px-4 py-3 shadow-premium",
              isUser
                ? "bg-primary-500 text-white rounded-tr-md"
                : "bg-secondary/80 backdrop-blur-sm rounded-tl-md"
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
                    components={{
                      code({ className, children, ...props }) {
                        const inline = !className
                        const match = /language-(\w+)/.exec(className || '')
                        const language = match ? match[1] : ''

                        if (inline) {
                          return (
                            <code
                              className="bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono"
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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group my-4 -mx-4 sm:mx-0 sm:rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-xs text-gray-400 font-mono">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code */}
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: '#1e1e2e',
          fontSize: '0.875rem',
        }}
        lineProps={{ style: { backgroundColor: 'transparent' }}}
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

        return (
          <div
            key={invocation.toolCallId}
            className={cn(
              "rounded-xl border overflow-hidden transition-all duration-300 ease-out shadow-premium",
              "animate-in fade-in slide-in-from-top-2 backdrop-blur-sm",
              invocation.state === 'pending'
                ? "border-border/50 bg-background/40"
                : invocation.state === 'result'
                ? "border-green-500/30 bg-green-500/10"
                : "border-red-500/30 bg-red-500/10"
            )}
            style={{
              animationDelay: `${index * 50}ms`,
              animationFillMode: 'backwards'
            }}
          >
            {/* Tool Card Header */}
            <button
              onClick={() => toggleTool(invocation.toolCallId)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
            >
              {/* Tool Icon with colored background */}
              <div className={cn(
                "flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center",
                config.bgColor
              )}>
                <ToolIcon className={cn("h-4.5 w-4.5", config.color)} />
              </div>

              {/* Tool Info */}
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {formatToolName(invocation.toolName)}
                  </span>
                  {/* Status Badge */}
                  {invocation.state === 'pending' ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Running...
                    </span>
                  ) : invocation.state === 'result' ? (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Success
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-red-400">
                      <XCircle className="h-3 w-3" />
                      Error
                    </span>
                  )}
                </div>
                {/* Show brief args preview when collapsed */}
                {!isExpanded && Object.keys(invocation.args).length > 0 && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {formatArgsPreview(invocation.args)}
                  </p>
                )}
              </div>

              {/* Expand/Collapse Arrow */}
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                isExpanded && "rotate-180"
              )} />
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t border-border/30 px-4 py-3 space-y-3 bg-black/20">
                {/* Arguments Section */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Zap className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Input
                    </span>
                  </div>
                  <pre className="text-xs bg-gray-900/80 rounded-lg p-3 overflow-x-auto border border-border/30">
                    {JSON.stringify(invocation.args, null, 2)}
                  </pre>
                </div>

                {/* Result Section */}
                {invocation.result && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Server className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Output
                      </span>
                    </div>
                    <pre className="text-xs bg-gray-900/80 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto border border-border/30">
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

function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

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
      // Same-origin proxy in prod; VITE_API_BASE_URL is the local-dev escape hatch.
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/proxy'
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
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
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
