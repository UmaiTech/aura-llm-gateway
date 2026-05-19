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

import { auth } from '../_lib/auth'
import { mintPlaygroundApiKey } from '../_lib/mint-key'
import { normalizeRequest } from '../_lib/normalize-request'

// Vercel's Node.js runtime hands us a Web-API-style Request, but
// `req.url` is the relative path (`/api/auth/get-session?path=...`)
// rather than an absolute URL. better-auth/better-call calls
// `new URL(req.url)` internally, which throws `Invalid URL` on a
// relative path. We rebuild a proper absolute Request before
// forwarding.
//
// We also strip the spurious `?path=...` query param that Vercel's
// `:path*` rewrite (vercel.json) tacks onto every request. Leaving
// it confuses better-auth's route matcher.
export default async function handler(req: Request): Promise<Response> {
  try {
    const absoluteReq = normalizeRequest(req)
    const response = await auth.handler(absoluteReq)

    // On a successful sign-in callback, ensure the user has a gateway API key.
    // We hook here (after the callback has run) rather than as a better-auth
    // lifecycle event because the lifecycle hooks ship per-request in
    // serverless environments and we want this to be idempotent + safe to retry.
    const url = new URL(absoluteReq.url)
    if (url.pathname === '/api/auth/callback/github' && response.status < 400) {
      // Don't block the response on the mint — fire-and-forget. If it fails,
      // the first /api/proxy call will retry.
      void mintPlaygroundApiKey(absoluteReq).catch((err) => {
        console.error('[auth] mintPlaygroundApiKey failed (non-fatal):', err)
      })
    }

    return response
  } catch (err) {
    // Without this, any throw inside auth.handler surfaces to Vercel as
    // an opaque FUNCTION_INVOCATION_FAILED 500 with no body — making
    // debugging effectively blind. Log the full error to Vercel
    // function logs (visible in the dashboard) and return a non-leaky
    // 500. Stack details stay server-side.
    console.error('[auth] handler crashed:', err)
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({
        error: 'auth_handler_error',
        message: message.slice(0, 200),
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      },
    )
  }
}

// Runs on Vercel's default Node.js runtime (@vercel/node). The explicit
// `config.runtime` export was removed because Vercel deprecated that key
// — Node is the default for /api/*.ts handlers under @vercel/node@5.
// better-auth depends on `pg`, which only works on Node, not Edge.
