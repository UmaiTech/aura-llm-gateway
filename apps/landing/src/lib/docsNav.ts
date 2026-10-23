/**
 * Docs navigation data: the sidebar tree, the task-oriented entry paths on
 * the docs index, and helpers that map a docs route to its content file.
 *
 * Pure data and functions (no React) so `docsNav.test.ts` can check that
 * every internal link resolves to a file under src/content and that every
 * `#anchor` matches a heading in that file.
 */

export const REPO_URL = 'https://github.com/UmaiTech/aura-llm-gateway'
/** Content files live here, relative to the repository root. */
export const CONTENT_DIR = 'apps/landing/src/content'

export interface DocNavItem {
  title: string
  path: string
  /** Opens outside the docs (another site). */
  external?: boolean
  /** A page of the site outside the docs content tree (e.g. /roadmap). */
  standalone?: boolean
}

export interface DocNavSection {
  title: string
  items: DocNavItem[]
}

export const DOC_SECTIONS: DocNavSection[] = [
  {
    title: 'Getting started',
    items: [
      { title: 'Introduction', path: '/docs' },
      { title: 'Quickstart', path: '/docs/quickstart' },
      { title: 'Configuration', path: '/docs/configuration' },
      { title: 'Deployment', path: '/docs/deployment' },
    ],
  },
  {
    title: 'API reference',
    items: [
      { title: 'Overview', path: '/docs/api' },
      { title: 'Swagger UI', path: 'https://api.aura-llm.dev/swagger-ui/', external: true },
      { title: 'Authentication', path: '/docs/api/authentication' },
      { title: 'Create Response', path: '/docs/api/create-response' },
      { title: 'Conversations', path: '/docs/api/conversations' },
      { title: 'Streaming', path: '/docs/api/streaming' },
      { title: 'Tool Roundtrips', path: '/docs/api/tool-roundtrips' },
      { title: 'Cost Tracking', path: '/docs/api/cost-tracking' },
      { title: 'Rate Limiting', path: '/docs/api/rate-limiting' },
      { title: 'Smart Routing', path: '/docs/api/routing' },
      { title: 'Auto Model Routing', path: '/docs/api/auto-routing' },
      { title: 'Prompt Compression', path: '/docs/api/compression' },
      { title: 'Response Validation', path: '/docs/api/validation' },
      { title: 'Response Consistency', path: '/docs/api/consistency' },
      { title: 'Response Caching', path: '/docs/api/caching' },
      { title: 'Prometheus Metrics', path: '/docs/api/metrics' },
      { title: 'Error Reference', path: '/docs/api/errors' },
      { title: 'Admin API', path: '/docs/api/admin' },
      { title: 'Changelog', path: '/docs/api/changelog' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { title: 'Using Existing SDKs', path: '/docs/guides/existing-sdks' },
      { title: 'Tool Calling', path: '/docs/guides/tool-calling' },
      { title: 'Testing & Sandbox', path: '/docs/guides/testing' },
      { title: 'Migration Guide', path: '/docs/guides/migration' },
    ],
  },
  {
    title: 'SDKs',
    items: [
      { title: 'Python', path: '/docs/sdks/python' },
      { title: 'TypeScript', path: '/docs/sdks/typescript' },
    ],
  },
  {
    title: 'Multi-tenancy',
    items: [
      { title: 'Organizations & End-Users', path: '/docs/organizations' },
      { title: 'Provider Credentials', path: '/docs/credentials' },
    ],
  },
  {
    title: 'Architecture',
    items: [{ title: 'Overview', path: '/docs/architecture' }],
  },
  {
    title: 'Providers',
    items: [
      { title: 'OpenAI', path: '/docs/providers/openai' },
      { title: 'Anthropic', path: '/docs/providers/anthropic' },
      { title: 'Google', path: '/docs/providers/google' },
      { title: 'Mistral', path: '/docs/providers/mistral' },
      { title: 'Together AI', path: '/docs/providers/together' },
      { title: 'Ollama', path: '/docs/providers/ollama' },
      { title: 'HuggingFace', path: '/docs/providers/huggingface' },
      { title: 'AWS Bedrock', path: '/docs/providers/bedrock' },
    ],
  },
  {
    title: 'Concepts',
    items: [{ title: 'Open Responses API', path: '/docs/concepts/open-responses' }],
  },
  {
    title: 'Project',
    items: [{ title: 'Roadmap', path: '/roadmap', standalone: true }],
  },
]

export interface EntryLink {
  label: string
  /** Docs route, optionally with a `#heading` anchor. */
  href: string
}

export interface EntryPath {
  id: string
  title: string
  summary: string
  links: EntryLink[]
}

/**
 * Task-oriented ways into the existing docs (design pack "Recommended
 * navigation"). Only pages that exist are linked; docsNav.test.ts enforces
 * that, anchors included.
 */
export const ENTRY_PATHS: EntryPath[] = [
  {
    id: 'start',
    title: 'Start',
    summary: 'Run the gateway, add a provider key and send a first request.',
    links: [
      { label: 'Quickstart', href: '/docs/quickstart' },
      { label: 'Provider API keys', href: '/docs/configuration#provider-api-keys' },
      { label: 'Authentication', href: '/docs/api/authentication' },
      { label: 'Create a response', href: '/docs/api/create-response' },
      { label: 'Streaming', href: '/docs/api/streaming' },
      { label: 'Use an existing SDK', href: '/docs/guides/existing-sdks' },
    ],
  },
  {
    id: 'route',
    title: 'Route',
    summary: 'Let the gateway choose a model, constrain it and read why it chose.',
    links: [
      { label: 'Auto model routing', href: '/docs/api/auto-routing' },
      { label: 'Tiers', href: '/docs/api/auto-routing#tiers' },
      { label: 'Modes and options', href: '/docs/api/auto-routing#modes-and-options' },
      { label: 'Reading the decision', href: '/docs/api/auto-routing#reading-the-decision' },
      { label: 'Shadow mode', href: '/docs/api/auto-routing#shadow-mode' },
      { label: 'Routing strategies', href: '/docs/api/routing' },
    ],
  },
  {
    id: 'operate',
    title: 'Operate',
    summary: 'Run it in production: settings, tenants, limits, caching and metrics.',
    links: [
      { label: 'Deployment', href: '/docs/deployment' },
      { label: 'Runtime settings', href: '/docs/api/auto-routing#runtime-settings-from-the-admin-app' },
      { label: 'Organizations & end users', href: '/docs/organizations' },
      { label: 'Rate limiting', href: '/docs/api/rate-limiting' },
      { label: 'Response caching', href: '/docs/api/caching' },
      { label: 'Prometheus metrics', href: '/docs/api/metrics' },
    ],
  },
  {
    id: 'learn',
    title: 'Learn & evaluate',
    summary: 'Check answer quality and let the router learn from your own traffic.',
    links: [
      { label: 'Learning from your traffic', href: '/docs/api/auto-routing#learning-from-your-traffic' },
      { label: 'Response validation', href: '/docs/api/validation' },
      { label: 'Response consistency', href: '/docs/api/consistency' },
      { label: 'Testing & sandbox', href: '/docs/guides/testing' },
    ],
  },
  {
    id: 'reference',
    title: 'Reference',
    summary: 'Every endpoint, error code and SDK surface.',
    links: [
      { label: 'API overview', href: '/docs/api' },
      { label: 'Error reference', href: '/docs/api/errors' },
      { label: 'Admin API', href: '/docs/api/admin' },
      { label: 'Python SDK', href: '/docs/sdks/python' },
      { label: 'TypeScript SDK', href: '/docs/sdks/typescript' },
      { label: 'Configuration', href: '/docs/configuration' },
    ],
  },
]

/**
 * Some content has a canonical source elsewhere in the repository; the
 * docs copy is a public summary of it. docsSources.test.ts keeps the pair
 * from drifting.
 */
export const CANONICAL_SOURCES: Record<string, string> = {
  '/docs/api/auto-routing': 'docs/api/auto-routing.md',
}

/** Heading anchor id, GitHub style: "Modes and options" -> "modes-and-options". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
}

/** Docs route -> content slug relative to src/content (no extension). */
export function contentSlug(route: string): string | null {
  const path = route.split('#')[0]
  if (path === '/docs') return 'index'
  if (!path.startsWith('/docs/')) return null
  const rest = path.slice('/docs/'.length).replace(/\/$/, '')
  return rest
}

/** Glob key ("../content/api/x.md") -> docs route, as the docs page maps them. */
export function routeForContentFile(filePath: string): string {
  const match = filePath.match(/content\/(.+)\.(md|mdx)$/)
  if (!match) return ''
  const path = match[1]
  if (path === 'index') return '/docs'
  if (path.endsWith('/index')) return `/docs/${path.slice(0, -'/index'.length)}`
  return `/docs/${path}`
}

/** `## Heading` / `### Heading` texts of a markdown document, outside fences. */
export function markdownHeadings(markdown: string, levels: number[] = [2, 3]): string[] {
  const out: string[] = []
  let fenced = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (m && levels.includes(m[1].length)) out.push(m[2].replace(/`/g, ''))
  }
  return out
}
