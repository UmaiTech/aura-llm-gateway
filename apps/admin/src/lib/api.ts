// Admin Dashboard API Client

import type {
  OverviewStats,
  UsageStats,
  CostStats,
  ProviderHealth,
  CacheStats,
  RoutingStats,
  TimelinePoint,
  RecentLog,
  OrganizationSummary,
  TeamSummary,
  ApiKeySummary,
  TimeRange,
  DynamicStats,
  InsightsStats,
  ModelCostStats,
  ToolUsageStats,
  HeatmapData,
  TokenUsageTimeline,
  EndUserSummary,
  ProviderSummary,
} from './types'
import { useAuthStore } from '@/stores'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function getAuthHeaders(): Record<string, string> {
  const adminKey = useAuthStore.getState().adminKey
  if (adminKey) {
    return { Authorization: `Bearer ${adminKey}` }
  }
  return {}
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new ApiError(
      error.error || `API error: ${response.status}`,
      response.status,
      error
    )
  }

  // 204 No Content has an empty body; .json() would throw. The DELETE
  // and update endpoints return 204 — let the caller type T = void and
  // we return undefined cast.
  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

// Dashboard Stats
export async function getOverviewStats(): Promise<OverviewStats> {
  return fetchApi<OverviewStats>('/admin/stats/overview')
}

// Dashboard Stats with time range
export async function getDynamicStats(period: TimeRange = '24h'): Promise<DynamicStats> {
  return fetchApi<DynamicStats>(`/admin/stats/dynamic?period=${period}`)
}

export async function getUsageStats(): Promise<UsageStats> {
  return fetchApi<UsageStats>('/admin/stats/usage')
}

export async function getCostStats(): Promise<CostStats> {
  return fetchApi<CostStats>('/admin/stats/costs')
}

export async function getProviderHealth(): Promise<ProviderHealth[]> {
  return fetchApi<ProviderHealth[]>('/admin/stats/providers')
}

export async function getCacheStats(): Promise<CacheStats> {
  return fetchApi<CacheStats>('/admin/stats/cache')
}

export async function getRoutingStats(): Promise<RoutingStats[]> {
  return fetchApi<RoutingStats[]>('/admin/stats/routing')
}

// Timelines
export async function getHourlyTimeline(): Promise<TimelinePoint[]> {
  return fetchApi<TimelinePoint[]>('/admin/stats/timeline/hourly')
}

export async function getDailyTimeline(): Promise<TimelinePoint[]> {
  return fetchApi<TimelinePoint[]>('/admin/stats/timeline/daily')
}

// Logs
export async function getRecentLogs(params?: { limit?: number; offset?: number }): Promise<RecentLog[]> {
  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set('limit', params.limit.toString())
  if (params?.offset) searchParams.set('offset', params.offset.toString())

  const query = searchParams.toString()
  return fetchApi<RecentLog[]>(`/admin/logs/recent${query ? `?${query}` : ''}`)
}

// Organizations
export async function getOrganizations(): Promise<OrganizationSummary[]> {
  return fetchApi<OrganizationSummary[]>('/admin/organizations')
}

// Teams
export async function getTeams(): Promise<TeamSummary[]> {
  return fetchApi<TeamSummary[]>('/admin/teams')
}

// API Keys. Pass an organizationId to scope the result to one org —
// useful for monitoring the Playground (Demo) org separately from
// real customer keys.
export async function getApiKeys(
  organizationId?: string | null,
): Promise<ApiKeySummary[]> {
  const query = organizationId
    ? `?organization_id=${encodeURIComponent(organizationId)}`
    : ''
  return fetchApi<ApiKeySummary[]>(`/admin/api-keys${query}`)
}

// End Users. Same org filter shape as getApiKeys.
export async function getEndUsers(
  organizationId?: string | null,
): Promise<EndUserSummary[]> {
  const query = organizationId
    ? `?organization_id=${encodeURIComponent(organizationId)}`
    : ''
  return fetchApi<EndUserSummary[]>(`/admin/end-users${query}`)
}

// Providers (detailed view)
export async function getProviders(): Promise<ProviderSummary[]> {
  return fetchApi<ProviderSummary[]>('/admin/providers')
}

// Routing rule CRUD methods removed (#175 / A6) — the backend handlers
// were mock-only and the RoutingPage now shows read-only stats from
// /admin/stats/routing. Restore these when a routing_rules table exists.

// Insights Stats
export async function getInsightsStats(period: TimeRange = '7d'): Promise<InsightsStats> {
  return fetchApi<InsightsStats>(`/admin/stats/insights?period=${period}`)
}

export async function getModelCosts(period: TimeRange = '7d'): Promise<ModelCostStats[]> {
  return fetchApi<ModelCostStats[]>(`/admin/stats/model-costs?period=${period}`)
}

export async function getToolUsage(period: TimeRange = '7d'): Promise<ToolUsageStats[]> {
  return fetchApi<ToolUsageStats[]>(`/admin/stats/tool-usage?period=${period}`)
}

export async function getUsageHeatmap(period: TimeRange = '7d'): Promise<HeatmapData[]> {
  return fetchApi<HeatmapData[]>(`/admin/stats/heatmap?period=${period}`)
}

export async function getTokenTimeline(period: TimeRange = '7d'): Promise<TokenUsageTimeline[]> {
  return fetchApi<TokenUsageTimeline[]>(`/admin/stats/token-timeline?period=${period}`)
}

// Helper to check API availability
export async function checkApiHealth(): Promise<boolean> {
  try {
    await fetchApi('/health')
    return true
  } catch {
    return false
  }
}

// Export types for convenience
export type { ApiError }
export * from './types'

// ---------------------------------------------------------------------------
// CRUD — Organizations
// ---------------------------------------------------------------------------

export interface OrganizationRecord {
  id: string
  name: string
  slug: string
  owner_id: string
  settings?: unknown
  created_at: string
  updated_at: string
}

export async function createOrganization(payload: {
  name: string
  slug: string
  owner_id?: string
}): Promise<OrganizationRecord> {
  return fetchApi<OrganizationRecord>('/admin/organizations', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateOrganization(
  id: string,
  payload: { name?: string; settings?: unknown }
): Promise<OrganizationRecord> {
  return fetchApi<OrganizationRecord>(`/admin/organizations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteOrganization(id: string): Promise<void> {
  await fetchApi<void>(`/admin/organizations/${id}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// CRUD — Teams
// ---------------------------------------------------------------------------

export interface TeamRecord {
  id: string
  organization_id: string
  name: string
  slug: string
  description?: string
  monthly_token_limit?: number
  current_month_tokens: number
  created_at: string
}

export async function createTeam(payload: {
  organization_id: string
  name: string
  slug: string
  description?: string
  monthly_token_limit?: number
}): Promise<TeamRecord> {
  return fetchApi<TeamRecord>('/admin/teams', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateTeam(
  id: string,
  payload: { name?: string; description?: string; monthly_token_limit?: number }
): Promise<void> {
  await fetchApi<void>(`/admin/teams/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteTeam(id: string): Promise<void> {
  await fetchApi<void>(`/admin/teams/${id}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// CRUD — End Users
// ---------------------------------------------------------------------------

export async function createEndUser(payload: {
  organization_id: string
  external_id: string
  name?: string
  email?: string
}): Promise<EndUserSummary> {
  return fetchApi<EndUserSummary>('/admin/end-users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateEndUser(
  id: string,
  payload: { monthly_token_limit?: number; blocked?: boolean }
): Promise<void> {
  await fetchApi<void>(`/admin/end-users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteEndUser(id: string): Promise<void> {
  await fetchApi<void>(`/admin/end-users/${id}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// CRUD — API Keys
// ---------------------------------------------------------------------------

export interface CreatedApiKey {
  /** Full key — shown once, never retrievable again. */
  key: string
  key_id: string
  name: string
}

export async function createApiKey(payload: {
  name: string
  description?: string
  organization_id: string
  rate_limit_rpm?: number
  monthly_token_limit?: number
  daily_message_limit?: number
}): Promise<CreatedApiKey> {
  return fetchApi<CreatedApiKey>('/admin/api-keys', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function deleteApiKey(id: string): Promise<void> {
  await fetchApi<void>(`/admin/api-keys/${id}`, { method: 'DELETE' })
}
