import {
  Sparkles, ArrowRight, Zap, BarChart3,
  Code2, Globe, MessageSquare, BookOpen,
  Github, ExternalLink, Lock, Network, FileSearch,
  Layers, Minimize2
} from 'lucide-react'

const features = [
  {
    icon: Globe,
    title: '7 Providers',
    description: 'OpenAI, Anthropic, Google, Mistral, Ollama, HuggingFace, AWS Bedrock — all behind one Open Responses API.',
  },
  {
    icon: Minimize2,
    title: 'Prompt Compression',
    description: 'TOON, AISP, YAML, and JSON compression strategies cut token usage 40–60% on uniform arrays and nested objects.',
  },
  {
    icon: Network,
    title: 'Smart Routing',
    description: 'Eight strategies — round-robin, weighted, region-aware, cost-optimized. Circuit breaker fails over to a healthy provider on the same call.',
  },
  {
    icon: BarChart3,
    title: 'Cost Tracking',
    description: 'Per-request USD on every response. Track input, output, cached, and reasoning tokens across all seven providers.',
  },
  {
    icon: FileSearch,
    title: 'Response Validation',
    description: 'Logprobs, self-consistency, best-of-N sampling, and confidence thresholds — measurably reduce hallucinations.',
  },
  {
    icon: Lock,
    title: 'Encrypted Credentials',
    description: 'AES-256-GCM envelope encryption for provider API keys. Master key from KMS or Vault — never written to disk in plaintext.',
  },
  {
    icon: Layers,
    title: 'Multi-Tenancy',
    description: 'Hierarchical org → team → project → end-user model with scoped API keys and per-user cost allocation.',
  },
  {
    icon: Zap,
    title: 'Production Ready',
    description: 'Redis-backed rate limiting and response caching, Prometheus metrics, structured logging, and SSE streaming throughout.',
  },
  {
    icon: Code2,
    title: 'Self-Hosted in Rust',
    description: 'Single static binary, no runtime deps. Axum + Tokio + reqwest. Built to keep gateway overhead under 10ms.',
  },
]

const codeExample = `// Request to Aura Gateway
const response = await fetch('http://localhost:8080/v1/responses', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4o',
    input: [
      { type: 'message', role: 'user', content: 'Hello!' }
    ],
    stream: true
  })
});

// Response includes Aura enrichment
{
  "usage": {
    "input_tokens": 10,
    "output_tokens": 25,
    "cost_usd": 0.00035  // 💰 Calculated by gateway
  },
  "metadata": {
    "aura": {
      "provider": "openai",
      "latency_ms": 245
    }
  }
}`

export default function App() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-lg border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/icon-square.svg" alt="Aura Logo" className="h-9 w-9" />
              <span className="font-semibold text-xl">Aura</span>
            </div>
            <div className="flex items-center gap-4">
              <a href="https://docs.aura-llm.dev" className="text-gray-400 hover:text-white transition-colors">
                Docs
              </a>
              <a href="https://roadmap.aura-llm.dev" className="text-gray-400 hover:text-white transition-colors">
                Roadmap
              </a>
              <a
                href="https://playground.aura-llm.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors flex items-center gap-1"
              >
                Playground
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href="https://github.com/UmaiTech/aura-llm-gateway"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <Github className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800 text-sm text-gray-300 mb-6">
            <Sparkles className="h-4 w-4 text-aura-400" />
            Open Responses API Compatible
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold mb-6">
            <span className="gradient-text">Unified LLM Gateway</span>
            <br />
            <span className="text-gray-100">for Modern AI Apps</span>
          </h1>

          <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            Route requests across seven providers — OpenAI, Anthropic, Google, Mistral,
            Ollama, HuggingFace, and AWS Bedrock — with a single API.
            Built-in cost tracking, observability, and agentic workflow support.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="/docs/quickstart" className="btn-primary gap-2">
              Get Started
              <ArrowRight className="h-4 w-4" />
            </a>
            <a href="/docs/api" className="btn-secondary gap-2">
              <BookOpen className="h-4 w-4" />
              API Reference
            </a>
          </div>
        </div>
      </section>

      {/* Code Example */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900/50">
        <div className="max-w-4xl mx-auto">
          <div className="card glow">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <div className="h-3 w-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-sm text-gray-500 ml-2">example.ts</span>
            </div>
            <pre className="text-sm overflow-x-auto">
              <code className="text-gray-300">{codeExample}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Everything you need</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              A complete LLM gateway built with Rust for performance and reliability.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="card group">
                <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-aura-500/20 to-primary-500/20 flex items-center justify-center mb-4 group-hover:from-aura-500/30 group-hover:to-primary-500/30 transition-colors">
                  <feature.icon className="h-6 w-6 text-aura-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-900/50 to-gray-950">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <MessageSquare className="h-8 w-8 text-aura-400" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Try the Playground</h2>
          <p className="text-gray-400 mb-8 max-w-xl mx-auto">
            Test the gateway with our built-in chat interface. Supports agent mode with tool execution.
          </p>
          <a
            href="http://localhost:3000"
            className="btn-primary gap-2"
          >
            Open Playground
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-gray-800">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-400">
            <img src="/icon-square.svg" alt="Aura" className="h-4 w-4" />
            <span className="text-sm">Aura LLM Gateway</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="/docs" className="hover:text-gray-300 transition-colors">Documentation</a>
            <a href="/docs/api" className="hover:text-gray-300 transition-colors">API Reference</a>
            <a
              href="https://github.com/UmaiTech/aura-llm-gateway"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-300 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
