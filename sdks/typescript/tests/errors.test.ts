import { describe, it, expect } from 'vitest'
import {
  AuraError,
  APIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  RateLimitError,
  APIConnectionError,
  APITimeoutError,
  errorFromResponse,
} from '../src/errors.js'

describe('error hierarchy', () => {
  it('subclasses are instanceof their parents', () => {
    const e = new AuthenticationError()
    expect(e).toBeInstanceOf(AuthenticationError)
    expect(e).toBeInstanceOf(APIError)
    expect(e).toBeInstanceOf(AuraError)
    expect(e).toBeInstanceOf(Error)
  })

  it('carries code/status defaults per subclass', () => {
    expect(new AuthenticationError().status).toBe(401)
    expect(new BadRequestError('x').status).toBe(400)
    expect(new NotFoundError('x').status).toBe(404)
    expect(new RateLimitError().status).toBe(429)
    expect(new RateLimitError('x', { retryAfter: 7 }).retryAfter).toBe(7)
  })

  it('preserves name for logging', () => {
    expect(new RateLimitError().name).toBe('RateLimitError')
    expect(new APITimeoutError().name).toBe('APITimeoutError')
  })
})

describe('errorFromResponse', () => {
  const headers = (h: Record<string, string> = {}) => new Headers(h)

  it('maps status codes to the right class', () => {
    const body = { error: { code: 'bad', message: 'nope', param: 'model' } }
    expect(errorFromResponse(401, body, headers())).toBeInstanceOf(AuthenticationError)
    expect(errorFromResponse(400, body, headers())).toBeInstanceOf(BadRequestError)
    expect(errorFromResponse(404, body, headers())).toBeInstanceOf(NotFoundError)
    expect(errorFromResponse(429, body, headers())).toBeInstanceOf(RateLimitError)
    expect(errorFromResponse(500, body, headers())).toBeInstanceOf(APIError)
  })

  it('extracts message, code, param from the body', () => {
    const err = errorFromResponse(
      400,
      { error: { code: 'invalid_model', message: 'unknown model', param: 'model' } },
      headers(),
    )
    expect(err.message).toBe('unknown model')
    expect(err.code).toBe('invalid_model')
    expect(err.param).toBe('model')
    expect(err.status).toBe(400)
  })

  it('parses Retry-After on 429', () => {
    const err = errorFromResponse(429, {}, headers({ 'retry-after': '12' })) as RateLimitError
    expect(err.retryAfter).toBe(12)
  })

  it('captures request id when present', () => {
    const err = errorFromResponse(500, {}, headers({ 'x-request-id': 'req_42' }))
    expect(err.requestId).toBe('req_42')
  })

  it('falls back gracefully on a non-standard body', () => {
    const err = errorFromResponse(503, 'plain text', headers())
    expect(err.code).toBe('unknown_error')
    expect(err.status).toBe(503)
  })
})

describe('APIConnectionError / APITimeoutError', () => {
  it('have sensible defaults', () => {
    expect(new APIConnectionError().code).toBe('connection_error')
    expect(new APITimeoutError().code).toBe('timeout')
  })
})
