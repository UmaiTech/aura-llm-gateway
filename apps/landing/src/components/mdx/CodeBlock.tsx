import { useState, ReactNode } from 'react'
import { clsx } from 'clsx'
import { Check, Copy } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface CodeBlockProps {
  children: string
  language?: string
  title?: string
  showLineNumbers?: boolean
  highlightLines?: number[]
}

export function CodeBlock({
  children,
  language = 'text',
  title,
  showLineNumbers = false,
  highlightLines = [],
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const code = children.trim()

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="my-4 rounded-lg overflow-hidden bg-[#0f172a] border border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/50 border-b border-gray-800">
        <div className="flex items-center gap-2">
          {title && (
            <span className="text-sm text-gray-400 font-mono">{title}</span>
          )}
          {!title && language && (
            <span className="text-xs text-gray-500 font-mono uppercase">{language}</span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className={clsx(
            'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
            copied
              ? 'text-green-400 bg-green-500/10'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          )}
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
        language={language}
        style={vscDarkPlus}
        showLineNumbers={showLineNumbers}
        wrapLines={highlightLines.length > 0}
        lineProps={(lineNumber) => {
          const style: React.CSSProperties = { display: 'block' }
          if (highlightLines.includes(lineNumber)) {
            style.backgroundColor = 'rgba(99, 102, 241, 0.1)'
            style.borderLeft = '2px solid #6366f1'
            style.marginLeft = '-2px'
          }
          return { style }
        }}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.875rem',
          background: 'transparent',
          padding: '1rem',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

// Inline code component
interface InlineCodeProps {
  children: ReactNode
}

export function InlineCode({ children }: InlineCodeProps) {
  return (
    <code className="text-aura-400 bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
      {children}
    </code>
  )
}
