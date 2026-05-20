import { useState, useEffect, useMemo, Suspense, ComponentType } from 'react'
import { useLocation, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import mermaid from 'mermaid'
import { SearchModal, SearchButton, useSearchShortcut } from '../components/Search'
import { StockholmFooter } from '../components/StockholmFooter'

import {
  Callout,
  CodeBlock,
  CodeTabs,
  CodeTab,
  Steps,
  Step,
  Expandable,
  Card,
  CardGrid,
  ApiPlayground,
  ModelTable,
} from '../components/mdx'

const mdModules = import.meta.glob('../content/**/*.md', {
  as: 'raw',
  eager: true,
}) as Record<string, unknown>

const mdxModules = import.meta.glob('../content/**/*.mdx') as Record<
  string,
  () => Promise<{ default: ComponentType }>
>

function removeFrontmatter(content: unknown): string {
  if (typeof content !== 'string') {
    if (content && typeof content === 'object' && 'default' in content) {
      return removeFrontmatter((content as { default: unknown }).default)
    }
    return ''
  }
  return content.replace(/^---\n[\s\S]*?\n---\n/, '')
}

function getDocPath(filePath: string): string {
  const match = filePath.match(/content\/(.+)\.(md|mdx)$/)
  if (!match) return ''
  const path = match[1]
  if (path === 'index') return '/docs'
  if (path === 'api/index') return '/docs/api'
  if (path.endsWith('/index')) {
    return `/docs/${path.replace('/index', '')}`
  }
  return `/docs/${path}`
}

const docContentFromFiles: Record<string, string> = {}
for (const [filePath, content] of Object.entries(mdModules)) {
  const docPath = getDocPath(filePath)
  if (docPath) {
    docContentFromFiles[docPath] = removeFrontmatter(content)
  }
}

const mdxComponentLoaders: Record<string, () => Promise<{ default: ComponentType }>> = {}
for (const [filePath, loader] of Object.entries(mdxModules)) {
  const docPath = getDocPath(filePath)
  if (docPath) {
    mdxComponentLoaders[docPath] = loader
  }
}

interface SidebarItem {
  title: string
  path: string
  external?: boolean
  standalone?: boolean
}

interface SidebarSection {
  title: string
  items: SidebarItem[]
}

const docSections: SidebarSection[] = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Introduction', path: '/docs' },
      { title: 'Quickstart', path: '/docs/quickstart' },
      { title: 'Configuration', path: '/docs/configuration' },
      { title: 'Deployment', path: '/docs/deployment' },
    ],
  },
  {
    title: 'API Reference',
    items: [
      { title: 'Overview', path: '/docs/api' },
      { title: 'Swagger UI', path: 'https://api.aura-llm.dev/swagger-ui/', external: true },
      { title: 'Authentication', path: '/docs/api/authentication' },
      { title: 'Create Response', path: '/docs/api/create-response' },
      { title: 'Conversations', path: '/docs/api/conversations' },
      { title: 'Streaming', path: '/docs/api/streaming' },
      { title: 'Cost Tracking', path: '/docs/api/cost-tracking' },
      { title: 'Rate Limiting', path: '/docs/api/rate-limiting' },
      { title: 'Smart Routing', path: '/docs/api/routing' },
      { title: 'Prompt Compression', path: '/docs/api/compression' },
      { title: 'Response Validation', path: '/docs/api/validation' },
      { title: 'Response Consistency', path: '/docs/api/consistency' },
      { title: 'Response Caching', path: '/docs/api/caching' },
      { title: 'Error Reference', path: '/docs/api/errors' },
      { title: 'Admin API', path: '/docs/api/admin' },
      { title: 'Changelog', path: '/docs/api/changelog' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { title: 'Using Existing SDKs', path: '/docs/guides/existing-sdks' },
      { title: 'Tool Calling', path: '/docs/guides/tool-calling' },
      { title: 'Testing & Sandbox', path: '/docs/guides/testing' },
      { title: 'Migration Guide', path: '/docs/guides/migration' },
    ],
  },
  {
    title: 'SDKs',
    items: [{ title: 'Python', path: '/docs/sdks/python' }],
  },
  {
    title: 'Multi-Tenancy',
    items: [
      { title: 'Organizations & End-Users', path: '/docs/organizations' },
      { title: 'Provider Credentials', path: '/docs/credentials' },
    ],
  },
  {
    title: 'Architecture',
    items: [{ title: 'Overview', path: '/docs/architecture' }],
  },
  {
    title: 'Providers',
    items: [
      { title: 'OpenAI', path: '/docs/providers/openai' },
      { title: 'Anthropic', path: '/docs/providers/anthropic' },
      { title: 'Google', path: '/docs/providers/google' },
      { title: 'Mistral', path: '/docs/providers/mistral' },
      { title: 'Ollama', path: '/docs/providers/ollama' },
      { title: 'HuggingFace', path: '/docs/providers/huggingface' },
      { title: 'AWS Bedrock', path: '/docs/providers/bedrock' },
    ],
  },
  {
    title: 'Concepts',
    items: [{ title: 'Open Responses API', path: '/docs/concepts/open-responses' }],
  },
  {
    title: 'Project',
    items: [{ title: 'Roadmap', path: '/roadmap', standalone: true }],
  },
]

const fallbackContent: Record<string, string> = {
  '/docs': `# Introduction

Aura is a high-performance LLM gateway built in Rust. It provides a unified API for multiple LLM providers with built-in cost tracking, observability, and support for agentic workflows.

## Features

- Unified API for OpenAI, Anthropic, and Google models
- Real-time cost calculation per request
- Open Responses API specification support
- Streaming via Server-Sent Events
- Tool/function calling support
- Request enrichment with provider and latency metadata

## Architecture

Aura is organised into modular Rust crates:

- \`aura-types\` — shared type definitions
- \`aura-core\` — providers, routing, caching
- \`aura-proxy\` — main server binary
- \`aura-db\` — database models and queries
`,
}

// Mermaid theme — sRGB equivalents of OKLCH tokens (Mermaid does not parse OKLCH)
const mermaidTheme = {
  primaryColor: '#383838',
  primaryTextColor: '#f1f1f1',
  primaryBorderColor: '#4d4d4d',
  lineColor: '#a8a8a8',
  secondaryColor: '#2e2e2e',
  tertiaryColor: '#262626',
  background: '#2a2a2a',
  mainBkg: '#2e2e2e',
  secondBkg: '#383838',
  textColor: '#f1f1f1',
  fontSize: '14px',
  fontFamily: 'Inter Variable, Inter, sans-serif',
}

function MermaidDiagram({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    let cancelled = false

    const renderDiagram = async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: mermaidTheme,
          securityLevel: 'loose',
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: 'basis',
          },
        })
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const { svg: renderedSvg } = await mermaid.render(id, chart)
        if (!cancelled) {
          setSvg(renderedSvg)
          setError('')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram')
        }
      }
    }

    if (chart) renderDiagram()
    return () => {
      cancelled = true
    }
  }, [chart])

  if (error) {
    return (
      <aside data-callout="danger" style={{ margin: 'var(--space-5) 0' }}>
        <span className="callout-label">Mermaid error</span>
        <p>{error}</p>
      </aside>
    )
  }

  if (!svg) {
    return (
      <div style={{ margin: 'var(--space-5) 0', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
        rendering diagram…
      </div>
    )
  }

  return (
    <div
      style={{ margin: 'var(--space-5) 0', overflowX: 'auto' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const markdownComponents: any = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 400,
        fontSize: 'clamp(2.25rem, 4vw, 3rem)',
        lineHeight: 1.05,
        letterSpacing: '-0.02em',
        margin: '0 0 var(--space-5) 0',
      }}
    >
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 500,
        fontSize: 'clamp(1.625rem, 2.5vw, 2rem)',
        lineHeight: 1.1,
        letterSpacing: '-0.02em',
        marginTop: 'var(--space-6)',
        marginBottom: 'var(--space-4)',
      }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3
      style={{
        fontFamily: 'var(--font-mono)',
        fontWeight: 500,
        fontSize: '0.8125rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--ink-muted)',
        marginTop: 'var(--space-5)',
        marginBottom: 'var(--space-3)',
        paddingBottom: 'var(--space-2)',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      {children}
    </h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 500,
        fontSize: '1.125rem',
        marginTop: 'var(--space-4)',
        marginBottom: 'var(--space-2)',
        letterSpacing: '-0.01em',
      }}
    >
      {children}
    </h4>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p style={{ color: 'var(--ink)', fontSize: '1rem', lineHeight: 1.6, margin: '0 0 var(--space-4) 0' }}>
      {children}
    </p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul style={{ listStyle: 'disc outside', paddingLeft: 'var(--space-4)', margin: '0 0 var(--space-4) 0', color: 'var(--ink)' }}>
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol style={{ listStyle: 'decimal outside', paddingLeft: 'var(--space-4)', margin: '0 0 var(--space-4) 0', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li style={{ marginBottom: 'var(--space-1)', color: 'var(--ink)' }}>{children}</li>
  ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code: ({ inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1] : ''
    const codeString = Array.isArray(children) ? children.join('') : String(children || '').replace(/\n$/, '')

    if (language === 'mermaid') {
      return <MermaidDiagram chart={codeString} />
    }

    if (inline || !className) {
      return (
        <code
          {...props}
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

    return (
      <SyntaxHighlighter
        language={language || 'text'}
        style={vscDarkPlus}
        customStyle={{
          margin: '0 0 var(--space-4) 0',
          borderRadius: 0,
          fontSize: '0.875rem',
          background: 'var(--code-bg)',
          padding: 'var(--space-4)',
        }}
        showLineNumbers={false}
      >
        {codeString}
      </SyntaxHighlighter>
    )
  },
  pre: ({ children }: { children?: React.ReactNode }) => <div style={{ margin: '0 0 var(--space-4) 0' }}>{children}</div>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    if (href?.startsWith('/') || href?.startsWith('#')) {
      return (
        <Link to={href} className="link">
          {children}
        </Link>
      )
    }
    return (
      <a href={href} className="link" target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  },
  table: ({ children }: { children?: React.ReactNode }) => (
    <div style={{ overflowX: 'auto', margin: '0 0 var(--space-4) 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
        {children}
      </table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th
      style={{
        textAlign: 'left',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--ink-muted)',
        padding: 'var(--space-2) var(--space-3)',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--rule)', color: 'var(--ink)', verticalAlign: 'top' }}>
      {children}
    </td>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote
      style={{
        borderLeft: '1px solid var(--rule)',
        paddingLeft: 'var(--space-4)',
        margin: '0 0 var(--space-4) 0',
        color: 'var(--ink-muted)',
        fontStyle: 'italic',
      }}
    >
      {children}
    </blockquote>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong style={{ fontWeight: 500, color: 'var(--ink)' }}>{children}</strong>
  ),
}

const mdxWrapperComponents = {
  ...markdownComponents,
  Callout,
  CodeBlock,
  CodeTabs,
  CodeTab,
  Steps,
  Step,
  Expandable,
  Card,
  CardGrid,
  ApiPlayground,
  ModelTable,
}

function MDXLoading() {
  return (
    <div style={{ padding: 'var(--space-5) 0', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
      loading documentation…
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MDXComponentType = ComponentType<{ components?: Record<string, ComponentType<any>> }>

function MDXContent({ path }: { path: string }) {
  const [Component, setComponent] = useState<MDXComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loader = mdxComponentLoaders[path]
    if (loader) {
      loader()
        .then((mod) => {
          setComponent(() => mod.default)
          setError(null)
        })
        .catch(() => setError('Failed to load documentation'))
    }
  }, [path])

  if (error) {
    return (
      <aside data-callout="danger">
        <span className="callout-label">Error</span>
        <p>{error}</p>
      </aside>
    )
  }

  if (!Component) return <MDXLoading />
  return <Component components={mdxWrapperComponents} />
}

export function DocsPage() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useSearchShortcut(() => setSearchOpen(true))

  const currentPath = location.pathname
  const hasMdxContent = mdxComponentLoaders[currentPath] !== undefined

  const currentContent = useMemo(() => {
    if (hasMdxContent) return null
    return docContentFromFiles[currentPath] || fallbackContent[currentPath] || fallbackContent['/docs']
  }, [currentPath, hasMdxContent])

  const hasContent = (path: string) =>
    docContentFromFiles[path] || fallbackContent[path] || mdxComponentLoaders[path]

  return (
    <div style={{ background: 'var(--canvas)', color: 'var(--ink)', minHeight: '100vh' }}>
      {/* Top bar */}
      <nav style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--rule)', background: 'var(--canvas)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="docs-mobile-toggle"
              aria-label="Toggle sidebar"
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--ink-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {sidebarOpen ? '× Close' : '☰ Menu'}
            </button>
            <Link
              to="/"
              aria-label="Aura LLM Gateway — home"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', textDecoration: 'none' }}
            >
              <img
                src="/icon-square.svg"
                alt=""
                aria-hidden
                style={{ display: 'block', height: 36, width: 36 }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.25rem',
                  letterSpacing: '-0.01em',
                  color: 'var(--ink)',
                  lineHeight: 1,
                }}
              >
                Aura
              </span>
            </Link>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)' }}>
              Docs
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
            <SearchButton onClick={() => setSearchOpen(true)} />
            <span style={{ color: 'var(--ink-dim)' }} aria-hidden>·</span>
            <a href="https://playground.aura-llm.dev" className="link">Playground</a>
          </div>
        </div>
      </nav>

      <div className="docs-layout">
        {/* Sidebar */}
        <aside
          className={`docs-sidebar ${sidebarOpen ? 'docs-sidebar-open' : ''}`}
          style={{
            background: 'var(--canvas)',
            borderRight: '1px solid var(--rule)',
          }}
        >
          <nav style={{ padding: 'var(--space-5) var(--space-4)' }}>
            {docSections.map((section) => (
              <div key={section.title} style={{ marginBottom: 'var(--space-5)' }}>
                <h3
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.6875rem',
                    fontWeight: 500,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-dim)',
                    margin: '0 0 var(--space-3) 0',
                  }}
                >
                  {section.title}
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {section.items.map((item) => {
                    const isActive = currentPath === item.path
                    const isStandalone = item.standalone
                    const itemHasContent = isStandalone || hasContent(item.path)

                    if (item.external) {
                      return (
                        <li key={item.path}>
                          <a
                            href={item.path}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'block',
                              padding: '4px 0',
                              fontSize: '0.875rem',
                              color: 'var(--ink-muted)',
                              textDecoration: 'none',
                            }}
                          >
                            {item.title} <span aria-hidden style={{ color: 'var(--ink-dim)' }}>↗</span>
                          </a>
                        </li>
                      )
                    }

                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          onClick={() => setSidebarOpen(false)}
                          style={{
                            display: 'block',
                            padding: '4px 0',
                            fontSize: '0.875rem',
                            // Active items pick up the cyan accent on the
                            // border AND the text so they're unambiguously
                            // selected — single hairline alone got lost in
                            // dense sidebars during user testing.
                            color: isActive ? 'var(--accent)' : itemHasContent ? 'var(--ink-muted)' : 'var(--ink-dim)',
                            textDecoration: 'none',
                            fontWeight: isActive ? 500 : 400,
                            borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                            paddingLeft: 'var(--space-2)',
                            marginLeft: 'calc(var(--space-2) * -1)',
                            transition: 'color var(--motion-duration-base) var(--motion-ease)',
                          }}
                        >
                          {item.title}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="docs-main" style={{ padding: 'var(--space-6) var(--space-5)' }}>
          <div style={{ maxWidth: '68ch', margin: '0 auto' }} className="md-content">
            <div style={{ marginBottom: 'var(--space-5)', display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              <button
                onClick={() => window.history.back()}
                style={{
                  background: 'transparent',
                  border: 0,
                  color: 'var(--ink-muted)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  letterSpacing: 'inherit',
                  textTransform: 'inherit',
                  padding: 0,
                }}
              >
                ← Back
              </button>
              <span style={{ color: 'var(--ink-dim)' }} aria-hidden>·</span>
              <Link to="/" className="link">Home</Link>
            </div>

            {hasMdxContent ? (
              <Suspense fallback={<MDXLoading />}>
                <MDXContent path={currentPath} />
              </Suspense>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {currentContent || ''}
              </ReactMarkdown>
            )}

            <hr style={{ margin: 'var(--space-7) 0 var(--space-4) 0', border: 0, borderTop: '1px solid var(--rule)' }} />
            <StockholmFooter />
          </div>
        </main>
      </div>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'var(--canvas-overlay)', zIndex: 'var(--z-overlay)' }}
          className="docs-mobile-backdrop"
          aria-hidden
        />
      )}

      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}

/* Hallmark · genre: editorial-minimal · macrostructure: workbench · design-system: design.md · designed-as-app */
