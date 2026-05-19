/**
 * Vercel @vercel/node@5 quirk: the Request handed to the function has
 * `url` as a path (e.g. `/api/auth/get-session?path=get-session`)
 * instead of an absolute URL. Anything downstream calling
 * `new URL(req.url)` throws `Invalid URL`. better-auth/better-call
 * does exactly this in its router, so we have to fix it before
 * forwarding.
 *
 * We also strip the `path` query param injected by the
 * `:path*` rewrite in vercel.json. It isn't part of the original
 * client request — Vercel adds it as a side-effect of the rewrite
 * mapping `/api/auth/foo/bar` → `/api/auth/[...all]?path=foo/bar`.
 */

export function normalizeRequest(req: Request): Request {
  const host =
    req.headers.get('x-forwarded-host') ??
    req.headers.get('host') ??
    'localhost'
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'

  let pathAndQuery: string
  try {
    const parsed = new URL(req.url)
    pathAndQuery = parsed.pathname + parsed.search
  } catch {
    pathAndQuery = req.url
  }

  const url = new URL(pathAndQuery, `${proto}://${host}`)
  url.searchParams.delete('path')

  return new Request(url.toString(), {
    method: req.method,
    headers: req.headers,
    body:
      req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
    // @ts-expect-error - duplex is required by undici when body is a stream
    duplex: 'half',
  })
}
