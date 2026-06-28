import { describe, it, expect, vi } from 'vitest'
import { AuraClient } from '../src/client.js'
import {
  AuthenticationError,
  BadRequestError,
  RateLimitError,
  APITimeoutError,
  APIConnectionError,
} from '../src/errors.js'
import { outputText, type StreamEvent } from '../src/types.js'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

/** Typed fetch-mock factory so `.mock.calls[i][1]` (RequestInit) narrows. */
type FetchImpl = (url: string | URL | Request, init?: RequestInit) => Promise<Response>
function mockFetch(impl: FetchImpl) {
  return vi.fn(impl)
}
const asFetch = (m: ReturnType<typeof mockFetch>): typeof fetch =>
  m as unknown as typeof fetch

const SAMPLE_RESPONSE = {
  id: 'resp_1',
  object: 'response',
  created_at: 1,
  status: 'completed',
  model: 'gpt-5.4-mini',
  output: [
    { type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] },
  ],
}

describe('AuraClient.responses.create (non-streaming)', () => {
  it('sends a POST with bearer auth and string input coerced to a user message', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(SAMPLE_RESPONSE))
    const client = new AuraClient({ apiKey: 'sk-test', baseUrl: 'https://gw.test', fetch: asFetch(fetchMock) })

    const res = await client.responses.create({ model: 'gpt-5.4-mini', input: 'hi' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://gw.test/v1/responses')
    expect(init!.method).toBe('POST')
    expect((init!.headers as Headers).get('authorization')).toBe('Bearer sk-test')
    const body = JSON.parse(init!.body as string)
    expect(body.input).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.stream).toBe(false)
    expect(outputText(res)).toBe('Hello!')
  })

  it('passes through tools, user, and config blocks; drops undefined', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(SAMPLE_RESPONSE))
    const client = new AuraClient({ apiKey: 'k', fetch: asFetch(fetchMock) })
    await client.responses.create({
      model: 'm',
      input: 'x',
      user: 'cust_1',
      temperature: undefined,
      compression: { strategy: 'toon', auto_select: true },
    })
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body.user).toBe('cust_1')
    expect(body.compression).toEqual({ strategy: 'toon', auto_select: true })
    expect('temperature' in body).toBe(false)
  })
})

describe('error mapping', () => {
  it('maps 401 → AuthenticationError', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({ error: { code: 'authentication_error', message: 'bad key' } }, { status: 401 }),
    )
    const client = new AuraClient({ fetch: asFetch(fetchMock), maxRetries: 0 })
    await expect(client.responses.create({ model: 'm', input: 'x' })).rejects.toBeInstanceOf(
      AuthenticationError,
    )
  })

  it('maps 400 → BadRequestError with param', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({ error: { message: 'bad', param: 'model' } }, { status: 400 }),
    )
    const client = new AuraClient({ fetch: asFetch(fetchMock), maxRetries: 0 })
    await expect(client.responses.create({ model: 'm', input: 'x' })).rejects.toMatchObject({
      name: 'BadRequestError',
      param: 'model',
    })
  })
})

describe('retry policy', () => {
  it('retries retryable 503 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'busy' } }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(SAMPLE_RESPONSE))
    const client = new AuraClient({ fetch: asFetch(fetchMock), maxRetries: 2 })
    // Avoid real backoff delay.
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout)
    const res = await client.responses.create({ model: 'm', input: 'x' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(res.id).toBe('resp_1')
    vi.restoreAllMocks()
  })

  it('does not retry a non-retryable 400', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({ error: { message: 'bad' } }, { status: 400 }),
    )
    const client = new AuraClient({ fetch: asFetch(fetchMock), maxRetries: 3 })
    await expect(client.responses.create({ model: 'm', input: 'x' })).rejects.toBeInstanceOf(
      BadRequestError,
    )
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('surfaces RateLimitError with retryAfter when retries exhausted', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({ error: { message: 'slow down' } }, {
        status: 429,
        headers: { 'retry-after': '1', 'content-type': 'application/json' },
      }),
    )
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout)
    const client = new AuraClient({ fetch: asFetch(fetchMock), maxRetries: 1 })
    await expect(client.responses.create({ model: 'm', input: 'x' })).rejects.toMatchObject({
      name: 'RateLimitError',
      retryAfter: 1,
    })
    vi.restoreAllMocks()
  })
})

describe('network errors', () => {
  it('maps a fetch throw to APIConnectionError', async () => {
    const fetchMock = mockFetch(async () => {
      throw new TypeError('fetch failed')
    })
    const client = new AuraClient({ fetch: asFetch(fetchMock), maxRetries: 0 })
    await expect(client.responses.create({ model: 'm', input: 'x' })).rejects.toBeInstanceOf(
      APIConnectionError,
    )
  })

  it('maps an abort to APITimeoutError', async () => {
    const fetchMock = mockFetch(async () => {
      const e = new Error('aborted')
      e.name = 'AbortError'
      throw e
    })
    const client = new AuraClient({ fetch: asFetch(fetchMock), maxRetries: 0 })
    await expect(client.responses.create({ model: 'm', input: 'x' })).rejects.toBeInstanceOf(
      APITimeoutError,
    )
  })
})

describe('lifecycle hooks', () => {
  it('fires onRequest and onResponse', async () => {
    const onRequest = vi.fn()
    const onResponse = vi.fn()
    const fetchMock = mockFetch(async () => jsonResponse(SAMPLE_RESPONSE))
    const client = new AuraClient({ fetch: asFetch(fetchMock), onRequest, onResponse })
    await client.responses.create({ model: 'm', input: 'x' })
    expect(onRequest).toHaveBeenCalledOnce()
    expect(onResponse).toHaveBeenCalledOnce()
    expect(onResponse.mock.calls[0]![0].status).toBe(200)
  })
})

describe('streaming', () => {
  it('returns an AsyncIterable of typed events', async () => {
    const sse =
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hi","output_index":0,"content_index":0}\n\n' +
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"r1"}}\n\n'
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> =>
        new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    )
    const client = new AuraClient({ fetch: fetchMock as unknown as typeof fetch })
    const stream = await client.responses.create({ model: 'm', input: 'x', stream: true })
    const events: StreamEvent[] = []
    for await (const ev of stream) events.push(ev)
    expect(events.map((e) => e.type)).toEqual([
      'response.output_text.delta',
      'response.completed',
    ])
    // stream:true is sent in the payload
    const init = fetchMock.mock.calls[0]![1]
    const body = JSON.parse(init!.body as string)
    expect(body.stream).toBe(true)
  })

  it('throws a typed error before the first byte', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({ error: { message: 'bad key' } }, { status: 401 }),
    )
    const client = new AuraClient({ fetch: asFetch(fetchMock) })
    await expect(
      client.responses.create({ model: 'm', input: 'x', stream: true }),
    ).rejects.toBeInstanceOf(AuthenticationError)
  })
})
