import { Github, MessageSquare, ArrowLeft, Map } from 'lucide-react'
import { Link } from 'react-router-dom'

type Phase = 'shipped' | 'active' | 'planned' | 'considering'

interface ReleaseItem {
  label: string
  note?: string
}

interface Release {
  version: string
  /** Calendar date for shipped releases. Free-form for planned. */
  when: string
  phase: Phase
  title: string
  subtitle: string
  items: ReleaseItem[]
  issueRefs?: string[]
}

/**
 * Roadmap — editorial timeline.
 *
 * Data sourced directly from CHANGELOG.md as of 2026-05-21. When you
 * ship a new minor version, update CHANGELOG and add a release row
 * here. The latest shipped row sets phase='shipped' with the date;
 * the next-up row sets phase='active'.
 *
 * Latest shipped: v0.13.0 (2026-05-25)
 * In progress: v0.14 (harness improvements, organization detail page)
 */
const releases: Release[] = [
  {
    version: 'v0.1',
    when: 'Jan 2026',
    phase: 'shipped',
    title: 'Foundation',
    subtitle: 'Core gateway, three providers, Python SDK',
    items: [
      { label: 'OpenAI, Anthropic, Google providers' },
      { label: 'Open Responses API spec compliance' },
      { label: 'Streaming via Server-Sent Events' },
      { label: 'Cost tracking per request' },
      { label: 'PostgreSQL request logging' },
      { label: 'Python SDK (aura-llm on PyPI)' },
    ],
  },
  {
    version: 'v0.2',
    when: 'Jan 2026',
    phase: 'shipped',
    title: 'Production readiness',
    subtitle: 'Caching, rate limits, encryption, multi-tenancy',
    items: [
      { label: 'Redis response caching', note: 'SHA-256 keys, TTL' },
      { label: 'Token-bucket rate limiting per API key' },
      { label: 'Prometheus metrics at /metrics' },
      { label: 'AES-256-GCM credential encryption' },
      { label: 'Hierarchical orgs', note: 'org → team → project' },
      { label: 'End-user cost tracking' },
    ],
  },
  {
    version: 'v0.3',
    when: 'Feb 2026',
    phase: 'shipped',
    title: 'Multi-provider expansion',
    subtitle: 'Four new providers, smart routing, prompt compression',
    items: [
      { label: 'Mistral AI provider' },
      { label: 'Ollama local inference' },
      { label: 'HuggingFace TGI provider' },
      { label: 'AWS Bedrock provider', note: 'Claude family' },
      { label: 'Smart routing', note: '8 strategies, circuit breaker, health tracking' },
      { label: 'Admin dashboard foundation' },
      { label: 'TOON, AISP, JSON, YAML compression' },
    ],
  },
  {
    version: 'v0.4',
    when: 'May 2026',
    phase: 'shipped',
    title: 'OSS launch & distribution',
    subtitle: 'Public release, Helm chart, PyPI, dedicated domain',
    items: [
      { label: 'Open-sourced at github.com/UmaiTech/aura-llm-gateway' },
      { label: 'Helm chart on ghcr.io', note: 'OCI registry' },
      { label: 'Python SDK on PyPI via trusted publishing (OIDC)' },
      { label: 'aura-llm.dev launched', note: 'landing, docs, roadmap subdomains' },
      { label: 'Chat playground deployed' },
    ],
  },
  {
    version: 'v0.5',
    when: 'May 2026',
    phase: 'shipped',
    title: 'Playground & content',
    subtitle: 'Bundled playground, new model registrations, docs polish',
    items: [
      { label: 'Chat playground bundled at /playground' },
      { label: 'Roadmap subdomain split out' },
      { label: 'GPT-5.4/5.5 + Claude 4.6/4.7 models registered' },
      { label: 'MDX docs with interactive components' },
    ],
  },
  {
    version: 'v0.6',
    when: 'May 2026',
    phase: 'shipped',
    title: 'Harness & resilience',
    subtitle: 'Agentic harness, CORS robustness, model coverage',
    items: [
      { label: 'Agentic harness runnable end-to-end' },
      { label: 'Claude Haiku 4.5 registration + pricing' },
      { label: 'AURA_CORS_ALLOWED_ORIGINS fail-open + loud log' },
      { label: 'Robust `migrate` subcommand (duplicate-argv tolerance)' },
    ],
  },
  {
    version: 'v0.7',
    when: 'May 2026',
    phase: 'shipped',
    title: 'Per-user scoping',
    subtitle: 'API key ownership and CI hardening',
    items: [
      { label: 'API key routes scoped to authenticated user' },
      { label: 'Version-preview workflow skips fork PRs' },
      { label: 'Python SDK version sync hook' },
    ],
  },
  {
    version: 'v0.8',
    when: 'May 2026',
    phase: 'shipped',
    title: 'Vercel + analytics',
    subtitle: 'Move /api to repo root, TLS on Fly Postgres, analytics',
    items: [
      { label: 'Moved api/ to repo root for Vercel deploy' },
      { label: 'TLS enabled on pg Pool (Fly Postgres)' },
      { label: 'Vercel Analytics on landing, chat, admin' },
      { label: 'Node 22.x pinned for Vercel builds' },
    ],
  },
  {
    version: 'v0.9',
    when: 'May 2026',
    phase: 'shipped',
    title: 'Current — playground stability',
    subtitle: 'better-auth, daily caps, ESM /api, security fixes',
    items: [
      { label: 'GitHub OAuth for playground via better-auth' },
      { label: 'Per-user gateway keys auto-minted on sign-in' },
      { label: 'Free-tier daily message cap (20/day UTC)' },
      { label: '/api/* emits ESM so better-auth loads' },
      { label: 'Compression view + dashboard NUMERIC f64 panic fixes' },
      { label: 'Playground (Demo) org rollup in admin' },
    ],
  },
  {
    version: 'v0.10',
    when: 'May 2026',
    phase: 'shipped',
    title: 'Admin polish & content audit',
    subtitle: 'Editorial redesign, admin app, design-audit cleanup',
    items: [
      { label: 'Admin dashboard at app.aura-llm.dev' },
      { label: 'Editorial redesign across landing/docs/roadmap/admin/chat' },
      { label: 'Validation strategies wired end-to-end', note: '#155' },
    ],
    issueRefs: ['#155'],
  },
  {
    version: 'v0.11',
    when: 'May 2026',
    phase: 'shipped',
    title: 'Validation fanout & playground polish',
    subtitle: 'best_of_n / self_consistency / confidence_threshold + consistency UI',
    items: [
      { label: 'best_of_n + self_consistency validation fanout', note: '#155' },
      { label: 'confidence_threshold validation gate' },
      { label: 'Consistency parameters + strategy outcomes in chat', note: '#158, #161' },
      { label: 'Provider param hotfixes (Gemini 3.x, OpenAI top_logprobs, Anthropic tool roundtrip race)' },
    ],
  },
  {
    version: 'v0.12',
    when: 'May 2026',
    phase: 'shipped',
    title: 'Admin CRUD foundation',
    subtitle: 'Backend endpoints for orgs / teams / end users / API keys',
    items: [
      { label: 'Admin CRUD backend endpoints for all 4 entities' },
      { label: 'Teams CRUD modal wired end-to-end' },
      { label: 'Gateway: api_key_usage now records for failed + incomplete responses' },
      { label: 'Streaming request logs populate latency_ms' },
      { label: 'Helm chart version syncs to release tag' },
    ],
  },
  {
    version: 'v0.13',
    when: 'May 2026',
    phase: 'shipped',
    title: 'Admin polish & honesty',
    subtitle: 'CRUD wiring for all 4 entities, dashboard expansion, removed mock surfaces',
    items: [
      { label: 'CRUD modals wired for Organizations, End Users, API Keys' },
      { label: 'Dashboard: 24h hourly buckets, "All time" range, real x-axis labels' },
      { label: 'Provider Health card shows requests / success% / avg + p95 latency' },
      { label: 'New dashboard cards for compression, validation, consistency activity' },
      { label: 'Insights tool_calls metric reads real data instead of hardcoded zero' },
      { label: 'Removed mock /admin/routing/rules surface; Routing page is now read-only stats' },
    ],
  },
  {
    version: 'v0.14',
    when: 'next',
    phase: 'active',
    title: 'Harness improvements & new surfaces',
    subtitle: 'Trace timeline events, tool drill-down, organization detail page',
    items: [
      { label: 'Compression / validation / consistency events in harness timeline' },
      { label: 'Per-tool drill-down drawer in harness' },
      { label: 'Organization detail page with team + key + cost breakdown' },
      { label: 'TypeScript SDK', note: 'matching the Python feature set' },
      { label: 'Distributed tracing', note: 'OpenTelemetry, end-to-end spans' },
    ],
  },
  {
    version: 'v1.0',
    when: 'later',
    phase: 'planned',
    title: 'Stabilization',
    subtitle: 'Enterprise security, HA deployment, uptime commitment',
    items: [
      { label: 'Webhook callbacks for async completion' },
      { label: 'Auto-updating pricing scraper' },
      { label: 'API key rotation' },
      { label: 'IP allowlisting' },
      { label: 'Audit logs' },
      { label: 'Active-active deployment' },
      { label: '99.9% uptime commitment' },
    ],
  },
  {
    version: 'Future',
    when: '—',
    phase: 'considering',
    title: 'Under consideration',
    subtitle: 'Evaluating based on community feedback',
    items: [
      { label: 'Budget hard caps per user / key' },
      { label: 'A/B traffic splitting between models' },
      { label: 'Semantic caching', note: 'vector-based' },
      { label: 'Batch processing API' },
      { label: 'LangChain / LlamaIndex integrations' },
      { label: 'Cohere, Azure OpenAI, Together AI, Replicate' },
    ],
  },
]

// Use a manual reverse-find instead of Array.prototype.findLast — the
// latter needs lib=es2023 which isn't on this tsconfig. Keeps the
// build target compatible while still picking the latest shipped row.
const LATEST_SHIPPED_VERSION = (() => {
  for (let i = releases.length - 1; i >= 0; i--) {
    if (releases[i].phase === 'shipped') return releases[i].version
  }
  return 'v0.9'
})()

function phaseLabel(phase: Phase) {
  switch (phase) {
    case 'shipped':
      return 'shipped'
    case 'active':
      return 'in progress'
    case 'planned':
      return 'planned'
    case 'considering':
      return 'considering'
  }
}

function phaseDot(phase: Phase) {
  switch (phase) {
    case 'shipped':
      return 'bg-green-500'
    case 'active':
      return 'bg-aura-400'
    case 'planned':
      return 'bg-gray-500'
    case 'considering':
      return 'bg-gray-700'
  }
}

function ReleaseRow({
  release,
  isLast,
}: {
  release: Release
  isLast: boolean
}) {
  const dim =
    release.phase === 'planned'
      ? 'opacity-80'
      : release.phase === 'considering'
        ? 'opacity-60'
        : 'opacity-100'

  return (
    <article className={`${dim} relative grid grid-cols-12 gap-6 sm:gap-8 pb-12 ${!isLast ? 'border-b border-gray-800' : ''} pt-12 first:pt-0 first:border-t-0`}>
      {/* Margin: version + date */}
      <div className="col-span-12 sm:col-span-3 lg:col-span-2">
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${phaseDot(release.phase)} ${
              release.phase === 'active' ? 'animate-pulse' : ''
            }`}
            aria-hidden
          />
          <span className="font-mono text-xs uppercase tracking-wider text-gray-500">
            {phaseLabel(release.phase)}
          </span>
        </div>
        <div className="font-display text-3xl sm:text-4xl font-semibold text-gray-100 leading-none mt-3">
          {release.version}
        </div>
        <div className="font-mono text-xs text-gray-500 mt-2">
          {release.when}
        </div>
      </div>

      {/* Main: title + body */}
      <div className="col-span-12 sm:col-span-9 lg:col-span-10">
        <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-gray-100">
          {release.title}
        </h2>
        <p className="text-gray-400 text-sm mt-1">{release.subtitle}</p>
        <ul className="mt-5 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {release.items.map((item, i) => (
            <li key={i} className="text-gray-300 flex items-baseline gap-2">
              <span
                aria-hidden
                className="text-gray-600 font-mono text-xs flex-shrink-0"
              >
                ·
              </span>
              <span>
                {item.label}
                {item.note && (
                  <span className="text-gray-500 font-mono text-xs ml-1">
                    ({item.note})
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}

export function RoadmapPage() {
  const shippedCount = releases.filter((r) => r.phase === 'shipped').length

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="border-b border-gray-800 bg-gray-950 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link
            to="/docs"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Docs
          </Link>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <Map className="h-3.5 w-3.5" />
            <span>Roadmap</span>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-16">
        {/* Hero — editorial */}
        <header className="mb-16">
          <div className="font-mono text-xs uppercase tracking-wider text-gray-500 mb-6">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
              Latest release
            </span>
            <span className="mx-2">·</span>
            <span className="font-semibold text-green-400">
              {LATEST_SHIPPED_VERSION}
            </span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold mb-4 tracking-tight">
            <span className="text-gray-100">Building in public.</span>
            <br />
            <span className="text-gray-400">Here&apos;s where we are.</span>
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl leading-relaxed">
            Nine minor versions shipped through {LATEST_SHIPPED_VERSION}. Seven
            LLM providers behind one API. Open source on GitHub, on PyPI, on
            GHCR — sourced directly from the changelog.
          </p>

          {/* Stat row — same vocabulary as the landing */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mt-12 border-t border-gray-800 pt-8">
            <div>
              <div className="font-display text-3xl font-semibold text-gray-100 leading-none">
                {shippedCount}
              </div>
              <div className="font-mono text-xs text-gray-500 uppercase tracking-wider mt-2">
                versions shipped
              </div>
            </div>
            <div>
              <div className="font-display text-3xl font-semibold text-gray-100 leading-none">
                7
              </div>
              <div className="font-mono text-xs text-gray-500 uppercase tracking-wider mt-2">
                LLM providers
              </div>
            </div>
            <div>
              <div className="font-display text-3xl font-semibold text-green-400 leading-none">
                {LATEST_SHIPPED_VERSION}
              </div>
              <div className="font-mono text-xs text-gray-500 uppercase tracking-wider mt-2">
                current
              </div>
            </div>
            <div>
              <div className="font-display text-3xl font-semibold text-aura-400 leading-none">
                v0.10
              </div>
              <div className="font-mono text-xs text-gray-500 uppercase tracking-wider mt-2">
                in progress
              </div>
            </div>
          </div>
        </header>

        {/* Timeline — flat, no cards, hairline rules between rows */}
        <section>
          {releases.map((release, i) => (
            <ReleaseRow
              key={release.version}
              release={release}
              isLast={i === releases.length - 1}
            />
          ))}
        </section>

        {/* CTA — single-sentence typographic */}
        <section className="mt-20 pt-16 border-t border-gray-800">
          <p className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-gray-100 max-w-3xl leading-tight">
            Help shape what&apos;s next.{' '}
            <a
              href="https://github.com/UmaiTech/aura-llm-gateway/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-aura-400 hover:text-aura-300 transition-colors underline-offset-4 hover:underline inline-flex items-baseline gap-1.5"
            >
              <Github className="h-5 w-5 self-center" />
              Open an issue
            </a>
            {' or '}
            <a
              href="https://github.com/UmaiTech/aura-llm-gateway/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-aura-400 hover:text-aura-300 transition-colors underline-offset-4 hover:underline inline-flex items-baseline gap-1.5"
            >
              <MessageSquare className="h-5 w-5 self-center" />
              start a discussion
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  )
}
