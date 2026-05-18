/**
 * better-auth configuration for the playground.
 *
 * Imported by:
 *   - apps/chat/api/auth/[...all].ts  — the Vercel serverless function that
 *     handles every /api/auth/* request (sign-in, callback, sign-out, etc.)
 *   - apps/chat/api/proxy/[...path].ts — the serverless proxy validates the
 *     session before forwarding LLM calls to api.aura-llm.dev
 *
 * NOT imported by the React client. The client uses better-auth/react via
 * a separate module (`./auth-client.ts`) so we never bundle the database
 * driver or the GitHub OAuth secret into the browser.
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

const pool = new Pool({
  connectionString: databaseUrl,
  // Vercel serverless functions are short-lived; keep the pool small to
  // avoid exhausting Postgres connections under burst traffic.
  max: 1,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
})

export const auth = betterAuth({
  baseURL,
  secret: betterAuthSecret,

  // Map better-auth's default table names to our `playground_auth` schema.
  // The Postgres adapter accepts a `schema` option on each model.
  database: {
    type: 'postgres',
    pool,
    schema: 'playground_auth',
  },

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

  trustedOrigins: [
    'https://playground.aura-llm.dev',
    'https://aura-llm.dev',
    'http://localhost:3000', // local dev
  ],
})

// Re-export the pool so other server-side modules (the proxy, the per-user
// API key minting hook) can share connections without re-instantiating.
export { pool }
