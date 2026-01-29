//! Authentication middleware and routes for API key management
//!
//! This module provides:
//! - Bearer token authentication middleware
//! - API key CRUD endpoints
//! - Request context with authenticated user info

use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use tracing::warn;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::AppState;
use aura_core::crypto::{
    extract_key_id, generate_api_key, verify_api_key, API_KEY_PREFIX_LIVE, API_KEY_PREFIX_TEST,
};
use aura_db::{ApiKey, ApiKeyRepo, NewApiKey};

/// Authenticated request context
///
/// This is added to request extensions after successful authentication.
/// Includes full tenant hierarchy for cost attribution and analytics.
#[derive(Debug, Clone)]
pub struct AuthContext {
    /// The API key record
    pub api_key: ApiKey,
    /// User ID (if associated with the key)
    pub user_id: Option<String>,
    /// Tenant hierarchy (org -> team -> project)
    pub tenant: TenantContext,
}

/// Tenant hierarchy information from the authenticated API key
#[derive(Debug, Clone, Default, Serialize)]
pub struct TenantContext {
    /// Organization ID
    pub organization_id: Option<Uuid>,
    /// Organization name
    pub organization_name: Option<String>,
    /// Team ID
    pub team_id: Option<Uuid>,
    /// Team name
    pub team_name: Option<String>,
    /// Project ID
    pub project_id: Option<Uuid>,
    /// Project name
    pub project_name: Option<String>,
    /// API key ID (for tracking)
    pub api_key_id: String,
}

impl AuthContext {
    /// Check if the authenticated key has a specific scope
    #[allow(dead_code)]
    pub fn has_scope(&self, scope: &str) -> bool {
        self.api_key.has_scope(scope)
    }
}

/// Authentication error response
#[derive(Debug, Serialize)]
pub struct AuthError {
    pub error: AuthErrorInner,
}

#[derive(Debug, Serialize)]
pub struct AuthErrorInner {
    pub code: String,
    pub message: String,
}

impl AuthError {
    fn missing_auth() -> Self {
        Self {
            error: AuthErrorInner {
                code: "missing_authentication".to_string(),
                message:
                    "Missing or invalid Authorization header. Use Bearer token authentication."
                        .to_string(),
            },
        }
    }

    fn invalid_key() -> Self {
        Self {
            error: AuthErrorInner {
                code: "invalid_api_key".to_string(),
                message: "Invalid API key. Please check your key and try again.".to_string(),
            },
        }
    }

    fn expired_key() -> Self {
        Self {
            error: AuthErrorInner {
                code: "expired_api_key".to_string(),
                message: "API key has expired. Please generate a new key.".to_string(),
            },
        }
    }

    fn revoked_key() -> Self {
        Self {
            error: AuthErrorInner {
                code: "revoked_api_key".to_string(),
                message: "API key has been revoked.".to_string(),
            },
        }
    }

    #[allow(dead_code)]
    fn insufficient_scope(required: &str) -> Self {
        Self {
            error: AuthErrorInner {
                code: "insufficient_scope".to_string(),
                message: format!("API key does not have required scope: {}", required),
            },
        }
    }
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let status = match self.error.code.as_str() {
            "missing_authentication" => StatusCode::UNAUTHORIZED,
            "invalid_api_key" => StatusCode::UNAUTHORIZED,
            "expired_api_key" => StatusCode::UNAUTHORIZED,
            "revoked_api_key" => StatusCode::FORBIDDEN,
            "insufficient_scope" => StatusCode::FORBIDDEN,
            _ => StatusCode::UNAUTHORIZED,
        };

        (status, Json(self)).into_response()
    }
}

/// Load full tenant hierarchy context for the API key
///
/// Queries the database to get organization, team, and project names
/// for cost attribution and analytics metadata.
async fn load_tenant_context(pool: &aura_db::DbPool, api_key: &ApiKey) -> TenantContext {
    use aura_db::{OrganizationRepo, ProjectRepo, TeamRepo};

    let mut tenant = TenantContext {
        api_key_id: api_key.key_id.clone(),
        ..Default::default()
    };

    // Load organization if present
    if let Some(org_id) = api_key.organization_id {
        if let Ok(Some(org)) = OrganizationRepo::find_by_id(pool, org_id).await {
            tenant.organization_id = Some(org.id);
            tenant.organization_name = Some(org.name);
        }
    }

    // Load scope-specific entity based on scope_type
    if let (Some(scope_type), Some(scope_id)) = (&api_key.scope_type, api_key.scope_id) {
        match scope_type.as_str() {
            "team" => {
                // Load team directly
                if let Ok(Some(team)) = TeamRepo::find_by_id(pool, scope_id).await {
                    tenant.team_id = Some(team.id);
                    tenant.team_name = Some(team.name);
                    // Also load org from team if not already set
                    if tenant.organization_id.is_none() {
                        if let Ok(Some(org)) =
                            OrganizationRepo::find_by_id(pool, team.organization_id).await
                        {
                            tenant.organization_id = Some(org.id);
                            tenant.organization_name = Some(org.name);
                        }
                    }
                }
            }
            "project" => {
                // Load project and traverse to team/org
                if let Ok(Some(project)) = ProjectRepo::find_by_id(pool, scope_id).await {
                    tenant.project_id = Some(project.id);
                    tenant.project_name = Some(project.name);
                    // Load team from project
                    if let Ok(Some(team)) = TeamRepo::find_by_id(pool, project.team_id).await {
                        tenant.team_id = Some(team.id);
                        tenant.team_name = Some(team.name);
                        // Load org from team if not already set
                        if tenant.organization_id.is_none() {
                            if let Ok(Some(org)) =
                                OrganizationRepo::find_by_id(pool, team.organization_id).await
                            {
                                tenant.organization_id = Some(org.id);
                                tenant.organization_name = Some(org.name);
                            }
                        }
                    }
                }
            }
            _ => {
                // "organization" or "user" scope - already handled by organization_id
            }
        }
    }

    tenant
}

/// Authentication middleware
///
/// Extracts the API key from the Authorization header, validates it,
/// and adds the AuthContext to request extensions.
pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, AuthError> {
    let path = request.uri().path();

    // Allow public endpoints without auth
    if path.starts_with("/health")
        || path.starts_with("/openapi")
        || path.starts_with("/swagger-ui")
        || path.starts_with("/swagger")
    {
        return Ok(next.run(request).await);
    }

    // Get Authorization header
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());

    let token = match auth_header {
        Some(h) if h.starts_with("Bearer ") => &h[7..],
        _ => {
            // No database configured = development mode, skip auth
            if state.db_pool().is_none() {
                return Ok(next.run(request).await);
            }
            // Require authentication
            warn!("Request missing Authorization header");
            return Err(AuthError::missing_auth());
        }
    };

    // Extract key_id from the token
    let key_id = match extract_key_id(token) {
        Some(id) => id,
        None => {
            warn!("Invalid API key format");
            return Err(AuthError::invalid_key());
        }
    };

    // Look up the key in the database
    let pool = match state.db_pool() {
        Some(p) => p,
        None => {
            // No database, skip authentication
            return Ok(next.run(request).await);
        }
    };

    let api_key = match ApiKeyRepo::find_by_key_id(pool, &key_id).await {
        Ok(Some(key)) => key,
        Ok(None) => {
            warn!(key_id = %key_id, "API key not found");
            return Err(AuthError::invalid_key());
        }
        Err(e) => {
            warn!(error = %e, "Database error during authentication");
            return Err(AuthError::invalid_key());
        }
    };

    // Check key status
    if api_key.status == "revoked" {
        return Err(AuthError::revoked_key());
    }

    if api_key.status == "expired" || !api_key.is_valid() {
        return Err(AuthError::expired_key());
    }

    // Verify the key hash
    if !verify_api_key(token, &api_key.key_hash) {
        warn!(key_id = %key_id, "API key hash mismatch");
        return Err(AuthError::invalid_key());
    }

    // Update last_used timestamp (fire and forget)
    let pool_clone = pool.clone();
    let key_id_clone = api_key.id;
    tokio::spawn(async move {
        let _ = ApiKeyRepo::update_last_used(&pool_clone, key_id_clone).await;
    });

    // Load tenant hierarchy for metadata
    let tenant = load_tenant_context(pool, &api_key).await;

    // Create auth context
    let auth_context = AuthContext {
        user_id: api_key.user_id.clone(),
        tenant,
        api_key,
    };

    // Add to request extensions
    request.extensions_mut().insert(auth_context);

    Ok(next.run(request).await)
}

/// Require a specific scope for the request
#[allow(dead_code)]
pub fn require_scope(scope: &'static str) -> impl Fn(AuthContext) -> Result<(), AuthError> + Clone {
    move |auth: AuthContext| {
        if auth.has_scope(scope) || auth.has_scope("*") {
            Ok(())
        } else {
            Err(AuthError::insufficient_scope(scope))
        }
    }
}

// ============================================================================
// API Key Management Routes
// ============================================================================

/// Create API key router
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/api-keys", post(create_api_key))
        .route("/v1/api-keys", get(list_api_keys))
        .route("/v1/api-keys/{key_id}", get(get_api_key))
        .route("/v1/api-keys/{key_id}", delete(revoke_api_key))
}

/// Request to create a new API key
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateApiKeyRequest {
    /// Human-readable name for the key
    pub name: String,
    /// Optional description
    pub description: Option<String>,
    /// Key environment: "live" or "test"
    #[serde(default = "default_environment")]
    pub environment: String,
    /// Scopes/permissions for the key
    #[serde(default = "default_scopes")]
    pub scopes: Vec<String>,
    /// Optional rate limit (requests per minute)
    pub rate_limit_rpm: Option<i32>,
    /// Optional monthly token limit
    pub monthly_token_limit: Option<i64>,
    /// Optional expiration in days from now
    pub expires_in_days: Option<i64>,
    /// Organization ID for scoping the key
    pub organization_id: Option<uuid::Uuid>,
    /// Scope type: "organization", "team", "project", or "user"
    pub scope_type: Option<String>,
    /// Scope ID (team_id, project_id, etc depending on scope_type)
    pub scope_id: Option<uuid::Uuid>,
}

fn default_environment() -> String {
    "live".to_string()
}

fn default_scopes() -> Vec<String> {
    vec!["responses:create".to_string()]
}

/// Response after creating an API key
#[derive(Debug, Serialize, ToSchema)]
pub struct CreateApiKeyResponse {
    /// The full API key (only shown once!)
    pub key: String,
    /// The key ID for reference
    pub key_id: String,
    /// Human-readable name
    pub name: String,
    /// Key scopes
    pub scopes: Vec<String>,
    /// When the key was created
    pub created_at: String,
    /// When the key expires (if set)
    pub expires_at: Option<String>,
}

/// Create a new API key
#[utoipa::path(
    post,
    path = "/v1/api-keys",
    tag = "auth",
    request_body = CreateApiKeyRequest,
    responses(
        (status = 200, description = "API key created successfully", body = CreateApiKeyResponse),
        (status = 401, description = "Unauthorized"),
        (status = 503, description = "Database unavailable")
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn create_api_key(
    State(state): State<AppState>,
    Json(req): Json<CreateApiKeyRequest>,
) -> Result<Json<CreateApiKeyResponse>, (StatusCode, Json<AuthError>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(AuthError {
                error: AuthErrorInner {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    // Determine prefix based on environment
    let prefix = if req.environment == "test" {
        API_KEY_PREFIX_TEST
    } else {
        API_KEY_PREFIX_LIVE
    };

    // Generate the API key
    let generated = generate_api_key(prefix);

    // Calculate expiration
    let expires_at = req
        .expires_in_days
        .map(|days| Utc::now() + Duration::days(days));

    // Create the database record
    let new_key = NewApiKey {
        key_id: generated.key_id.clone(),
        key_hash: generated.key_hash,
        name: req.name.clone(),
        description: req.description.clone(),
        user_id: None, // TODO: Get from auth context
        organization_id: req.organization_id,
        scopes: serde_json::json!(req.scopes),
        rate_limit_rpm: req.rate_limit_rpm,
        monthly_token_limit: req.monthly_token_limit,
        expires_at,
        allowed_ips: None,
        metadata: None,
        scope_type: req.scope_type,
        scope_id: req.scope_id,
    };

    let api_key = ApiKeyRepo::create(pool, new_key).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(AuthError {
                error: AuthErrorInner {
                    code: "creation_failed".to_string(),
                    message: format!("Failed to create API key: {}", e),
                },
            }),
        )
    })?;

    // Get scopes before moving other fields
    let scopes = api_key.get_scopes();
    Ok(Json(CreateApiKeyResponse {
        key: generated.key, // Only time we return the full key!
        key_id: api_key.key_id,
        name: api_key.name,
        scopes,
        created_at: api_key.created_at.to_rfc3339(),
        expires_at: api_key.expires_at.map(|e| e.to_rfc3339()),
    }))
}

/// API key info (without the secret)
#[derive(Debug, Serialize, ToSchema)]
pub struct ApiKeyInfo {
    pub key_id: String,
    pub name: String,
    pub description: Option<String>,
    pub scopes: Vec<String>,
    pub status: String,
    pub created_at: String,
    pub expires_at: Option<String>,
    pub last_used_at: Option<String>,
}

impl From<ApiKey> for ApiKeyInfo {
    fn from(key: ApiKey) -> Self {
        // Get scopes first before moving other fields
        let scopes = key.get_scopes();
        Self {
            key_id: key.key_id,
            name: key.name,
            description: key.description,
            scopes,
            status: key.status,
            created_at: key.created_at.to_rfc3339(),
            expires_at: key.expires_at.map(|e| e.to_rfc3339()),
            last_used_at: key.last_used_at.map(|e| e.to_rfc3339()),
        }
    }
}

/// List API keys response
#[derive(Debug, Serialize, ToSchema)]
pub struct ListApiKeysResponse {
    pub keys: Vec<ApiKeyInfo>,
}

/// List API keys for the authenticated user
#[utoipa::path(
    get,
    path = "/v1/api-keys",
    tag = "auth",
    responses(
        (status = 200, description = "List of API keys", body = ListApiKeysResponse),
        (status = 401, description = "Unauthorized"),
        (status = 503, description = "Database unavailable")
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn list_api_keys(
    State(state): State<AppState>,
    // TODO: Extract user from auth context
) -> Result<Json<ListApiKeysResponse>, (StatusCode, Json<AuthError>)> {
    let _pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(AuthError {
                error: AuthErrorInner {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    // TODO: Filter by user_id from auth context
    // For now, return empty list if no user context
    let keys: Vec<ApiKeyInfo> = vec![];

    Ok(Json(ListApiKeysResponse { keys }))
}

/// Get API key by key_id
#[utoipa::path(
    get,
    path = "/v1/api-keys/{key_id}",
    tag = "auth",
    params(
        ("key_id" = String, Path, description = "The API key ID")
    ),
    responses(
        (status = 200, description = "API key info", body = ApiKeyInfo),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "API key not found"),
        (status = 503, description = "Database unavailable")
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn get_api_key(
    State(state): State<AppState>,
    axum::extract::Path(key_id): axum::extract::Path<String>,
) -> Result<Json<ApiKeyInfo>, (StatusCode, Json<AuthError>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(AuthError {
                error: AuthErrorInner {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    let api_key = ApiKeyRepo::find_by_key_id(pool, &key_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthError {
                    error: AuthErrorInner {
                        code: "lookup_failed".to_string(),
                        message: format!("Failed to look up API key: {}", e),
                    },
                }),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(AuthError {
                    error: AuthErrorInner {
                        code: "not_found".to_string(),
                        message: "API key not found".to_string(),
                    },
                }),
            )
        })?;

    Ok(Json(ApiKeyInfo::from(api_key)))
}

/// Revoke an API key
#[utoipa::path(
    delete,
    path = "/v1/api-keys/{key_id}",
    tag = "auth",
    params(
        ("key_id" = String, Path, description = "The API key ID to revoke")
    ),
    responses(
        (status = 204, description = "API key revoked successfully"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "API key not found"),
        (status = 503, description = "Database unavailable")
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn revoke_api_key(
    State(state): State<AppState>,
    axum::extract::Path(key_id): axum::extract::Path<String>,
) -> Result<StatusCode, (StatusCode, Json<AuthError>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(AuthError {
                error: AuthErrorInner {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    // Find the key first
    let api_key = ApiKeyRepo::find_by_key_id(pool, &key_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthError {
                    error: AuthErrorInner {
                        code: "lookup_failed".to_string(),
                        message: format!("Failed to look up API key: {}", e),
                    },
                }),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(AuthError {
                    error: AuthErrorInner {
                        code: "not_found".to_string(),
                        message: "API key not found".to_string(),
                    },
                }),
            )
        })?;

    // Revoke the key
    ApiKeyRepo::revoke(pool, api_key.id).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(AuthError {
                error: AuthErrorInner {
                    code: "revoke_failed".to_string(),
                    message: format!("Failed to revoke API key: {}", e),
                },
            }),
        )
    })?;

    Ok(StatusCode::NO_CONTENT)
}
