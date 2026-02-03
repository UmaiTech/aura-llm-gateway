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
  ApiKeySummary,
  RoutingRule,
} from './types'

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

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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

  return response.json()
}

// Dashboard Stats
export async function getOverviewStats(): Promise<OverviewStats> {
  return fetchApi<OverviewStats>('/admin/stats/overview')
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

// API Keys
export async function getApiKeys(): Promise<ApiKeySummary[]> {
  return fetchApi<ApiKeySummary[]>('/admin/api-keys')
}

// Routing Rules
export async function getRoutingRules(): Promise<RoutingRule[]> {
  return fetchApi<RoutingRule[]>('/admin/routing/rules')
}

export async function createRoutingRule(
  rule: Omit<RoutingRule, 'id' | 'enabled'>
): Promise<RoutingRule> {
  return fetchApi<RoutingRule>('/admin/routing/rules', {
    method: 'POST',
    body: JSON.stringify(rule),
  })
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
