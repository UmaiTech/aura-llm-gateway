/**
 * Open Responses API types, ported from the Python SDK's `types.py`.
 *
 * These are plain TypeScript interfaces/unions (the gateway returns JSON; we
 * don't validate at runtime beyond shape-narrowing on `type`). Helper
 * functions (`outputText`, `toolCalls`) replace the Python `@property`
 * accessors, since interfaces can't carry methods.
 */

// ── Enums (as string-literal unions) ───────────────────────────────────────

export type ResponseStatus =
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'incomplete'
  | 'cancelled'

export type ItemType =
  | 'message'
  | 'function_call'
  | 'function_call_output'
  | 'reasoning'

export type Role = 'user' | 'assistant' | 'system'

// ── Content ────────────────────────────────────────────────────────────────

export interface TextContent {
  type: 'text'
  text: string
}

export interface ImageContent {
  type: 'image'
  url?: string
  base64?: string
  media_type?: string
}

export type Content = TextContent | ImageContent

// ── Items ────────────────────────────────────────────────────────────────

export interface MessageItem {
  type: 'message'
  id?: string
  role: Role
  content: Content[]
  status?: string
}

export interface FunctionCallItem {
  type: 'function_call'
  id?: string
  call_id: string
  name: string
  arguments: string
  status?: string
}

export interface FunctionCallOutputItem {
  type: 'function_call_output'
  id?: string
  call_id: string
  output: string
}

export interface ReasoningItem {
  type: 'reasoning'
  id?: string
  content: TextContent[]
  status?: string
}

export type Item =
  | MessageItem
  | FunctionCallItem
  | FunctionCallOutputItem
  | ReasoningItem

// ── Tools ────────────────────────────────────────────────────────────────

export interface FunctionDefinition {
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

export interface Tool {
  type: 'function'
  function: FunctionDefinition
}

/** Convenience builder for a function tool (mirrors Tool.function_tool). */
export function functionTool(
  name: string,
  description?: string,
  parameters?: Record<string, unknown>,
): Tool {
  return {
    type: 'function',
    function: { name, ...(description ? { description } : {}), ...(parameters ? { parameters } : {}) },
  }
}

// ── Usage ────────────────────────────────────────────────────────────────

export interface Usage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  input_tokens_details?: Record<string, number>
  output_tokens_details?: Record<string, number>
  cost_usd?: number
}

// ── Response ─────────────────────────────────────────────────────────────

export interface ResponseError {
  code: string
  message: string
  param?: string
}

export interface AuraMetadata {
  request_id?: string
  model?: string
  provider?: string
  gateway_version?: string
  latency_ms?: number
  agentic?: Record<string, unknown>
}

export interface ResponseMetadata {
  aura?: AuraMetadata
}

export interface Response {
  id: string
  object: 'response'
  created_at: number
  status: ResponseStatus
  model: string
  output: Item[]
  usage?: Usage
  error?: ResponseError
  metadata?: ResponseMetadata
  previous_response_id?: string
  conversation_id?: string
}

// ── Response helpers (replace Python @property accessors) ───────────────────

/** Text from the first assistant message output item ('' if none). */
export function outputText(response: Response): string {
  for (const item of response.output) {
    if (item.type === 'message' && item.role === 'assistant') {
      return item.content
        .filter((c): c is TextContent => c.type === 'text')
        .map((c) => c.text)
        .join('')
    }
  }
  return ''
}

/** All function-call items in the output. */
export function toolCalls(response: Response): FunctionCallItem[] {
  return response.output.filter(
    (item): item is FunctionCallItem => item.type === 'function_call',
  )
}

export const hasToolCalls = (r: Response): boolean => toolCalls(r).length > 0
export const isComplete = (r: Response): boolean => r.status === 'completed'
export const isFailed = (r: Response): boolean => r.status === 'failed'

// ── Stream events ──────────────────────────────────────────────────────────

interface StreamEventBase {
  type: string
  sequence?: number
}

export interface ResponseCreatedEvent extends StreamEventBase {
  type: 'response.created'
  response: Response
}
export interface ResponseInProgressEvent extends StreamEventBase {
  type: 'response.in_progress'
  response: Response
}
export interface ResponseCompletedEvent extends StreamEventBase {
  type: 'response.completed'
  response: Response
}
export interface ResponseFailedEvent extends StreamEventBase {
  type: 'response.failed'
  response: Response
}
export interface OutputItemAddedEvent extends StreamEventBase {
  type: 'response.output_item.added'
  item: Item
  output_index: number
}
export interface OutputItemDoneEvent extends StreamEventBase {
  type: 'response.output_item.done'
  item: Item
  output_index: number
}
export interface TextDeltaEvent extends StreamEventBase {
  type: 'response.output_text.delta'
  delta: string
  output_index: number
  content_index: number
}
export interface TextDoneEvent extends StreamEventBase {
  type: 'response.output_text.done'
  text: string
  output_index: number
  content_index: number
}
export interface FunctionCallDeltaEvent extends StreamEventBase {
  type: 'response.function_call.delta'
  delta: string
  output_index: number
  call_id: string
}
export interface FunctionCallDoneEvent extends StreamEventBase {
  type: 'response.function_call.done'
  item: FunctionCallItem
  output_index: number
}
export interface ErrorEvent extends StreamEventBase {
  type: 'error'
  error: ResponseError
}

export type StreamEvent =
  | ResponseCreatedEvent
  | ResponseInProgressEvent
  | ResponseCompletedEvent
  | ResponseFailedEvent
  | OutputItemAddedEvent
  | OutputItemDoneEvent
  | TextDeltaEvent
  | TextDoneEvent
  | FunctionCallDeltaEvent
  | FunctionCallDoneEvent
  | ErrorEvent

/** All recognized stream event type strings. */
export const STREAM_EVENT_TYPES = new Set<string>([
  'response.created',
  'response.in_progress',
  'response.completed',
  'response.failed',
  'response.output_item.added',
  'response.output_item.done',
  'response.output_text.delta',
  'response.output_text.done',
  'response.function_call.delta',
  'response.function_call.done',
  'error',
])

// ── Input types ────────────────────────────────────────────────────────────

export interface InputMessage {
  role: Role
  content: string | Content[]
}

export const userMessage = (content: string): InputMessage => ({ role: 'user', content })
export const assistantMessage = (content: string): InputMessage => ({
  role: 'assistant',
  content,
})
export const systemMessage = (content: string): InputMessage => ({
  role: 'system',
  content,
})

// ── Config blocks (compression / validation / consistency) ──────────────────

export interface CompressionConfig {
  strategy?: string
  auto_select?: boolean
  [key: string]: unknown
}
export interface ValidationConfig {
  strategy?: string
  n?: number
  min_confidence?: number
  [key: string]: unknown
}
export interface ConsistencyConfig {
  style_profile?: string
  [key: string]: unknown
}
