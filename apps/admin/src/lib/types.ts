// API Response Types for Admin Dashboard

export interface OverviewStats {
  // 24h metrics
  total_requests_24h: number
  input_tokens_24h: number
  output_tokens_24h: number
  cached_tokens_24h: number
  cost_24h: number
  avg_latency_24h: number
  success_rate_24h: number
  // 7d metrics
  total_requests_7d: number
  total_tokens_7d: number
  cost_7d: number
  // 30d metrics
  total_requests_30d: number
  total_tokens_30d: number
  cost_30d: number
  // All time
  total_requests_all: number
  total_tokens_all: number
  cost_all: number
  // Counts
  active_providers: number
  active_api_keys: number
  total_organizations: number
  total_end_users: number
}

export interface UsageDataPoint {
  timestamp: string
  requests: number
  input_tokens: number
  output_tokens: number
}

export interface UsageStats {
  period: string
  data_points: UsageDataPoint[]
}

export interface ProviderCost {
  provider: string
  cost: number
  percentage: number
}

export interface ModelCost {
  model: string
  cost: number
  requests: number
}

export interface CostStats {
  period: string
  total_cost: number
  by_provider: ProviderCost[]
  by_model: ModelCost[]
}

export interface ProviderHealth {
  provider_name: string
  display_name: string | null
  is_enabled: boolean
  total_requests: number
  successful_requests: number
  failed_requests: number
  success_rate: number
  avg_latency_ms: number
  p95_latency_ms: number
  total_tokens: number
  total_cost: number
  health_status: 'healthy' | 'degraded' | 'inactive' | 'no_data' | 'disabled'
}

export interface CacheStats {
  cache_hits: number
  cache_misses: number
  total_requests: number
  hit_rate: number
  total_cached_tokens: number
  estimated_savings: number
}

export interface RoutingStats {
  routing_strategy: string
  request_count: number
  total_tokens: number
  total_cost: number
  avg_latency_ms: number
  successful_requests: number
  failed_requests: number
}

export interface TimelinePoint {
  timestamp: string
  request_count: number
  total_tokens: number
  total_cost: number
  avg_latency_ms: number
  error_count: number
}

export interface RecentLog {
  id: string
  response_id: string
  conversation_id: string | null
  provider_name: string
  model_id: string
  user_id: string | null
  input_tokens: number | null
  output_tokens: number | null
  cached_tokens: number | null
  reasoning_tokens: number | null
  cost_usd: number | null
  latency_ms: number | null
  status: string
  error_code: string | null
  error_message: string | null
  routing_strategy: string | null
  cache_hit: boolean
  has_reasoning: boolean
  compressed: boolean | null
  // Tool call metadata
  has_tool_calls: boolean
  tool_calls_count: number
  tools_used: string[]
  tool_calls_data: ToolCallData[]
  created_at: string
}

export interface ToolCallData {
  name: string
  arguments: unknown
  call_id?: string
}

export interface OrganizationSummary {
  id: string
  name: string
  slug: string
  api_key_count: number
  team_count: number
  end_user_count: number
  total_tokens: number
  total_cost: number
  total_requests: number
}

export interface TeamSummary {
  id: string
  organization_id: string
  organization_name: string
  name: string
  slug: string
  description: string | null
  monthly_token_limit: number | null
  current_month_tokens: number
  member_count: number
  project_count: number
  created_at: string
}

export interface ApiKeySummary {
  id: string
  key_id: string
  name: string
  status: string
  rate_limit_rpm: number | null
  monthly_token_limit: number | null
  current_month_tokens: number
  last_used_at: string | null
  created_at: string
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cost: number
  usage_percentage: number | null
}

// RoutingRule / RoutingCondition / RoutingAction types removed alongside
// the mock CRUD endpoints (#175 / A6). The Routing page is read-only and
// uses RoutingStats from /admin/stats/routing instead.

// Time range for dashboard queries
export type TimeRange = '24h' | '2d' | '3d' | '4d' | '5d' | '6d' | '7d'

// Dynamic stats that support time range filtering
export interface DynamicStats {
  total_requests: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  total_cost: number
  avg_latency: number
  success_rate: number
  period: string
}

// Insights page types
export interface InsightsStats {
  total_requests: number
  total_tokens: number
  total_cost: number
  avg_latency: number
  tool_calls: number
  // Comparison with previous period
  requests_change: number
  tokens_change: number
  cost_change: number
  latency_change: number
  tool_calls_change: number
}

export interface ModelCostStats {
  model_id: string
  model_name: string | null
  total_cost: number
  request_count: number
  percentage: number
}

export interface ToolUsageStats {
  tool_name: string
  call_count: number
  percentage: number
}

export interface HeatmapData {
  day_of_week: number // 0-6, 0 = Monday
  hour_of_day: number // 0-23
  request_count: number
  intensity: number // 0-5 scale
}

export interface TokenUsageTimeline {
  timestamp: string
  input_tokens: number
  output_tokens: number
}

// End Users page types
export interface EndUserSummary {
  id: string
  organization_id: string
  organization_name: string
  organization_slug: string
  external_id: string
  name: string | null
  email: string | null
  total_input_tokens: number
  total_output_tokens: number
  total_tokens: number
  total_cost_usd: number
  request_count: number
  current_month_tokens: number
  monthly_token_limit: number | null
  rate_limit_rpm: number | null
  is_blocked: boolean
  first_seen_at: string | null
  last_seen_at: string | null
  created_at: string
}

// Providers page types (detailed view)
export interface ProviderSummary {
  provider_name: string
  display_name: string | null
  is_enabled: boolean
  api_base_url: string | null
  requests_24h: number
  successful_24h: number
  failed_24h: number
  success_rate: number
  avg_latency_ms: number
  p95_latency_ms: number
  p99_latency_ms: number
  min_latency_ms: number
  max_latency_ms: number
  last_request_at: string | null
  input_tokens_24h: number
  output_tokens_24h: number
  tokens_24h: number
  cost_24h: number
  all_time_requests: number
  all_time_cost: number
  health_status: 'healthy' | 'degraded' | 'inactive' | 'no_data' | 'disabled'
  created_at: string
  updated_at: string
}
