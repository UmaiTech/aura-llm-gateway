import {
  ArrowRight,
  Github,
  ExternalLink,
} from 'lucide-react'

/**
 * Landing page — Stat-Led editorial layout.
 *
 * Per docs/design-audit/REDESIGN.md, this page is the only one in the
 * app where every claim is a real, defensible number. So the page is
 * organized around those numbers as its structural spine:
 *
 *   00 — Hero: stat row in display serif
 *   01..05 — Numbered sections, one per defensible claim, with
 *            adjacent code (no card-flip).
 *   end — Typographic CTA + single-line footer.
 *
 * No 3-column feature grid, no card-flip, no centered playground CTA
 * with an orphan icon, no glassmorphic surfaces, no two-stop
 * gradients. One accent (aura-400). Spacing varies by content
 * weight, not by a uniform py-20.
 */

interface NumberedSection {
  /** "01", "02", ... rendered hanging in the margin */
  index: string
  /** Section title — short, declarative. */
  title: string
  /** Body text — two or three sentences max. */
  body: React.ReactNode
  /** Code or config example shown adjacent to text. */
  code: string
  /** Programming language for the mono label. */
  lang: string
  /** Where the "Read the docs" link points. */
  docsHref: string
  /** Optional inline stat above the title ("7 providers", etc.). */
  stat?: { value: string; unit: string }
}

const SECTIONS: NumberedSection[] = [
  {
    index: '01',
    stat: { value: '7', unit: 'providers' },
    title: 'One API, every model.',
    body: (
      <>
        OpenAI, Anthropic, Google, Mistral, Ollama, HuggingFace, and AWS
        Bedrock — all behind the Open Responses API. Switch providers by
        changing one string.
      </>
    ),
    code: `curl /v1/responses -d '{
  "model": "claude-sonnet-4-5",
  "input": [{
    "role": "user",
    "content": "Hello!"
  }]
}'`,
    lang: 'bash',
    docsHref: 'https://docs.aura-llm.dev/docs/providers/anthropic',
  },
  {
    index: '02',
    stat: { value: '40–60%', unit: 'fewer tokens' },
    title: 'Compression that actually compresses.',
    body: (
      <>
        TOON, AISP, YAML, and JSON compression strategies cut token usage
        on uniform arrays and nested objects. The compressor auto-selects
        the right strategy for the payload shape.
      </>
    ),
    code: `let compressor = SmartCompressor::builder()
    .auto_select(true)
    .build();
let result = compressor.compress(input)?;
// 40-60% fewer tokens`,
    lang: 'rust',
    docsHref: 'https://docs.aura-llm.dev/docs/api/compression',
  },
  {
    index: '03',
    stat: { value: '<10ms', unit: 'gateway overhead' },
    title: 'Routing that knows when to fail over.',
    body: (
      <>
        Eight strategies — round-robin, weighted, region-aware,
        cost-optimized. The circuit breaker fails over to a healthy
        provider on the same call, not the next one.
      </>
    ),
    code: `# config.yaml
routing:
  strategy: cost_optimized
  fallback: [openai, anthropic]
  circuit_breaker:
    failure_threshold: 3`,
    lang: 'yaml',
    docsHref: 'https://docs.aura-llm.dev/docs/api/routing',
  },
  {
    index: '04',
    title: 'Cost on every response.',
    body: (
      <>
        Per-request USD attached to every response, calculated by the
        gateway. Track input, output, cached, and reasoning tokens across
        all seven providers without instrumenting your app.
      </>
    ),
    code: `// Every response includes:
"usage": {
  "input_tokens": 1842,
  "output_tokens": 318,
  "cost_usd": 0.00732
}`,
    lang: 'json',
    docsHref: 'https://docs.aura-llm.dev/docs/api/cost-tracking',
  },
  {
    index: '05',
    title: 'Multi-tenant, end-user-aware.',
    body: (
      <>
        Hierarchical org → team → project → end-user, with scoped API
        keys and per-user cost allocation. Pass <code className="font-mono text-sm">user</code> on
        any request to roll up usage by customer.
      </>
    ),
    code: `POST /v1/responses
Authorization: Bearer aura_team_...
{
  "model": "gpt-5.4-mini",
  "user": "customer_42",
  "input": [...]
}`,
    lang: 'http',
    docsHref: 'https://docs.aura-llm.dev/docs/organizations',
  },
]

const codeExample = `// Request to Aura Gateway
const response = await fetch('https://api.aura-llm.dev/v1/responses', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-5.4-mini',
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
    "cost_usd": 0.00035
  },
  "metadata": {
    "aura": {
      "provider": "openai",
      "latency_ms": 245
    }
  }
}`

function NumberedBlock({ section }: { section: NumberedSection }) {
  return (
    <section className="border-t border-gray-800 py-12 sm:py-16">
      <div className="grid grid-cols-12 gap-6 sm:gap-8">
        {/* Margin: index + optional stat */}
        <div className="col-span-12 sm:col-span-3 lg:col-span-2">
          <div className="font-mono text-xs uppercase tracking-wider text-gray-500">
            {section.index}
          </div>
          {section.stat && (
            <div className="mt-4">
              <div className="font-display text-3xl sm:text-4xl font-semibold text-gray-100 leading-none">
                {section.stat.value}
              </div>
              <div className="font-mono text-xs text-gray-500 uppercase tracking-wider mt-1">
                {section.stat.unit}
              </div>
            </div>
          )}
        </div>

        {/* Main: title + body */}
        <div className="col-span-12 sm:col-span-9 lg:col-span-5">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-gray-100">
            {section.title}
          </h2>
          <p className="mt-3 text-gray-400 leading-relaxed">{section.body}</p>
          <a
            href={section.docsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-sm text-aura-400 hover:text-aura-300 transition-colors"
          >
            Read the docs
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Code: adjacent, not behind a flip */}
        <div className="col-span-12 lg:col-span-5">
          <div className="rounded-lg border border-gray-800 bg-gray-900/30 overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-800 font-mono text-xs uppercase tracking-wide text-gray-500">
              {section.lang}
            </div>
            <pre className="p-4 overflow-x-auto text-sm">
              <code className="text-gray-300 font-mono leading-relaxed">
                {section.code}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav — solid background, no backdrop-blur */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950 border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <a href="/" className="flex items-center gap-2">
              <img src="/icon-square.svg" alt="" className="h-6 w-6" />
              <span className="font-display font-semibold text-lg tracking-tight">
                Aura
              </span>
            </a>
            <div className="flex items-center gap-5 text-sm">
              <a
                href="https://docs.aura-llm.dev"
                className="text-gray-400 hover:text-gray-100 transition-colors"
              >
                Docs
              </a>
              <a
                href="https://roadmap.aura-llm.dev"
                className="text-gray-400 hover:text-gray-100 transition-colors"
              >
                Roadmap
              </a>
              <a
                href="https://playground.aura-llm.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-100 transition-colors inline-flex items-center gap-1"
              >
                Playground
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href="https://github.com/UmaiTech/aura-llm-gateway"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-100 transition-colors"
                aria-label="GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero — stat-led. Big serif headline, then the stat row. */}
        <section className="pt-32 pb-16 sm:pt-40 sm:pb-20">
          <div className="font-mono text-xs uppercase tracking-wider text-gray-500 mb-6">
            Open Responses API · v0.4.1 · Rust
          </div>
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight max-w-3xl text-gray-100 leading-[1.05]">
            A unified LLM gateway,{' '}
            <span className="text-gray-400">built for production.</span>
          </h1>
          <p className="mt-6 text-lg text-gray-400 leading-relaxed max-w-2xl">
            Seven providers behind one API. Cost on every response.
            Compression that cuts tokens 40–60%. Self-hosted Rust binary,
            under 10ms overhead.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <a href="/docs/quickstart" className="btn-primary gap-2">
              Get Started
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="https://github.com/UmaiTech/aura-llm-gateway"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary gap-2"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </a>
          </div>
        </section>

        {/* Stat row — the page's structural anchor */}
        <section className="border-t border-gray-800 py-12 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {[
            { value: '7', unit: 'providers' },
            { value: '40–60%', unit: 'token reduction' },
            { value: '<10ms', unit: 'overhead' },
            { value: 'v0.4.1', unit: 'shipping' },
          ].map((s) => (
            <div key={s.unit}>
              <div className="font-display text-3xl sm:text-4xl font-semibold text-gray-100 leading-none">
                {s.value}
              </div>
              <div className="font-mono text-xs text-gray-500 uppercase tracking-wider mt-2">
                {s.unit}
              </div>
            </div>
          ))}
        </section>

        {/* Inline "what a request looks like" — no fake window chrome */}
        <section className="border-t border-gray-800 py-12 sm:py-16 grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-4">
            <div className="font-mono text-xs uppercase tracking-wider text-gray-500">
              the request
            </div>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-gray-100">
              Looks like the API you already use.
            </h2>
            <p className="mt-3 text-gray-400 leading-relaxed">
              Drop-in compatible with the Open Responses specification.
              Every Aura response carries the upstream fields plus a
              <code className="font-mono text-sm text-aura-400"> usage</code>{' '}
              block with cost calculated by the gateway.
            </p>
          </div>
          <div className="col-span-12 lg:col-span-8">
            <div className="rounded-lg border border-gray-800 bg-gray-900/30 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-800 font-mono text-xs uppercase tracking-wide text-gray-500">
                example.ts
              </div>
              <pre className="p-4 overflow-x-auto text-sm">
                <code className="text-gray-300 font-mono leading-relaxed">
                  {codeExample}
                </code>
              </pre>
            </div>
          </div>
        </section>

        {/* Numbered sections — the stat-led body */}
        {SECTIONS.map((section) => (
          <NumberedBlock key={section.index} section={section} />
        ))}

        {/* Playground CTA — single-sentence typographic */}
        <section className="border-t border-gray-800 py-16 sm:py-20">
          <p className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-gray-100 max-w-3xl leading-tight">
            Or just try it.{' '}
            <a
              href="https://playground.aura-llm.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-aura-400 hover:text-aura-300 transition-colors underline-offset-4 hover:underline"
            >
              Open the playground →
            </a>
          </p>
        </section>
      </main>

      {/* Footer — single line of running prose */}
      <footer className="border-t border-gray-800 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-sm text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-gray-400">Aura LLM Gateway</span>
          <span aria-hidden>·</span>
          <span>open source</span>
          <span aria-hidden>·</span>
          <a
            href="https://github.com/UmaiTech/aura-llm-gateway"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-300 transition-colors inline-flex items-center gap-1"
          >
            <Github className="h-3.5 w-3.5" />
            GitHub
          </a>
          <span aria-hidden>·</span>
          <a
            href="https://docs.aura-llm.dev"
            className="hover:text-gray-300 transition-colors"
          >
            Docs
          </a>
        </div>
      </footer>
    </div>
  )
}
