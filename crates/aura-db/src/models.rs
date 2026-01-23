//! Database models

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// Provider record
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Provider {
    pub id: Uuid,
    pub name: String,
    pub display_name: String,
    pub api_base_url: Option<String>,
    pub is_enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Model pricing record (per 1M tokens)
/// Note: Manually constructed from queries due to Decimal handling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    pub id: Uuid,
    pub provider_id: Uuid,
    pub model_id: String,
    pub model_name: String,
    pub input_per_million: f64,
    pub output_per_million: f64,
    pub cached_input_per_million: Option<f64>,
    pub reasoning_per_million: Option<f64>,
    pub context_window: Option<i32>,
    pub max_output_tokens: Option<i32>,
    pub is_enabled: bool,
    pub effective_from: DateTime<Utc>,
    pub effective_until: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl ModelPricing {
    /// Calculate cost for given token counts
    pub fn calculate_cost(
        &self,
        input_tokens: u32,
        output_tokens: u32,
        cached_tokens: Option<u32>,
        reasoning_tokens: Option<u32>,
    ) -> f64 {
        let input_cost = (input_tokens as f64 / 1_000_000.0) * self.input_per_million;
        let output_cost = (output_tokens as f64 / 1_000_000.0) * self.output_per_million;

        let cached_cost = cached_tokens
            .and_then(|tokens| {
                self.cached_input_per_million
                    .map(|rate| (tokens as f64 / 1_000_000.0) * rate)
            })
            .unwrap_or(0.0);

        let reasoning_cost = reasoning_tokens
            .and_then(|tokens| {
                self.reasoning_per_million
                    .map(|rate| (tokens as f64 / 1_000_000.0) * rate)
            })
            .unwrap_or(0.0);

        input_cost + output_cost + cached_cost + reasoning_cost
    }
}

/// Simplified model pricing for queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricingSimple {
    pub model_id: String,
    pub model_name: String,
    pub provider_name: String,
    pub input_per_million: f64,
    pub output_per_million: f64,
    pub cached_input_per_million: Option<f64>,
    pub context_window: Option<i32>,
    pub max_output_tokens: Option<i32>,
}

/// Conversation record
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Conversation {
    pub id: Uuid,
    pub user_id: Option<String>,
    pub title: Option<String>,
    pub model_id: String,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Message record
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Message {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub role: String,
    pub content: String,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

/// Request log record - manually constructed due to Decimal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestLog {
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
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

/// New request log for insertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewRequestLog {
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
    pub metadata: Option<serde_json::Value>,
}

/// New conversation for insertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewConversation {
    pub user_id: Option<String>,
    pub title: Option<String>,
    pub model_id: String,
    pub metadata: Option<serde_json::Value>,
}

/// New message for insertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewMessage {
    pub conversation_id: Uuid,
    pub role: String,
    pub content: String,
    pub metadata: Option<serde_json::Value>,
}

/// Response record - stores complete Open Responses API response objects
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseRecord {
    pub id: String,
    pub conversation_id: Uuid,
    pub model_id: String,
    pub status: String,
    pub previous_response_id: Option<String>,
    pub input_items: serde_json::Value,
    pub output_items: serde_json::Value,
    pub usage_input_tokens: Option<i32>,
    pub usage_output_tokens: Option<i32>,
    pub usage_cached_tokens: Option<i32>,
    pub usage_reasoning_tokens: Option<i32>,
    pub usage_cost_usd: Option<f64>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub incomplete_reason: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// New response for insertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewResponse {
    pub id: String,
    pub conversation_id: Uuid,
    pub model_id: String,
    pub status: String,
    pub previous_response_id: Option<String>,
    pub input_items: serde_json::Value,
    pub output_items: serde_json::Value,
    pub usage_input_tokens: Option<i32>,
    pub usage_output_tokens: Option<i32>,
    pub usage_cached_tokens: Option<i32>,
    pub usage_reasoning_tokens: Option<i32>,
    pub usage_cost_usd: Option<f64>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub incomplete_reason: Option<String>,
    pub metadata: Option<serde_json::Value>,
}
