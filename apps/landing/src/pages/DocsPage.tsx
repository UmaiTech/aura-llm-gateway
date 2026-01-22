import { useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import {
  Sparkles, BookOpen, Zap, Server, Code2, Settings,
  ChevronRight, Menu, X, ExternalLink
} from 'lucide-react'

// Documentation structure
const docSections = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Introduction', path: '/docs', icon: BookOpen },
      { title: 'Quickstart', path: '/docs/quickstart', icon: Zap },
      { title: 'Configuration', path: '/docs/configuration', icon: Settings },
    ],
  },
  {
    title: 'API Reference',
    items: [
      { title: 'Overview', path: '/docs/api', icon: Code2 },
      { title: 'Create Response', path: '/docs/api/responses', icon: Server },
      { title: 'Streaming', path: '/docs/api/streaming', icon: Zap },
    ],
  },
  {
    title: 'Concepts',
    items: [
      { title: 'Open Responses API', path: '/docs/concepts/open-responses', icon: BookOpen },
      { title: 'Cost Tracking', path: '/docs/concepts/cost-tracking', icon: Zap },
      { title: 'Providers', path: '/docs/concepts/providers', icon: Server },
    ],
  },
]

// Documentation content (can be moved to separate files or fetched from MD)
const docContent: Record<string, { title: string; content: React.ReactNode }> = {
  '/docs': {
    title: 'Introduction',
    content: <IntroductionContent />,
  },
  '/docs/quickstart': {
    title: 'Quickstart',
    content: <QuickstartContent />,
  },
  '/docs/api': {
    title: 'API Overview',
    content: <ApiOverviewContent />,
  },
  '/docs/api/responses': {
    title: 'Create Response',
    content: <CreateResponseContent />,
  },
}

export function DocsPage() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const currentPath = location.pathname
  const currentDoc = docContent[currentPath] || docContent['/docs']

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
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-aura-400 to-primary-500 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
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
                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          onClick={() => setSidebarOpen(false)}
                          className={`
                            flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                            ${isActive
                              ? 'bg-aura-500/10 text-aura-400'
                              : 'text-gray-400 hover:text-white hover:bg-gray-800'
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
            <h1 className="text-3xl font-bold mb-6">{currentDoc.title}</h1>
            <div className="prose prose-invert prose-gray max-w-none">
              {currentDoc.content}
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

// Documentation Content Components

function IntroductionContent() {
  return (
    <div className="space-y-6">
      <p className="text-gray-300 text-lg">
        Aura is a high-performance LLM gateway built with Rust. It provides a unified API
        for multiple LLM providers with built-in cost tracking, observability, and support
        for agentic workflows.
      </p>

      <h2 className="text-2xl font-semibold mt-8">Features</h2>
      <ul className="list-disc list-inside space-y-2 text-gray-300">
        <li>Unified API for OpenAI, Anthropic, and Google models</li>
        <li>Real-time cost calculation per request</li>
        <li>Open Responses API specification support</li>
        <li>Streaming with Server-Sent Events</li>
        <li>Tool/function calling support</li>
        <li>Request enrichment with provider and latency metadata</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-8">Architecture</h2>
      <p className="text-gray-300">
        Aura is organized into modular Rust crates:
      </p>
      <ul className="list-disc list-inside space-y-2 text-gray-300">
        <li><code className="text-aura-400">aura-types</code> - Shared type definitions (Open Responses API)</li>
        <li><code className="text-aura-400">aura-core</code> - Core business logic (providers, routing, caching)</li>
        <li><code className="text-aura-400">aura-proxy</code> - Main server binary (Axum routes, middleware)</li>
        <li><code className="text-aura-400">aura-db</code> - Database models and queries (SQLx)</li>
      </ul>
    </div>
  )
}

function QuickstartContent() {
  return (
    <div className="space-y-6">
      <p className="text-gray-300 text-lg">
        Get up and running with Aura in just a few minutes.
      </p>

      <h2 className="text-2xl font-semibold mt-8">1. Clone and Build</h2>
      <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
        <code className="text-gray-300">{`git clone https://github.com/UmaiTech/aura-llm-gateway.git
cd aura-llm-gateway
cargo build --release`}</code>
      </pre>

      <h2 className="text-2xl font-semibold mt-8">2. Configure Environment</h2>
      <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
        <code className="text-gray-300">{`# Required: At least one provider API key
export OPENAI_API_KEY=sk-...

# Optional: Additional providers
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_API_KEY=...

# Server configuration
export AURA_HOST=0.0.0.0
export AURA_PORT=8080`}</code>
      </pre>

      <h2 className="text-2xl font-semibold mt-8">3. Run the Gateway</h2>
      <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
        <code className="text-gray-300">{`cargo run -p aura-proxy

# Or with debug logging
RUST_LOG=debug cargo run -p aura-proxy`}</code>
      </pre>

      <h2 className="text-2xl font-semibold mt-8">4. Make a Request</h2>
      <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
        <code className="text-gray-300">{`curl -X POST http://localhost:8080/v1/responses \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "input": [
      {"type": "message", "role": "user", "content": "Hello!"}
    ]
  }'`}</code>
      </pre>
    </div>
  )
}

function ApiOverviewContent() {
  return (
    <div className="space-y-6">
      <p className="text-gray-300 text-lg">
        Aura implements the Open Responses API specification, providing a unified
        interface for agentic LLM workflows.
      </p>

      <h2 className="text-2xl font-semibold mt-8">Base URL</h2>
      <pre className="bg-gray-900 rounded-lg p-4">
        <code className="text-gray-300">http://localhost:8080</code>
      </pre>

      <h2 className="text-2xl font-semibold mt-8">Endpoints</h2>
      <div className="space-y-4">
        <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded">POST</span>
            <code className="text-gray-300">/v1/responses</code>
          </div>
          <p className="text-gray-400 text-sm">Create a response (streaming or non-streaming)</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded">GET</span>
            <code className="text-gray-300">/health</code>
          </div>
          <p className="text-gray-400 text-sm">Health check endpoint</p>
        </div>
      </div>

      <h2 className="text-2xl font-semibold mt-8">Response Enrichment</h2>
      <p className="text-gray-300">
        Aura automatically enriches responses with additional metadata:
      </p>
      <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
        <code className="text-gray-300">{`{
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50,
    "cost_usd": 0.0035  // Calculated by gateway
  },
  "metadata": {
    "aura": {
      "provider": "openai",
      "gateway_version": "0.1.7",
      "latency_ms": 245
    }
  }
}`}</code>
      </pre>
    </div>
  )
}

function CreateResponseContent() {
  return (
    <div className="space-y-6">
      <p className="text-gray-300 text-lg">
        Create a model response with optional streaming and tool use.
      </p>

      <h2 className="text-2xl font-semibold mt-8">Request</h2>
      <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
        <code className="text-gray-300">{`POST /v1/responses
Content-Type: application/json

{
  "model": "gpt-4o",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "What's the weather like?"
    }
  ],
  "instructions": "You are a helpful assistant.",
  "stream": true,
  "max_output_tokens": 1000,
  "temperature": 0.7,
  "tools": [
    {
      "type": "function",
      "name": "get_weather",
      "description": "Get current weather",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "City name"
          }
        },
        "required": ["location"]
      }
    }
  ]
}`}</code>
      </pre>

      <h2 className="text-2xl font-semibold mt-8">Response</h2>
      <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
        <code className="text-gray-300">{`{
  "id": "resp_abc123",
  "object": "response",
  "created_at": 1706140800,
  "model": "gpt-4o",
  "status": "completed",
  "output": [
    {
      "type": "message",
      "id": "msg_xyz",
      "role": "assistant",
      "content": [
        {
          "type": "text",
          "text": "I'd be happy to help..."
        }
      ]
    }
  ],
  "usage": {
    "input_tokens": 25,
    "output_tokens": 100,
    "total_tokens": 125,
    "cost_usd": 0.00125
  },
  "metadata": {
    "aura": {
      "provider": "openai",
      "gateway_version": "0.1.7",
      "latency_ms": 523
    }
  }
}`}</code>
      </pre>
    </div>
  )
}
