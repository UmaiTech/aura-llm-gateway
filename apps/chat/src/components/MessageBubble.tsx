import {
  User, Sparkles, Copy, Check, Wrench, Loader2, CheckCircle2, XCircle,
  ChevronDown, Coins, Search, Calculator, Clock, Cloud,
  Zap, Server, Timer
} from 'lucide-react'
import { useState } from 'react'
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

  return (
    <div
      className={cn(
        "flex gap-4",
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

        {/* Usage info (tokens, cost, and Aura metadata) */}
        {!isUser && message.usage && !message.isStreaming && (
          <UsageDisplay usage={message.usage} aura={message.aura} />
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
  }
}

function UsageDisplay({ usage, aura }: UsageDisplayProps) {
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
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
    </div>
  )
}
