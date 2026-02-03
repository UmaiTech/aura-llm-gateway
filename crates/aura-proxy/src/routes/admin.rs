//! Admin dashboard endpoints
//!
//! Provides admin-specific endpoints for:
//! - Dashboard statistics and overview
//! - Routing configuration
//! - System health and metrics

use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use serde::{Deserialize, Serialize};

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Dashboard stats
        .route("/admin/stats/overview", get(get_overview_stats))
        .route("/admin/stats/usage", get(get_usage_stats))
        .route("/admin/stats/costs", get(get_cost_stats))
        // Routing configuration
        .route("/admin/routing/rules", get(list_routing_rules))
        .route(
            "/admin/routing/rules",
            axum::routing::post(create_routing_rule),
        )
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct OverviewStats {
    pub total_requests: i64,
    pub total_cost_usd: f64,
    pub avg_latency_ms: f64,
    pub error_rate: f64,
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

// ============================================================================
// Dashboard Stats Endpoints
// ============================================================================

async fn get_overview_stats(State(_state): State<AppState>) -> Json<OverviewStats> {
    // Return mock data for now - real implementation would query the database
    Json(OverviewStats {
        total_requests: 24832,
        total_cost_usd: 127.45,
        avg_latency_ms: 234.0,
        error_rate: 0.03,
        active_providers: 3,
        active_api_keys: 12,
        total_organizations: 5,
        total_end_users: 1620,
    })
}

async fn get_usage_stats(State(_state): State<AppState>) -> Json<UsageStats> {
    // Return mock data for now
    Json(UsageStats {
        period: "7d".to_string(),
        data_points: vec![
            UsageDataPoint {
                timestamp: "2026-01-27".to_string(),
                requests: 3200,
                input_tokens: 1250000,
                output_tokens: 890000,
            },
            UsageDataPoint {
                timestamp: "2026-01-28".to_string(),
                requests: 3450,
                input_tokens: 1340000,
                output_tokens: 920000,
            },
            UsageDataPoint {
                timestamp: "2026-01-29".to_string(),
                requests: 3100,
                input_tokens: 1180000,
                output_tokens: 850000,
            },
            UsageDataPoint {
                timestamp: "2026-01-30".to_string(),
                requests: 3800,
                input_tokens: 1520000,
                output_tokens: 1100000,
            },
            UsageDataPoint {
                timestamp: "2026-01-31".to_string(),
                requests: 4200,
                input_tokens: 1680000,
                output_tokens: 1200000,
            },
            UsageDataPoint {
                timestamp: "2026-02-01".to_string(),
                requests: 3900,
                input_tokens: 1550000,
                output_tokens: 1080000,
            },
            UsageDataPoint {
                timestamp: "2026-02-02".to_string(),
                requests: 3182,
                input_tokens: 1270000,
                output_tokens: 910000,
            },
        ],
    })
}

async fn get_cost_stats(State(_state): State<AppState>) -> Json<CostStats> {
    // Return mock data for now
    Json(CostStats {
        period: "7d".to_string(),
        total_cost: 127.45,
        by_provider: vec![
            ProviderCost {
                provider: "openai".to_string(),
                cost: 78.90,
                percentage: 61.9,
            },
            ProviderCost {
                provider: "anthropic".to_string(),
                cost: 35.20,
                percentage: 27.6,
            },
            ProviderCost {
                provider: "google".to_string(),
                cost: 13.35,
                percentage: 10.5,
            },
        ],
        by_model: vec![
            ModelCost {
                model: "gpt-4o".to_string(),
                cost: 52.30,
                requests: 4500,
            },
            ModelCost {
                model: "claude-3-sonnet".to_string(),
                cost: 28.40,
                requests: 3200,
            },
            ModelCost {
                model: "gpt-4o-mini".to_string(),
                cost: 18.60,
                requests: 8900,
            },
            ModelCost {
                model: "gemini-pro".to_string(),
                cost: 13.35,
                requests: 2100,
            },
            ModelCost {
                model: "claude-3-haiku".to_string(),
                cost: 6.80,
                requests: 5600,
            },
        ],
    })
}

// ============================================================================
// Routing Configuration Endpoints
// ============================================================================

async fn list_routing_rules(State(_state): State<AppState>) -> Json<Vec<RoutingRule>> {
    // Return mock routing rules - real implementation would query database
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
