/**
 * AuraClient — the TypeScript client for the Aura LLM Gateway.
 *
 * Single client (no sync/async split — JS is async by default). Everything
 * returns a Promise; `create({ stream: true })` returns an AsyncIterable of
 * `StreamEvent`. Universal: uses global `fetch` + Web Streams, so it runs on
 * Node 20+, browsers, Deno, Bun, and edge runtimes with no Node-only deps.
 */

import {
  APIConnectionError,
  APITimeoutError,
  errorFromResponse,
  type AuraError,
} from './errors.js'
import { parseSSE } from './streaming.js'
import type {
  CompressionConfig,
  ConsistencyConfig,
  InputMessage,
  Response,
  StreamEvent,
  Tool,
  ValidationConfig,
} from './types.js'

export const DEFAULT_BASE_URL = 'http://localhost:8080'
export const DEFAULT_TIMEOUT = 60_000
export const DEFAULT_MAX_RETRIES = 2
const SDK_VERSION = '0.1.0'

/** Status codes worth retrying (plus network errors, handled separately). */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

type FetchFn = typeof fetch

export interface AuraClientOptions {
  /** API key. Falls back to `AURA_API_KEY` env var (Node/Deno/Bun). */
  apiKey?: string
  /** Gateway base URL. Falls back to `AURA_BASE_URL`, then localhost:8080. */
  baseUrl?: string
  /** Per-request timeout in milliseconds (default 60000). */
  timeout?: number
  /** Max retries for retryable failures (default 2; 0 disables). */
  maxRetries?: number
  /** Extra headers merged into every request. */
  headers?: Record<string, string>
  /** Custom fetch implementation (injection for edge runtimes / tests). */
  fetch?: FetchFn
  /** Lifecycle hooks. */
  onRequest?: (req: { method: string; url: string; headers: Headers }) => void
  onResponse?: (res: { status: number; url: string }, durationMs: number) => void
  onError?: (err: AuraError) => void
}

export interface ResponseCreateParams {
  model: string
  input: string | InputMessage[] | Array<Record<string, unknown>>
  instructions?: string
  tools?: Tool[]
  tool_choice?: string
  temperature?: number
  max_tokens?: number
  top_p?: number
  previous_response_id?: string
  /** End-user identifier for multi-tenant cost tracking. */
  user?: string
  compression?: CompressionConfig
  validation?: ValidationConfig
  consistency?: ConsistencyConfig
  /** Escape hatch for params not yet typed. */
  [key: string]: unknown
}

function readEnv(name: string): string | undefined {
  // Read process.env via globalThis so this compiles without @types/node and
  // stays safe in browsers/edge runtimes where `process` is undefined.
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process
  return proc?.env?.[name]
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** Responses API resource. */
export class Responses {
  constructor(private readonly client: AuraClient) {}

  /** Create a non-streaming response. */
  create(params: ResponseCreateParams & { stream?: false }): Promise<Response>
  /** Create a streaming response (AsyncIterable of events). */
  create(
    params: ResponseCreateParams & { stream: true },
  ): Promise<AsyncIterable<StreamEvent>>
  create(
    params: ResponseCreateParams & { stream?: boolean },
  ): Promise<Response | AsyncIterable<StreamEvent>> {
    const { stream = false } = params
    const payload = this.buildPayload(params)
    if (stream) {
      return this.client._stream('/v1/responses', payload)
    }
    return this.client._request<Response>('POST', '/v1/responses', payload)
  }

  private buildPayload(params: ResponseCreateParams): Record<string, unknown> {
    const { input, stream = false, ...rest } = params
    let inputItems: unknown
    if (typeof input === 'string') {
      inputItems = [{ role: 'user', content: input }]
    } else {
      inputItems = input
    }
    const payload: Record<string, unknown> = { ...rest, input: inputItems, stream }
    // Drop undefined keys so we don't send `"temperature": null`.
    for (const k of Object.keys(payload)) {
      if (payload[k] === undefined) delete payload[k]
    }
    return payload
  }
}

export class AuraClient {
  readonly baseUrl: string
  readonly timeout: number
  readonly maxRetries: number
  readonly responses: Responses

  private readonly apiKey: string | undefined
  private readonly headers: Record<string, string>
  private readonly fetchFn: FetchFn
  private readonly opts: AuraClientOptions

  constructor(options: AuraClientOptions = {}) {
    this.apiKey = options.apiKey ?? readEnv('AURA_API_KEY')
    this.baseUrl = (options.baseUrl ?? readEnv('AURA_BASE_URL') ?? DEFAULT_BASE_URL).replace(
      /\/+$/,
      '',
    )
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.opts = options

    const fetchImpl = options.fetch ?? globalThis.fetch
    if (!fetchImpl) {
      throw new Error(
        'No global fetch available. Pass a `fetch` implementation in AuraClientOptions.',
      )
    }
    this.fetchFn = fetchImpl

    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': `aura-typescript/${SDK_VERSION}`,
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...(options.headers ?? {}),
    }

    this.responses = new Responses(this)
  }

  /** Build an absolute URL + Headers for a request. */
  private prepare(path: string): { url: string; headers: Headers } {
    return { url: `${this.baseUrl}${path}`, headers: new Headers(this.headers) }
  }

  /** Exponential backoff with jitter, capped at 30s; honors Retry-After. */
  private backoffMs(attempt: number, retryAfter?: number): number {
    if (retryAfter && Number.isFinite(retryAfter)) return retryAfter * 1000
    return Math.min(2 ** attempt * 1000 + Math.random() * 1000, 30_000)
  }

  /** Non-streaming JSON request with retry + typed error mapping. */
  async _request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const { url, headers } = this.prepare(path)
    let lastError: AuraError | undefined

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeout)
      const started = Date.now()
      this.opts.onRequest?.({ method, url, headers })
      try {
        const res = await this.fetchFn(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        })
        this.opts.onResponse?.({ status: res.status, url }, Date.now() - started)

        if (res.ok) {
          return (await res.json()) as T
        }

        const parsed = await safeJson(res)
        const err = errorFromResponse(res.status, parsed, res.headers)
        if (RETRYABLE_STATUS.has(res.status) && attempt < this.maxRetries) {
          lastError = err
          const retryAfter =
            'retryAfter' in err ? (err as { retryAfter?: number }).retryAfter : undefined
          await sleep(this.backoffMs(attempt, retryAfter))
          continue
        }
        this.opts.onError?.(err)
        throw err
      } catch (e) {
        const mapped = this.mapNetworkError(e)
        if (mapped) {
          if (attempt < this.maxRetries) {
            lastError = mapped
            await sleep(this.backoffMs(attempt))
            continue
          }
          this.opts.onError?.(mapped)
          throw mapped
        }
        throw e // already an AuraError thrown above
      } finally {
        clearTimeout(timer)
      }
    }
    // Exhausted retries.
    throw lastError ?? new APIConnectionError('Request failed after retries')
  }

  /**
   * Streaming request → AsyncIterable<StreamEvent>. Streams are NOT retried
   * (re-issuing a partial stream would replay events); errors before the
   * first byte still surface as typed errors.
   */
  async _stream(
    path: string,
    body: unknown,
  ): Promise<AsyncIterable<StreamEvent>> {
    const { url, headers } = this.prepare(path)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)
    const started = Date.now()
    this.opts.onRequest?.({ method: 'POST', url, headers })

    let res: globalThis.Response
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (e) {
      clearTimeout(timer)
      const mapped = this.mapNetworkError(e)
      if (mapped) {
        this.opts.onError?.(mapped)
        throw mapped
      }
      throw e
    }
    this.opts.onResponse?.({ status: res.status, url }, Date.now() - started)

    if (!res.ok) {
      clearTimeout(timer)
      const parsed = await safeJson(res)
      const err = errorFromResponse(res.status, parsed, res.headers)
      this.opts.onError?.(err)
      throw err
    }
    if (!res.body) {
      clearTimeout(timer)
      throw new APIConnectionError('Streaming response had no body')
    }

    // Clear the timeout once streaming starts — the timeout guards
    // time-to-first-byte, not the (potentially long) stream lifetime.
    clearTimeout(timer)
    return parseSSE(res.body)
  }

  /** Map a thrown fetch error to a typed AuraError, or null if not ours. */
  private mapNetworkError(e: unknown): AuraError | null {
    if (e instanceof Error) {
      if (e.name === 'AbortError') return new APITimeoutError(`Request timed out: ${e.message}`)
      if (e.name === 'TypeError' || /fetch failed|network|ECONN|ENOTFOUND/i.test(e.message)) {
        return new APIConnectionError(`Failed to connect: ${e.message}`)
      }
    }
    return null
  }
}

async function safeJson(res: globalThis.Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    try {
      return { error: { message: await res.text() } }
    } catch {
      return undefined
    }
  }
}
