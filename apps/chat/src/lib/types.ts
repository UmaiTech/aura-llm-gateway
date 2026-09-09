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
  rawResponse?: unknown  // Full raw API response for debugging
}

export interface MessageUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost?: number  // Cost in USD (based on model pricing)
}

// Compression metadata from the gateway
export interface CompressionMetadata {
  original_tokens?: number
  compressed_tokens?: number
  ratio?: number
  savings_percent?: number
  strategies?: string[]
  latency_ms?: number
}

// Validation metadata in response
export interface ValidationMetadataResponse {
  strategy: string
  n?: number
  min_confidence?: number
  selection?: string
  include_logprobs?: boolean
  // Populated by the gateway after the strategy actually runs.
  // The chat surfaces this in the MessageBubble footer so users
  // can see whether the picked strategy made any difference.
  confidence?: number
  candidates_count?: number
  selected_index?: number
}

// Consistency metadata in response
export interface ConsistencyMetadataResponse {
  strategy: string
  apply_calibration?: boolean
  has_principles?: boolean
  principles_count?: number
  has_style_profile?: boolean
  has_examples?: boolean
  examples_count?: number
}

// Compression config in response
export interface CompressionConfigResponse {
  data_format: string
  semantic_format: string
  auto_select?: boolean
}

// One model the auto router considered for a request.
export interface RoutingCandidate {
  model: string
  provider?: string | null
  tier: 'simple' | 'medium' | 'complex' | 'reasoning'
  cost_per_million?: number | null
  eligible: boolean
  predicted_cost_usd?: number | null
}

// A provider failure the auto router escalated past.
export interface RoutingEscalation {
  from_model: string
  from_tier: string
  to_model: string
  to_tier: string
  error_code: string
}

// The auto router's decision, as returned in metadata.aura.routing.
// Mirrors AutoDecision in crates/aura-core/src/router/auto/mod.rs.
export interface RoutingDecisionMetadata {
  requested_model: string
  mode: 'cost' | 'balanced' | 'quality' | string
  classifier: string
  score: number
  raw_score: number
  classified_tier: string
  tier: string
  /** Score boundaries in force (inclusive lower bound of each upper tier). */
  boundaries?: { simple_medium: number; medium_complex: number; complex_reasoning: number }
  signals?: Record<string, number>
  features?: Record<string, unknown>
  hard_filters?: string[]
  candidates?: RoutingCandidate[]
  selected: string
  selected_provider?: string | null
  reason: string
  shadow: boolean
  latency_us?: number
  escalations?: RoutingEscalation[]
  predicted_cost_usd?: number | null
  /** The routing options the gateway applied (request merged with any org override). */
  options?: RoutingOptionsRequest
}

// Request-level options for the auto router (the `routing` object on
// POST /v1/responses). Mirrors RoutingOptions in crates/aura-types.
export interface RoutingOptionsRequest {
  mode?: 'cost' | 'balanced' | 'quality'
  min_tier?: AutoRoutingTier
  max_tier?: AutoRoutingTier
  allow?: string[]
  deny?: string[]
  sticky?: boolean
  classifier?: AutoRoutingClassifier
  max_cost_usd?: number
}

export type AutoRoutingTier = 'simple' | 'medium' | 'complex' | 'reasoning'
export type AutoRoutingClassifier = 'heuristic' | 'learned' | 'llm'

export const AUTO_ROUTING_TIERS: AutoRoutingTier[] = ['simple', 'medium', 'complex', 'reasoning']

export const AUTO_ROUTING_CLASSIFIERS: Array<{ id: AutoRoutingClassifier; name: string; description: string }> = [
  { id: 'heuristic', name: 'Heuristic', description: 'Weighted keyword and shape features, sub-millisecond' },
  { id: 'learned', name: 'Learned', description: 'Logistic regression trained on this gateway\'s traffic (falls back to heuristic when none is active)' },
  { id: 'llm', name: 'LLM', description: 'Ask a small model to grade the request (adds latency, falls back to heuristic on failure)' },
]

// Playground-side settings for the auto router. `null` means "leave it
// to the gateway / organization default" and is not sent.
export interface AutoRoutingSettings {
  minTier: AutoRoutingTier | null
  maxTier: AutoRoutingTier | null
  classifier: AutoRoutingClassifier | null
  /** Per-request budget in USD; null = no budget. */
  maxCostUsd: number | null
  /** Keep the previous model inside tool loops (gateway default: on). */
  sticky: boolean
}

export const DEFAULT_AUTO_ROUTING_SETTINGS: AutoRoutingSettings = {
  minTier: null,
  maxTier: null,
  classifier: null,
  maxCostUsd: null,
  sticky: true,
}

/** True for the gateway's auto-routing aliases (`auto`, `auto:cost`, …). */
export function isAutoModel(modelId: string): boolean {
  return modelId === 'auto' || modelId.startsWith('auto:')
}

/** Build the request `routing` object from the settings; undefined when
 *  everything is at its default so pinned-model requests stay untouched. */
export function toRoutingOptions(settings: AutoRoutingSettings): RoutingOptionsRequest | undefined {
  const out: RoutingOptionsRequest = {}
  if (settings.minTier) out.min_tier = settings.minTier
  if (settings.maxTier) out.max_tier = settings.maxTier
  if (settings.classifier) out.classifier = settings.classifier
  if (settings.maxCostUsd !== null && settings.maxCostUsd > 0) out.max_cost_usd = settings.maxCostUsd
  if (!settings.sticky) out.sticky = false
  return Object.keys(out).length > 0 ? out : undefined
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
  compression?: CompressionMetadata // Compression stats if applied
  // Gateway features
  validation?: ValidationMetadataResponse
  consistency?: ConsistencyMetadataResponse
  compression_enabled?: boolean
  compression_config?: CompressionConfigResponse
  // Auto model routing (model: "auto"): the decision, plus the
  // routing_strategy label ("auto:<tier>") the gateway recorded.
  routing?: RoutingDecisionMetadata
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
  provider: 'aura' | 'openai' | 'anthropic' | 'google'
  description?: string
  /**
   * Access tier for this model on the hosted playground.
   *  - 'free': included in the playground's free quota (5 rpm, 50K tokens/mo)
   *  - 'beta': locked behind the managed-service beta. The picker shows a
   *    badge and tapping it opens the Join-beta CTA instead of selecting.
   *
   * Optional — undefined defaults to 'free'.
   */
  tier?: 'free' | 'beta'
}

/**
 * One pane in Compare Mode. The user can spawn up to 3 of these to
 * fan-out a single prompt across different model/strategy/system-prompt
 * choices and compare the outputs side-by-side.
 *
 * Compare panes are intentionally ephemeral — they don't persist across
 * conversation switches or page reloads. Persistence would balloon
 * localStorage and the whole point of compare mode is "throwaway
 * experiment", not "save my A/B/C session forever". When the user
 * toggles compare mode off, the pane state is dropped.
 */
export interface PaneConfig {
  /** Stable id so React can key panes correctly across re-renders. */
  id: string
  /** Per-pane model picker. */
  model: string
  /** Per-pane system prompt. Empty string = no instructions sent. */
  systemPrompt: string
  /** Per-pane strategy chips (matching the single-pane chat shape). */
  routingStrategy: RoutingStrategy
  validationStrategy: ValidationStrategy
  consistencyStrategy: ConsistencyStrategy
  compressionStrategy: CompressionStrategy
  /** Live transcript for this pane (cleared when the pane is reset). */
  messages: Message[]
  /** True while a response is streaming into this pane. */
  isStreaming: boolean
  /** Last error message for this pane, if the most recent send failed. */
  error: string | null
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
  routing?: RoutingOptionsRequest  // Auto router options (model: "auto")
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
  metadata?: {
    aura?: {
      provider?: string
      gateway_version?: string
      latency_ms?: number
      request_id?: string
      compression?: CompressionMetadata
      consistency?: ConsistencyMetadataResponse
      validation?: ValidationMetadataResponse
    }
  }
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

// Validation strategies for response quality
export type ValidationStrategy =
  | 'none'
  | 'logprobs'
  | 'best_of_n'
  | 'self_consistency'
  | 'confidence_threshold'

export type SelectionCriteria =
  | 'highest_confidence'
  | 'longest'
  | 'shortest'
  | 'most_relevant'
  | 'lowest_perplexity'

export interface ValidationConfig {
  strategy: ValidationStrategy
  min_confidence?: number
  n?: number
  selection?: SelectionCriteria
  include_logprobs?: boolean
  top_logprobs?: number
}

export interface ValidationMetadata {
  strategy: ValidationStrategy
  confidence?: number
  perplexity?: number
  candidates_generated?: number
  selected_index?: number
  selection_reason?: string
  passed: boolean
  warning?: string
}

// Validation strategies — all four are now wired end-to-end in the
// gateway (issue #155). The `preview` flag stays on the type so a
// strategy can be re-marked preview in the future without a schema
// change, but it's no longer set on the live options.
export const VALIDATION_STRATEGIES: {
  id: ValidationStrategy
  name: string
  description: string
  preview?: boolean
}[] = [
  { id: 'none', name: 'None', description: 'No validation (fastest)' },
  {
    id: 'logprobs',
    name: 'Log Probabilities',
    description: 'Use token logprobs for confidence (OpenAI/Gemini)',
  },
  {
    id: 'best_of_n',
    name: 'Best of N',
    description: 'Generate N responses in parallel, pick highest-confidence. Costs N× the single-call price.',
  },
  {
    id: 'self_consistency',
    name: 'Self-Consistency',
    description: 'Generate N responses, pick the most-common answer. Costs N× the single-call price.',
  },
  {
    id: 'confidence_threshold',
    name: 'Confidence Threshold',
    description: 'Flag responses as incomplete if confidence falls below threshold',
  },
]

export const SELECTION_CRITERIA: { id: SelectionCriteria; name: string }[] = [
  { id: 'highest_confidence', name: 'Highest Confidence' },
  { id: 'longest', name: 'Longest Response' },
  { id: 'shortest', name: 'Shortest Response' },
  { id: 'most_relevant', name: 'Most Relevant' },
  { id: 'lowest_perplexity', name: 'Lowest Perplexity' },
]

// Consistency strategies for cross-model response normalization
export type ConsistencyStrategy =
  | 'none'
  | 'constitutional'
  | 'reference_anchoring'
  | 'model_calibration'
  | 'format_schema'
  | 'few_shot_priming'
  | 'style_profile'
  | 'semantic_normalization'
  | 'ensemble_voting'

export type Tone = 'professional' | 'friendly' | 'neutral' | 'authoritative' | 'empathetic'
export type Formality = 'formal' | 'standard' | 'casual'
export type Verbosity = 'concise' | 'balanced' | 'detailed'

export interface StyleProfile {
  tone: Tone
  formality: Formality
  verbosity: Verbosity
  use_markdown?: boolean
  use_bullet_points?: boolean
  format_code?: boolean
  max_length?: number
}

export interface ConsistencyExample {
  input: string
  output: string
  explanation?: string
}

export interface ConsistencyConfig {
  strategy: ConsistencyStrategy
  principles?: string[]
  reference_response?: string
  examples?: ConsistencyExample[]
  output_schema?: Record<string, unknown>
  style_profile?: StyleProfile
  apply_calibration?: boolean
}

export interface ConsistencyMetadata {
  strategy: ConsistencyStrategy
  calibration_applied: boolean
  adjustments?: string[]
  style_applied?: string
  principles_injected?: number
  examples_injected?: number
}

export const CONSISTENCY_STRATEGIES: { id: ConsistencyStrategy; name: string; description: string }[] = [
  { id: 'none', name: 'None', description: 'No consistency enforcement (default)' },
  { id: 'constitutional', name: 'Constitutional', description: 'Inject guiding principles (Constitutional AI)' },
  { id: 'reference_anchoring', name: 'Reference Anchoring', description: 'Match style of example response' },
  { id: 'model_calibration', name: 'Model Calibration', description: 'Apply model-specific corrections' },
  { id: 'format_schema', name: 'Format Schema', description: 'Force structured JSON output' },
  { id: 'few_shot_priming', name: 'Few-Shot Priming', description: 'Prime with input/output examples' },
  { id: 'style_profile', name: 'Style Profile', description: 'Apply tone/formality/verbosity settings' },
  { id: 'semantic_normalization', name: 'Semantic Normalization', description: 'Two-pass fact extraction and formatting' },
  { id: 'ensemble_voting', name: 'Ensemble Voting', description: 'Query multiple models, find consensus' },
]

export const STYLE_PRESETS: { id: string; name: string; profile: StyleProfile }[] = [
  {
    id: 'technical',
    name: 'Technical',
    profile: { tone: 'professional', formality: 'formal', verbosity: 'concise', use_markdown: true, format_code: true }
  },
  {
    id: 'conversational',
    name: 'Conversational',
    profile: { tone: 'friendly', formality: 'casual', verbosity: 'balanced', use_markdown: false }
  },
  {
    id: 'academic',
    name: 'Academic',
    profile: { tone: 'neutral', formality: 'formal', verbosity: 'detailed', use_markdown: true }
  },
]

export const CONSTITUTIONAL_PRESETS: { id: string; name: string; principles: string[] }[] = [
  {
    id: 'concise',
    name: 'Concise',
    principles: [
      'Get to the point immediately.',
      'Avoid unnecessary preambles.',
      'Do not repeat the question back.',
      'Skip obvious disclaimers.',
      'End with the answer, not pleasantries.',
    ],
  },
  {
    id: 'factual',
    name: 'Factual',
    principles: [
      'Only state facts you are confident about.',
      'Clearly distinguish between facts and opinions.',
      'If uncertain, explicitly state uncertainty.',
      'Do not fabricate information or sources.',
      'Prefer specific, verifiable claims.',
    ],
  },
  {
    id: 'technical',
    name: 'Technical',
    principles: [
      'Use precise technical terminology.',
      'Include relevant code examples.',
      'Mention version numbers when relevant.',
      'Explain trade-offs when recommending solutions.',
      'Cite documentation when relevant.',
    ],
  },
]

// Compression strategies for token reduction (UI selection)
export type CompressionStrategy =
  | 'none'
  | 'auto'
  | 'json'
  | 'toon'
  | 'yaml'
  | 'aisp'

// Data format for the backend
export type DataFormat = 'json' | 'json_compact' | 'yaml' | 'toon' | 'markdown'

// Semantic format for the backend
export type SemanticFormat = 'natural' | 'aisp' | 'pseudocode'

// Compression config sent to the backend (matches Rust CompressionConfig)
export interface CompressionConfig {
  enabled: boolean
  data_format?: DataFormat
  semantic_format?: SemanticFormat
  auto_select?: boolean
  target_ratio?: number
  token_budget?: number
  token_cleanup?: boolean
  minify_json?: boolean
}

export const COMPRESSION_STRATEGIES: { id: CompressionStrategy; name: string; description: string; savings: string }[] = [
  { id: 'none', name: 'None', description: 'No compression (default)', savings: '0%' },
  { id: 'auto', name: 'Auto', description: 'Smart selection based on content', savings: '15-60%' },
  { id: 'json', name: 'JSON Minify', description: 'Whitespace removal, key shortening', savings: '15-30%' },
  { id: 'toon', name: 'TOON', description: 'Token-Oriented Object Notation for arrays', savings: '40-60%' },
  { id: 'yaml', name: 'YAML', description: 'Fewer delimiters for nested objects', savings: '10-25%' },
  { id: 'aisp', name: 'AISP', description: 'AI Symbolic Protocol for math notation', savings: 'Clarity boost' },
]
