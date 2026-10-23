/**
 * GET /api/github/stars
 *
 *   200 { stars: number }      // stargazers_count of UmaiTech/aura-llm-gateway
 *   502 { error: 'upstream' }  // GitHub unreachable, rate-limited or malformed
 *
 * Backs the star-count badge on the landing page. Visitors' browsers never
 * call api.github.com directly (unauthenticated limit: 60 req/h per IP);
 * instead Vercel's edge caches this response for an hour and serves it stale
 * for up to a day while revalidating, so GitHub sees roughly one request per
 * hour. Set GITHUB_TOKEN to lift the server-side limit to 5,000 req/h.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

const REPO = 'UmaiTech/aura-llm-gateway'
const TIMEOUT_MS = 5_000

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'method_not_allowed' })
  }

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'aura-llm-gateway-landing',
    'x-github-api-version': '2022-11-28',
  }
  const token = process.env.GITHUB_TOKEN
  if (token) headers.authorization = `Bearer ${token}`

  try {
    const upstream = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!upstream.ok) throw new Error(`GitHub responded ${upstream.status}`)
    const body = (await upstream.json()) as { stargazers_count?: unknown }
    const stars = body.stargazers_count
    if (typeof stars !== 'number' || !Number.isFinite(stars)) {
      throw new Error('stargazers_count missing from GitHub response')
    }
    res.setHeader('cache-control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return json(res, 200, { stars })
  } catch (err) {
    console.error('github stars fetch failed', err)
    // Cache failures briefly so an outage or rate limit doesn't turn every
    // page view into another upstream call.
    res.setHeader('cache-control', 'public, s-maxage=300')
    return json(res, 502, { error: 'upstream' })
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}
