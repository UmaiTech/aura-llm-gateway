import { useState, ReactNode } from 'react'
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

  const label = title || (language && language !== 'text' ? language : '')

  return (
    <div className="code-block">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        {label && (
          <span className="code-block-label" style={{ marginBottom: 'var(--space-2)' }}>
            {label}
          </span>
        )}
        <button
          onClick={handleCopy}
          style={{
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            color: 'var(--ink-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: 0,
            marginLeft: 'auto',
            marginBottom: 'var(--space-2)',
            textDecoration: 'underline',
            textDecorationColor: 'var(--rule)',
            textUnderlineOffset: '0.2em',
          }}
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? 'copied ✓' : 'copy ↗'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        showLineNumbers={showLineNumbers}
        wrapLines={highlightLines.length > 0}
        lineProps={(lineNumber) => {
          const style: React.CSSProperties = { display: 'block' }
          if (highlightLines.includes(lineNumber)) {
            style.background = 'var(--code-highlight)'
          }
          return { style }
        }}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.875rem',
          background: 'var(--code-bg)',
          padding: 'var(--space-4)',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

interface InlineCodeProps {
  children: ReactNode
}

export function InlineCode({ children }: InlineCodeProps) {
  return (
    <code
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.875rem',
        color: 'var(--ink)',
        background: 'var(--canvas-elevated)',
        padding: '1px 6px',
        borderRadius: '2px',
      }}
    >
      {children}
    </code>
  )
}

/* Hallmark · genre: editorial-minimal · macrostructure: workbench · design-system: design.md · designed-as-app */
