/**
 * Aura SDK error hierarchy.
 *
 * Mirrors the Python SDK's `exceptions.py`:
 *   AuraError
 *   ├── APIError                (errors returned by the gateway)
 *   │   ├── AuthenticationError (401)
 *   │   ├── BadRequestError     (400)
 *   │   ├── NotFoundError       (404)
 *   │   └── RateLimitError      (429, carries retryAfter)
 *   ├── APIConnectionError      (network failure)
 *   └── APITimeoutError         (exceeded the configured timeout)
 *
 * Use `instanceof` to branch on error class.
 */

export interface AuraErrorOptions {
  code?: string
  param?: string
  status?: number
  requestId?: string
  responseBody?: unknown
}

/** Base class for every error thrown by the SDK. */
export class AuraError extends Error {
  /** Gateway error code (e.g. `invalid_model`), when present. */
  readonly code?: string
  /** Offending request parameter, when the gateway reports one. */
  readonly param?: string
  /** HTTP status code, when the error originated from a response. */
  readonly status?: number
  /** Gateway request id for support/correlation, when present. */
  readonly requestId?: string
  /** Raw parsed response body, for debugging. */
  readonly responseBody?: unknown

  constructor(message: string, options: AuraErrorOptions = {}) {
    super(message)
    this.name = this.constructor.name
    this.code = options.code
    this.param = options.param
    this.status = options.status
    this.requestId = options.requestId
    this.responseBody = options.responseBody
    // Restore prototype chain for `instanceof` across transpile targets.
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** An error returned by the Aura API (any non-2xx with a parseable body). */
export class APIError extends AuraError {}

/** 401 — invalid or missing API key. */
export class AuthenticationError extends APIError {
  constructor(message = 'Invalid or missing API key', options: AuraErrorOptions = {}) {
    super(message, { code: 'authentication_error', status: 401, ...options })
  }
}

/** 400 — the request was malformed or invalid. */
export class BadRequestError extends APIError {
  constructor(message: string, options: AuraErrorOptions = {}) {
    super(message, { code: 'invalid_request', status: 400, ...options })
  }
}

/** 404 — resource not found (e.g. an unknown model). */
export class NotFoundError extends APIError {
  constructor(message: string, options: AuraErrorOptions = {}) {
    super(message, { code: 'not_found', status: 404, ...options })
  }
}

/** 429 — rate limit exceeded. */
export class RateLimitError extends APIError {
  /** Seconds to wait before retrying, from the `Retry-After` header. */
  readonly retryAfter?: number

  constructor(
    message = 'Rate limit exceeded',
    options: AuraErrorOptions & { retryAfter?: number } = {},
  ) {
    const { retryAfter, ...rest } = options
    super(message, { code: 'rate_limit_exceeded', status: 429, ...rest })
    this.retryAfter = retryAfter
  }
}

/** Failed to connect to the gateway (DNS, refused, reset, …). */
export class APIConnectionError extends AuraError {
  constructor(message = 'Failed to connect to Aura API', options: AuraErrorOptions = {}) {
    super(message, { code: 'connection_error', ...options })
  }
}

/** The request exceeded the configured `timeout`. */
export class APITimeoutError extends AuraError {
  constructor(message = 'Request timed out', options: AuraErrorOptions = {}) {
    super(message, { code: 'timeout', ...options })
  }
}

/**
 * Map an HTTP status + parsed error body to the right error class.
 * Used by the request layer.
 */
export function errorFromResponse(
  status: number,
  body: unknown,
  headers: Headers,
): AuraError {
  let code = 'unknown_error'
  let message = `HTTP ${status}`
  let param: string | undefined
  if (body && typeof body === 'object') {
    const err = (body as { error?: Record<string, unknown> }).error
    if (err && typeof err === 'object') {
      if (typeof err.code === 'string') code = err.code
      if (typeof err.message === 'string') message = err.message
      if (typeof err.param === 'string') param = err.param
    }
  }
  const requestId =
    headers.get('x-request-id') ?? headers.get('x-aura-request-id') ?? undefined
  const base: AuraErrorOptions = { code, param, status, requestId, responseBody: body }

  switch (status) {
    case 401:
      return new AuthenticationError(message, base)
    case 400:
      return new BadRequestError(message, base)
    case 404:
      return new NotFoundError(message, base)
    case 429: {
      const ra = headers.get('retry-after')
      return new RateLimitError(message, {
        ...base,
        retryAfter: ra ? Number.parseInt(ra, 10) : undefined,
      })
    }
    default:
      return new APIError(message, base)
  }
}
