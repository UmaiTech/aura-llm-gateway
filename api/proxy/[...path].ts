/**
 * Vercel serverless proxy: /api/proxy/* → https://api.aura-llm.dev/*
 *
 * The chat frontend never sees a gateway API key. Instead it calls
 * /api/proxy/v1/responses (same-origin) with just the session cookie.
 * This function:
 *
 *   1. Validates the better-auth session cookie
 *   2. Looks up the authenticated user's gateway API key (server-side only)
 *   3. Forwards the request to api.aura-llm.dev with the correct Bearer token
 *   4. Streams the response back to the client, preserving SSE for /v1/responses
 *
 * This is the security boundary that makes the playground safe for public
 * use: an attacker who steals the session cookie can use a single user's
 * rate-limited quota, but never gets the underlying gateway key.
 */

import { auth } from '../_lib/auth'
import { getUserApiKey, mintPlaygroundApiKey } from '../_lib/mint-key'
import { normalizeRequest } from '../_lib/normalize-request'

const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL || 'https://api.aura-llm.dev'

export default async function handler(req: Request): Promise<Response> {
  // Vercel's @vercel/node@5 hands us a Request whose `url` is a path,
  // not an absolute URL — and the vercel.json `:path*` rewrite tacks
  // on a spurious `?path=...` query param. Rebuild a proper Request
  // before doing anything with it.
  req = normalizeRequest(req)

  // 1. Session check
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user?.id) {
    return jsonError(401, 'unauthorized', 'No active session. Sign in to use the playground.')
  }

  // 2. Per-user gateway key lookup (mints on first call if it's missing —
  // covers the edge case where the OAuth callback's fire-and-forget mint
  // failed).
  //
  // Concurrency note: two near-simultaneous proxy calls from the same user
  // can BOTH see a missing key and BOTH try to mint. The first one wins
  // (the INSERT succeeds); the second one's INSERT fails with a unique
  // constraint violation on (user_id). The losing call must re-fetch
  // because the winning call has now populated the row — it's NOT actually
  // a 500-worthy failure, just a benign race.
  //
  // Always re-fetch after a mint attempt (success OR failure) before
  // deciding whether to 500.
  let apiKey = await getUserApiKey(session.user.id)
  if (!apiKey) {
    try {
      await mintPlaygroundApiKey(req)
    } catch (err) {
      // Concurrent mint won the race, or some other DB error — either way,
      // fall through to the re-fetch and let the re-fetch decide.
      console.warn('[proxy] Mint attempt failed (may be benign race):', err)
    }
    apiKey = await getUserApiKey(session.user.id)
    if (!apiKey) {
      return jsonError(
        500,
        'mint_failed',
        'Could not provision a gateway API key for your account. Try signing out and in.',
      )
    }
  }

  // 3. Build the upstream URL: strip /api/proxy/ prefix, forward the rest.
  const url = new URL(req.url)
  const upstreamPath = url.pathname.replace(/^\/api\/proxy\/?/, '/') + url.search
  const upstreamUrl = `${GATEWAY_BASE_URL}${upstreamPath}`

  // 4. Forward headers — but rewrite Authorization to use the user's key.
  // Strip the session cookie so we don't leak it to the gateway.
  const headers = new Headers()
  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase()
    if (lower === 'cookie' || lower === 'authorization' || lower === 'host') {
      continue
    }
    headers.set(key, value)
  }
  headers.set('Authorization', `Bearer ${apiKey}`)

  // 5. Forward the request, including its body if any. For POST /v1/responses
  // with streaming, the gateway returns text/event-stream — we want to pipe
  // that through unchanged so the chat UI sees the same SSE format.
  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body:
        req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
      // Don't follow redirects automatically — let the client see them.
      redirect: 'manual',
    })
  } catch (err) {
    console.error('[proxy] Upstream fetch failed:', err)
    return jsonError(502, 'gateway_unreachable', 'Aura gateway is not reachable. Try again shortly.')
  }

  // 6. Stream the body back. Construct a new Response from the upstream
  // body stream + filtered headers (drop hop-by-hop headers).
  const responseHeaders = new Headers()
  for (const [key, value] of upstreamResponse.headers.entries()) {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lower)) continue
    responseHeaders.set(key, value)
  }
  // Pass through useful rate-limit headers so the UI can display remaining quota.
  // (Already included in the upstream copy above; here for documentation.)

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  })
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Headers that should not be forwarded back to the client per RFC 7230.
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

// Runs on Vercel's default Node.js runtime. Edge is not viable here:
// it has a 25s response cap that doesn't work for long LLM streams.
// The explicit `config.runtime` export was removed because Vercel
// deprecated that key — Node is the default for @vercel/node@5.
