/**
 * better-auth configuration for the playground (server-only).
 *
 * Lives under /api/_lib/ — outside apps/chat/. ESM emit is forced by
 * two settings working together:
 *   1. Root tsconfig.json sets `module: NodeNext` so @vercel/node@5's
 *      TypeScript pass emits real `import`/`export` syntax instead of
 *      CJS `exports.foo = ...`.
 *   2. Root package.json has `"type": "module"` so Node treats the
 *      emitted `.js` as ESM at runtime.
 * Both are required: without (1) the file is CJS code but loaded as
 * ESM (`ReferenceError: exports is not defined`); without (2) the file
 * is ESM-ish but loaded as CJS, which then can't `require()` the
 * ESM-only better-auth (`ERR_REQUIRE_ESM`).
 *
 * apps/chat / apps/landing / apps/admin each have their own package.json
 * and tsconfig.json, so their build pipelines are unaffected.
 *
 * Imported by:
 *   - api/auth/[...all].ts — the Vercel serverless function that
 *     handles every /api/auth/* request (sign-in, callback, sign-out, etc.)
 *   - api/proxy/[...path].ts — the serverless proxy validates the
 *     session before forwarding LLM calls to api.aura-llm.dev
 *   - api/_lib/mint-key.ts — writes the per-user gateway API key
 *
 * NOT imported by the React client. The client uses better-auth/react
 * via apps/chat/src/lib/auth-client.ts, which stays in the React app.
 */

import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

// Database URL points at the Fly Postgres (aura-llm-pg). The serverless
// function runs in Vercel's edge/Node runtime and connects out to Fly's
// public Postgres endpoint (NOT the .flycast internal hostname — that only
// works from inside Fly's network).
//
// To connect from Vercel: use the public connection string Fly exposes via
// `flyctl postgres connect --url` (form: postgres://postgres:<password>@<app>.fly.dev:5432
// or the dedicated proxy address).
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required for the playground auth backend. Set it in Vercel.',
  )
}

const githubClientId = process.env.GITHUB_CLIENT_ID
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET
if (!githubClientId || !githubClientSecret) {
  throw new Error(
    'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required for GitHub OAuth.',
  )
}

const betterAuthSecret = process.env.BETTER_AUTH_SECRET
if (!betterAuthSecret) {
  throw new Error(
    'BETTER_AUTH_SECRET is required. Generate one with: openssl rand -hex 32',
  )
}

// In production this is https://playground.aura-llm.dev. In Vercel preview
// deploys it's the per-deploy preview URL. Locally it's http://localhost:3000.
// better-auth needs this to construct correct redirect URLs.
const baseURL =
  process.env.BETTER_AUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

// Pool size sits above 1 because better-auth's adapter and our mint-key
// transaction can hold a connection simultaneously inside the same
// invocation — with max: 1 they deadlock waiting for each other. A pool
// of 4 leaves headroom without blowing past Fly Postgres's connection
// budget (default 100 across all clients). Each Vercel serverless
// invocation is short-lived, so idle connections drop off quickly.
//
// `ssl` must be set explicitly here. Fly Postgres requires TLS, but the
// `node-postgres` driver does NOT honor `sslmode=require` in the
// connection string the way libpq does — it only reads its own `ssl`
// option. Without this, the driver opens a plain-TCP connection, Fly
// rejects it mid-handshake, and the function hangs until
// `connectionTimeoutMillis` fires (every request, no logs). Setting
// `rejectUnauthorized: false` because Fly Postgres uses a self-signed
// cert by default — the connection is still TLS-encrypted, we just
// don't validate the cert chain. Acceptable here because the gateway
// runs in the same Fly org and we're only protecting bearer tokens
// in transit, not against MITM from inside Fly's network.
// Force every pg connection to use the `playground_auth` schema as
// the default search_path. better-auth's Kysely query builder issues
// unqualified table names like `INSERT INTO "user"` — without this,
// those resolve to `public.user` (which doesn't exist) and fail.
//
// We use Postgres's `options` startup parameter (delivered via the
// connection-string query `?options=-c+search_path=...`). Postgres
// evaluates this at the connection handshake, BEFORE the client can
// run any queries — so better-auth's first SELECT/INSERT lands in
// the right schema reliably.
//
// We tried `pool.on('connect')` + `SET search_path` first, but the
// listener is synchronous in node-postgres: the connection is handed
// back to the consumer before our SET resolves. better-auth then
// fires an INSERT against `public.user` (which doesn't exist),
// causing `Connection terminated unexpectedly`.
//
// `-c search_path=...` is the libpq option-flag equivalent of
// `SET search_path = ...`.
function withSearchPath(url: string): string {
  const parsed = new URL(url)
  const existing = parsed.searchParams.get('options') ?? ''
  const optionString =
    `${existing} -c search_path=playground_auth,public`.trim()
  parsed.searchParams.set('options', optionString)
  return parsed.toString()
}

const pool = new Pool({
  connectionString: withSearchPath(databaseUrl),
  ssl: { rejectUnauthorized: false },
  max: 4,
  idleTimeoutMillis: 5000,
  // Bumped from 5s → 15s after intermittent `Connection terminated
  // due to connection timeout` errors on cold Vercel function starts.
  // Fly Postgres handshake (public endpoint + TLS + auth) can take
  // 3-8s the first time a new function instance hits it. 5s left no
  // headroom for a momentary Fly machine cycle — which happens on
  // every gateway redeploy via release_command. 15s absorbs the
  // cycle without making real failures (unreachable Fly PG) much
  // slower; those fail on TCP connect long before this fires.
  connectionTimeoutMillis: 15000,
})

// Pull an Origin header value out of whatever better-auth happens to
// hand the `trustedOrigins` callback. In 1.6 we've observed three
// shapes: a real `Request`, a plain object with a `headers` map, and
// `undefined`. Calling `.headers.get('origin')` on the second one
// throws `headers.get is not a function`.
function extractOrigin(req: unknown): string | undefined {
  if (!req || typeof req !== 'object') return undefined
  const headers = (req as { headers?: unknown }).headers
  if (!headers) return undefined
  // Real Headers / fetch Request
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get('origin') ?? undefined
  }
  // Plain object (Node-style) — keys are usually lowercase already
  if (typeof headers === 'object') {
    const h = headers as Record<string, string | string[] | undefined>
    const raw = h.origin ?? h.Origin
    return Array.isArray(raw) ? raw[0] : raw
  }
  return undefined
}

export const auth = betterAuth({
  baseURL,
  secret: betterAuthSecret,

  // Pass the pg.Pool directly — better-auth 1.6 auto-wraps it in a
  // Kysely Postgres dialect with default camelCase column conventions
  // (`emailVerified`, `createdAt`, etc.). Our migration 017 renames
  // every playground_auth column to camelCase to match. Schema scoping
  // (playground_auth) is pinned via the `options=-c search_path=...`
  // URL param on the pool's connection string (above).
  database: pool,

  socialProviders: {
    github: {
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      // We only need basic profile info. Don't request public_repo / user:email
      // scopes — GitHub provides email implicitly via the /user/emails endpoint
      // for OAuth apps when the user has a public primary email.
      scope: ['read:user', 'user:email'],
    },
  },

  // Session settings: 30-day cookie, refreshed every hour while active.
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60, // 1 hour
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes — short enough that revocation is felt quickly
    },
  },

  // Disable email + password auth entirely. GitHub-only for now.
  emailAndPassword: { enabled: false },

  // Trusted origins: prod domains + local dev + Vercel preview deploys.
  // Vercel sets VERCEL_URL to the per-deploy hostname (e.g.
  // aura-llm-gateway-git-fix-foo-marcus-elwin-s-projects.vercel.app), but
  // since these URLs are dynamic we accept any *.vercel.app origin in
  // non-production environments. better-auth supports passing a function
  // that's invoked per-request for dynamic checks.
  //
  // The argument shape from better-auth 1.6 isn't always a full Request:
  // sometimes it's a Request-like with `headers` as a Headers instance,
  // sometimes as a plain `Record<string, string>`, sometimes undefined.
  // Read the origin defensively to avoid `headers.get is not a function`.
  trustedOrigins: (request?: unknown) => {
    const staticOrigins = [
      'https://playground.aura-llm.dev',
      'https://aura-llm.dev',
      'http://localhost:3000',
    ]
    const origin = extractOrigin(request)
    if (origin && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
      return [...staticOrigins, origin]
    }
    return staticOrigins
  },
})

// Re-export the pool so other server-side modules (the proxy, the per-user
// API key minting hook) can share connections without re-instantiating.
export { pool }
