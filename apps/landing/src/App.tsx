import { ArrowRight } from 'lucide-react'

const heroCode = `curl -X POST http://localhost:8080/v1/responses \\
  -H 'Content-Type: application/json' \\
  -d '{
    "model": "claude-sonnet-4-5",
    "input": [
      { "type": "message", "role": "user",
        "content": "Hello!" }
    ],
    "stream": true
  }'`

const compressionCode = `let compressor = SmartCompressor::builder()
    .auto_select(true)
    .build();
let result = compressor.compress(input)?;
// 40-60% fewer tokens on uniform arrays`

const routingCode = `# config.yaml
routing:
  strategy: cost_optimized
  fallback: [openai, anthropic]
  circuit_breaker:
    failure_threshold: 3`

const responseCode = `{
  "usage": {
    "input_tokens": 1842,
    "output_tokens": 318,
    "cost_usd": 0.00732
  },
  "metadata": {
    "aura": {
      "provider": "openai",
      "latency_ms": 245
    }
  }
}`

const productionCode = `# Generate master key once
export AURA_MASTER_KEY=$(openssl rand -hex 32)

# Provider keys encrypted at rest
# DEK wrapping per-tenant
# Prometheus at /metrics`

const rustCode = `# Deploy with Helm
helm install aura \\
  oci://ghcr.io/umaitech/charts/aura-llm-gateway \\
  --set secrets.inline.openaiApiKey=sk-...`

interface Stat {
  value: string
  label: string
}

const stats: Stat[] = [
  { value: '7', label: 'Providers' },
  { value: '40–60%', label: 'Token reduction' },
  { value: '<10ms', label: 'Gateway overhead' },
  { value: '4', label: 'Versions shipped' },
]

interface Section {
  marker: string
  title: string
  body: string[]
  code: string
  codeLabel: string
}

const sections: Section[] = [
  {
    marker: '§ 01 — Providers',
    title: 'Seven providers, one API',
    body: [
      'OpenAI, Anthropic, Google, Mistral, Ollama, HuggingFace, AWS Bedrock — all behind a single Open Responses API. Switch models with a string, not a rewrite.',
    ],
    code: heroCode,
    codeLabel: 'request.sh',
  },
  {
    marker: '§ 02 — Compression',
    title: 'Compression that pays for itself',
    body: [
      'TOON, AISP, YAML, and JSON compression strategies cut token usage 40–60% on uniform arrays and nested objects. The compressor picks the best strategy per payload.',
    ],
    code: compressionCode,
    codeLabel: 'compress.rs',
  },
  {
    marker: '§ 03 — Routing & cost',
    title: 'Routes for cost, fails over for uptime',
    body: [
      'Eight strategies — round-robin, weighted, region-aware, cost-optimized. The circuit breaker fails over to a healthy provider on the same call. Every response carries per-request USD, calculated from the gateway.',
    ],
    code: routingCode,
    codeLabel: 'config.yaml',
  },
  {
    marker: '§ 04 — Production',
    title: 'Encrypted, multi-tenant, observable',
    body: [
      'AES-256-GCM envelope encryption for provider keys. Hierarchical org → team → project → end-user with scoped API keys and per-user cost allocation. Redis-backed rate limiting and response caching. Prometheus metrics, structured logging, SSE streaming throughout.',
    ],
    code: productionCode,
    codeLabel: 'production.sh',
  },
  {
    marker: '§ 05 — Self-hosted in Rust',
    title: 'A single static binary',
    body: [
      'Axum + Tokio + reqwest. Single static binary, no runtime dependencies. Built to keep gateway overhead under 10ms. Open-sourced under MIT, distributed via Helm chart on GHCR and PyPI.',
    ],
    code: rustCode,
    codeLabel: 'deploy.sh',
  },
]

// Editorial pres pick up the .editorial-pre treatment (cyan
// left rule, tabular numerics, generous line-height) from
// index.css. Inline styles only override what's distinct here.
const response = (
  <pre className="editorial-pre" style={{ fontSize: '0.8125rem' }}>
    {responseCode}
  </pre>
)

export default function App() {
  return (
    <div style={{ background: 'var(--canvas)', color: 'var(--ink)', minHeight: '100vh' }}>
      <Nav />
      <Hero />
      <Sections />
      <ClosingNote />
      <Footer />
    </div>
  )
}

function Nav() {
  return (
    <nav
      style={{
        background: 'var(--canvas)',
        padding: 'var(--space-4) var(--space-6) var(--space-4) var(--space-6)',
      }}
    >
      <div style={{ maxWidth: '72rem', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <a href="/" aria-label="Aura LLM Gateway — home" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <img src="/logo-horizontal.svg" alt="Aura LLM Gateway" className="brand-wordmark" />
        </a>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--ink-muted)', letterSpacing: '0.04em' }}>
          <a href="https://docs.aura-llm.dev" className="link">Docs</a>
          <span aria-hidden>·</span>
          <a href="https://roadmap.aura-llm.dev" className="link">Roadmap</a>
          <span aria-hidden>·</span>
          <a href="https://playground.aura-llm.dev" className="link">Playground</a>
          <span aria-hidden>·</span>
          <a href="https://github.com/UmaiTech/aura-llm-gateway" className="link">GitHub</a>
        </div>
      </div>
    </nav>
  )
}

function Hero() {
  return (
    <section
      style={{
        padding: 'var(--space-8) var(--space-6) var(--space-7) var(--space-6)',
      }}
    >
      <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', display: 'block', marginBottom: 'var(--space-4)' }}>
          v0.5.x — Open Responses API
        </span>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(2.75rem, 6vw, 5rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            marginBottom: 'var(--space-5)',
            maxWidth: '20ch',
          }}
        >
          A <span style={{ color: 'var(--accent-warm)' }}>unified</span> LLM gateway, written like a foundry publishes a type specimen.
        </h1>
        <p style={{ fontSize: '1.0625rem', lineHeight: 1.6, color: 'var(--ink-muted)', maxWidth: '52ch', marginBottom: 'var(--space-6)' }}>
          Route requests across seven providers behind one API. Built in Rust, open-sourced under MIT,
          deployed with a single Helm command.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-5)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: 'var(--space-5) 0', marginBottom: 'var(--space-6)' }}>
          {stats.map((stat) => (
            <div key={stat.label}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 400,
                  fontSize: '2.5rem',
                  lineHeight: 1.05,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--ink)',
                }}
              >
                {stat.value}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginTop: 'var(--space-2)' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
          <a href="/docs/quickstart" className="btn-outline btn-outline--warm">
            Get started <span aria-hidden>→</span>
          </a>
          <a href="/docs/api" className="link" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
            Read the API reference <ArrowRight style={{ display: 'inline', height: '0.875em', width: '0.875em', verticalAlign: 'baseline' }} aria-hidden />
          </a>
        </div>
      </div>
    </section>
  )
}

function Sections() {
  return (
    <div>
      {sections.map((section, idx) => (
        <SectionRow
          key={section.marker}
          section={section}
          padTop={idx === 0 ? 'var(--space-6)' : 'var(--space-7)'}
          padBottom={idx === sections.length - 1 ? 'var(--space-7)' : 'var(--space-6)'}
          showResponseExtras={idx === 2}
        />
      ))}
    </div>
  )
}

function SectionRow({ section, padTop, padBottom, showResponseExtras }: { section: Section; padTop: string; padBottom: string; showResponseExtras: boolean }) {
  return (
    <section style={{ padding: `${padTop} var(--space-6) ${padBottom} var(--space-6)`, borderTop: '1px solid var(--rule)' }}>
      <div style={{ maxWidth: '72rem', margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--space-5)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 'var(--space-6)' }} className="section-row-grid">
          <div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', display: 'block', marginBottom: 'var(--space-3)' }}>
              {section.marker}
            </span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'clamp(1.75rem, 3vw, 2.25rem)', lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 'var(--space-4)', maxWidth: '22ch' }}>
              {section.title}
            </h2>
            {section.body.map((para, i) => (
              <p key={i} style={{ fontSize: '1rem', lineHeight: 1.6, color: 'var(--ink-muted)', maxWidth: '52ch', marginBottom: 'var(--space-3)' }}>
                {para}
              </p>
            ))}
          </div>
          <div>
            <span className="code-block-label">{section.codeLabel}</span>
            <pre className="editorial-pre" style={{ fontSize: '0.8125rem' }}>
              {section.code}
            </pre>
            {showResponseExtras && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <span className="code-block-label">response.json</span>
                {response}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function ClosingNote() {
  return (
    <section style={{ padding: 'var(--space-6) var(--space-6) var(--space-7) var(--space-6)', borderTop: '1px solid var(--rule)' }}>
      <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1.5rem, 2.5vw, 2rem)', lineHeight: 1.3, letterSpacing: '-0.01em', maxWidth: '34ch', color: 'var(--ink)' }}>
          Try the gateway in the{' '}
          <a href="https://playground.aura-llm.dev" className="link">browser playground</a>
          {' '}or read the{' '}
          <a href="/docs/quickstart" className="link">quickstart</a>.
        </p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ padding: 'var(--space-6)', borderTop: '1px solid var(--rule)' }}>
      <div
        style={{
          maxWidth: '72rem',
          margin: '0 auto',
          display: 'flex',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', margin: 0 }}>
          Aura LLM Gateway · open source · MIT ·{' '}
          <a href="https://github.com/UmaiTech/aura-llm-gateway" className="link">
            github.com/UmaiTech/aura-llm-gateway <span aria-hidden>→</span>
          </a>
        </p>
        {/* Hand-cut signature line. Centered-bottom on mobile, right-
            aligned on wider screens via the flex layout above. The
            heart uses --accent-warm (the same purple used on the hero
            keyword) so the brand color closes the page where it
            opened it. */}
        <p
          style={{
            color: 'var(--ink-muted)',
            margin: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Made in Stockholm with{' '}
          <span aria-label="love" style={{ color: 'var(--accent-warm)' }}>
            ❤
          </span>
        </p>
      </div>
    </footer>
  )
}

/* Hallmark · genre: editorial-minimal · macrostructure: stat-led · design-system: design.md · designed-as-app */
