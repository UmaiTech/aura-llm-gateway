import { useState, useEffect, useMemo } from 'react'
import { useLocation, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import mermaid from 'mermaid'
import {
  BookOpen, Zap, Server, Code2, Settings,
  ChevronRight, Menu, X, ExternalLink, DollarSign, Layers, Users, Shield
} from 'lucide-react'

// Import all MD files from src/content at build time using Vite's glob
const mdModules = import.meta.glob('../content/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

const allMdModules = mdModules

// Remove frontmatter from markdown content
function removeFrontmatter(content: string): string {
  // Remove YAML frontmatter (--- ... ---)
  return content.replace(/^---\n[\s\S]*?\n---\n/, '')
}

// Map file paths to doc paths
function getDocPath(filePath: string): string {
  // ../content/index.md -> /docs
  // ../content/api/index.md -> /docs/api
  // ../content/api/create-response.md -> /docs/api/create-response
  // ../content/architecture.md -> /docs/architecture
  const match = filePath.match(/content\/(.+)\.md$/)
  if (!match) return ''

  const path = match[1]
  if (path === 'index') return '/docs'
  if (path === 'api/index') return '/docs/api'
  if (path.endsWith('/index')) {
    return `/docs/${path.replace('/index', '')}`
  }
  return `/docs/${path}`
}

// Create content map from imported modules
const docContentFromFiles: Record<string, string> = {}
for (const [filePath, content] of Object.entries(allMdModules)) {
  const docPath = getDocPath(filePath)
  if (docPath) {
    docContentFromFiles[docPath] = removeFrontmatter(content)
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
      { title: 'Authentication', path: '/docs/api/authentication', icon: Server },
      { title: 'Create Response', path: '/docs/api/create-response', icon: Server },
      { title: 'Conversations', path: '/docs/api/conversations', icon: BookOpen },
      { title: 'Streaming', path: '/docs/api/streaming', icon: Zap },
      { title: 'Cost Tracking', path: '/docs/api/cost-tracking', icon: DollarSign },
      { title: 'Error Reference', path: '/docs/api/errors', icon: Code2 },
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
  '/docs/quickstart': `# Quickstart

Get up and running with Aura in just a few minutes.

## 1. Clone and Build

\`\`\`bash
git clone https://github.com/UmaiTech/aura-llm-gateway.git
cd aura-llm-gateway
cargo build --release
\`\`\`

## 2. Configure Environment

\`\`\`bash
# Required: At least one provider API key
export OPENAI_API_KEY=sk-...

# Optional: Additional providers
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_API_KEY=...

# Server configuration
export AURA_HOST=0.0.0.0
export AURA_PORT=8080
\`\`\`

## 3. Run the Gateway

\`\`\`bash
cargo run -p aura-proxy

# Or with debug logging
RUST_LOG=debug cargo run -p aura-proxy
\`\`\`

## 4. Make a Request

\`\`\`bash
curl -X POST http://localhost:8080/v1/responses \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "input": [
      {"type": "message", "role": "user", "content": "Hello!"}
    ]
  }'
\`\`\`
`,
  '/docs/configuration': `# Configuration

Aura is configured through environment variables.

## Required Variables

| Variable | Description |
|----------|-------------|
| \`AURA_HOST\` | Server bind address (default: \`0.0.0.0\`) |
| \`AURA_PORT\` | Server port (default: \`8080\`) |

## Provider API Keys

At least one provider API key is required:

| Variable | Provider |
|----------|----------|
| \`OPENAI_API_KEY\` | OpenAI (GPT models) |
| \`ANTHROPIC_API_KEY\` | Anthropic (Claude models) |
| \`GOOGLE_API_KEY\` | Google (Gemini models) |

## Optional Variables

| Variable | Description |
|----------|-------------|
| \`RUST_LOG\` | Log level (e.g., \`info,aura_proxy=debug\`) |
| \`DATABASE_URL\` | PostgreSQL connection string |
| \`REDIS_URL\` | Redis connection string |
| \`AURA_ADMIN_KEY\` | Admin API key for management endpoints |
`,
  '/docs/concepts/open-responses': `# Open Responses API

The Open Responses API is a specification for agentic LLM workflows. Aura implements
this specification to provide a unified interface for building AI agents.

## Core Concepts

### Items

Items are atomic units of conversation:

- **message** - User or assistant messages
- **function_call** - Tool invocations by the model
- **function_call_output** - Results from tool executions
- **reasoning** - Model's internal reasoning (when available)

### Response Lifecycle

Responses go through a status lifecycle:

\`\`\`
in_progress → completed | failed | incomplete
\`\`\`

### Streaming Events

Aura provides semantic streaming events (not raw token deltas):

- \`response.in_progress\` - Response started
- \`response.output_item.added\` - New item in output
- \`response.output_text.delta\` - Text chunk
- \`response.completed\` - Response finished
- \`response.failed\` - Error occurred

## Conversation Threading

Use \`previous_response_id\` to continue conversations:

\`\`\`json
{
  "model": "gpt-4o",
  "input": [{"type": "message", "role": "user", "content": "Continue..."}],
  "previous_response_id": "resp_abc123"
}
\`\`\`

Learn more at [openresponses.org](https://www.openresponses.org/specification)
`,
  '/docs/concepts/providers': `# Providers

Aura supports multiple LLM providers through a unified interface.

## Supported Providers

### OpenAI

Models: \`gpt-4o\`, \`gpt-4o-mini\`, \`gpt-4-turbo\`, \`gpt-3.5-turbo\`, \`o1\`, \`o1-mini\`, \`o3-mini\`

\`\`\`bash
export OPENAI_API_KEY=sk-...
\`\`\`

### Anthropic (Coming Soon)

Models: \`claude-3-5-sonnet-20241022\`, \`claude-3-5-haiku-20241022\`

\`\`\`bash
export ANTHROPIC_API_KEY=sk-ant-...
\`\`\`

### Google (Coming Soon)

Models: \`gemini-2.0-flash\`, \`gemini-1.5-pro\`

\`\`\`bash
export GOOGLE_API_KEY=...
\`\`\`

## Provider Selection

Aura automatically routes requests to the appropriate provider based on the model name.
If a model is supported by multiple providers, the first registered provider is used.

## Adding Custom Providers

See the development guide for implementing custom providers.
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
        // Initialize mermaid on first render
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

// Markdown components for custom styling - using any for React-Markdown compatibility
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
  code: ({ node, inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1] : ''

    // Ensure children is a string
    const codeString = Array.isArray(children)
      ? children.join('')
      : String(children || '').replace(/\n$/, '')

    // Handle Mermaid diagrams
    if (language === 'mermaid') {
      return <MermaidDiagram chart={codeString} />
    }

    // Inline code
    if (inline || !className) {
      return <code className="text-aura-400 bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
    }

    // Code blocks with syntax highlighting
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
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} className="text-aura-400 hover:text-aura-300 underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
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

export function DocsPage() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const currentPath = location.pathname

  // Get content from MD files or fallback
  const currentContent = useMemo(() => {
    return docContentFromFiles[currentPath] || fallbackContent[currentPath] || fallbackContent['/docs']
  }, [currentPath])


  // Debug: Log available docs
  useEffect(() => {
    console.log('Available MD files:', Object.keys(docContentFromFiles))
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
                    const hasContent = docContentFromFiles[item.path] || fallbackContent[item.path]
                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          onClick={() => setSidebarOpen(false)}
                          className={`
                            flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                            ${isActive
                              ? 'bg-aura-500/10 text-aura-400'
                              : hasContent
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
            <div className="prose prose-invert prose-gray max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {currentContent}
              </ReactMarkdown>
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
    </div>
  )
}
