/**
 * Vercel serverless catch-all for /api/auth/*.
 *
 * Routes every auth request (sign-in initiation, GitHub callback, session
 * lookup, sign-out) to better-auth's request handler. better-auth handles
 * the OAuth dance, sets HTTP-only secure cookies, and writes to the
 * playground_auth schema on Fly Postgres.
 *
 * URLs handled (configured by better-auth):
 *   POST /api/auth/sign-in/social        — start GitHub OAuth flow
 *   GET  /api/auth/callback/github       — OAuth callback from GitHub
 *   GET  /api/auth/session               — current session info
 *   POST /api/auth/sign-out              — clear session
 *
 * The [...all].ts naming is Vercel's "catch-all rest segment" convention —
 * every URL under /api/auth/ maps to this single file.
 */

import { auth } from '../../apps/chat/src/lib/auth'
import { mintPlaygroundApiKey } from '../_lib/mint-key'

// Vercel's Node.js runtime gives us a Web-API-style Request/Response.
// better-auth's handler is built for the same shape — direct passthrough.
export default async function handler(req: Request): Promise<Response> {
  const response = await auth.handler(req)

  // On a successful sign-in callback, ensure the user has a gateway API key.
  // We hook here (after the callback has run) rather than as a better-auth
  // lifecycle event because the lifecycle hooks ship per-request in
  // serverless environments and we want this to be idempotent + safe to retry.
  const url = new URL(req.url)
  if (url.pathname === '/api/auth/callback/github' && response.status < 400) {
    // Don't block the response on the mint — fire-and-forget. If it fails,
    // the first /api/proxy call will retry.
    void mintPlaygroundApiKey(req).catch((err) => {
      console.error('[auth] mintPlaygroundApiKey failed (non-fatal):', err)
    })
  }

  return response
}

// Runs on Vercel's default Node.js runtime (@vercel/node). The explicit
// `config.runtime` export was removed because Vercel deprecated that key
// — Node is the default for /api/*.ts handlers under @vercel/node@5.
// better-auth depends on `pg`, which only works on Node, not Edge.
