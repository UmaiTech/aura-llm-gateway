/**
 * Vercel @vercel/node@5 quirk: depending on the Vercel version and
 * how the function file is structured, the value handed to the
 * handler is either:
 *   - a Web `Request` whose `url` is a relative path (not absolute),
 *     and whose `headers` is a fetch `Headers` instance, OR
 *   - a Node-style `IncomingMessage`-like object whose `url` is a
 *     path string and whose `headers` is a plain `Record<string,
 *     string | string[]>`.
 *
 * better-auth/better-call calls `new URL(req.url)` and
 * `req.headers.get(...)` in its router — both throw on the
 * Node-style shape. This helper coerces either shape into a real
 * absolute-URL `Request` that better-auth can consume.
 *
 * We also strip the `path` query param injected by the `:path*`
 * rewrite in vercel.json — it isn't part of the real client request
 * and confuses better-auth's route matcher.
 */

type AnyHeaders =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined

interface AnyRequestLike {
  url?: string
  method?: string
  headers?: AnyHeaders
  body?: unknown
}

function readHeader(headers: AnyHeaders, name: string): string | undefined {
  if (!headers) return undefined
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined
  }
  const lower = name.toLowerCase()
  const map = headers as Record<string, string | string[] | undefined>
  const raw = map[name] ?? map[lower] ?? map[name.toUpperCase()]
  if (Array.isArray(raw)) return raw[0]
  return raw
}

function toHeaders(headers: AnyHeaders): Headers {
  if (!headers) return new Headers()
  if (typeof (headers as Headers).get === 'function') {
    return headers as Headers
  }
  const out = new Headers()
  for (const [key, value] of Object.entries(
    headers as Record<string, string | string[] | undefined>,
  )) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) out.append(key, v)
    } else {
      out.set(key, value)
    }
  }
  return out
}

export function normalizeRequest(req: AnyRequestLike): Request {
  const host =
    readHeader(req.headers, 'x-forwarded-host') ??
    readHeader(req.headers, 'host') ??
    'localhost'
  const proto = readHeader(req.headers, 'x-forwarded-proto') ?? 'https'

  const rawUrl = req.url ?? '/'
  let pathAndQuery: string
  try {
    const parsed = new URL(rawUrl)
    pathAndQuery = parsed.pathname + parsed.search
  } catch {
    pathAndQuery = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`
  }

  const url = new URL(pathAndQuery, `${proto}://${host}`)
  url.searchParams.delete('path')

  const method = req.method ?? 'GET'
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers: toHeaders(req.headers),
  }
  if (method !== 'GET' && method !== 'HEAD' && req.body != null) {
    // req.body shape varies (ReadableStream | Buffer | string). Pass
    // through and let undici figure it out; `duplex: 'half'` is
    // required when the body is a stream.
    init.body = req.body as BodyInit
    init.duplex = 'half'
  }

  return new Request(url.toString(), init)
}
