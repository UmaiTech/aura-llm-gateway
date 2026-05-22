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
 * Why this file uses Node-style (req, res) instead of Web (Request)→Response:
 *
 *   The auth handler hit a series of breakage when we tried to return a Web
 *   `Response` from a function under @vercel/node@5 — the runtime's
 *   Web-Request shim was incomplete (relative req.url, plain-object headers),
 *   and streaming bodies hung. The same proxy used to "work" only because
 *   chats fitted in a single sync response. Once we look at long SSE
 *   streams, the Web-Response path stalls.
 *
 *   Node-style with explicit `res.write()` + `pipeline()` for the body
 *   stream maps directly to what @vercel/node ships under the hood (it's
 *   a thin wrapper around Node's http.IncomingMessage/ServerResponse), so
 *   there's no shim to misbehave.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../_lib/auth.js'
import { getUserApiKey, mintPlaygroundApiKey } from '../_lib/mint-key.js'

// Trim + strip trailing slash so accidental whitespace or a trailing
// `/` in the Vercel env var doesn't produce malformed URLs like
// ' https://api.aura-llm.dev  /v1/responses' which `fetch` rejects
// with `ERR_INVALID_URL`. The env var has been set by hand at least
// once with leading/trailing spaces — defensively cleaning the value
// here is cheaper than catching it at a future deploy.
const GATEWAY_BASE_URL = (
  process.env.GATEWAY_BASE_URL || 'https://api.aura-llm.dev'
)
  .trim()
  .replace(/\/+$/, '')

// Headers we MUST NOT forward back to the client per RFC 7230. Browsers
// also reject `transfer-encoding` on fetch responses.
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

// Headers we strip from the inbound request before forwarding upstream.
// `cookie` carries the session token and we don't want to leak it to
// the gateway. `authorization` will be replaced with the user's
// gateway API key. `host` must be the upstream host, not ours.
// `content-length` MUST be dropped because we re-serialize the JSON
// body to inject `user` (see step 5). Forwarding the inbound length
// against a re-serialized body of a different size produced the
// `gateway_unreachable` storm in May 2026 — undici truncated the
// write at the inbound length and Fly's edge RST'd the half-sent
// request, never reaching the aura-proxy app. fetch() computes the
// correct length from the body Buffer on its own.
const REQUEST_HEADERS_TO_DROP = new Set([
  'cookie',
  'authorization',
  'host',
  'content-length',
])

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    // 1. Session check via better-auth's Node-side helper.
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })
    if (!session?.user?.id) {
      return jsonError(
        res,
        401,
        'unauthorized',
        'No active session. Sign in to use the playground.',
      )
    }

    // 2. Per-user gateway key lookup. Mints on first call if missing —
    // covers the case where the OAuth callback's fire-and-forget mint
    // failed or hadn't completed by the time the user hit Send.
    //
    // Concurrency note: two near-simultaneous proxy calls from the
    // same user can BOTH see a missing key and BOTH try to mint. The
    // first one wins (the INSERT succeeds); the second one's INSERT
    // hits ON CONFLICT DO NOTHING. Either way, the re-fetch below
    // returns the winning row.
    let apiKey = await getUserApiKey(session.user.id)
    if (!apiKey) {
      try {
        await mintPlaygroundApiKey({ headers: req.headers })
      } catch (err) {
        console.warn(
          '[proxy] Mint attempt failed (may be benign race):',
          err,
        )
      }
      apiKey = await getUserApiKey(session.user.id)
      if (!apiKey) {
        return jsonError(
          res,
          500,
          'mint_failed',
          'Could not provision a gateway API key for your account. Try signing out and in.',
        )
      }
    }

    // 3. Build the upstream URL: strip /api/proxy/ prefix, forward
    // the rest. The vercel.json `:path*` rewrite tacks on a spurious
    // `?path=...` param — drop it.
    const incomingUrl = req.url ?? '/'
    const parsed = new URL(incomingUrl, 'http://placeholder')
    parsed.searchParams.delete('path')
    const upstreamPath =
      parsed.pathname.replace(/^\/api\/proxy\/?/, '/') + parsed.search
    const upstreamUrl = `${GATEWAY_BASE_URL}${upstreamPath}`

    // 4. Forward headers — drop hop-by-hop / session / host, then
    // override Authorization with the user's gateway key.
    const upstreamHeaders = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue
      const lower = key.toLowerCase()
      if (REQUEST_HEADERS_TO_DROP.has(lower)) continue
      if (HOP_BY_HOP_HEADERS.has(lower)) continue
      if (Array.isArray(value)) {
        for (const v of value) upstreamHeaders.append(key, v)
      } else {
        upstreamHeaders.set(key, value)
      }
    }
    upstreamHeaders.set('Authorization', `Bearer ${apiKey}`)

    // 5. Buffer the request body. For LLM chat completions the body is
    // a few KB of JSON; not worth streaming inbound. Outbound (SSE) is
    // what needs streaming, and we handle that below with pipeline().
    let body: Buffer | undefined
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await readBody(req)

      // Inject `user: <playground_user_id>` on /v1/responses calls so
      // the gateway creates an `end_users` row per playground user
      // under the Playground (Demo) org. Without this, every
      // playground request looks anonymous to the gateway and the
      // admin "End Users" view filtered to the Playground org stays
      // empty. We only do this for /v1/responses — other endpoints
      // (admin, organizations, etc.) don't accept a `user` field.
      //
      // Don't clobber an explicit `user` already on the body — if a
      // client passes one (e.g. a customer building on top of the
      // playground key), respect their value.
      if (upstreamPath.startsWith('/v1/responses') && body.length > 0) {
        try {
          const parsed = JSON.parse(body.toString('utf-8'))
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            typeof parsed.user !== 'string'
          ) {
            parsed.user = session.user.id
            body = Buffer.from(JSON.stringify(parsed), 'utf-8')
          }
        } catch (err) {
          // Body wasn't JSON — leave it alone. The gateway will
          // 400 the request itself if that's a real problem.
          console.warn('[proxy] Body not JSON; skipping user injection:', err)
        }
      }
    }

    // 6. Forward the request to the gateway.
    //
    // Stale-pooled-socket retry: Vercel Fluid Compute reuses function
    // instances and undici keeps a connection pool keyed by origin.
    // Fly's edge closes idle TCP connections after ~60-90s. The next
    // request can grab a half-closed socket from the pool — undici
    // throws `UND_ERR_SOCKET` with `bytesWritten: 0` because the FIN
    // arrived before our request bytes did. Nothing was sent upstream
    // so retrying once is idempotent regardless of HTTP method.
    let upstream: Response
    try {
      upstream = await fetchWithStaleSocketRetry(upstreamUrl, {
        method: req.method ?? 'GET',
        headers: upstreamHeaders,
        body,
        redirect: 'manual',
      })
    } catch (err) {
      console.error('[proxy] Upstream fetch failed:', err)
      return jsonError(
        res,
        502,
        'gateway_unreachable',
        'Aura gateway is not reachable. Try again shortly.',
      )
    }

    // 7. Write status + headers, then pipe the body. Hop-by-hop
    // headers are dropped on the way back too. We deliberately set
    // headers before calling pipeline() because pipeline() flushes
    // the first byte.
    res.statusCode = upstream.status
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase()
      if (HOP_BY_HOP_HEADERS.has(lower)) return
      res.setHeader(key, value)
    })

    if (!upstream.body) {
      res.end()
      return
    }

    // Convert the Web ReadableStream to a Node Readable, then pipe
    // into the ServerResponse. `pipeline` resolves when the upstream
    // closes its end of the SSE stream (or rejects on a socket
    // error). Either way, the response is ended for us.
    const nodeStream = Readable.fromWeb(
      upstream.body as Parameters<typeof Readable.fromWeb>[0],
    )
    await pipeline(nodeStream, res)
  } catch (err) {
    console.error('[proxy] handler crashed:', err)
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : String(err)
      jsonError(res, 500, 'proxy_error', message.slice(0, 200))
    } else {
      // Headers already flushed (probably mid-stream) — best we can do
      // is close the connection so the client sees the stream end.
      res.end()
    }
  }
}

function jsonError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ error: { code, message } }))
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// Retry exactly once when undici hands us a half-closed pooled socket
// (Fly edge closes idle TCP after ~60-90s; Vercel Fluid Compute keeps
// the undici pool warm across invocations). Identified by
// `UND_ERR_SOCKET` with `bytesWritten === 0` — request bytes never
// left the socket, so retrying is safe for any HTTP method.
async function fetchWithStaleSocketRetry(
  url: string,
  init: Parameters<typeof fetch>[1],
): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err) {
    if (!isStalePooledSocketError(err)) throw err
    console.warn('[proxy] Retrying once after stale pooled socket to', url)
    return await fetch(url, init)
  }
}

function isStalePooledSocketError(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string; socket?: { bytesWritten?: number } } })?.cause
  return cause?.code === 'UND_ERR_SOCKET' && cause?.socket?.bytesWritten === 0
}

// Runs on Vercel's default Node.js runtime. Edge is not viable here:
// it has a 25s response cap that doesn't work for long LLM streams.
// The explicit `config.runtime` export was removed because Vercel
// deprecated that key — Node is the default for @vercel/node@5.
