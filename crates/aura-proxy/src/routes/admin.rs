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
        .route("/admin/stats/usage", get(get_usage_stats))
        .route("/admin/stats/costs", get(get_cost_stats))
        .route("/admin/stats/providers", get(get_provider_health))
        .route("/admin/stats/cache", get(get_cache_stats))
        .route("/admin/stats/routing", get(get_routing_stats))
        .route("/admin/stats/timeline/hourly", get(get_hourly_timeline))
        .route("/admin/stats/timeline/daily", get(get_daily_timeline))
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
        // API Keys
        .route("/admin/api-keys", get(list_api_keys))
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
    pub created_at: DateTime<Utc>,
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
            let total_tokens: i64 = row.get("total_tokens");
            // Estimate input/output split (typically ~60% input, 40% output)
            let input_estimate = (total_tokens as f64 * 0.6) as i64;
            let output_estimate = total_tokens - input_estimate;

            UsageDataPoint {
                timestamp: date.to_string(),
                requests: row.get("request_count"),
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
        .map(|r| r.get::<f64, _>("total_cost"))
        .sum();

    let by_provider: Vec<ProviderCost> = provider_rows
        .iter()
        .map(|row| {
            let cost: f64 = row.get("total_cost");
            ProviderCost {
                provider: row.get("provider_name"),
                cost,
                percentage: if total_cost > 0.0 {
                    (cost / total_cost * 100.0 * 100.0).round() / 100.0
                } else {
                    0.0
                },
            }
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
        .map(|row| ModelCost {
            model: row.get("model_id"),
            cost: row.get("total_cost"),
            requests: row.get("request_count"),
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
        .map(|row| ProviderHealth {
            provider_name: row.get("provider_name"),
            display_name: row.get("display_name"),
            is_enabled: row.get("is_enabled"),
            total_requests: row.try_get("total_requests").unwrap_or(0),
            successful_requests: row.try_get("successful_requests").unwrap_or(0),
            failed_requests: row.try_get("failed_requests").unwrap_or(0),
            success_rate: row.try_get::<f64, _>("success_rate").unwrap_or(100.0),
            avg_latency_ms: row.try_get("avg_latency_ms").unwrap_or(0),
            p95_latency_ms: row.try_get("p95_latency_ms").unwrap_or(0),
            total_tokens: row.try_get("total_tokens").unwrap_or(0),
            total_cost: row.try_get("total_cost").unwrap_or(0.0),
            health_status: row.get("health_status"),
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
        cache_hits: row.get("cache_hits"),
        cache_misses: row.get("cache_misses"),
        total_requests: row.get("total_requests"),
        hit_rate: row.try_get::<f64, _>("hit_rate").unwrap_or(0.0),
        total_cached_tokens: row.get("total_cached_tokens"),
        estimated_savings: row.get("estimated_savings"),
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
        .map(|row| RoutingStats {
            routing_strategy: row.get("routing_strategy"),
            request_count: row.get("request_count"),
            total_tokens: row.get("total_tokens"),
            total_cost: row.get("total_cost"),
            avg_latency_ms: row.get("avg_latency_ms"),
            successful_requests: row.get("successful_requests"),
            failed_requests: row.get("failed_requests"),
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
            TimelinePoint {
                timestamp: hour.to_rfc3339(),
                request_count: row.get("request_count"),
                total_tokens: row.get("total_tokens"),
                total_cost: row.get("total_cost"),
                avg_latency_ms: row.get("avg_latency_ms"),
                error_count: row.get("error_count"),
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
            TimelinePoint {
                timestamp: date.to_string(),
                request_count: row.get("request_count"),
                total_tokens: row.get("total_tokens"),
                total_cost: row.get("total_cost"),
                avg_latency_ms: row.get("avg_latency_ms"),
                error_count: row.get("error_count"),
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
        .map(|row| RecentLog {
            id: row.get("id"),
            response_id: row.get("response_id"),
            conversation_id: row.get("conversation_id"),
            provider_name: row.get("provider_name"),
            model_id: row.get("model_id"),
            user_id: row.get("user_id"),
            input_tokens: row.get("input_tokens"),
            output_tokens: row.get("output_tokens"),
            cached_tokens: row.get("cached_tokens"),
            reasoning_tokens: row.get("reasoning_tokens"),
            cost_usd: row.try_get("cost_usd").ok(),
            latency_ms: row.get("latency_ms"),
            status: row.get("status"),
            error_code: row.get("error_code"),
            error_message: row.get("error_message"),
            routing_strategy: row.get("routing_strategy"),
            cache_hit: row.get("cache_hit"),
            has_reasoning: row.get("has_reasoning"),
            compressed: row.get("compressed"),
            created_at: row.get("created_at"),
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
        .map(|row| OrganizationSummary {
            id: row.get("organization_id"),
            name: row.get("organization_name"),
            slug: row.get("slug"),
            api_key_count: row.get("api_key_count"),
            team_count: row.get("team_count"),
            end_user_count: row.get("end_user_count"),
            total_tokens: row.get("total_tokens"),
            total_cost: row.get("total_cost"),
            total_requests: row.get("total_requests"),
        })
        .collect();

    Ok(Json(orgs))
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
                    model: "gpt-4o-mini".to_string(),
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
                    model: "gpt-4o".to_string(),
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
                    model: "gpt-4o".to_string(),
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
