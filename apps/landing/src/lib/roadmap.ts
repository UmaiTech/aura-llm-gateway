/**
 * Public roadmap data (aura-llm.dev/roadmap). The page renders this file;
 * roadmap.test.ts checks it against CHANGELOG.md on every test run.
 *
 * Statuses:
 * - released           in a published version: needs releasedVersion,
 *                      releasedAt (the CHANGELOG date) and evidence links.
 * - merged-unreleased  on main, not in a tagged release yet. Evidence is the
 *                      PR or the CHANGELOG "Unreleased" section.
 * - in-progress        actively being built (an open PR or branch exists).
 * - planned            the maintainers intend to build it. No dates.
 * - considering        under evaluation, or a proposal. No dates.
 */

export type RoadmapStatus = 'released' | 'merged-unreleased' | 'in-progress' | 'planned' | 'considering'

export type RoadmapArea =
  | 'routing'
  | 'providers'
  | 'models'
  | 'admin'
  | 'playground'
  | 'sdks'
  | 'pricing'
  | 'gateway'
  | 'observability'
  | 'security'
  | 'site'
  | 'docs'

export interface EvidenceLink {
  label: string
  href: string
}

export interface RoadmapItem {
  id: string
  title: string
  status: RoadmapStatus
  /** Semver without the `v`, e.g. "0.20.0". Released items only. */
  releasedVersion?: string
  /** ISO date of that version's CHANGELOG heading. Released items only. */
  releasedAt?: string
  evidenceLinks: EvidenceLink[]
  area: RoadmapArea
  description: string
  /** Suggested in a design review rather than announced by the maintainers. */
  proposal?: boolean
  /** User-facing GitHub issues worth highlighting, e.g. ['#155']. */
  issueRefs?: string[]
}

export const REPO = 'https://github.com/UmaiTech/aura-llm-gateway'

/** When this file was last checked against CHANGELOG.md, tags and merged PRs. */
export const RECONCILED = {
  date: '2026-10-23',
  /** main commit the release history was reconciled against. */
  revision: '9bd32ab',
} as const

export const pr = (n: number): EvidenceLink => ({ label: `#${n}`, href: `${REPO}/pull/${n}` })

/** GitHub's anchor for a `## [x.y.z] - yyyy-mm-dd` CHANGELOG heading. */
export function changelogAnchor(version: string, date: string): string {
  return `${version.replace(/\./g, '')}---${date}`
}

export const changelogLink = (version: string, date: string): EvidenceLink => ({
  label: `CHANGELOG ${version}`,
  href: `${REPO}/blob/main/CHANGELOG.md#${changelogAnchor(version, date)}`,
})

/** Evidence for merged-unreleased items that have no single PR. */
export const UNRELEASED: EvidenceLink = { label: 'CHANGELOG · Unreleased', href: `${REPO}/blob/main/CHANGELOG.md#unreleased` }

/** Published versions shown in the release list, newest first. */
export interface Release {
  version: string
  date: string
  /** A `v<version>` git tag / GitHub release exists. */
  tagged: boolean
}

export const RELEASES: Release[] = [
  { version: '0.21.0', date: '2026-10-23', tagged: true },
  { version: '0.20.0', date: '2026-10-22', tagged: true },
  { version: '0.19.0', date: '2026-10-22', tagged: true },
  { version: '0.18.0', date: '2026-09-09', tagged: true },
  { version: '0.17.0', date: '2026-09-07', tagged: true },
  { version: '0.16.0', date: '2026-06-30', tagged: true },
  { version: '0.15.0', date: '2026-05-26', tagged: true },
  { version: '0.14.2', date: '2026-05-25', tagged: true },
  { version: '0.14.0', date: '2026-05-25', tagged: false },
]

export const releaseLink = (r: Release): EvidenceLink =>
  r.tagged ? { label: `v${r.version} release`, href: `${REPO}/releases/tag/v${r.version}` } : changelogLink(r.version, r.date)

function released(
  version: string,
  item: Omit<RoadmapItem, 'status' | 'releasedVersion' | 'releasedAt'>,
): RoadmapItem {
  const release = RELEASES.find((r) => r.version === version)
  return { ...item, status: 'released', releasedVersion: version, releasedAt: release?.date }
}

export const ROADMAP: RoadmapItem[] = [
  // ── Merged to main, not in a release yet ──────────────────────────────
  {
    id: 'streaming-fixes',
    title: 'Streaming fixes for Gemini and long answers',
    status: 'merged-unreleased',
    area: 'gateway',
    description:
      'Streamed Gemini answers no longer lose words, text cut mid-character by the network is no longer dropped by any provider, long code answers no longer stall the playground, and every routing decision now echoes the options it applied.',
    evidenceLinks: [pr(235)],
  },

  // ── Released ─────────────────────────────────────────────────────────
  released('0.21.0', {
    id: 'routing-decisions-explorer',
    title: 'Routing decisions explorer and router health',
    area: 'admin',
    description:
      'The admin app lists every auto-routing decision with filters for time, tier, mode, model, outcome, cost and flags, and opens any one in the shared routing inspector with what happened next. The Routing page adds router health: reward and counterfactual-savings trends, learned arm statistics, model activation and gold-label coverage.',
    evidenceLinks: [pr(246)],
  }),
  released('0.21.0', {
    id: 'admin-design-refresh',
    title: 'Admin app design refresh',
    area: 'admin',
    description:
      'The admin app now uses the shared Aura look in light and dark mode, works on phones, and explains failed requests with a retry instead of showing empty pages. The request-volume chart now reads correctly at low traffic.',
    evidenceLinks: [pr(247)],
  }),
  released('0.21.0', {
    id: 'landing-redesign',
    title: 'Product-led landing page',
    area: 'site',
    description:
      'aura-llm.dev now leads with the admin app and the playground, includes an interactive walkthrough of the auto router, and comes in light and dark themes.',
    evidenceLinks: [pr(248)],
  }),
  released('0.21.0', {
    id: 'brand-identity',
    title: 'New brand identity',
    area: 'site',
    description: 'A new mark, wordmark and favicon family, used across the landing page, playground and admin app.',
    evidenceLinks: [pr(248)],
  }),
  released('0.21.0', {
    id: 'routing-inspector-shared',
    title: 'Routing inspector in playground and admin',
    area: 'routing',
    description:
      'One shared inspector shows the model that actually answered, whether a decision was applied or only shadowed, the tiers, the constraints in force and every candidate considered.',
    evidenceLinks: [pr(248)],
  }),
  released('0.21.0', {
    id: 'docs-entry-roadmap',
    title: 'Docs entry paths and reconciled roadmap',
    area: 'docs',
    description:
      'The docs open with Start, Route, Operate and Reference paths into the existing guides. This roadmap is now checked against the changelog, separates merged work from releases and links every shipped item to evidence.',
    evidenceLinks: [pr(248)],
  }),
  released('0.21.0', {
    id: 'pricing-estimator',
    title: 'Pricing estimator and model comparison',
    area: 'pricing',
    description:
      'Estimate the cost of a workload, compare up to three models side by side and filter by capability on the public pricing page, with all existing currencies kept.',
    evidenceLinks: [pr(248)],
  }),
  released('0.21.0', {
    id: 'prompt-caching',
    title: 'Provider prompt caching, billed correctly',
    area: 'gateway',
    description:
      'The stable part of each prompt is marked cacheable for Anthropic and Bedrock and sent with a stable cache key to OpenAI. Cache hits from supported providers are reported as cached tokens, billed at the cached rate, counted in metrics and shown in the playground.',
    evidenceLinks: [pr(243)],
  }),
  released('0.21.0', {
    id: 'routing-lab',
    title: 'Routing lab in the admin app',
    area: 'admin',
    description:
      'Battle-test the auto router before trusting it: run preset or pasted prompt suites through auto, auto:cost and auto:quality next to a pinned model, free as a dry run or live with a spend guard, and compare tiers, candidates, predicted and actual cost, latency and answers. Live runs are admin-only, audited and kept out of routing statistics.',
    evidenceLinks: [pr(244)],
  }),
  released('0.21.0', {
    id: 'github-stars',
    title: 'GitHub star count on the landing page',
    area: 'site',
    description: 'The landing page shows the repository’s live star count, served from an hourly edge-cached endpoint.',
    evidenceLinks: [pr(242)],
  }),
  released('0.20.0', {
    id: 'live-settings',
    title: 'Live gateway settings in the admin app',
    area: 'admin',
    description:
      'The Settings page edits real configuration: auto routing, its mode, classifier and tier lists, payload capture, tool-context replay, caching and rate-limit defaults. Changes persist in Postgres and apply without a redeploy; environment-only settings are shown read-only.',
    evidenceLinks: [pr(234)],
  }),
  released('0.20.0', {
    id: 'synthetic-traces',
    title: 'Synthetic training traces for the router',
    area: 'routing',
    description:
      'Generate labelled training traffic with a cheap model, label it against the tier ladder and ingest it separately from real traffic, so the learned router can be trained before production traffic exists.',
    evidenceLinks: [pr(231)],
  }),
  released('0.20.0', {
    id: 'catalog-oct-2',
    title: 'October 2026 model catalog, part two',
    area: 'models',
    description:
      'More Anthropic models and a new Gemini model with seed pricing, SDK constants and playground entries; two older Gemini Flash models are marked legacy in the docs.',
    evidenceLinks: [pr(237)],
  }),
  released('0.19.0', {
    id: 'catalog-oct-1',
    title: 'October 2026 model catalog refresh',
    area: 'models',
    description: 'New OpenAI and Anthropic models, routable through the gateway with seed pricing, SDK constants and playground entries.',
    evidenceLinks: [pr(236)],
  }),
  released('0.18.0', {
    id: 'auto-routing',
    title: 'Auto model routing',
    area: 'routing',
    description:
      'Send model "auto" and the gateway scores the request’s complexity, maps it to a tier and picks the cheapest capable model in it. auto:cost and auto:quality shift the balance, organizations can set limits, every response explains the decision, and pinned-model traffic can be shadow-scored.',
    evidenceLinks: [pr(217), pr(218), pr(219), pr(220)],
  }),
  released('0.18.0', {
    id: 'router-learning',
    title: 'Auto router learns from your traffic',
    area: 'routing',
    description:
      'Outcome signals from retries, corrections and feedback score each decision; Thompson sampling, an optional LLM classifier with gold-label collection, and a learned tier classifier are trained from the gateway’s own logs.',
    evidenceLinks: [pr(221), pr(222), pr(223)],
  }),
  released('0.18.0', {
    id: 'cost-model-budgets',
    title: 'Predicted-cost ranking and per-request budgets',
    area: 'routing',
    description:
      'A learned cost model predicts what each candidate would cost for this request, ranks candidates by it and honours a per-request max_cost_usd. This is routing guidance, not a hard spending cap.',
    evidenceLinks: [pr(225)],
  }),
  released('0.18.0', {
    id: 'escalation',
    title: 'Escalation after provider failures',
    area: 'routing',
    description: 'Auto-routed requests that fail before any output retry on the next eligible model, with a per-model circuit breaker.',
    evidenceLinks: [pr(224)],
  }),
  released('0.18.0', {
    id: 'routing-inspector-playground',
    title: 'Routing inspector in the playground',
    area: 'playground',
    description: 'Each auto-routed answer shows its tier, score, signals, candidates with predicted cost and the reason it was picked, plus public auto-routing docs.',
    evidenceLinks: [pr(226)],
  }),
  released('0.18.0', {
    id: 'sdk-feedback',
    title: 'SDK validation metadata and feedback',
    area: 'sdks',
    description: 'The SDKs expose validation results and a feedback resource for thumbs up/down on responses.',
    evidenceLinks: [pr(216)],
  }),
  released('0.17.0', {
    id: 'catalog-sep',
    title: 'September 2026 model catalog refresh',
    area: 'models',
    description: 'New OpenAI, Anthropic and Gemini models, routable through the gateway with seed pricing, SDK constants and playground entries.',
    evidenceLinks: [pr(227)],
  }),
  released('0.16.0', {
    id: 'fireworks',
    title: 'Fireworks AI provider',
    area: 'providers',
    description: 'An OpenAI-compatible adapter for Fireworks’ serverless open-weight catalog, plus a KnownModels catalog in the SDKs.',
    evidenceLinks: [pr(212)],
    issueRefs: ['#209'],
  }),
  released('0.16.0', {
    id: 'typescript-sdk',
    title: 'TypeScript SDK',
    area: 'sdks',
    description: 'aura-llm on npm: universal fetch, AsyncIterable streaming and typed errors, matching the Python SDK.',
    evidenceLinks: [pr(211)],
    issueRefs: ['#148'],
  }),
  released('0.16.0', {
    id: 'pricing-page',
    title: 'Public pricing page with weekly price scraping',
    area: 'pricing',
    description:
      'aura-llm.dev/pricing shows prices scraped weekly from each provider’s own pricing page into a versioned price history, with batch-tier prices, filters and per-model detail.',
    evidenceLinks: [pr(210)],
    issueRefs: ['#123'],
  }),
  released('0.15.0', {
    id: 'end-user-fields',
    title: 'Editable end-user fields',
    area: 'admin',
    description: 'external_id and metadata on end users can be edited from the admin app.',
    evidenceLinks: [pr(196)],
  }),
  released('0.15.0', {
    id: 'payload-capture',
    title: 'Harness payload capture',
    area: 'observability',
    description: 'Optional per-organization capture of full requests and responses, shown inline on the harness trace.',
    evidenceLinks: [pr(197)],
  }),
  released('0.14.2', {
    id: 'admin-surfaces',
    title: 'Organization detail page and admin drill-downs',
    area: 'admin',
    description: 'An organization detail page with team, key and cost breakdowns, heatmap drill-down, request-log deep links and a features page.',
    evidenceLinks: [pr(190)],
  }),
  released('0.14.0', {
    id: 'harness-timeline',
    title: 'Harness timeline events and tool drill-down',
    area: 'observability',
    description: 'Compression, validation and consistency events in the harness timeline, and a per-tool drill-down drawer.',
    evidenceLinks: [changelogLink('0.14.0', '2026-05-25')],
  }),

  // ── Planned (no dates) ───────────────────────────────────────────────
  {
    id: 'webhooks',
    title: 'Webhook callbacks for async completion',
    status: 'planned',
    area: 'gateway',
    description: 'Notify a URL when a long-running response finishes instead of holding a connection open.',
    evidenceLinks: [],
  },
  {
    id: 'key-rotation',
    title: 'API key rotation',
    status: 'planned',
    area: 'security',
    description: 'Rotate gateway API keys without downtime for the clients that use them.',
    evidenceLinks: [],
  },
  {
    id: 'ip-allowlist',
    title: 'IP allowlisting',
    status: 'planned',
    area: 'security',
    description: 'Restrict which networks may use a key or organization.',
    evidenceLinks: [],
  },
  {
    id: 'audit-logs',
    title: 'Audit logs',
    status: 'planned',
    area: 'security',
    description: 'A record of administrative changes: who changed which key, organization or setting, and when.',
    evidenceLinks: [],
  },
  {
    id: 'active-active',
    title: 'Active-active deployment',
    status: 'planned',
    area: 'gateway',
    description: 'Run several gateway regions at once with shared state.',
    evidenceLinks: [],
  },

  // ── Proposed priorities from the design review (no dates) ───────────
  {
    id: 'decision-trust',
    title: 'Make routing decisions easy to trust',
    status: 'considering',
    proposal: true,
    area: 'routing',
    description:
      'Keep one consistent decision inspector everywhere, publish rollout evidence, and always report applied results separately from shadow estimates.',
    evidenceLinks: [],
  },
  {
    id: 'information-freshness',
    title: 'Keep public information current',
    status: 'considering',
    proposal: true,
    area: 'docs',
    description:
      'Generate release history from the changelog, keep a single canonical source for each doc, and show where every price comes from and how fresh it is.',
    evidenceLinks: [],
  },
  {
    id: 'v1-readiness',
    title: 'Define what v1 means',
    status: 'considering',
    proposal: true,
    area: 'gateway',
    description:
      'Publish measurable compatibility, recovery and deployment criteria for a 1.0 release. An uptime target needs a defined service and operator, so none is promised here.',
    evidenceLinks: [],
  },
  {
    id: 'hard-budgets',
    title: 'Evaluate hard budgets per key or user',
    status: 'considering',
    proposal: true,
    area: 'gateway',
    description:
      'Spending caps that actually block requests, designed separately from today’s predicted-cost routing, with clear reservation, accounting and concurrency rules before any cap is promised.',
    evidenceLinks: [],
  },

  // ── Under consideration (no dates) ───────────────────────────────────
  {
    id: 'otel-tracing',
    title: 'Distributed tracing',
    status: 'considering',
    area: 'observability',
    description: 'OpenTelemetry spans from the client request through routing to the provider call.',
    evidenceLinks: [],
  },
  {
    id: 'ab-splitting',
    title: 'A/B traffic splitting between models',
    status: 'considering',
    area: 'routing',
    description: 'Send a fixed share of traffic to a candidate model and compare outcomes.',
    evidenceLinks: [],
  },
  {
    id: 'semantic-cache',
    title: 'Semantic caching',
    status: 'considering',
    area: 'gateway',
    description: 'Serve near-duplicate prompts from a vector-based cache.',
    evidenceLinks: [],
  },
  {
    id: 'batch-api',
    title: 'Batch processing API',
    status: 'considering',
    area: 'gateway',
    description: 'Submit large jobs at providers’ batch prices.',
    evidenceLinks: [],
  },
  {
    id: 'framework-packages',
    title: 'Dedicated LangChain and LlamaIndex packages',
    status: 'considering',
    area: 'sdks',
    description: 'Both already work through OpenAI-compatible clients (see the existing-SDKs guide); dedicated packages are under consideration.',
    evidenceLinks: [],
  },
  {
    id: 'more-providers',
    title: 'More providers',
    status: 'considering',
    area: 'providers',
    description: 'Cohere, Azure OpenAI and Replicate.',
    evidenceLinks: [],
  },
]

/**
 * Milestones before v0.14, kept as an archive. Each row summarises one
 * minor line; `changelogVersion`/`releasedAt` name its first CHANGELOG entry.
 */
export interface LegacyMilestone {
  version: string
  changelogVersion: string
  releasedAt: string
  title: string
  subtitle: string
  items: { label: string; note?: string }[]
  issueRefs?: string[]
}

export const LEGACY_MILESTONES: LegacyMilestone[] = [
  {
    version: 'v0.13',
    changelogVersion: '0.13.0',
    releasedAt: '2026-05-25',
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
    version: 'v0.12',
    changelogVersion: '0.12.0',
    releasedAt: '2026-05-24',
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
    version: 'v0.11',
    changelogVersion: '0.11.0',
    releasedAt: '2026-05-24',
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
    version: 'v0.10',
    changelogVersion: '0.10.0',
    releasedAt: '2026-05-23',
    title: 'Admin polish & content audit',
    subtitle: 'Editorial redesign, admin app, design-audit cleanup',
    items: [
      { label: 'Admin dashboard at app.aura-llm.dev' },
      { label: 'Editorial redesign across landing/docs/roadmap/admin/chat' },
      { label: 'Validation strategies wired end-to-end', note: '#155' },
      { label: 'Together AI provider', note: 'open-weight models; was listed as a future provider until this reconciliation' },
    ],
    issueRefs: ['#155'],
  },
  {
    version: 'v0.9',
    changelogVersion: '0.9.0',
    releasedAt: '2026-05-20',
    title: 'Playground stability',
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
    version: 'v0.8',
    changelogVersion: '0.8.0',
    releasedAt: '2026-05-18',
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
    version: 'v0.7',
    changelogVersion: '0.7.0',
    releasedAt: '2026-05-18',
    title: 'Per-user scoping',
    subtitle: 'API key ownership and CI hardening',
    items: [
      { label: 'API key routes scoped to authenticated user' },
      { label: 'Version-preview workflow skips fork PRs' },
      { label: 'Python SDK version sync hook' },
    ],
  },
  {
    version: 'v0.6',
    changelogVersion: '0.6.0',
    releasedAt: '2026-05-18',
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
    version: 'v0.5',
    changelogVersion: '0.5.0',
    releasedAt: '2026-05-17',
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
    version: 'v0.4',
    changelogVersion: '0.4.0',
    releasedAt: '2026-05-17',
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
    version: 'v0.3',
    changelogVersion: '0.3.0',
    releasedAt: '2026-02-03',
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
    version: 'v0.2',
    changelogVersion: '0.2.0',
    releasedAt: '2026-01-23',
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
    version: 'v0.1',
    changelogVersion: '0.1.2',
    releasedAt: '2026-01-21',
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
]

export const LATEST_RELEASE = RELEASES[0]

export type StatusFilter = 'all' | 'released' | 'merged' | 'proposed'

export function matchesFilter(item: RoadmapItem, filter: StatusFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'released':
      return item.status === 'released'
    case 'merged':
      return item.status === 'merged-unreleased'
    case 'proposed':
      return item.status === 'in-progress' || item.status === 'planned' || item.status === 'considering'
  }
}

export const STATUS_LABEL: Record<RoadmapStatus, string> = {
  released: 'Released',
  'merged-unreleased': 'Merged, unreleased',
  'in-progress': 'In progress',
  planned: 'Planned',
  considering: 'Considering',
}

/** "2026-10-22" -> "22 Oct 2026", without time-zone surprises. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[m - 1]} ${y}`
}

export function formatMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[m - 1]} ${y}`
}
