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

// ============================================================================
// API Key Models
// ============================================================================

/// API Key status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiKeyStatus {
    Active,
    Revoked,
    Expired,
}

impl std::fmt::Display for ApiKeyStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiKeyStatus::Active => write!(f, "active"),
            ApiKeyStatus::Revoked => write!(f, "revoked"),
            ApiKeyStatus::Expired => write!(f, "expired"),
        }
    }
}

impl std::str::FromStr for ApiKeyStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "active" => Ok(ApiKeyStatus::Active),
            "revoked" => Ok(ApiKeyStatus::Revoked),
            "expired" => Ok(ApiKeyStatus::Expired),
            _ => Err(format!("Unknown API key status: {}", s)),
        }
    }
}

/// API Key record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKey {
    pub id: Uuid,
    pub key_id: String,
    pub key_hash: String,
    pub name: String,
    pub description: Option<String>,
    pub user_id: Option<String>,
    pub organization_id: Option<Uuid>,
    pub scopes: serde_json::Value,
    pub rate_limit_rpm: Option<i32>,
    pub monthly_token_limit: Option<i64>,
    /// Max requests per UTC day. NULL = no cap. Counter is Redis-backed
    /// and rolls over at 00:00 UTC. Different from rate_limit_rpm
    /// (per-minute burst) — daily_message_limit is the constraint that
    /// actually shapes chat usage since per-minute caps are rarely
    /// reached organically.
    pub daily_message_limit: Option<i32>,
    pub current_month_tokens: i64,
    pub usage_reset_month: Option<String>,
    pub status: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub allowed_ips: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    /// Scope type: organization, team, project, or user
    pub scope_type: Option<String>,
    /// ID of the scoped entity (team_id, project_id, or user_id depending on scope_type)
    pub scope_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl ApiKey {
    /// Check if the key is currently valid
    pub fn is_valid(&self) -> bool {
        self.status == "active" && self.expires_at.map(|exp| exp > Utc::now()).unwrap_or(true)
    }

    /// Check if a scope is allowed
    pub fn has_scope(&self, scope: &str) -> bool {
        if let Some(scopes) = self.scopes.as_array() {
            scopes
                .iter()
                .any(|s| s.as_str() == Some(scope) || s.as_str() == Some("*"))
        } else {
            false
        }
    }

    /// Get scopes as a vector of strings
    pub fn get_scopes(&self) -> Vec<String> {
        self.scopes
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default()
    }
}

/// New API key for creation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewApiKey {
    pub key_id: String,
    pub key_hash: String,
    pub name: String,
    pub description: Option<String>,
    pub user_id: Option<String>,
    pub organization_id: Option<Uuid>,
    pub scopes: serde_json::Value,
    pub rate_limit_rpm: Option<i32>,
    pub monthly_token_limit: Option<i64>,
    pub daily_message_limit: Option<i32>,
    pub expires_at: Option<DateTime<Utc>>,
    pub allowed_ips: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    /// Scope type: organization, team, project, or user
    pub scope_type: Option<String>,
    /// ID of the scoped entity
    pub scope_id: Option<Uuid>,
}

/// API key usage record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyUsage {
    pub id: Uuid,
    pub api_key_id: Uuid,
    pub request_id: String,
    pub model_id: String,
    pub provider_name: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub cached_tokens: Option<i32>,
    pub reasoning_tokens: Option<i32>,
    pub cost_usd: Option<f64>,
    /// End user ID (from end_users table)
    pub end_user_id: Option<Uuid>,
    /// External end user ID (provided in API request)
    pub end_user_external_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// New API key usage for insertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewApiKeyUsage {
    pub api_key_id: Uuid,
    pub request_id: String,
    pub model_id: String,
    pub provider_name: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub cached_tokens: Option<i32>,
    pub reasoning_tokens: Option<i32>,
    pub cost_usd: Option<f64>,
    /// End user ID (from end_users table)
    pub end_user_id: Option<Uuid>,
    /// External end user ID (provided in API request)
    pub end_user_external_id: Option<String>,
}

// ============================================================================
// Provider Credentials Models
// ============================================================================

/// Encrypted provider credentials record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCredential {
    pub id: Uuid,
    pub user_id: Option<String>,
    pub organization_id: Option<Uuid>,
    pub provider_name: String,
    pub encrypted_api_key: Vec<u8>,
    pub wrapped_dek: Vec<u8>,
    pub encryption_params: serde_json::Value,
    pub base_url: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// New provider credential for insertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewProviderCredential {
    pub user_id: Option<String>,
    pub organization_id: Option<Uuid>,
    pub provider_name: String,
    pub encrypted_api_key: Vec<u8>,
    pub wrapped_dek: Vec<u8>,
    pub encryption_params: serde_json::Value,
    pub base_url: Option<String>,
}

// ============================================================================
// Organization Models
// ============================================================================

/// Organization record
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Organization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub owner_id: String,
    pub settings: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// New organization for insertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewOrganization {
    pub name: String,
    pub slug: String,
    pub owner_id: String,
    pub settings: Option<serde_json::Value>,
}

/// Organization member role
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrgRole {
    Owner,
    Admin,
    Member,
}

impl std::fmt::Display for OrgRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrgRole::Owner => write!(f, "owner"),
            OrgRole::Admin => write!(f, "admin"),
            OrgRole::Member => write!(f, "member"),
        }
    }
}

/// Organization member record
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct OrganizationMember {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub user_id: String,
    pub role: String,
    pub joined_at: DateTime<Utc>,
}

/// New organization member for insertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewOrganizationMember {
    pub organization_id: Uuid,
    pub user_id: String,
    pub role: String,
}

// ============================================================================
// Team Models
// ============================================================================

/// Team record
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Team {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub monthly_token_limit: Option<i64>,
    pub current_month_tokens: i64,
    pub usage_reset_month: Option<String>,
    pub settings: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// New team for insertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewTeam {
    pub organization_id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub monthly_token_limit: Option<i64>,
    pub settings: Option<serde_json::Value>,
}

/// Team member role
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamRole {
    Lead,
    Member,
}

impl std::fmt::Display for TeamRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TeamRole::Lead => write!(f, "lead"),
            TeamRole::Member => write!(f, "member"),
        }
    }
}

/// Team member record
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct TeamMember {
    pub id: Uuid,
    pub team_id: Uuid,
    pub user_id: String,
    pub role: String,
    pub joined_at: DateTime<Utc>,
}

/// New team member for insertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewTeamMember {
    pub team_id: Uuid,
    pub user_id: String,
    pub role: String,
}

// ============================================================================
// Project Models
// ============================================================================

/// Project status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectStatus {
    Active,
    Archived,
}

impl std::fmt::Display for ProjectStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProjectStatus::Active => write!(f, "active"),
            ProjectStatus::Archived => write!(f, "archived"),
        }
    }
}

/// Project record
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Project {
    pub id: Uuid,
    pub team_id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub monthly_token_limit: Option<i64>,
    pub current_month_tokens: i64,
    pub usage_reset_month: Option<String>,
    pub status: String,
    pub settings: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// New project for insertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewProject {
    pub team_id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub monthly_token_limit: Option<i64>,
    pub settings: Option<serde_json::Value>,
}

// ============================================================================
// End User Models (for cost tracking)
// ============================================================================

/// End user record - tracks consumer/client users of applications built with Aura
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndUser {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub external_id: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cost_usd: f64,
    pub request_count: i64,
    pub rate_limit_rpm: Option<i32>,
    pub monthly_token_limit: Option<i64>,
    pub current_month_tokens: i64,
    pub usage_reset_month: Option<String>,
    pub is_blocked: bool,
    pub metadata: Option<serde_json::Value>,
    pub first_seen_at: DateTime<Utc>,
    pub last_seen_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl EndUser {
    /// Get total tokens consumed
    pub fn total_tokens(&self) -> i64 {
        self.total_input_tokens + self.total_output_tokens
    }
}

/// New end user for insertion/upsert
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewEndUser {
    pub organization_id: Uuid,
    pub external_id: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

/// End user usage update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndUserUsageUpdate {
    pub end_user_id: Uuid,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub cost_usd: Option<f64>,
}

// ============================================================================
// API Key Scope Types
// ============================================================================

/// API key scope type - determines what level the key operates at
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiKeyScopeType {
    Organization,
    Team,
    Project,
    User,
}

impl std::fmt::Display for ApiKeyScopeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiKeyScopeType::Organization => write!(f, "organization"),
            ApiKeyScopeType::Team => write!(f, "team"),
            ApiKeyScopeType::Project => write!(f, "project"),
            ApiKeyScopeType::User => write!(f, "user"),
        }
    }
}

impl std::str::FromStr for ApiKeyScopeType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "organization" => Ok(ApiKeyScopeType::Organization),
            "team" => Ok(ApiKeyScopeType::Team),
            "project" => Ok(ApiKeyScopeType::Project),
            "user" => Ok(ApiKeyScopeType::User),
            _ => Err(format!("Unknown API key scope type: {}", s)),
        }
    }
}

// ============================================================================
// Feedback Sample Models (for adaptive few-shot learning)
// ============================================================================

/// Feedback type for response samples
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FeedbackType {
    Approved,
    Rejected,
}

impl std::fmt::Display for FeedbackType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FeedbackType::Approved => write!(f, "approved"),
            FeedbackType::Rejected => write!(f, "rejected"),
        }
    }
}

impl std::str::FromStr for FeedbackType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "approved" => Ok(FeedbackType::Approved),
            "rejected" => Ok(FeedbackType::Rejected),
            _ => Err(format!("Unknown feedback type: {}", s)),
        }
    }
}

/// Feedback sample record - stores user-reinforced response examples
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackSample {
    pub id: Uuid,
    pub organization_id: Option<Uuid>,

    /// The user input/query
    pub input_text: String,
    /// The model response
    pub output_text: String,
    /// Model that generated this response
    pub model_id: Option<String>,

    /// User feedback (approved = good example, rejected = bad example)
    pub feedback: String,
    /// Optional reason for feedback
    pub feedback_reason: Option<String>,
    /// User who provided feedback
    pub feedback_by: Option<String>,

    /// Tags for categorization and retrieval
    pub tags: Vec<String>,
    /// Category for grouping (e.g., "customer_support", "code", "technical")
    pub category: Option<String>,

    /// Reference to original response
    pub response_id: Option<String>,
    pub conversation_id: Option<Uuid>,

    /// Quality metrics
    pub confidence_score: Option<f32>,
    pub use_count: i32,

    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl FeedbackSample {
    /// Check if this is an approved (good) sample
    pub fn is_approved(&self) -> bool {
        self.feedback == "approved"
    }

    /// Check if this is a rejected (bad) sample
    pub fn is_rejected(&self) -> bool {
        self.feedback == "rejected"
    }
}

/// New feedback sample for insertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewFeedbackSample {
    pub organization_id: Option<Uuid>,
    pub input_text: String,
    pub output_text: String,
    pub model_id: Option<String>,
    pub feedback: String,
    pub feedback_reason: Option<String>,
    pub feedback_by: Option<String>,
    pub tags: Vec<String>,
    pub category: Option<String>,
    pub response_id: Option<String>,
    pub conversation_id: Option<Uuid>,
    pub confidence_score: Option<f32>,
    pub metadata: Option<serde_json::Value>,
}

impl NewFeedbackSample {
    /// Create a new approved sample
    pub fn approved(input: String, output: String) -> Self {
        Self {
            organization_id: None,
            input_text: input,
            output_text: output,
            model_id: None,
            feedback: "approved".to_string(),
            feedback_reason: None,
            feedback_by: None,
            tags: vec![],
            category: None,
            response_id: None,
            conversation_id: None,
            confidence_score: None,
            metadata: None,
        }
    }

    /// Create a new rejected sample
    pub fn rejected(input: String, output: String, reason: Option<String>) -> Self {
        Self {
            organization_id: None,
            input_text: input,
            output_text: output,
            model_id: None,
            feedback: "rejected".to_string(),
            feedback_reason: reason,
            feedback_by: None,
            tags: vec![],
            category: None,
            response_id: None,
            conversation_id: None,
            confidence_score: None,
            metadata: None,
        }
    }

    /// Set organization
    pub fn with_organization(mut self, org_id: Uuid) -> Self {
        self.organization_id = Some(org_id);
        self
    }

    /// Set tags
    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.tags = tags;
        self
    }

    /// Set category
    pub fn with_category(mut self, category: String) -> Self {
        self.category = Some(category);
        self
    }

    /// Set model
    pub fn with_model(mut self, model_id: String) -> Self {
        self.model_id = Some(model_id);
        self
    }

    /// Set feedback by
    pub fn with_feedback_by(mut self, user: String) -> Self {
        self.feedback_by = Some(user);
        self
    }
}
