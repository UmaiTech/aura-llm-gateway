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
    subtitle: 'Four new providers, smart routing, prompt compression',
    items: [
      { label: 'Mistral AI provider' },
      { label: 'Ollama local inference' },
      { label: 'HuggingFace TGI provider' },
      { label: 'AWS Bedrock provider', note: 'Claude family' },
      { label: 'Smart routing', note: '8 strategies, circuit breaker, health tracking' },
      { label: 'Admin dashboard foundation' },
      { label: 'TOON, AISP, JSON, YAML prompt compression' },
    ],
  },
  {
    version: 'v0.4.x',
    phase: 'shipped',
    title: 'OSS Launch & Distribution',
    subtitle: 'Public release, Helm chart, PyPI publishing, dedicated domain',
    items: [
      { label: 'Open-sourced at github.com/UmaiTech/aura-llm-gateway' },
      { label: 'Helm chart on ghcr.io', note: 'OCI registry, one-command k8s install' },
      { label: 'Python SDK published on PyPI', note: 'trusted publishing via OIDC' },
      { label: 'aura-llm.dev launched', note: 'landing, docs, roadmap, playground subdomains' },
      { label: 'Chat playground deployed' },
      { label: 'Landing page with full capability map' },
    ],
  },
  {
    version: 'v0.5.x',
    phase: 'shipped',
    title: 'Hosted Demo & Provider Reach',
    subtitle: 'api.aura-llm.dev live, new provider families',
    items: [
      { label: 'Hosted demo gateway', note: 'api.aura-llm.dev on Fly.io' },
      { label: 'HF Classic Inference API', note: '#74' },
      { label: 'Bedrock Llama / Mistral / Titan families', note: '#73' },
      { label: 'Mistral FIM completions', note: '#75' },
    ],
    issueRefs: ['#73', '#74', '#75'],
  },
  {
    version: 'v0.6–v0.7',
    phase: 'shipped',
    title: 'Playground Auth',
    subtitle: 'GitHub OAuth, per-user gateway keys, server-side proxy',
    items: [
      { label: 'better-auth + GitHub OAuth on playground' },
      { label: 'Auto-mint per-user gateway API key on first sign-in' },
      { label: 'Server-side proxy', note: 'no API key ever in the browser' },
      { label: 'playground_auth schema isolation' },
      { label: 'Helm chart on ghcr.io', note: 'one-command k8s install' },
    ],
  },
  {
    version: 'v0.8.x',
    phase: 'shipped',
    title: 'Free Tier & Beta Funnel',
    subtitle: 'Daily cap, model gating, managed-beta CTAs',
    items: [
      { label: 'Daily message cap', note: '20/day, atomic Redis counter' },
      { label: 'Frontier models gated behind managed beta' },
      { label: 'Beta-signup CTAs', note: '3 surfaces, source-attributed' },
      { label: 'Rate-limit notice with one-click join' },
      { label: 'Vercel Analytics on all apps' },
    ],
  },
  {
    version: 'v0.9.x',
    phase: 'active',
    title: 'Resilience & UX Polish',
    subtitle: 'HA Postgres, quota chip, editorial redesign',
    items: [
      { label: 'Fly Postgres replica + repmgr failover' },
      { label: 'Migrate retry-with-backoff', note: 'absorbs PG flap windows' },
      { label: 'Daily-quota chip', note: 'persistent, with stale check' },
      { label: 'Hard chat cutoff at 20', note: 'input disabled at the wall' },
      { label: 'Editorial-minimal redesign', note: 'landing + docs + roadmap' },
      { label: 'TypeScript SDK', note: 'matching Python feature set — in progress' },
    ],
  },
  {
    version: 'v1.0',
    phase: 'planned',
    title: 'Stabilization',
    subtitle: 'Enterprise security, observability, 99.9% uptime',
    items: [
      { label: 'Distributed tracing', note: 'OpenTelemetry, end-to-end spans' },
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

const phaseLabel = (phase: Phase): string => {
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

/**
 * Map a release entry's version string to a changelog URL.
 *
 * For specific shipped versions ("v0.4.x") we anchor into the
 * version's CHANGELOG.md section. For multi-version entries
 * ("v0.6–v0.7") there's no single anchor — link to the file root.
 *
 * GitHub auto-generates fragment anchors from headings as
 * `#nnn---yyyy-mm-dd` for our git-cliff format. The release tag
 * (`vX.Y.Z`) is more stable, so we use that instead — clicking
 * lands on the Release notes for that tag.
 */
function changelogHref(version: string): string {
  // Multi-version range — link to the file root
  if (version.includes('–') || version === 'Future') {
    return 'https://github.com/UmaiTech/aura-llm-gateway/blob/main/CHANGELOG.md'
  }
  // vX.Y.x — pick a representative recent tag in that minor
  const minor = version.replace('v', '').replace('.x', '')
  return `https://github.com/UmaiTech/aura-llm-gateway/releases?q=v${minor}`
}

export function RoadmapPage() {
  return (
    <div style={{ background: 'var(--canvas)', color: 'var(--ink)', minHeight: '100vh' }}>
      <nav style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ maxWidth: '52rem', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <Link to="/" aria-label="Aura LLM Gateway — home" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            <img src="/logo-horizontal.svg" alt="Aura LLM Gateway" className="brand-wordmark" />
          </Link>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            Roadmap · v0.9.x
          </span>
        </div>
      </nav>

      <main style={{ maxWidth: '52rem', margin: '0 auto', padding: 'var(--space-7) var(--space-5) var(--space-7) var(--space-5)' }}>
        <header style={{ marginBottom: 'var(--space-7)' }}>
          <img src="/icon-square.svg" alt="" aria-hidden style={{ display: 'block', height: 48, width: 48, marginBottom: 'var(--space-5)' }} />
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              marginBottom: 'var(--space-5)',
              maxWidth: '18ch',
            }}
          >
            Building in public. Here's where we are.
          </h1>
          <p style={{ fontSize: '1.0625rem', lineHeight: 1.6, color: 'var(--ink-muted)', maxWidth: '56ch' }}>
            Nine versions shipped. Seven providers unified behind a single API.
            Open-sourced, on PyPI, on GHCR, with a live hosted playground at{' '}
            <a href="https://playground.aura-llm.dev" className="link">playground.aura-llm.dev</a>.
            This is what we've built — and what comes next.
          </p>
        </header>

        <hr style={{ margin: 'var(--space-7) 0', border: 0, color: 'var(--ink-muted)', textAlign: 'left' }} />

        {releases.map((release, idx) => (
          <article key={release.version} style={{ marginBottom: 'var(--space-7)' }}>
            <header
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                alignItems: 'baseline',
                gap: 'var(--space-4)',
                marginBottom: 'var(--space-4)',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.875rem',
                    letterSpacing: '0.04em',
                    color: 'var(--ink-muted)',
                    marginBottom: 'var(--space-2)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {release.version}
                </div>
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 500,
                    fontSize: 'clamp(1.5rem, 2.5vw, 1.875rem)',
                    lineHeight: 1.1,
                    letterSpacing: '-0.02em',
                    margin: 0,
                  }}
                >
                  {release.title}
                </h2>
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.9375rem', marginTop: 'var(--space-2)', margin: 'var(--space-2) 0 0 0' }}>
                  {release.subtitle}
                </p>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: release.phase === 'active' ? 'var(--accent)' : 'var(--ink-muted)',
                  fontStyle: 'italic',
                  whiteSpace: 'nowrap',
                }}
              >
                {phaseLabel(release.phase)}
              </span>
            </header>

            <ul style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: '1px solid var(--rule)' }}>
              {release.items.map((item, i) => (
                <li
                  key={i}
                  style={{
                    padding: 'var(--space-2) 0',
                    borderBottom: '1px solid var(--rule)',
                    color: release.phase === 'considering' ? 'var(--ink-muted)' : 'var(--ink)',
                    fontSize: '0.9375rem',
                    lineHeight: 1.55,
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 'var(--space-3)',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>{item.label}</span>
                  {item.note && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>
                      — {item.note}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {/* Per-release changelog link for shipped versions.
                For multi-version entries (v0.6–v0.7) we link to the
                CHANGELOG.md file itself; for single versions we
                anchor into that section. "active" / "planned" /
                "considering" don't get a link since there's nothing
                shipped yet. */}
            {release.phase === 'shipped' && (
              <div
                style={{
                  marginTop: 'var(--space-3)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8125rem',
                  color: 'var(--ink-muted)',
                }}
              >
                <a
                  href={changelogHref(release.version)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  Changelog →
                </a>
              </div>
            )}

            {idx < releases.length - 1 && (
              <div style={{ textAlign: 'center', color: 'var(--ink-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', letterSpacing: '0.2em', marginTop: 'var(--space-6)' }}>
                — — —
              </div>
            )}
          </article>
        ))}

        <hr style={{ margin: 'var(--space-7) 0 var(--space-5) 0' }} />

        <p style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.25rem', lineHeight: 1.4, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
          Help shape the roadmap. <a href="https://github.com/UmaiTech/aura-llm-gateway/issues" className="link">Open an issue</a> · <a href="https://github.com/UmaiTech/aura-llm-gateway/discussions" className="link">join discussions</a>.
        </p>
      </main>
    </div>
  )
}

/* Hallmark · genre: editorial-minimal · macrostructure: long-document · design-system: design.md · designed-as-app */
