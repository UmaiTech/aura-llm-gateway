import { useState, useEffect, useMemo, Suspense, ComponentType } from 'react'
import { useLocation, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import mermaid from 'mermaid'
import {
  BookOpen, Zap, Server, Code2, Settings,
  ChevronRight, ChevronLeft, Menu, X, ExternalLink, DollarSign, Layers, Users, Shield,
  Wrench, ArrowRightLeft, Package, Plug, KeyRound, History, FlaskConical, Home
} from 'lucide-react'
import { SearchModal, SearchButton, useSearchShortcut } from '../components/Search'

// Import MDX components for use in MDX files
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

// Import all MD files from src/content at build time using Vite's glob
const mdModules = import.meta.glob('../content/**/*.md', {
  as: 'raw',
  eager: true
}) as Record<string, unknown>

// Import all MDX files as lazy components
const mdxModules = import.meta.glob('../content/**/*.mdx') as Record<
  string,
  () => Promise<{ default: ComponentType }>
>

// Remove frontmatter from markdown content
function removeFrontmatter(content: unknown): string {
  // Handle case where content might not be a string (e.g., module object)
  if (typeof content !== 'string') {
    console.warn('Content is not a string:', typeof content, content)
    // Try to extract string from module-like object
    if (content && typeof content === 'object' && 'default' in content) {
      return removeFrontmatter((content as { default: unknown }).default)
    }
    return ''
  }
  return content.replace(/^---\n[\s\S]*?\n---\n/, '')
}

// Map file paths to doc paths
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

// Create content map from imported MD modules
const docContentFromFiles: Record<string, string> = {}
for (const [filePath, content] of Object.entries(mdModules)) {
  const docPath = getDocPath(filePath)
  if (docPath) {
    docContentFromFiles[docPath] = removeFrontmatter(content)
  }
}

// Create MDX component map
const mdxComponents: Record<string, () => Promise<{ default: ComponentType }>> = {}
for (const [filePath, loader] of Object.entries(mdxModules)) {
  const docPath = getDocPath(filePath)
  if (docPath) {
    mdxComponents[docPath] = loader
  }
}

// Documentation structure with icons
const docSections = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Introduction', path: '/docs', icon: BookOpen },
      { title: 'Quickstart', path: '/docs/quickstart', icon: Zap },
      { title: 'Configuration', path: '/docs/configuration', icon: Settings },
      { title: 'Deployment', path: '/docs/deployment', icon: Server },
      { title: 'Roadmap', path: '/docs/roadmap', icon: Zap },
    ],
  },
  {
    title: 'API Reference',
    items: [
      { title: 'Overview', path: '/docs/api', icon: Code2 },
      { title: 'Swagger UI', path: 'http://localhost:8080/swagger-ui', icon: ExternalLink, external: true },
      { title: 'Authentication', path: '/docs/api/authentication', icon: Server },
      { title: 'Create Response', path: '/docs/api/create-response', icon: Server },
      { title: 'Conversations', path: '/docs/api/conversations', icon: BookOpen },
      { title: 'Streaming', path: '/docs/api/streaming', icon: Zap },
      { title: 'Cost Tracking', path: '/docs/api/cost-tracking', icon: DollarSign },
      { title: 'Rate Limiting', path: '/docs/api/rate-limiting', icon: Shield },
      { title: 'Smart Routing', path: '/docs/api/routing', icon: ArrowRightLeft },
      { title: 'Prompt Compression', path: '/docs/api/compression', icon: Package },
      { title: 'Response Validation', path: '/docs/api/validation', icon: Shield },
      { title: 'Response Consistency', path: '/docs/api/consistency', icon: Layers },
      { title: 'Response Caching', path: '/docs/api/caching', icon: Server },
      { title: 'Error Reference', path: '/docs/api/errors', icon: Code2 },
      { title: 'Admin API', path: '/docs/api/admin', icon: KeyRound },
      { title: 'Changelog', path: '/docs/api/changelog', icon: History },
    ],
  },
  {
    title: 'Guides',
    items: [
      { title: 'Using Existing SDKs', path: '/docs/guides/existing-sdks', icon: Plug },
      { title: 'Tool Calling', path: '/docs/guides/tool-calling', icon: Wrench },
      { title: 'Testing & Sandbox', path: '/docs/guides/testing', icon: FlaskConical },
      { title: 'Migration Guide', path: '/docs/guides/migration', icon: ArrowRightLeft },
    ],
  },
  {
    title: 'SDKs',
    items: [
      { title: 'Python', path: '/docs/sdks/python', icon: Package },
    ],
  },
  {
    title: 'Multi-Tenancy',
    items: [
      { title: 'Organizations & End-Users', path: '/docs/organizations', icon: Users },
      { title: 'Provider Credentials', path: '/docs/credentials', icon: Shield },
    ],
  },
  {
    title: 'Architecture',
    items: [
      { title: 'Overview', path: '/docs/architecture', icon: Layers },
    ],
  },
  {
    title: 'Providers',
    items: [
      { title: 'OpenAI', path: '/docs/providers/openai', icon: Server },
      { title: 'Anthropic', path: '/docs/providers/anthropic', icon: Server },
      { title: 'Google', path: '/docs/providers/google', icon: Server },
    ],
  },
  {
    title: 'Concepts',
    items: [
      { title: 'Open Responses API', path: '/docs/concepts/open-responses', icon: BookOpen },
    ],
  },
]

// Fallback content for docs not yet created as MD files
const fallbackContent: Record<string, string> = {
  '/docs': `# Introduction

Aura is a high-performance LLM gateway built with Rust. It provides a unified API
for multiple LLM providers with built-in cost tracking, observability, and support
for agentic workflows.

## Features

- **Unified API** for OpenAI, Anthropic, and Google models
- **Real-time cost calculation** per request
- **Open Responses API** specification support
- **Streaming** with Server-Sent Events
- **Tool/function calling** support
- **Request enrichment** with provider and latency metadata

## Architecture

Aura is organized into modular Rust crates:

- \`aura-types\` - Shared type definitions (Open Responses API)
- \`aura-core\` - Core business logic (providers, routing, caching)
- \`aura-proxy\` - Main server binary (Axum routes, middleware)
- \`aura-db\` - Database models and queries (SQLx)
`,
}

// Mermaid component
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
          themeVariables: {
            primaryColor: '#818cf8',
            primaryTextColor: '#e5e7eb',
            primaryBorderColor: '#6366f1',
            lineColor: '#9ca3af',
            secondaryColor: '#374151',
            tertiaryColor: '#1f2937',
            background: '#111827',
            mainBkg: '#1f2937',
            secondBkg: '#374151',
            textColor: '#e5e7eb',
            fontSize: '14px',
            fontFamily: 'Inter, sans-serif'
          },
          securityLevel: 'loose',
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: 'basis'
          }
        })

        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const { svg: renderedSvg } = await mermaid.render(id, chart)

        if (!cancelled) {
          setSvg(renderedSvg)
          setError('')
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Mermaid rendering error:', err)
          setError(err instanceof Error ? err.message : 'Failed to render diagram')
        }
      }
    }

    if (chart) {
      renderDiagram()
    }

    return () => {
      cancelled = true
    }
  }, [chart])

  if (error) {
    return (
      <div className="my-6 p-4 bg-red-900/20 border border-red-800 rounded text-red-400 text-sm">
        <strong>Mermaid rendering error:</strong> {error}
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="my-6 flex justify-center">
        <div className="text-gray-500 text-sm">Loading diagram...</div>
      </div>
    )
  }

  return (
    <div
      className="my-6 flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

// Markdown components for custom styling
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const markdownComponents: any = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-3xl font-bold mb-6 text-white">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-xl font-semibold mt-6 mb-3 text-white">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-lg font-semibold mt-4 mb-2 text-white">{children}</h4>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-gray-300 mb-4 leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside space-y-2 text-gray-300 mb-4">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-gray-300">{children}</li>
  ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code: ({ inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1] : ''

    const codeString = Array.isArray(children)
      ? children.join('')
      : String(children || '').replace(/\n$/, '')

    if (language === 'mermaid') {
      return <MermaidDiagram chart={codeString} />
    }

    if (inline || !className) {
      return <code className="text-aura-400 bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
    }

    return (
      <SyntaxHighlighter
        language={language || 'text'}
        style={vscDarkPlus}
        customStyle={{
          margin: '0 0 1rem 0',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          background: '#0f172a',
          padding: '1rem'
        }}
        showLineNumbers={false}
      >
        {codeString}
      </SyntaxHighlighter>
    )
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <div className="mb-4">{children}</div>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    // Use Link for internal navigation, regular anchor for external
    if (href?.startsWith('/') || href?.startsWith('#')) {
      return (
        <Link to={href} className="text-aura-400 hover:text-aura-300 underline">
          {children}
        </Link>
      )
    }
    return (
      <a href={href} className="text-aura-400 hover:text-aura-300 underline" target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  },
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full divide-y divide-gray-800">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300 bg-gray-900">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-4 py-2 text-sm text-gray-400 border-t border-gray-800">{children}</td>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-4 border-aura-500 pl-4 italic text-gray-400 mb-4">{children}</blockquote>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
}

// MDX wrapper components - these are passed to MDX files
const mdxWrapperComponents = {
  // Standard HTML elements with styling
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-3xl font-bold mb-6 text-white">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-xl font-semibold mt-6 mb-3 text-white">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-lg font-semibold mt-4 mb-2 text-white">{children}</h4>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-gray-300 mb-4 leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside space-y-2 text-gray-300 mb-4">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-gray-300">{children}</li>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    if (href?.startsWith('/') || href?.startsWith('#')) {
      return (
        <Link to={href} className="text-aura-400 hover:text-aura-300 underline">
          {children}
        </Link>
      )
    }
    return (
      <a href={href} className="text-aura-400 hover:text-aura-300 underline" target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  },
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full divide-y divide-gray-800">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300 bg-gray-900">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-4 py-2 text-sm text-gray-400 border-t border-gray-800">{children}</td>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-4 border-aura-500 pl-4 italic text-gray-400 mb-4">{children}</blockquote>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="text-aura-400 bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <div className="mb-4">{children}</div>
  ),
  // Custom MDX components
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

// Loading component for MDX
function MDXLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-pulse text-gray-500">Loading documentation...</div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MDXComponentType = ComponentType<{ components?: Record<string, ComponentType<any>> }>

// MDX Content renderer
function MDXContent({ path }: { path: string }) {
  const [Component, setComponent] = useState<MDXComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loader = mdxComponents[path]
    if (loader) {
      loader()
        .then((mod) => {
          setComponent(() => mod.default)
          setError(null)
        })
        .catch((err) => {
          console.error('Failed to load MDX:', err)
          setError('Failed to load documentation')
        })
    }
  }, [path])

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-800 rounded text-red-400">
        {error}
      </div>
    )
  }

  if (!Component) {
    return <MDXLoading />
  }

  return <Component components={mdxWrapperComponents} />
}

export function DocsPage() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Global keyboard shortcut for search
  useSearchShortcut(() => setSearchOpen(true))

  const currentPath = location.pathname

  // Check if we have MDX content for this path
  const hasMdxContent = mdxComponents[currentPath] !== undefined

  // Get markdown content from MD files or fallback
  const currentContent = useMemo(() => {
    if (hasMdxContent) return null
    return docContentFromFiles[currentPath] || fallbackContent[currentPath] || fallbackContent['/docs']
  }, [currentPath, hasMdxContent])

  // Check if path has any content
  const hasContent = (path: string) => {
    return docContentFromFiles[path] || fallbackContent[path] || mdxComponents[path]
  }

  useEffect(() => {
    console.log('Available MD files:', Object.keys(docContentFromFiles))
    console.log('Available MDX files:', Object.keys(mdxComponents))
    console.log('Current path:', currentPath)
  }, [currentPath])

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-lg border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-800"
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <Link to="/" className="flex items-center gap-2">
                <img src="/icon-square.svg" alt="Aura Logo" className="h-8 w-8" />
                <span className="font-semibold text-lg">Aura Docs</span>
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <SearchButton onClick={() => setSearchOpen(true)} />
              <a
                href="http://localhost:3000"
                className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
              >
                Playground
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex pt-16">
        {/* Sidebar */}
        <aside
          className={`
            fixed lg:sticky top-16 left-0 z-40 h-[calc(100vh-4rem)] w-64
            bg-gray-950 border-r border-gray-800 overflow-y-auto
            transform transition-transform duration-200 lg:transform-none
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          <nav className="p-4 space-y-6">
            {docSections.map((section) => (
              <div key={section.title}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {section.title}
                </h3>
                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = currentPath === item.path
                    const itemHasContent = hasContent(item.path)
                    const isExternal = 'external' in item && item.external

                    if (isExternal) {
                      return (
                        <li key={item.path}>
                          <a
                            href={item.path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-gray-400 hover:text-white hover:bg-gray-800"
                          >
                            <item.icon className="h-4 w-4" />
                            {item.title}
                            <ExternalLink className="h-3 w-3 ml-auto" />
                          </a>
                        </li>
                      )
                    }

                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          onClick={() => setSidebarOpen(false)}
                          className={`
                            flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                            ${isActive
                              ? 'bg-aura-500/10 text-aura-400'
                              : itemHasContent
                                ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                                : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800/50'
                            }
                          `}
                        >
                          <item.icon className="h-4 w-4" />
                          {item.title}
                          {isActive && <ChevronRight className="h-3 w-3 ml-auto" />}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8 lg:pl-8">
          <div className="max-w-3xl mx-auto">
            {/* Navigation breadcrumb */}
            <div className="flex items-center gap-4 mb-6 text-sm">
              <button
                onClick={() => window.history.back()}
                className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              <Link
                to="/"
                className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
              >
                <Home className="h-4 w-4" />
                Home
              </Link>
            </div>
            <div className="prose prose-invert prose-gray max-w-none">
              {hasMdxContent ? (
                <Suspense fallback={<MDXLoading />}>
                  <MDXContent path={currentPath} />
                </Suspense>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {currentContent || ''}
                </ReactMarkdown>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Search Modal */}
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
