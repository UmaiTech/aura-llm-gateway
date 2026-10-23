import { useEffect, useState, isValidElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import mermaid from 'mermaid'
import { Check, Copy } from 'lucide-react'
import { slugify } from '../../lib/docsNav'

/**
 * Element renderers shared by the Markdown and MDX docs. Prose uses the
 * semantic aura tokens so it follows the light/dark theme; code blocks
 * stay dark in both themes (the syntax palette is built for a dark ground).
 */

/** Plain text of rendered children, for heading anchors. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

function MermaidDiagram({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const render = async () => {
      try {
        // Monochrome diagram theme on its own dark panel, so it reads the
        // same in both site themes.
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            primaryColor: '#1f2937',
            primaryTextColor: '#e5e7eb',
            primaryBorderColor: '#a78bfa',
            lineColor: '#6b7280',
            secondaryColor: '#111827',
            tertiaryColor: '#0f172a',
            background: '#0b0d14',
            mainBkg: '#1f2937',
            secondBkg: '#111827',
            textColor: '#e5e7eb',
            fontSize: '14px',
            fontFamily: 'Inter, sans-serif',
          },
          securityLevel: 'loose',
          flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
        })
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
        const { svg: rendered } = await mermaid.render(id, chart)
        if (!cancelled) {
          setSvg(rendered)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render diagram')
      }
    }
    if (chart) render()
    return () => {
      cancelled = true
    }
  }, [chart])

  if (error) {
    return (
      <div className="my-6 rounded-control border border-aura-red/40 bg-aura-red/10 p-4 text-sm text-aura-red">
        <strong>Diagram could not be rendered:</strong> {error}
      </div>
    )
  }
  if (!svg) {
    return <div className="my-6 text-center text-sm text-aura-dim">Loading diagram…</div>
  }
  return (
    <div
      className="my-6 flex justify-center overflow-x-auto rounded-panel border border-aura-border bg-[#0b0d14] p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: nothing to report beyond not showing "Copied".
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-control border border-white/10 bg-[#111827] px-2 py-1 text-xs text-slate-300 opacity-90 transition-colors hover:text-white focus-visible:opacity-100"
      aria-label={copied ? 'Copied' : 'Copy code'}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

export function CodeSample({ code, language }: { code: string; language: string }) {
  return (
    <div className="relative mb-5 max-w-full overflow-hidden rounded-panel border border-aura-border bg-[#0f172a]">
      <CopyButton text={code} />
      <SyntaxHighlighter
        language={language || 'text'}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.8125rem',
          lineHeight: 1.6,
          background: 'transparent',
          padding: '1rem 1.1rem',
          overflowX: 'auto',
        }}
        showLineNumbers={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

type Props = { children?: ReactNode }

const heading = (Tag: 'h2' | 'h3' | 'h4', className: string) =>
  function Heading({ children }: Props) {
    const label = textOf(children)
    const id = slugify(label)
    return (
      <Tag id={id} data-toc-label={label} className={`group scroll-mt-24 ${className}`}>
        {children}
        {id && (
          <a
            href={`#${id}`}
            className="ml-2 text-aura-dim no-underline opacity-0 transition-opacity hover:text-aura-accent focus-visible:opacity-100 group-hover:opacity-100"
            aria-label={`Link to section: ${textOf(children)}`}
          >
            #
          </a>
        )}
      </Tag>
    )
  }

function InlineOrBlockCode({ className, children }: { className?: string; children?: ReactNode }) {
  const match = /language-([\w-]+)/.exec(className || '')
  const language = match ? match[1] : ''
  const code = textOf(children).replace(/\n$/, '')

  if (language === 'mermaid') return <MermaidDiagram chart={code} />
  // Fenced blocks carry a language class; an unlabelled fence is still multi-line.
  if (language || code.includes('\n')) return <CodeSample code={code} language={language} />
  return (
    <code className="rounded bg-aura-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-aura-accent [overflow-wrap:anywhere]">
      {children}
    </code>
  )
}

function DocLink({ href, children }: { href?: string; children?: ReactNode }) {
  const cls = 'text-aura-accent underline decoration-aura-accent/40 underline-offset-2 hover:decoration-aura-accent [overflow-wrap:anywhere]'
  if (href?.startsWith('/') || href?.startsWith('#')) {
    return (
      <Link to={href} className={cls}>
        {children}
      </Link>
    )
  }
  return (
    <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

export const proseComponents = {
  h1: ({ children }: Props) => (
    <h1 className="mb-5 font-display text-[2.15rem] font-semibold leading-tight tracking-tight text-aura-text sm:text-[2.5rem]">
      {children}
    </h1>
  ),
  h2: heading('h2', 'mt-12 mb-4 border-t border-aura-border pt-8 text-2xl font-semibold tracking-tight text-aura-text'),
  h3: heading('h3', 'mt-8 mb-3 text-lg font-semibold text-aura-text'),
  h4: heading('h4', 'mt-6 mb-2 text-base font-semibold text-aura-text'),
  p: ({ children }: Props) => <p className="mb-4 leading-7 text-aura-muted">{children}</p>,
  ul: ({ children }: Props) => <ul className="mb-4 list-disc space-y-1.5 pl-5 leading-7 text-aura-muted marker:text-aura-dim">{children}</ul>,
  ol: ({ children }: Props) => <ol className="mb-4 list-decimal space-y-1.5 pl-5 leading-7 text-aura-muted marker:text-aura-dim">{children}</ol>,
  li: ({ children }: Props) => <li className="pl-1">{children}</li>,
  code: InlineOrBlockCode,
  pre: ({ children }: Props) => <>{children}</>,
  a: DocLink,
  table: ({ children }: Props) => (
    <div className="mb-5 max-w-full overflow-x-auto rounded-panel border border-aura-border" tabIndex={0} role="region" aria-label="Table">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: Props) => (
    <th className="whitespace-nowrap bg-aura-surface-2 px-3.5 py-2.5 text-left text-xs font-semibold text-aura-text">{children}</th>
  ),
  td: ({ children }: Props) => <td className="border-t border-aura-border px-3.5 py-2.5 align-top text-aura-muted">{children}</td>,
  blockquote: ({ children }: Props) => (
    <blockquote className="mb-4 border-l-2 border-aura-accent pl-4 text-aura-muted [&>p]:mb-2">{children}</blockquote>
  ),
  strong: ({ children }: Props) => <strong className="font-semibold text-aura-text">{children}</strong>,
  hr: () => <hr className="my-10 border-aura-border" />,
  img: ({ src, alt }: { src?: string; alt?: string }) => <img src={src} alt={alt ?? ''} className="my-6 max-w-full rounded-panel border border-aura-border" />,
}
