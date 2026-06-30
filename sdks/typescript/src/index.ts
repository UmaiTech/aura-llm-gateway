/**
 * aura-llm — TypeScript SDK for the Aura LLM Gateway (Open Responses API).
 *
 * @example
 * ```ts
 * import { AuraClient } from 'aura-llm'
 * const client = new AuraClient({ apiKey: process.env.AURA_API_KEY })
 * const res = await client.responses.create({ model: 'gpt-5.4-mini', input: 'Hi' })
 * console.log(outputText(res))
 * ```
 */

export {
  AuraClient,
  Responses,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  type AuraClientOptions,
  type ResponseCreateParams,
} from './client.js'

export {
  AuraError,
  APIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  RateLimitError,
  APIConnectionError,
  APITimeoutError,
  type AuraErrorOptions,
} from './errors.js'

export { parseSSE, parseSSEChunk } from './streaming.js'

export { KnownModels, type KnownModel } from './models.js'

export {
  // helpers
  functionTool,
  outputText,
  toolCalls,
  hasToolCalls,
  isComplete,
  isFailed,
  userMessage,
  assistantMessage,
  systemMessage,
  STREAM_EVENT_TYPES,
  // types
  type ResponseStatus,
  type ItemType,
  type Role,
  type TextContent,
  type ImageContent,
  type Content,
  type MessageItem,
  type FunctionCallItem,
  type FunctionCallOutputItem,
  type ReasoningItem,
  type Item,
  type FunctionDefinition,
  type Tool,
  type Usage,
  type ResponseError,
  type AuraMetadata,
  type ResponseMetadata,
  type Response,
  type InputMessage,
  type CompressionConfig,
  type ValidationConfig,
  type ConsistencyConfig,
  // stream events
  type StreamEvent,
  type ResponseCreatedEvent,
  type ResponseInProgressEvent,
  type ResponseCompletedEvent,
  type ResponseFailedEvent,
  type OutputItemAddedEvent,
  type OutputItemDoneEvent,
  type TextDeltaEvent,
  type TextDoneEvent,
  type FunctionCallDeltaEvent,
  type FunctionCallDoneEvent,
  type ErrorEvent,
} from './types.js'
