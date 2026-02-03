import type { CreateResponseRequest, Response, StreamEvent, Message, RoutingStrategy, ValidationConfig, ConsistencyConfig, CompressionConfig } from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/v1`
  : '/v1'

const API_KEY = import.meta.env.VITE_AURA_API_KEY || ''

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
      body: JSON.stringify({
        ...request,
        stream: false,
        ...(this.validationConfig && { validation: this.validationConfig }),
        ...(this.consistencyConfig && { consistency: this.consistencyConfig }),
        ...(this.compressionConfig && { compression: this.compressionConfig }),
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Request failed')
    }

    return response.json()
  }

  async *createResponseStream(
    request: CreateResponseRequest
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        ...request,
        stream: true,
        ...(this.validationConfig && { validation: this.validationConfig }),
        ...(this.consistencyConfig && { consistency: this.consistencyConfig }),
        ...(this.compressionConfig && { compression: this.compressionConfig }),
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Request failed')
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
