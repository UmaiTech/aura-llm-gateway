export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: Date
  isStreaming?: boolean
  toolInvocations?: ToolInvocation[]
  usage?: MessageUsage
  aura?: AuraMetadata  // Aura gateway metadata
  responseId?: string  // API response ID for conversation threading
}

export interface MessageUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost?: number  // Cost in USD (based on model pricing)
}

// Aura gateway enrichment metadata
export interface AuraMetadata {
  provider: string      // e.g., "openai", "anthropic", "google"
  gatewayVersion: string
  latencyMs?: number    // Request latency in milliseconds
  requestId?: string    // Unique request ID for tracing
}

export interface ToolInvocation {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result?: string
  state: 'pending' | 'result' | 'error'
}

export interface Model {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'google'
  description?: string
}

export interface Conversation {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
  model: string
  systemPrompt?: string
  messages: Message[]
}

export interface Tool {
  type: 'function'
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description?: string
      enum?: string[]
    }>
    required?: string[]
  }
}

export interface CreateResponseRequest {
  model: string
  input: InputItem[]
  instructions?: string
  stream?: boolean
  max_output_tokens?: number
  temperature?: number
  top_p?: number
  previous_response_id?: string  // For conversation threading
}

export interface InputItem {
  type: 'message'
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface Response {
  id: string
  model: string
  status: 'in_progress' | 'completed' | 'failed' | 'incomplete'
  output: OutputItem[]
  usage?: Usage
  error?: ResponseError
}

export interface OutputItem {
  type: 'message' | 'function_call'
  id: string
  role?: 'assistant'
  content?: ContentPart[]
  name?: string
  call_id?: string
  arguments?: string
}

export interface ContentPart {
  type: 'text'
  text: string
}

export interface Usage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

export interface ResponseError {
  code: string
  message: string
}

export interface StreamEvent {
  type: string
  response?: Response
  output_index?: number
  content_index?: number
  delta?: string
  text?: string
  item?: OutputItem
  error?: StreamErrorDetails
}

export interface StreamErrorDetails {
  type: string
  code: string
  message: string
}
