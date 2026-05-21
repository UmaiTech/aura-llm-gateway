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
 * The reason this file is ESM at runtime (so it can import the ESM-only
 * `better-auth/node`) is the root tsconfig.json + package.json combo —
 * see ../_lib/auth.ts for the full rationale.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { toNodeHandler } from 'better-auth/node'
import { auth } from '../_lib/auth.js'
import { mintPlaygroundApiKey } from '../_lib/mint-key.js'

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
        // CRITICAL: req.headers has the OAuth state cookie (from the
        // pre-callback redirect), but NOT the session cookie — the
        // session cookie is what better-auth just set on the
        // response via `Set-Cookie`. Reading `req.headers` would make
        // getSession() return null and skip the mint silently.
        //
        // Build a synthetic header map that points at the session
        // cookie better-auth wrote on `res`. mint-key then resolves a
        // real session and proceeds to insert the user_api_key row.
        const headers = sessionHeadersFromResponse(req, res)
        void mintPlaygroundApiKey({ headers }).catch((err) => {
          console.error(
            '[auth] mintPlaygroundApiKey failed (non-fatal):',
            err,
          )
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

/**
 * Build a fake request-headers object whose `cookie` includes the
 * session cookie better-auth just wrote on the response. Used by the
 * post-callback mint hook because the inbound req.headers only have
 * the pre-callback OAuth state cookie, not the session cookie that
 * `auth.api.getSession` needs.
 */
function sessionHeadersFromResponse(
  req: IncomingMessage,
  res: ServerResponse,
): IncomingMessage['headers'] {
  // Pull every `Set-Cookie` value off the response. Node's getHeader
  // returns string | string[] | number — for set-cookie it's an array
  // when better-auth has set multiple, single string otherwise.
  const setCookie = res.getHeader('set-cookie')
  const setCookies = Array.isArray(setCookie)
    ? setCookie
    : setCookie != null
      ? [String(setCookie)]
      : []

  // Strip attributes (`; HttpOnly; Path=/...`) — only the `name=value`
  // pair belongs in a Cookie request header.
  const cookieParts = setCookies.map((line) => line.split(';')[0].trim())

  // Merge with whatever the client already sent on the request. The
  // original `cookie` header might carry unrelated cookies we want to
  // keep around (CSRF tokens, etc.).
  const existing = req.headers.cookie
  if (existing) cookieParts.unshift(existing)

  return {
    ...req.headers,
    cookie: cookieParts.filter(Boolean).join('; '),
  }
}

// Runs on Vercel's default Node.js runtime (@vercel/node). The
// explicit `config.runtime` export was removed because Vercel
// deprecated that key — Node is the default for /api/*.ts handlers
// under @vercel/node@5. better-auth depends on `pg`, which only
// works on Node, not Edge.
