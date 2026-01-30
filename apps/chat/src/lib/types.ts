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
  endpointId?: string   // Routing endpoint ID
  routingStrategy?: string // Routing strategy used
  isFallback?: boolean  // Whether this was a fallback
}

// Routing strategies available
export type RoutingStrategy =
  | 'round_robin'
  | 'weighted'
  | 'random'
  | 'least_latency'
  | 'region_based'
  | 'priority'
  | 'trait_based'
  | 'cost_optimized'
  // Agentic strategies
  | 'tool_aware'
  | 'context_adaptive'
  | 'sticky_session'
  | 'reasoning_depth'

export const ROUTING_STRATEGIES: { id: RoutingStrategy; name: string; description: string }[] = [
  // Standard strategies
  { id: 'round_robin', name: 'Round Robin', description: 'Distribute evenly across endpoints' },
  { id: 'weighted', name: 'Weighted', description: 'Route based on endpoint weights' },
  { id: 'random', name: 'Random', description: 'Random endpoint selection' },
  { id: 'least_latency', name: 'Least Latency', description: 'Route to healthiest endpoint' },
  { id: 'region_based', name: 'Region Based', description: 'Route to nearest region' },
  { id: 'priority', name: 'Priority', description: 'Route to highest priority endpoint' },
  { id: 'trait_based', name: 'Trait Based', description: 'Route based on model capabilities' },
  { id: 'cost_optimized', name: 'Cost Optimized', description: 'Route to cheapest capable model' },
  // Agentic strategies
  { id: 'tool_aware', name: 'Tool Aware', description: 'Route based on tools in request' },
  { id: 'context_adaptive', name: 'Context Adaptive', description: 'Route based on input token count' },
  { id: 'sticky_session', name: 'Sticky Session', description: 'Maintain endpoint affinity per conversation' },
  { id: 'reasoning_depth', name: 'Reasoning Depth', description: 'Route complex reasoning to thinking models' },
]

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
