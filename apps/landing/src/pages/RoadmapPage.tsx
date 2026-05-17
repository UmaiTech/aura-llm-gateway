import { Check, Clock, Rocket, Sparkles, Github, MessageSquare, ArrowLeft, Map } from 'lucide-react'
import { Link } from 'react-router-dom'

type Phase = 'shipped' | 'active' | 'planned' | 'considering'

interface ReleaseItem {
  label: string
  note?: string
}

interface Release {
  version: string
  phase: Phase
  title: string
  subtitle: string
  items: ReleaseItem[]
  issueRefs?: string[]
}

const releases: Release[] = [
  {
    version: 'v0.1.x',
    phase: 'shipped',
    title: 'Foundation',
    subtitle: 'Core gateway, three providers, Python SDK',
    items: [
      { label: 'OpenAI, Anthropic, Google providers' },
      { label: 'Open Responses API spec compliance' },
      { label: 'Streaming via Server-Sent Events' },
      { label: 'Cost tracking per request' },
      { label: 'PostgreSQL request logging' },
      { label: 'API key authentication' },
      { label: 'Python SDK (aura-llm on PyPI)' },
    ],
  },
  {
    version: 'v0.2.x',
    phase: 'shipped',
    title: 'Production Readiness',
    subtitle: 'Caching, rate limits, encryption, multi-tenancy',
    items: [
      { label: 'Response caching', note: 'Redis, SHA-256 keys, TTL' },
      { label: 'Rate limiting', note: 'token bucket per API key' },
      { label: 'Prometheus metrics at /metrics' },
      { label: 'AES-256-GCM credential encryption' },
      { label: 'Hierarchical orgs', note: 'org → team → project' },
      { label: 'End-user cost tracking' },
    ],
  },
  {
    version: 'v0.3.x',
    phase: 'shipped',
    title: 'Multi-Provider Expansion',
    subtitle: 'Four new providers, smart routing, admin UI — current',
    items: [
      { label: 'Mistral AI provider' },
      { label: 'Ollama local inference' },
      { label: 'HuggingFace TGI provider' },
      { label: 'AWS Bedrock provider' },
      { label: 'Smart routing', note: 'load balancing, failover, health tracking' },
      { label: 'Admin dashboard foundation' },
      { label: 'TOON, AISP, JSON, YAML prompt compression' },
    ],
  },
  {
    version: 'v0.4.x',
    phase: 'active',
    title: 'Observability & SDK Parity',
    subtitle: 'TypeScript SDK, distributed tracing, provider completions',
    items: [
      { label: 'TypeScript SDK' },
      { label: 'Distributed tracing', note: 'OpenTelemetry' },
      { label: 'HF Classic Inference API', note: '#74' },
      { label: 'Bedrock Llama / Mistral / Titan families', note: '#73' },
      { label: 'Mistral FIM completions', note: '#75' },
    ],
    issueRefs: ['#73', '#74', '#75'],
  },
  {
    version: 'v1.0',
    phase: 'planned',
    title: 'Stabilization',
    subtitle: 'Enterprise security, HA deployment, 99.9% uptime',
    items: [
      { label: 'Webhook callbacks for async response completion' },
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
    phase: 'considering',
    title: 'Under Consideration',
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

const phaseConfig = {
  shipped: {
    icon: Check,
    iconBg: 'bg-green-500/15',
    iconBorder: 'border-green-500/30',
    iconColor: 'text-green-400',
    nodeBg: 'bg-green-500',
    cardBorder: 'border-gray-800',
    cardBg: 'bg-gray-900/40',
    versionColor: 'text-green-400',
    label: 'Shipped',
    labelColor: 'text-green-400 bg-green-500/10 border-green-500/20',
    opacity: 'opacity-100',
  },
  active: {
    icon: Clock,
    iconBg: 'bg-primary-500/15',
    iconBorder: 'border-primary-500/30',
    iconColor: 'text-primary-400',
    nodeBg: 'bg-primary-500',
    cardBorder: 'border-primary-500/40',
    cardBg: 'bg-gray-900/60',
    versionColor: 'text-primary-400',
    label: 'In Progress',
    labelColor: 'text-primary-400 bg-primary-500/10 border-primary-500/20',
    opacity: 'opacity-100',
  },
  planned: {
    icon: Rocket,
    iconBg: 'bg-gray-700/40',
    iconBorder: 'border-gray-600/40',
    iconColor: 'text-gray-400',
    nodeBg: 'bg-gray-600',
    cardBorder: 'border-gray-700/50',
    cardBg: 'bg-gray-900/20',
    versionColor: 'text-gray-400',
    label: 'Planned',
    labelColor: 'text-gray-400 bg-gray-700/20 border-gray-600/20',
    opacity: 'opacity-80',
  },
  considering: {
    icon: Sparkles,
    iconBg: 'bg-gray-800/40',
    iconBorder: 'border-gray-700/30',
    iconColor: 'text-gray-600',
    nodeBg: 'bg-gray-700',
    cardBorder: 'border-gray-800/40',
    cardBg: 'bg-gray-900/10',
    versionColor: 'text-gray-600',
    label: 'Considering',
    labelColor: 'text-gray-600 bg-gray-800/30 border-gray-700/20',
    opacity: 'opacity-60',
  },
}

function TimelineNode({ phase, isLast }: { phase: Phase; isLast: boolean }) {
  const cfg = phaseConfig[phase]
  return (
    <div className="flex flex-col items-center">
      <div
        className={`
          relative h-3 w-3 rounded-full flex-shrink-0
          ${cfg.nodeBg}
          ${phase === 'active' ? 'shadow-[0_0_12px_3px_rgba(99,102,241,0.4)]' : ''}
        `}
      >
        {phase === 'active' && (
          <span className="absolute inset-0 rounded-full animate-ping bg-primary-500 opacity-30" />
        )}
      </div>
      {!isLast && (
        <div
          className={`
            w-px flex-1 min-h-8
            ${phase === 'shipped' ? 'bg-gradient-to-b from-green-500/40 to-gray-700/40' : 'bg-gray-800'}
          `}
        />
      )}
    </div>
  )
}

function ReleaseCard({ release }: { release: Release }) {
  const cfg = phaseConfig[release.phase]
  const Icon = cfg.icon

  return (
    <div className={`${cfg.opacity} group`}>
      <div
        className={`
          rounded-xl border p-5 sm:p-6 transition-all duration-200
          ${cfg.cardBg} ${cfg.cardBorder}
          ${release.phase === 'active' ? 'shadow-[0_0_30px_-5px_rgba(99,102,241,0.2)]' : ''}
          hover:border-gray-600/60
        `}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${cfg.iconBg} ${cfg.iconBorder}`}>
              <Icon className={`h-4.5 w-4.5 ${cfg.iconColor}`} style={{ height: '1.125rem', width: '1.125rem' }} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-mono text-sm font-semibold ${cfg.versionColor}`}>
                  {release.version}
                </span>
                {release.phase === 'shipped' && (
                  <span className="font-mono text-xs text-gray-600">—</span>
                )}
                <h2 className="font-semibold text-white text-base">{release.title}</h2>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{release.subtitle}</p>
            </div>
          </div>
          <span className={`hidden sm:inline-flex flex-shrink-0 text-xs font-medium px-2 py-1 rounded-full border ${cfg.labelColor}`}>
            {cfg.label}
          </span>
        </div>

        <ul className="space-y-1.5 ml-12">
          {release.items.map((item, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm">
              <span
                className={`
                  mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0
                  ${release.phase === 'shipped' ? 'bg-green-500/60' :
                    release.phase === 'active' ? 'bg-primary-500/60' :
                    'bg-gray-600'}
                `}
              />
              <span className={release.phase === 'considering' ? 'text-gray-600' : 'text-gray-300'}>
                {item.label}
              </span>
              {item.note && (
                <span className="text-gray-600 font-mono text-xs">{item.note}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function RoadmapPage() {
  const shippedCount = releases.filter(r => r.phase === 'shipped').length

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-lg sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
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

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-8">
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800/80 text-xs text-gray-400 mb-5 border border-gray-700/50">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />
            Current release
            <span className="font-mono text-green-400 font-semibold">v0.3.2</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight">
            <span className="gradient-text">Building in public.</span>
            <br />
            <span className="text-gray-200">Here's where we are.</span>
          </h1>
          <p className="text-lg text-gray-400 max-w-xl leading-relaxed">
            Three major versions shipped in four months. Seven LLM providers unified
            behind a single API. This is what we've done — and what comes next.
          </p>

          <div className="flex items-center gap-6 mt-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{shippedCount}</div>
              <div className="text-xs text-gray-500 mt-0.5">versions shipped</div>
            </div>
            <div className="h-8 w-px bg-gray-800" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white">7</div>
              <div className="text-xs text-gray-500 mt-0.5">LLM providers</div>
            </div>
            <div className="h-8 w-px bg-gray-800" />
            <div className="text-center">
              <div className="text-2xl font-bold gradient-text">v0.4</div>
              <div className="text-xs text-gray-500 mt-0.5">in progress</div>
            </div>
          </div>
        </div>

        <div className="relative">
          <div
            className="absolute left-[5px] top-3 bottom-0 w-px bg-gradient-to-b from-green-500/50 via-primary-500/30 to-gray-800/0"
            aria-hidden="true"
          />

          <div className="space-y-6">
            {releases.map((release, i) => (
              <div key={release.version} className="flex gap-5">
                <TimelineNode
                  phase={release.phase}
                  isLast={i === releases.length - 1}
                />
                <div className="flex-1 pb-2 min-w-0">
                  <ReleaseCard release={release} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 rounded-xl border border-gray-800 bg-gray-900/30 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-white mb-2">Help shape the roadmap</h2>
          <p className="text-sm text-gray-400 mb-5 max-w-lg">
            Open an issue to request a feature, vote on existing proposals, or
            contribute a PR. We read everything.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://github.com/UmaiTech/aura-llm-gateway/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary gap-2 text-sm px-4 py-2"
            >
              <Github className="h-4 w-4" />
              Open an issue
            </a>
            <a
              href="https://github.com/UmaiTech/aura-llm-gateway/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary gap-2 text-sm px-4 py-2"
            >
              <MessageSquare className="h-4 w-4" />
              Discussions
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
