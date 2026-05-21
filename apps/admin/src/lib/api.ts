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
  RoutingRule,
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

/**
 * Check whether the user has a valid better-auth session by hitting
 * the Vercel /api/auth/get-session endpoint (same-origin from the
 * admin app's perspective — both deploys live under
 * https://app.aura-llm.dev on prod).
 *
 * Returns the session user if logged in, null otherwise. Never
 * throws on a clean "no session" response (200 with `null` body);
 * only network/parse errors throw.
 */
export async function getCurrentSession(): Promise<{
  user: { email: string; name: string | null }
} | null> {
  const response = await fetch('/api/auth/get-session', {
    credentials: 'include',
  })
  if (!response.ok) {
    throw new Error(`Session check failed: HTTP ${response.status}`)
  }
  const data = await response.json()
  // better-auth returns null directly when no session exists, or
  // { user, session } when one does.
  if (!data || !data.user) return null
  return {
    user: { email: data.user.email, name: data.user.name ?? null },
  }
}

/**
 * Kick off the GitHub OAuth flow. better-auth's /sign-in/social
 * endpoint responds with a 302/JSON containing the GitHub authorize
 * URL — we navigate the browser there.
 */
export async function signInWithGithub(callbackUrl: string): Promise<void> {
  const response = await fetch('/api/auth/sign-in/social', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'github',
      callbackURL: callbackUrl,
    }),
  })
  if (!response.ok) {
    throw new Error(`GitHub sign-in failed: HTTP ${response.status}`)
  }
  const data = await response.json()
  if (data?.url) {
    window.location.href = data.url
  } else {
    throw new Error('GitHub sign-in did not return a redirect URL')
  }
}

/**
 * Sign out of the better-auth session. Clears the cookie on the
 * server side; the caller is responsible for clearing local store
 * state.
 */
export async function signOutSession(): Promise<void> {
  await fetch('/api/auth/sign-out', {
    method: 'POST',
    credentials: 'include',
  })
}

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
    // credentials: 'include' is required so the better-auth session
    // cookie set on `.aura-llm.dev` rides along on cross-origin
    // requests from app.aura-llm.dev → api.aura-llm.dev. Without
    // this, the gateway's admin middleware sees no cookie and falls
    // through to the bearer check (which fails for session users).
    credentials: 'include',
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
