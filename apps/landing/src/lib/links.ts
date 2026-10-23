/**
 * Deployed entry points for the product surfaces. The landing links into
 * the real apps (their own auth applies); it never calls them.
 */
export const LINKS = {
  playground: 'https://playground.aura-llm.dev/chat',
  admin: 'https://app.aura-llm.dev/',
  adminRequestLogs: 'https://app.aura-llm.dev/dev-logs',
  docs: '/docs',
  quickstart: '/docs/quickstart',
  autoRoutingDocs: '/docs/api/auto-routing',
  selfHost: '/docs/deployment',
  pricing: '/pricing',
  roadmap: '/roadmap',
  github: 'https://github.com/UmaiTech/aura-llm-gateway',
} as const

export interface PlaygroundSample {
  /** A model id or auto alias, e.g. `auto:cost`. */
  model?: string
  /** Prefilled into the composer; the visitor still presses send. */
  prompt?: string
  /** Open this inspector tab on the first response. */
  inspect?: 'routing'
}

/**
 * Link that opens the playground with a prefilled draft. The playground
 * reads these once, drops them from the URL, and never sends on its own,
 * so the request goes through the visitor's own sign-in and quota.
 */
export function playgroundSampleUrl(sample: PlaygroundSample): string {
  const params = new URLSearchParams()
  if (sample.model) params.set('model', sample.model)
  if (sample.prompt) params.set('prompt', sample.prompt)
  if (sample.inspect) params.set('inspect', sample.inspect)
  const query = params.toString()
  return query ? `${LINKS.playground}?${query}` : LINKS.playground
}
