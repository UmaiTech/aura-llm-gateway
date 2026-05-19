/**
 * better-auth configuration for the playground (server-only).
 *
 * Lives under /api/_lib/ — outside apps/chat/ — because apps/chat's
 * package.json declares `"type": "module"`. Vercel's @vercel/node
 * compiles .ts to CJS (`exports.foo = ...`), which Node refuses to
 * load from an ESM-typed package. Putting this file under the repo-root
 * /api/ tree keeps it in the implicit CJS scope of the root
 * package.json (no `type: module` there).
 *
 * Imported by:
 *   - api/auth/[...all].ts  — the Vercel serverless function that
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
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 4,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
})

// Force every new pg connection to use the `playground_auth` schema as
// the default search_path. better-auth's Kysely query builder issues
// unqualified table names like `SELECT * FROM "user"` — without this,
// those resolve to `public.user` (which doesn't exist) and fail.
//
// Doing this here, on connect, is cheaper than wrapping every model
// name with a schema prefix via better-auth's per-model config (which
// also broke between 1.3 and 1.6).
pool.on('connect', (client) => {
  // search_path must include `public` as a fallback for built-in types
  // and any cross-schema references better-auth might make.
  void client.query('SET search_path TO playground_auth, public')
})

export const auth = betterAuth({
  baseURL,
  secret: betterAuthSecret,

  // better-auth 1.6 accepts a raw `pg.Pool` here and auto-wraps it in
  // a Kysely Postgres dialect internally. The old 1.3-era shape we had
  // — `{ type: 'postgres', pool, schema: 'playground_auth' }` —
  // silently rejected during adapter init in 1.6 and surfaced as
  // "Failed to initialize database adapter" 504s.
  //
  // Note: 1.6 has no per-config schema option. We pin the schema by
  // setting `search_path` on every pool connection (above).
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
  trustedOrigins: (request?: Request) => {
    const staticOrigins = [
      'https://playground.aura-llm.dev',
      'https://aura-llm.dev',
      'http://localhost:3000',
    ]
    const origin = request?.headers.get('origin')
    if (origin && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
      return [...staticOrigins, origin]
    }
    return staticOrigins
  },
})

// Re-export the pool so other server-side modules (the proxy, the per-user
// API key minting hook) can share connections without re-instantiating.
export { pool }
