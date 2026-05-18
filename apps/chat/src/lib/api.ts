import type { CreateResponseRequest, Response, StreamEvent, Message, RoutingStrategy, ValidationConfig, ConsistencyConfig, CompressionConfig } from './types'

/**
 * Error thrown for any non-2xx HTTP response from the gateway/proxy.
 *
 * The UI checks `code` to specialize the message — 'rate_limit_exceeded'
 * gets a friendly upgrade CTA, everything else just shows the raw message.
 */
export class AuraApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'AuraApiError'
  }

  /** Did we hit the per-user free tier rate limit? */
  isRateLimit(): boolean {
    return this.status === 429
  }

  /** Did the session expire / user sign out from another tab? */
  isUnauthenticated(): boolean {
    return this.status === 401
  }
}

async function buildApiError(response: globalThis.Response): Promise<AuraApiError> {
  let body: { error?: { code?: string; message?: string } } = {}
  try {
    body = await response.json()
  } catch {
    // Non-JSON error body — fall through to defaults.
  }
  const message = body.error?.message ?? `Request failed: ${response.status}`
  const code = body.error?.code ?? `http_${response.status}`
  const retryAfterRaw = response.headers.get('Retry-After')
  const retryAfter = retryAfterRaw ? parseInt(retryAfterRaw, 10) : undefined
  return new AuraApiError(message, code, response.status, retryAfter)
}

// In prod (Vercel), we hit the same-origin /api/proxy/v1 — a serverless
// function that holds the user's gateway API key server-side and forwards
// the request to api.aura-llm.dev. The browser never sees the API key.
//
// In local dev, you can either:
//   1. Run the chat against the local gateway directly: VITE_API_BASE_URL=http://localhost:8080
//   2. Run `vercel dev` to get the proxy locally
//
// VITE_AURA_API_KEY is intentionally not read here anymore — the proxy is
// the only path that knows the key, and only on the server side.
const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/v1`
  : '/api/proxy/v1'

// The session cookie is the implicit credential. No bearer token in the
// browser bundle.
const API_KEY = ''

export interface AuraAPIConfig {
  baseUrl?: string
  apiKey?: string
  routingStrategy?: RoutingStrategy
  validationConfig?: ValidationConfig
  consistencyConfig?: ConsistencyConfig
  compressionConfig?: CompressionConfig
}

export class AuraAPI {
  private baseUrl: string
  private apiKey: string
  private routingStrategy: RoutingStrategy
  private validationConfig?: ValidationConfig
  private consistencyConfig?: ConsistencyConfig
  private compressionConfig?: CompressionConfig

  constructor(config: AuraAPIConfig = {}) {
    this.baseUrl = config.baseUrl || API_BASE
    this.apiKey = config.apiKey || API_KEY
    this.routingStrategy = config.routingStrategy || 'round_robin'
    this.validationConfig = config.validationConfig
    this.consistencyConfig = config.consistencyConfig
    this.compressionConfig = config.compressionConfig
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'X-Routing-Strategy': this.routingStrategy,
    }
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }
    return headers
  }

  async createResponse(request: CreateResponseRequest): Promise<Response> {
    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: this.getHeaders(),
      credentials: 'include', // Send the better-auth session cookie to /api/proxy
      body: JSON.stringify({
        ...request,
        stream: false,
        ...(this.validationConfig && { validation: this.validationConfig }),
        ...(this.consistencyConfig && { consistency: this.consistencyConfig }),
        ...(this.compressionConfig && { compression: this.compressionConfig }),
      }),
    })

    if (!response.ok) {
      throw await buildApiError(response)
    }

    return response.json()
  }

  async *createResponseStream(
    request: CreateResponseRequest
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: this.getHeaders(),
      credentials: 'include', // Send the better-auth session cookie to /api/proxy
      body: JSON.stringify({
        ...request,
        stream: true,
        ...(this.validationConfig && { validation: this.validationConfig }),
        ...(this.consistencyConfig && { consistency: this.consistencyConfig }),
        ...(this.compressionConfig && { compression: this.compressionConfig }),
      }),
    })

    if (!response.ok) {
      throw await buildApiError(response)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') {
              return
            }
            try {
              const event = JSON.parse(data) as StreamEvent
              yield event
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}

export function messagesToInput(messages: Message[]): CreateResponseRequest['input'] {
  return messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      type: 'message' as const,
      role: m.role,
      content: m.content,
    }))
}

export const api = new AuraAPI()
