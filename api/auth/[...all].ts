/**
 * Vercel serverless catch-all for /api/auth/*.
 *
 * Routes every auth request (sign-in initiation, GitHub callback,
 * session lookup, sign-out) to better-auth's Node handler. We use
 * `toNodeHandler` from `better-auth/node` because @vercel/node@5
 * passes us the Node-style (req, res) shape (IncomingMessage /
 * ServerResponse), NOT a Web Request/Response. Calling
 * `auth.handler(req)` directly throws on this shape — that's what
 * caused the chain of errors we've been chasing.
 *
 * URLs handled (configured by better-auth):
 *   POST /api/auth/sign-in/social        — start GitHub OAuth flow
 *   GET  /api/auth/callback/github       — OAuth callback from GitHub
 *   GET  /api/auth/get-session           — current session info
 *   POST /api/auth/sign-out              — clear session
 *
 * The [...all].ts naming is Vercel's "catch-all rest segment"
 * convention — every URL under /api/auth/ maps to this single file.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { toNodeHandler } from 'better-auth/node'
import { auth } from '../_lib/auth'
import { mintPlaygroundApiKey } from '../_lib/mint-key'

const authNodeHandler = toNodeHandler(auth)

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Side-effect: when the GitHub callback succeeds we want to mint a
  // gateway API key for the freshly-authenticated user. better-auth
  // doesn't expose a clean post-callback lifecycle hook in 1.6, so we
  // observe the response status by wrapping res.end. If the callback
  // returned a 2xx or 3xx (redirect to the chat after sign-in), kick
  // off the mint in the background.
  const isGithubCallback = req.url?.startsWith('/api/auth/callback/github')

  if (isGithubCallback) {
    const originalEnd = res.end.bind(res)
    // Cast to any because res.end has many overloads we don't care
    // about — we only need to peek at statusCode after the handler
    // finishes writing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.end = ((...args: unknown[]) => {
      const result = originalEnd(...(args as Parameters<typeof originalEnd>))
      // Fire-and-forget. If the mint fails, the first /api/proxy call
      // retries.
      if (res.statusCode >= 200 && res.statusCode < 400) {
        // Pass the raw headers along so mint-key can read the session
        // cookie better-auth just set.
        void mintPlaygroundApiKey({ headers: req.headers }).catch((err) => {
          console.error('[auth] mintPlaygroundApiKey failed (non-fatal):', err)
        })
      }
      return result
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  }

  try {
    await authNodeHandler(req, res)
  } catch (err) {
    // Without this, any throw inside auth.handler surfaces to Vercel
    // as an opaque FUNCTION_INVOCATION_FAILED 500 with no body. Log
    // the full error (visible in Vercel function logs) and write a
    // structured 500 to the response.
    console.error('[auth] handler crashed:', err)
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : String(err)
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          error: 'auth_handler_error',
          message: message.slice(0, 200),
        }),
      )
    }
  }
}

// Runs on Vercel's default Node.js runtime (@vercel/node). The
// explicit `config.runtime` export was removed because Vercel
// deprecated that key — Node is the default for /api/*.ts handlers
// under @vercel/node@5. better-auth depends on `pg`, which only
// works on Node, not Edge.
