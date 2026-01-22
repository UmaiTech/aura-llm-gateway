import { User, Sparkles, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '../lib/utils'
import type { Message } from '../lib/types'

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user'

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
          isUser && "flex justify-end"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-primary-500 text-white rounded-tr-md"
              : "bg-secondary rounded-tl-md"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div className="markdown-content prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  code({ node, className, children, ...props }) {
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
                {message.content || ' '}
              </ReactMarkdown>
              {isStreaming && <TypingIndicator />}
            </div>
          )}
        </div>
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
