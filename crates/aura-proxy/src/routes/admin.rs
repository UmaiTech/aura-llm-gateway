//! Admin dashboard endpoints
//!
//! Provides admin-specific endpoints for:
//! - Dashboard statistics and overview
//! - Provider health metrics
//! - Routing configuration
//! - Cache statistics
//! - Usage timelines

use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Dashboard stats
        .route("/admin/stats/overview", get(get_overview_stats))
        .route("/admin/stats/dynamic", get(get_dynamic_stats))
        .route("/admin/stats/usage", get(get_usage_stats))
        .route("/admin/stats/costs", get(get_cost_stats))
        .route("/admin/stats/providers", get(get_provider_health))
        .route("/admin/stats/cache", get(get_cache_stats))
        .route("/admin/stats/routing", get(get_routing_stats))
        .route("/admin/stats/timeline/hourly", get(get_hourly_timeline))
        .route("/admin/stats/timeline/daily", get(get_daily_timeline))
        // Insights endpoints
        .route("/admin/stats/insights", get(get_insights_stats))
        .route("/admin/stats/model-costs", get(get_model_costs))
        .route("/admin/stats/tool-usage", get(get_tool_usage))
        .route("/admin/stats/heatmap", get(get_usage_heatmap))
        .route("/admin/stats/token-timeline", get(get_token_timeline))
        // Request logs for dev logs page
        .route("/admin/logs/recent", get(get_recent_logs))
        // Routing configuration
        .route("/admin/routing/rules", get(list_routing_rules))
        .route(
            "/admin/routing/rules",
            axum::routing::post(create_routing_rule),
        )
        // Organizations
        .route("/admin/organizations", get(list_organizations))
        // Teams
        .route("/admin/teams", get(list_teams))
        // API Keys
        .route("/admin/api-keys", get(list_api_keys))
        // End Users
        .route("/admin/end-users", get(list_end_users))
        // Providers (full detail)
        .route("/admin/providers", get(list_providers))
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct OverviewStats {
    // 24h metrics
    pub total_requests_24h: i64,
    pub input_tokens_24h: i64,
    pub output_tokens_24h: i64,
    pub cached_tokens_24h: i64,
    pub cost_24h: f64,
    pub avg_latency_24h: i32,
    pub success_rate_24h: f64,
    // 7d metrics
    pub total_requests_7d: i64,
    pub total_tokens_7d: i64,
    pub cost_7d: f64,
    // 30d metrics
    pub total_requests_30d: i64,
    pub total_tokens_30d: i64,
    pub cost_30d: f64,
    // All time
    pub total_requests_all: i64,
    pub total_tokens_all: i64,
    pub cost_all: f64,
    // Counts
    pub active_providers: i32,
    pub active_api_keys: i32,
    pub total_organizations: i32,
    pub total_end_users: i32,
}

#[derive(Debug, Serialize)]
pub struct UsageStats {
    pub period: String,
    pub data_points: Vec<UsageDataPoint>,
}

#[derive(Debug, Serialize)]
pub struct UsageDataPoint {
    pub timestamp: String,
    pub requests: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
}

#[derive(Debug, Serialize)]
pub struct CostStats {
    pub period: String,
    pub total_cost: f64,
    pub by_provider: Vec<ProviderCost>,
    pub by_model: Vec<ModelCost>,
}

#[derive(Debug, Serialize)]
pub struct ProviderCost {
    pub provider: String,
    pub cost: f64,
    pub percentage: f64,
}

#[derive(Debug, Serialize)]
pub struct ModelCost {
    pub model: String,
    pub cost: f64,
    pub requests: i64,
}

#[derive(Debug, Serialize)]
pub struct ProviderHealth {
    pub provider_name: String,
    pub display_name: Option<String>,
    pub is_enabled: bool,
    pub total_requests: i64,
    pub successful_requests: i64,
    pub failed_requests: i64,
    pub success_rate: f64,
    pub avg_latency_ms: i32,
    pub p95_latency_ms: i32,
    pub total_tokens: i64,
    pub total_cost: f64,
    pub health_status: String,
}

#[derive(Debug, Serialize)]
pub struct CacheStats {
    pub cache_hits: i64,
    pub cache_misses: i64,
    pub total_requests: i64,
    pub hit_rate: f64,
    pub total_cached_tokens: i64,
    pub estimated_savings: f64,
}

#[derive(Debug, Serialize)]
pub struct RoutingStats {
    pub routing_strategy: String,
    pub request_count: i64,
    pub total_tokens: i64,
    pub total_cost: f64,
    pub avg_latency_ms: i32,
    pub successful_requests: i64,
    pub failed_requests: i64,
}

#[derive(Debug, Serialize)]
pub struct TimelinePoint {
    pub timestamp: String,
    pub request_count: i64,
    pub total_tokens: i64,
    pub total_cost: f64,
    pub avg_latency_ms: i32,
    pub error_count: i64,
}

#[derive(Debug, Serialize)]
pub struct RecentLog {
    pub id: Uuid,
    pub response_id: String,
    pub conversation_id: Option<Uuid>,
    pub provider_name: String,
    pub model_id: String,
    pub user_id: Option<String>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cached_tokens: Option<i32>,
    pub reasoning_tokens: Option<i32>,
    pub cost_usd: Option<f64>,
    pub latency_ms: Option<i32>,
    pub status: String,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub routing_strategy: Option<String>,
    pub cache_hit: bool,
    pub has_reasoning: bool,
    pub compressed: Option<bool>,
    // Tool call metadata
    pub has_tool_calls: bool,
    pub tool_calls_count: i32,
    pub tools_used: Vec<String>,
    pub tool_calls_data: Vec<ToolCallData>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolCallData {
    pub name: String,
    pub arguments: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub call_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OrganizationSummary {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub api_key_count: i64,
    pub team_count: i64,
    pub end_user_count: i64,
    pub total_tokens: i64,
    pub total_cost: f64,
    pub total_requests: i64,
}

#[derive(Debug, Serialize)]
pub struct TeamSummary {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub organization_name: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub monthly_token_limit: Option<i64>,
    pub current_month_tokens: i64,
    pub member_count: i64,
    pub project_count: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ApiKeySummary {
    pub id: Uuid,
    pub key_id: String,
    pub name: String,
    pub status: String,
    pub rate_limit_rpm: Option<i32>,
    pub monthly_token_limit: Option<i64>,
    pub current_month_tokens: i64,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub total_requests: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cost: f64,
    pub usage_percentage: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct EndUserSummary {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub organization_name: String,
    pub organization_slug: String,
    pub external_id: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub request_count: i64,
    pub current_month_tokens: i64,
    pub monthly_token_limit: Option<i64>,
    pub rate_limit_rpm: Option<i32>,
    pub is_blocked: bool,
    pub first_seen_at: Option<DateTime<Utc>>,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ProviderSummary {
    pub provider_name: String,
    pub display_name: Option<String>,
    pub is_enabled: bool,
    pub api_base_url: Option<String>,
    pub requests_24h: i64,
    pub successful_24h: i64,
    pub failed_24h: i64,
    pub success_rate: f64,
    pub avg_latency_ms: i32,
    pub p95_latency_ms: i32,
    pub p99_latency_ms: i32,
    pub min_latency_ms: i32,
    pub max_latency_ms: i32,
    pub last_request_at: Option<DateTime<Utc>>,
    pub input_tokens_24h: i64,
    pub output_tokens_24h: i64,
    pub tokens_24h: i64,
    pub cost_24h: f64,
    pub all_time_requests: i64,
    pub all_time_cost: f64,
    pub health_status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoutingRule {
    pub id: String,
    pub name: String,
    pub description: String,
    pub strategy: String,
    pub priority: i32,
    pub enabled: bool,
    pub conditions: Vec<RoutingCondition>,
    pub actions: Vec<RoutingAction>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoutingCondition {
    pub condition_type: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoutingAction {
    pub provider: String,
    pub model: String,
    pub weight: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoutingRuleRequest {
    pub name: String,
    pub description: String,
    pub strategy: String,
    pub priority: i32,
    pub conditions: Vec<RoutingCondition>,
    pub actions: Vec<RoutingAction>,
}

#[derive(Debug, Deserialize)]
pub struct LogsQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct PeriodQuery {
    pub period: Option<String>, // 24h, 2d, 3d, 4d, 5d, 6d, 7d
}

impl PeriodQuery {
    /// Convert period string to PostgreSQL interval
    fn to_interval(&self) -> &'static str {
        match self.period.as_deref() {
            Some("24h") | Some("1d") => "24 hours",
            Some("2d") => "2 days",
            Some("3d") => "3 days",
            Some("4d") => "4 days",
            Some("5d") => "5 days",
            Some("6d") => "6 days",
            Some("7d") => "7 days",
            _ => "24 hours", // default
        }
    }

    /// Get the period string for response
    fn period_str(&self) -> &str {
        self.period.as_deref().unwrap_or("24h")
    }
}

// Dynamic stats with configurable time range
#[derive(Debug, Serialize)]
pub struct DynamicStats {
    pub total_requests: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cached_tokens: i64,
    pub total_cost: f64,
    pub avg_latency: i32,
    pub success_rate: f64,
    pub period: String,
}

// Insights page types
#[derive(Debug, Serialize)]
pub struct InsightsStats {
    pub total_requests: i64,
    pub total_tokens: i64,
    pub total_cost: f64,
    pub avg_latency: i32,
    pub tool_calls: i64,
    // Comparison with previous period (percentage change)
    pub requests_change: f64,
    pub tokens_change: f64,
    pub cost_change: f64,
    pub latency_change: f64,
    pub tool_calls_change: f64,
}

#[derive(Debug, Serialize)]
pub struct ModelCostStats {
    pub model_id: String,
    pub model_name: Option<String>,
    pub total_cost: f64,
    pub request_count: i64,
    pub percentage: f64,
}

#[derive(Debug, Serialize)]
pub struct ToolUsageStats {
    pub tool_name: String,
    pub call_count: i64,
    pub percentage: f64,
}

#[derive(Debug, Serialize)]
pub struct HeatmapData {
    pub day_of_week: i32, // 0-6, 0 = Monday
    pub hour_of_day: i32, // 0-23
    pub request_count: i64,
    pub intensity: i32, // 0-5 scale
}

#[derive(Debug, Serialize)]
pub struct TokenUsageTimeline {
    pub timestamp: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
}

// ============================================================================
// Helper to get db pool
// ============================================================================

fn db_unavailable() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(serde_json::json!({
            "error": "Database not configured"
        })),
    )
}

// ============================================================================
// Dashboard Stats Endpoints
// ============================================================================

async fn get_overview_stats(
    State(state): State<AppState>,
) -> Result<Json<OverviewStats>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    // Get main stats from view
    let stats_row = sqlx::query(r#"SELECT * FROM v_dashboard_stats"#)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch dashboard stats: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    // Get active provider count
    let provider_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM providers WHERE is_enabled = true")
            .fetch_one(pool)
            .await
            .unwrap_or(0);

    // Get active API key count
    let api_key_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM api_keys WHERE status = 'active'")
            .fetch_one(pool)
            .await
            .unwrap_or(0);

    // Get organization count
    let org_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM organizations")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    // Get end user count
    let end_user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM end_users")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    Ok(Json(OverviewStats {
        total_requests_24h: stats_row.get::<i64, _>("total_requests_24h"),
        input_tokens_24h: stats_row.get::<i64, _>("input_tokens_24h"),
        output_tokens_24h: stats_row.get::<i64, _>("output_tokens_24h"),
        cached_tokens_24h: stats_row.get::<i64, _>("cached_tokens_24h"),
        cost_24h: stats_row.get::<f64, _>("cost_24h"),
        avg_latency_24h: stats_row.get::<i32, _>("avg_latency_24h"),
        success_rate_24h: stats_row
            .try_get::<f64, _>("success_rate_24h")
            .unwrap_or(100.0),
        total_requests_7d: stats_row.get::<i64, _>("total_requests_7d"),
        total_tokens_7d: stats_row.get::<i64, _>("total_tokens_7d"),
        cost_7d: stats_row.get::<f64, _>("cost_7d"),
        total_requests_30d: stats_row.get::<i64, _>("total_requests_30d"),
        total_tokens_30d: stats_row.get::<i64, _>("total_tokens_30d"),
        cost_30d: stats_row.get::<f64, _>("cost_30d"),
        total_requests_all: stats_row.get::<i64, _>("total_requests_all"),
        total_tokens_all: stats_row.get::<i64, _>("total_tokens_all"),
        cost_all: stats_row.get::<f64, _>("cost_all"),
        active_providers: provider_count as i32,
        active_api_keys: api_key_count as i32,
        total_organizations: org_count as i32,
        total_end_users: end_user_count as i32,
    }))
}

async fn get_usage_stats(
    State(state): State<AppState>,
) -> Result<Json<UsageStats>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let rows = sqlx::query(r#"SELECT * FROM v_daily_usage ORDER BY date DESC LIMIT 7"#)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch usage stats: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    let data_points: Vec<UsageDataPoint> = rows
        .into_iter()
        .map(|row| {
            let date: NaiveDate = row.get("date");
            // total_tokens may be NUMERIC from SQL SUM
            let total_tokens: i64 = row
                .try_get::<i64, _>("total_tokens")
                .or_else(|_| row.try_get::<f64, _>("total_tokens").map(|f| f as i64))
                .unwrap_or(0);
            // Estimate input/output split (typically ~60% input, 40% output)
            let input_estimate = (total_tokens as f64 * 0.6) as i64;
            let output_estimate = total_tokens - input_estimate;

            UsageDataPoint {
                timestamp: date.to_string(),
                requests: row.try_get("request_count").unwrap_or(0),
                input_tokens: input_estimate,
                output_tokens: output_estimate,
            }
        })
        .rev() // Reverse to show oldest to newest
        .collect();

    Ok(Json(UsageStats {
        period: "7d".to_string(),
        data_points,
    }))
}

async fn get_cost_stats(
    State(state): State<AppState>,
) -> Result<Json<CostStats>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    // Get costs by provider from v_provider_health
    let provider_rows = sqlx::query(
        r#"SELECT provider_name, total_cost FROM v_provider_health WHERE total_cost > 0 ORDER BY total_cost DESC"#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch provider costs: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("Database error: {}", e)})),
        )
    })?;

    let total_cost: f64 = provider_rows
        .iter()
        .filter_map(|r| r.try_get::<f64, _>("total_cost").ok())
        .sum();

    let by_provider: Vec<ProviderCost> = provider_rows
        .iter()
        .filter_map(|row| {
            let provider_name: Option<String> = row.try_get("provider_name").ok();
            let cost: f64 = row.try_get("total_cost").unwrap_or(0.0);
            provider_name.map(|provider| ProviderCost {
                provider,
                cost,
                percentage: if total_cost > 0.0 {
                    (cost / total_cost * 100.0 * 100.0).round() / 100.0
                } else {
                    0.0
                },
            })
        })
        .collect();

    // Get costs by model from v_model_usage
    let model_rows = sqlx::query(
        r#"SELECT model_id, total_cost, request_count FROM v_model_usage WHERE total_cost > 0 ORDER BY total_cost DESC LIMIT 10"#
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let by_model: Vec<ModelCost> = model_rows
        .iter()
        .filter_map(|row| {
            let model: Option<String> = row.try_get("model_id").ok();
            model.map(|m| ModelCost {
                model: m,
                cost: row.try_get("total_cost").unwrap_or(0.0),
                requests: row.try_get("request_count").unwrap_or(0),
            })
        })
        .collect();

    Ok(Json(CostStats {
        period: "7d".to_string(),
        total_cost,
        by_provider,
        by_model,
    }))
}

async fn get_provider_health(
    State(state): State<AppState>,
) -> Result<Json<Vec<ProviderHealth>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let rows = sqlx::query(r#"SELECT * FROM v_provider_health"#)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch provider health: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    let providers: Vec<ProviderHealth> = rows
        .iter()
        .filter_map(|row| {
            // provider_name should not be NULL after fix, but be defensive
            let provider_name: Option<String> = row.try_get("provider_name").ok();
            provider_name.map(|name| ProviderHealth {
                provider_name: name,
                display_name: row.try_get("display_name").ok().flatten(),
                is_enabled: row.try_get("is_enabled").unwrap_or(false),
                total_requests: row.try_get("total_requests").unwrap_or(0),
                successful_requests: row.try_get("successful_requests").unwrap_or(0),
                failed_requests: row.try_get("failed_requests").unwrap_or(0),
                success_rate: row.try_get::<f64, _>("success_rate").unwrap_or(100.0),
                avg_latency_ms: row.try_get("avg_latency_ms").unwrap_or(0),
                p95_latency_ms: row.try_get("p95_latency_ms").unwrap_or(0),
                total_tokens: row.try_get("total_tokens").unwrap_or(0),
                total_cost: row.try_get("total_cost").unwrap_or(0.0),
                health_status: row
                    .try_get("health_status")
                    .unwrap_or_else(|_| "unknown".to_string()),
            })
        })
        .collect();

    Ok(Json(providers))
}

async fn get_cache_stats(
    State(state): State<AppState>,
) -> Result<Json<CacheStats>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let row = sqlx::query(r#"SELECT * FROM v_cache_stats"#)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch cache stats: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    Ok(Json(CacheStats {
        cache_hits: row.try_get("cache_hits").unwrap_or(0),
        cache_misses: row.try_get("cache_misses").unwrap_or(0),
        total_requests: row.try_get("total_requests").unwrap_or(0),
        hit_rate: row.try_get::<f64, _>("hit_rate").unwrap_or(0.0),
        total_cached_tokens: row.try_get("total_cached_tokens").unwrap_or(0),
        estimated_savings: row.try_get::<f64, _>("estimated_savings").unwrap_or(0.0),
    }))
}

async fn get_routing_stats(
    State(state): State<AppState>,
) -> Result<Json<Vec<RoutingStats>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let rows = sqlx::query(r#"SELECT * FROM v_routing_stats"#)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch routing stats: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    let stats: Vec<RoutingStats> = rows
        .iter()
        .map(|row| {
            let total_tokens: i64 = row
                .try_get::<i64, _>("total_tokens")
                .or_else(|_| row.try_get::<f64, _>("total_tokens").map(|f| f as i64))
                .unwrap_or(0);
            RoutingStats {
                routing_strategy: row.get("routing_strategy"),
                request_count: row.try_get("request_count").unwrap_or(0),
                total_tokens,
                total_cost: row.try_get("total_cost").unwrap_or(0.0),
                avg_latency_ms: row.try_get("avg_latency_ms").unwrap_or(0),
                successful_requests: row.try_get("successful_requests").unwrap_or(0),
                failed_requests: row.try_get("failed_requests").unwrap_or(0),
            }
        })
        .collect();

    Ok(Json(stats))
}

async fn get_hourly_timeline(
    State(state): State<AppState>,
) -> Result<Json<Vec<TimelinePoint>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let rows = sqlx::query(r#"SELECT * FROM v_usage_timeline ORDER BY hour"#)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch hourly timeline: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    let timeline: Vec<TimelinePoint> = rows
        .iter()
        .map(|row| {
            let hour: DateTime<Utc> = row.get("hour");
            let total_tokens: i64 = row
                .try_get::<i64, _>("total_tokens")
                .or_else(|_| row.try_get::<f64, _>("total_tokens").map(|f| f as i64))
                .unwrap_or(0);
            TimelinePoint {
                timestamp: hour.to_rfc3339(),
                request_count: row.try_get("request_count").unwrap_or(0),
                total_tokens,
                total_cost: row.try_get("total_cost").unwrap_or(0.0),
                avg_latency_ms: row.try_get("avg_latency_ms").unwrap_or(0),
                error_count: row.try_get("error_count").unwrap_or(0),
            }
        })
        .collect();

    Ok(Json(timeline))
}

async fn get_daily_timeline(
    State(state): State<AppState>,
) -> Result<Json<Vec<TimelinePoint>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let rows = sqlx::query(r#"SELECT * FROM v_daily_usage ORDER BY date"#)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch daily timeline: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    let timeline: Vec<TimelinePoint> = rows
        .iter()
        .map(|row| {
            let date: NaiveDate = row.get("date");
            let total_tokens: i64 = row
                .try_get::<i64, _>("total_tokens")
                .or_else(|_| row.try_get::<f64, _>("total_tokens").map(|f| f as i64))
                .unwrap_or(0);
            TimelinePoint {
                timestamp: date.to_string(),
                request_count: row.try_get("request_count").unwrap_or(0),
                total_tokens,
                total_cost: row.try_get("total_cost").unwrap_or(0.0),
                avg_latency_ms: row.try_get("avg_latency_ms").unwrap_or(0),
                error_count: row.try_get("error_count").unwrap_or(0),
            }
        })
        .collect();

    Ok(Json(timeline))
}

// ============================================================================
// Request Logs Endpoint (for Dev Logs page)
// ============================================================================

async fn get_recent_logs(
    State(state): State<AppState>,
    Query(params): Query<LogsQuery>,
) -> Result<Json<Vec<RecentLog>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let limit = params.limit.unwrap_or(50).min(200);
    let offset = params.offset.unwrap_or(0);

    let rows = sqlx::query(
        r#"
        SELECT * FROM v_recent_requests
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
        "#,
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch recent logs: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("Database error: {}", e)})),
        )
    })?;

    let logs: Vec<RecentLog> = rows
        .iter()
        .map(|row| {
            // Parse tools_used from JSONB array
            let tools_used: Vec<String> = row
                .try_get::<Option<serde_json::Value>, _>("tools_used")
                .ok()
                .flatten()
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_default();

            // Parse tool_calls_data from JSONB array
            let tool_calls_data: Vec<ToolCallData> = row
                .try_get::<Option<serde_json::Value>, _>("tool_calls_data")
                .ok()
                .flatten()
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_default();

            RecentLog {
                id: row.get("id"),
                response_id: row.get("response_id"),
                conversation_id: row.try_get("conversation_id").ok().flatten(),
                provider_name: row.get("provider_name"),
                model_id: row.get("model_id"),
                user_id: row.try_get("user_id").ok().flatten(),
                input_tokens: row.try_get("input_tokens").ok().flatten(),
                output_tokens: row.try_get("output_tokens").ok().flatten(),
                cached_tokens: row.try_get("cached_tokens").ok().flatten(),
                reasoning_tokens: row.try_get("reasoning_tokens").ok().flatten(),
                cost_usd: row.try_get("cost_usd").ok().flatten(),
                latency_ms: row.try_get("latency_ms").ok().flatten(),
                status: row.get("status"),
                error_code: row.try_get("error_code").ok().flatten(),
                error_message: row.try_get("error_message").ok().flatten(),
                routing_strategy: row.try_get("routing_strategy").ok().flatten(),
                cache_hit: row.try_get("cache_hit").unwrap_or(false),
                has_reasoning: row.try_get("has_reasoning").unwrap_or(false),
                compressed: row.try_get("compressed").ok().flatten(),
                has_tool_calls: row.try_get("has_tool_calls").unwrap_or(false),
                tool_calls_count: row.try_get("tool_calls_count").unwrap_or(0),
                tools_used,
                tool_calls_data,
                created_at: row.get("created_at"),
            }
        })
        .collect();

    Ok(Json(logs))
}

// ============================================================================
// Organizations Endpoint
// ============================================================================

async fn list_organizations(
    State(state): State<AppState>,
) -> Result<Json<Vec<OrganizationSummary>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let rows = sqlx::query(r#"SELECT * FROM v_organization_usage"#)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch organizations: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    let orgs: Vec<OrganizationSummary> = rows
        .iter()
        .map(|row| {
            // total_tokens may be NUMERIC from SQL SUM, so try i64 first, then f64
            let total_tokens: i64 = row
                .try_get::<i64, _>("total_tokens")
                .or_else(|_| row.try_get::<f64, _>("total_tokens").map(|f| f as i64))
                .unwrap_or(0);

            OrganizationSummary {
                id: row.get("organization_id"),
                name: row.get("organization_name"),
                slug: row.get("slug"),
                api_key_count: row.try_get("api_key_count").unwrap_or(0),
                team_count: row.try_get("team_count").unwrap_or(0),
                end_user_count: row.try_get("end_user_count").unwrap_or(0),
                total_tokens,
                total_cost: row.try_get("total_cost").unwrap_or(0.0),
                total_requests: row.try_get("total_requests").unwrap_or(0),
            }
        })
        .collect();

    Ok(Json(orgs))
}

// ============================================================================
// Teams Endpoint
// ============================================================================

async fn list_teams(
    State(state): State<AppState>,
) -> Result<Json<Vec<TeamSummary>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let rows = sqlx::query(
        r#"
        SELECT
            t.id as team_id,
            t.organization_id,
            o.name as organization_name,
            t.name as team_name,
            t.slug,
            t.description,
            t.monthly_token_limit,
            t.current_month_tokens,
            t.created_at,
            COALESCE((SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id), 0) as member_count,
            COALESCE((SELECT COUNT(*) FROM projects p WHERE p.team_id = t.id), 0) as project_count
        FROM teams t
        JOIN organizations o ON o.id = t.organization_id
        ORDER BY o.name, t.name
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch teams: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("Database error: {}", e)})),
        )
    })?;

    let teams: Vec<TeamSummary> = rows
        .iter()
        .map(|row| TeamSummary {
            id: row.get("team_id"),
            organization_id: row.get("organization_id"),
            organization_name: row.get("organization_name"),
            name: row.get("team_name"),
            slug: row.get("slug"),
            description: row.try_get("description").ok().flatten(),
            monthly_token_limit: row.try_get("monthly_token_limit").ok().flatten(),
            current_month_tokens: row.try_get("current_month_tokens").unwrap_or(0),
            member_count: row.try_get("member_count").unwrap_or(0),
            project_count: row.try_get("project_count").unwrap_or(0),
            created_at: row.get("created_at"),
        })
        .collect();

    Ok(Json(teams))
}

// ============================================================================
// API Keys Endpoint
// ============================================================================

async fn list_api_keys(
    State(state): State<AppState>,
) -> Result<Json<Vec<ApiKeySummary>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let rows = sqlx::query(r#"SELECT * FROM v_api_key_stats LIMIT 100"#)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch API keys: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    let keys: Vec<ApiKeySummary> = rows
        .iter()
        .map(|row| ApiKeySummary {
            id: row.get("id"),
            key_id: row.get("key_id"),
            name: row.get("name"),
            status: row.get("status"),
            rate_limit_rpm: row.get("rate_limit_rpm"),
            monthly_token_limit: row.get("monthly_token_limit"),
            current_month_tokens: row.get("current_month_tokens"),
            last_used_at: row.get("last_used_at"),
            created_at: row.get("created_at"),
            total_requests: row.get("total_requests"),
            total_input_tokens: row.get("total_input_tokens"),
            total_output_tokens: row.get("total_output_tokens"),
            total_cost: row.get("total_cost"),
            usage_percentage: row.try_get::<f64, _>("usage_percentage").ok(),
        })
        .collect();

    Ok(Json(keys))
}

// ============================================================================
// End Users Endpoint
// ============================================================================

async fn list_end_users(
    State(state): State<AppState>,
) -> Result<Json<Vec<EndUserSummary>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let rows = sqlx::query(r#"SELECT * FROM v_end_users LIMIT 100"#)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch end users: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    let users: Vec<EndUserSummary> = rows
        .iter()
        .map(|row| EndUserSummary {
            id: row.get("id"),
            organization_id: row.get("organization_id"),
            organization_name: row.get("organization_name"),
            organization_slug: row.get("organization_slug"),
            external_id: row.get("external_id"),
            name: row.try_get("name").ok().flatten(),
            email: row.try_get("email").ok().flatten(),
            total_input_tokens: row.try_get("total_input_tokens").unwrap_or(0),
            total_output_tokens: row.try_get("total_output_tokens").unwrap_or(0),
            total_tokens: row.try_get("total_tokens").unwrap_or(0),
            total_cost_usd: row.try_get("total_cost_usd").unwrap_or(0.0),
            request_count: row.try_get("request_count").unwrap_or(0),
            current_month_tokens: row.try_get("current_month_tokens").unwrap_or(0),
            monthly_token_limit: row.try_get("monthly_token_limit").ok().flatten(),
            rate_limit_rpm: row.try_get("rate_limit_rpm").ok().flatten(),
            is_blocked: row.try_get("is_blocked").unwrap_or(false),
            first_seen_at: row.try_get("first_seen_at").ok().flatten(),
            last_seen_at: row.try_get("last_seen_at").ok().flatten(),
            created_at: row.get("created_at"),
        })
        .collect();

    Ok(Json(users))
}

// ============================================================================
// Providers Endpoint (detailed view)
// ============================================================================

async fn list_providers(
    State(state): State<AppState>,
) -> Result<Json<Vec<ProviderSummary>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let rows = sqlx::query(r#"SELECT * FROM v_providers"#)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch providers: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    let providers: Vec<ProviderSummary> = rows
        .iter()
        .map(|row| ProviderSummary {
            provider_name: row.get("provider_name"),
            display_name: row.try_get("display_name").ok().flatten(),
            is_enabled: row.try_get("is_enabled").unwrap_or(false),
            api_base_url: row.try_get("api_base_url").ok().flatten(),
            requests_24h: row.try_get("requests_24h").unwrap_or(0),
            successful_24h: row.try_get("successful_24h").unwrap_or(0),
            failed_24h: row.try_get("failed_24h").unwrap_or(0),
            success_rate: row.try_get("success_rate").unwrap_or(100.0),
            avg_latency_ms: row.try_get("avg_latency_ms").unwrap_or(0),
            p95_latency_ms: row.try_get("p95_latency_ms").unwrap_or(0),
            p99_latency_ms: row.try_get("p99_latency_ms").unwrap_or(0),
            min_latency_ms: row.try_get("min_latency_ms").unwrap_or(0),
            max_latency_ms: row.try_get("max_latency_ms").unwrap_or(0),
            last_request_at: row.try_get("last_request_at").ok().flatten(),
            input_tokens_24h: row.try_get("input_tokens_24h").unwrap_or(0),
            output_tokens_24h: row.try_get("output_tokens_24h").unwrap_or(0),
            tokens_24h: row.try_get("tokens_24h").unwrap_or(0),
            cost_24h: row.try_get("cost_24h").unwrap_or(0.0),
            all_time_requests: row.try_get("all_time_requests").unwrap_or(0),
            all_time_cost: row.try_get("all_time_cost").unwrap_or(0.0),
            health_status: row
                .try_get("health_status")
                .unwrap_or_else(|_| "unknown".to_string()),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
        .collect();

    Ok(Json(providers))
}

// ============================================================================
// Routing Configuration Endpoints
// ============================================================================

async fn list_routing_rules(State(_state): State<AppState>) -> Json<Vec<RoutingRule>> {
    // Return mock routing rules - real implementation would query database
    // Note: Routing rules table doesn't exist yet, so keeping mock data
    Json(vec![
        RoutingRule {
            id: "rule_1".to_string(),
            name: "Cost Optimization".to_string(),
            description: "Route simple queries to cheaper models".to_string(),
            strategy: "cost_based".to_string(),
            priority: 1,
            enabled: true,
            conditions: vec![RoutingCondition {
                condition_type: "input_tokens".to_string(),
                value: "< 500".to_string(),
            }],
            actions: vec![
                RoutingAction {
                    provider: "openai".to_string(),
                    model: "gpt-5.4-nano".to_string(),
                    weight: Some(70),
                },
                RoutingAction {
                    provider: "anthropic".to_string(),
                    model: "claude-3-haiku".to_string(),
                    weight: Some(30),
                },
            ],
        },
        RoutingRule {
            id: "rule_2".to_string(),
            name: "Load Balancing".to_string(),
            description: "Distribute load across providers".to_string(),
            strategy: "round_robin".to_string(),
            priority: 2,
            enabled: true,
            conditions: vec![],
            actions: vec![
                RoutingAction {
                    provider: "openai".to_string(),
                    model: "gpt-5.4-mini".to_string(),
                    weight: Some(40),
                },
                RoutingAction {
                    provider: "anthropic".to_string(),
                    model: "claude-3-sonnet".to_string(),
                    weight: Some(40),
                },
                RoutingAction {
                    provider: "google".to_string(),
                    model: "gemini-pro".to_string(),
                    weight: Some(20),
                },
            ],
        },
        RoutingRule {
            id: "rule_3".to_string(),
            name: "Fallback Chain".to_string(),
            description: "Automatic fallback on provider failures".to_string(),
            strategy: "fallback".to_string(),
            priority: 10,
            enabled: true,
            conditions: vec![RoutingCondition {
                condition_type: "on_error".to_string(),
                value: "true".to_string(),
            }],
            actions: vec![
                RoutingAction {
                    provider: "openai".to_string(),
                    model: "gpt-5.4-mini".to_string(),
                    weight: None,
                },
                RoutingAction {
                    provider: "anthropic".to_string(),
                    model: "claude-3-sonnet".to_string(),
                    weight: None,
                },
                RoutingAction {
                    provider: "google".to_string(),
                    model: "gemini-pro".to_string(),
                    weight: None,
                },
            ],
        },
    ])
}

async fn create_routing_rule(
    State(_state): State<AppState>,
    Json(req): Json<CreateRoutingRuleRequest>,
) -> (StatusCode, Json<RoutingRule>) {
    // Return mock created rule - real implementation would store in database
    let rule = RoutingRule {
        id: format!(
            "rule_{}",
            uuid::Uuid::new_v4().to_string().split('-').next().unwrap()
        ),
        name: req.name,
        description: req.description,
        strategy: req.strategy,
        priority: req.priority,
        enabled: true,
        conditions: req.conditions,
        actions: req.actions,
    };

    (StatusCode::CREATED, Json(rule))
}

// ============================================================================
// Dynamic Stats with Time Range
// ============================================================================

async fn get_dynamic_stats(
    State(state): State<AppState>,
    Query(params): Query<PeriodQuery>,
) -> Result<Json<DynamicStats>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let interval = params.to_interval();
    let query = format!(
        r#"
        SELECT
            COUNT(*) as total_requests,
            COALESCE(SUM(input_tokens), 0) as input_tokens,
            COALESCE(SUM(output_tokens), 0) as output_tokens,
            COALESCE(SUM(cached_tokens), 0) as cached_tokens,
            COALESCE(SUM(cost_usd), 0)::FLOAT8 as total_cost,
            COALESCE(AVG(latency_ms), 0)::INT as avg_latency,
            CASE WHEN COUNT(*) > 0
                THEN (COUNT(*) FILTER (WHERE status = 'completed')::FLOAT / COUNT(*) * 100)::FLOAT8
                ELSE 100.0
            END as success_rate
        FROM request_logs
        WHERE created_at >= NOW() - INTERVAL '{}'
        "#,
        interval
    );

    let row = sqlx::query(&query).fetch_one(pool).await.map_err(|e| {
        tracing::error!("Failed to fetch dynamic stats: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("Database error: {}", e)})),
        )
    })?;

    Ok(Json(DynamicStats {
        total_requests: row.try_get("total_requests").unwrap_or(0),
        input_tokens: row.try_get("input_tokens").unwrap_or(0),
        output_tokens: row.try_get("output_tokens").unwrap_or(0),
        cached_tokens: row.try_get("cached_tokens").unwrap_or(0),
        total_cost: row.try_get("total_cost").unwrap_or(0.0),
        avg_latency: row.try_get("avg_latency").unwrap_or(0),
        success_rate: row.try_get("success_rate").unwrap_or(100.0),
        period: params.period_str().to_string(),
    }))
}

// ============================================================================
// Insights Endpoints
// ============================================================================

async fn get_insights_stats(
    State(state): State<AppState>,
    Query(params): Query<PeriodQuery>,
) -> Result<Json<InsightsStats>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let interval = params.to_interval();

    // Current period stats
    let current_query = format!(
        r#"
        SELECT
            COUNT(*) as total_requests,
            COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
            COALESCE(SUM(cost_usd), 0)::FLOAT8 as total_cost,
            COALESCE(AVG(latency_ms), 0)::INT as avg_latency,
            0::BIGINT as tool_calls
        FROM request_logs
        WHERE created_at >= NOW() - INTERVAL '{}'
        "#,
        interval
    );

    // Previous period stats (for comparison)
    let previous_query = format!(
        r#"
        SELECT
            COUNT(*) as total_requests,
            COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
            COALESCE(SUM(cost_usd), 0)::FLOAT8 as total_cost,
            COALESCE(AVG(latency_ms), 0)::INT as avg_latency,
            0::BIGINT as tool_calls
        FROM request_logs
        WHERE created_at >= NOW() - INTERVAL '{0}' - INTERVAL '{0}'
          AND created_at < NOW() - INTERVAL '{0}'
        "#,
        interval
    );

    let current = sqlx::query(&current_query)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch current insights stats: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Database error: {}", e)})),
            )
        })?;

    let previous = sqlx::query(&previous_query).fetch_one(pool).await.ok();

    let current_requests: i64 = current.try_get("total_requests").unwrap_or(0);
    let current_tokens: i64 = current.try_get("total_tokens").unwrap_or(0);
    let current_cost: f64 = current.try_get("total_cost").unwrap_or(0.0);
    let current_latency: i32 = current.try_get("avg_latency").unwrap_or(0);
    let current_tools: i64 = current.try_get("tool_calls").unwrap_or(0);

    let (prev_requests, prev_tokens, prev_cost, prev_latency, prev_tools) = previous
        .map(|row| {
            (
                row.try_get::<i64, _>("total_requests").unwrap_or(0),
                row.try_get::<i64, _>("total_tokens").unwrap_or(0),
                row.try_get::<f64, _>("total_cost").unwrap_or(0.0),
                row.try_get::<i32, _>("avg_latency").unwrap_or(0),
                row.try_get::<i64, _>("tool_calls").unwrap_or(0),
            )
        })
        .unwrap_or((0, 0, 0.0, 0, 0));

    // Calculate percentage changes
    let calc_change = |current: f64, previous: f64| -> f64 {
        if previous > 0.0 {
            ((current - previous) / previous * 100.0 * 10.0).round() / 10.0
        } else if current > 0.0 {
            100.0
        } else {
            0.0
        }
    };

    Ok(Json(InsightsStats {
        total_requests: current_requests,
        total_tokens: current_tokens,
        total_cost: current_cost,
        avg_latency: current_latency,
        tool_calls: current_tools,
        requests_change: calc_change(current_requests as f64, prev_requests as f64),
        tokens_change: calc_change(current_tokens as f64, prev_tokens as f64),
        cost_change: calc_change(current_cost, prev_cost),
        latency_change: calc_change(current_latency as f64, prev_latency as f64),
        tool_calls_change: calc_change(current_tools as f64, prev_tools as f64),
    }))
}

async fn get_model_costs(
    State(state): State<AppState>,
    Query(params): Query<PeriodQuery>,
) -> Result<Json<Vec<ModelCostStats>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let interval = params.to_interval();
    let query = format!(
        r#"
        WITH model_stats AS (
            SELECT
                model_id,
                COUNT(*) as request_count,
                COALESCE(SUM(cost_usd), 0)::FLOAT8 as total_cost
            FROM request_logs
            WHERE created_at >= NOW() - INTERVAL '{}'
            GROUP BY model_id
        ),
        total AS (
            SELECT COALESCE(SUM(total_cost), 0)::FLOAT8 as total FROM model_stats
        )
        SELECT
            ms.model_id,
            mp.model_name,
            ms.total_cost,
            ms.request_count,
            CASE WHEN t.total > 0
                THEN (ms.total_cost / t.total * 100)::FLOAT8
                ELSE 0
            END as percentage
        FROM model_stats ms
        CROSS JOIN total t
        LEFT JOIN model_pricing mp ON mp.model_id = ms.model_id
        WHERE ms.total_cost > 0
        ORDER BY ms.total_cost DESC
        LIMIT 10
        "#,
        interval
    );

    let rows = sqlx::query(&query).fetch_all(pool).await.map_err(|e| {
        tracing::error!("Failed to fetch model costs: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("Database error: {}", e)})),
        )
    })?;

    let models: Vec<ModelCostStats> = rows
        .iter()
        .filter_map(|row| {
            let model_id: Option<String> = row.try_get("model_id").ok();
            model_id.map(|id| ModelCostStats {
                model_id: id,
                model_name: row.try_get("model_name").ok().flatten(),
                total_cost: row.try_get("total_cost").unwrap_or(0.0),
                request_count: row.try_get("request_count").unwrap_or(0),
                percentage: row.try_get("percentage").unwrap_or(0.0),
            })
        })
        .collect();

    Ok(Json(models))
}

async fn get_tool_usage(
    State(state): State<AppState>,
    Query(params): Query<PeriodQuery>,
) -> Result<Json<Vec<ToolUsageStats>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let interval = params.to_interval();

    // Tool usage is stored in metadata JSONB - extract tool calls
    let query = format!(
        r#"
        WITH tool_data AS (
            SELECT
                jsonb_array_elements_text(metadata->'tools_used') as tool_name
            FROM request_logs
            WHERE created_at >= NOW() - INTERVAL '{}'
              AND metadata ? 'tools_used'
              AND jsonb_array_length(metadata->'tools_used') > 0
        ),
        tool_counts AS (
            SELECT
                tool_name,
                COUNT(*) as call_count
            FROM tool_data
            GROUP BY tool_name
        ),
        total AS (
            SELECT COALESCE(SUM(call_count), 1)::FLOAT8 as total FROM tool_counts
        )
        SELECT
            tc.tool_name,
            tc.call_count,
            (tc.call_count::FLOAT8 / t.total * 100)::FLOAT8 as percentage
        FROM tool_counts tc
        CROSS JOIN total t
        ORDER BY tc.call_count DESC
        LIMIT 10
        "#,
        interval
    );

    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    let tools: Vec<ToolUsageStats> = rows
        .iter()
        .filter_map(|row| {
            let tool_name: Option<String> = row.try_get("tool_name").ok();
            tool_name.map(|name| ToolUsageStats {
                tool_name: name,
                call_count: row.try_get("call_count").unwrap_or(0),
                percentage: row.try_get("percentage").unwrap_or(0.0),
            })
        })
        .collect();

    Ok(Json(tools))
}

async fn get_usage_heatmap(
    State(state): State<AppState>,
    Query(params): Query<PeriodQuery>,
) -> Result<Json<Vec<HeatmapData>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let interval = params.to_interval();
    let query = format!(
        r#"
        WITH hourly_data AS (
            SELECT
                EXTRACT(ISODOW FROM created_at)::INT - 1 as day_of_week,
                EXTRACT(HOUR FROM created_at)::INT as hour_of_day,
                COUNT(*) as request_count
            FROM request_logs
            WHERE created_at >= NOW() - INTERVAL '{}'
            GROUP BY day_of_week, hour_of_day
        ),
        max_count AS (
            SELECT COALESCE(MAX(request_count), 1) as max_val FROM hourly_data
        )
        SELECT
            h.day_of_week,
            h.hour_of_day,
            h.request_count,
            LEAST(5, (h.request_count::FLOAT / m.max_val * 5)::INT) as intensity
        FROM hourly_data h
        CROSS JOIN max_count m
        ORDER BY h.day_of_week, h.hour_of_day
        "#,
        interval
    );

    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    let heatmap: Vec<HeatmapData> = rows
        .iter()
        .map(|row| HeatmapData {
            day_of_week: row.try_get("day_of_week").unwrap_or(0),
            hour_of_day: row.try_get("hour_of_day").unwrap_or(0),
            request_count: row.try_get("request_count").unwrap_or(0),
            intensity: row.try_get("intensity").unwrap_or(0),
        })
        .collect();

    Ok(Json(heatmap))
}

async fn get_token_timeline(
    State(state): State<AppState>,
    Query(params): Query<PeriodQuery>,
) -> Result<Json<Vec<TokenUsageTimeline>>, (StatusCode, Json<serde_json::Value>)> {
    let pool = match state.db_pool() {
        Some(p) => p,
        None => return Err(db_unavailable()),
    };

    let interval = params.to_interval();

    // Determine the grouping interval based on period
    let group_interval = match params.period.as_deref() {
        Some("24h") | Some("1d") => "1 hour",
        Some("2d") | Some("3d") => "2 hours",
        _ => "6 hours",
    };

    let query = format!(
        r#"
        WITH time_buckets AS (
            SELECT
                DATE_TRUNC('hour', created_at) -
                    (EXTRACT(HOUR FROM created_at)::INT % {}) * INTERVAL '1 hour' as bucket,
                COALESCE(SUM(input_tokens), 0) as input_tokens,
                COALESCE(SUM(output_tokens), 0) as output_tokens
            FROM request_logs
            WHERE created_at >= NOW() - INTERVAL '{}'
            GROUP BY bucket
        )
        SELECT
            bucket as timestamp,
            input_tokens,
            output_tokens
        FROM time_buckets
        ORDER BY bucket
        "#,
        match group_interval {
            "1 hour" => 1,
            "2 hours" => 2,
            _ => 6,
        },
        interval
    );

    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    let timeline: Vec<TokenUsageTimeline> = rows
        .iter()
        .map(|row| {
            let timestamp: DateTime<Utc> = row.try_get("timestamp").unwrap_or_else(|_| Utc::now());
            TokenUsageTimeline {
                timestamp: timestamp.to_rfc3339(),
                input_tokens: row.try_get("input_tokens").unwrap_or(0),
                output_tokens: row.try_get("output_tokens").unwrap_or(0),
            }
        })
        .collect();

    Ok(Json(timeline))
}
