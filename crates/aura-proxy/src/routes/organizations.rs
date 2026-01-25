//! Organization, team, and project management endpoints
//!
//! This module provides CRUD endpoints for the hierarchical multi-tenant structure:
//! - Organizations (top-level billing entities)
//! - Teams (department/product grouping within orgs)
//! - Projects (initiative-level scoping within teams)
//! - End-users (customer tracking for cost allocation)

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::AppState;
use aura_db::{
    EndUser, EndUserRepo, NewEndUser, NewOrganization, NewProject, NewTeam, Organization,
    OrganizationRepo, Project, ProjectRepo, Team, TeamRepo,
};

pub fn router() -> Router<AppState> {
    Router::new()
        // Organizations
        .route("/v1/organizations", post(create_organization))
        .route("/v1/organizations", get(list_organizations))
        .route("/v1/organizations/{org_id}", get(get_organization))
        .route("/v1/organizations/{org_id}", put(update_organization))
        .route("/v1/organizations/{org_id}", delete(delete_organization))
        // Teams
        .route("/v1/organizations/{org_id}/teams", post(create_team))
        .route("/v1/organizations/{org_id}/teams", get(list_teams))
        .route("/v1/teams/{team_id}", get(get_team))
        .route("/v1/teams/{team_id}", put(update_team))
        .route("/v1/teams/{team_id}", delete(delete_team))
        // Projects
        .route("/v1/teams/{team_id}/projects", post(create_project))
        .route("/v1/teams/{team_id}/projects", get(list_projects))
        .route("/v1/projects/{project_id}", get(get_project))
        .route("/v1/projects/{project_id}", put(update_project))
        .route("/v1/projects/{project_id}", delete(delete_project))
        // End-users
        .route(
            "/v1/organizations/{org_id}/end-users",
            post(create_end_user),
        )
        .route("/v1/organizations/{org_id}/end-users", get(list_end_users))
        .route("/v1/end-users/{user_id}", get(get_end_user))
        .route("/v1/end-users/{user_id}", put(update_end_user))
}

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateOrganizationRequest {
    pub name: String,
    pub slug: String,
    pub owner_id: String,
    #[serde(default)]
    pub settings: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct CreateTeamRequest {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub monthly_token_limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEndUserRequest {
    pub external_id: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: ErrorDetail,
}

#[derive(Debug, Serialize)]
pub struct ErrorDetail {
    pub code: String,
    pub message: String,
}

// ============================================================================
// Organization Endpoints
// ============================================================================

async fn create_organization(
    State(state): State<AppState>,
    Json(req): Json<CreateOrganizationRequest>,
) -> Result<(StatusCode, Json<Organization>), (StatusCode, Json<ErrorResponse>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    let new_org = NewOrganization {
        name: req.name,
        slug: req.slug,
        owner_id: req.owner_id,
        settings: Some(req.settings),
    };

    let org = OrganizationRepo::create(pool, new_org).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "create_failed".to_string(),
                    message: format!("Failed to create organization: {}", e),
                },
            }),
        )
    })?;

    Ok((StatusCode::CREATED, Json(org)))
}

async fn list_organizations(State(_state): State<AppState>) -> impl IntoResponse {
    // TODO: Implement proper list with pagination
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(ErrorResponse {
            error: ErrorDetail {
                code: "not_implemented".to_string(),
                message: "List organizations not yet implemented. Use find_by_id or get_by_user."
                    .to_string(),
            },
        }),
    )
}

async fn get_organization(
    State(state): State<AppState>,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Organization>, (StatusCode, Json<ErrorResponse>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    let org = OrganizationRepo::find_by_id(pool, org_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: ErrorDetail {
                        code: "get_failed".to_string(),
                        message: format!("Failed to get organization: {}", e),
                    },
                }),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: ErrorDetail {
                        code: "not_found".to_string(),
                        message: "Organization not found".to_string(),
                    },
                }),
            )
        })?;

    Ok(Json(org))
}

async fn update_organization(
    State(_state): State<AppState>,
    Path(_org_id): Path<Uuid>,
    Json(_req): Json<CreateOrganizationRequest>,
) -> impl IntoResponse {
    // TODO: Implement update
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(ErrorResponse {
            error: ErrorDetail {
                code: "not_implemented".to_string(),
                message: "Update organization not yet implemented".to_string(),
            },
        }),
    )
}

async fn delete_organization(
    State(_state): State<AppState>,
    Path(_org_id): Path<Uuid>,
) -> impl IntoResponse {
    // TODO: Implement delete
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(ErrorResponse {
            error: ErrorDetail {
                code: "not_implemented".to_string(),
                message: "Delete organization not yet implemented".to_string(),
            },
        }),
    )
}

// ============================================================================
// Team Endpoints
// ============================================================================

async fn create_team(
    State(state): State<AppState>,
    Path(org_id): Path<Uuid>,
    Json(req): Json<CreateTeamRequest>,
) -> Result<(StatusCode, Json<Team>), (StatusCode, Json<ErrorResponse>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    let new_team = NewTeam {
        organization_id: org_id,
        name: req.name,
        slug: req.slug,
        description: req.description,
        monthly_token_limit: req.monthly_token_limit,
        settings: None,
    };

    let team = TeamRepo::create(pool, new_team).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "create_failed".to_string(),
                    message: format!("Failed to create team: {}", e),
                },
            }),
        )
    })?;

    Ok((StatusCode::CREATED, Json(team)))
}

async fn list_teams(
    State(state): State<AppState>,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<Team>>, (StatusCode, Json<ErrorResponse>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    let teams = TeamRepo::get_by_organization(pool, org_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: ErrorDetail {
                        code: "list_failed".to_string(),
                        message: format!("Failed to list teams: {}", e),
                    },
                }),
            )
        })?;

    Ok(Json(teams))
}

async fn get_team(
    State(state): State<AppState>,
    Path(team_id): Path<Uuid>,
) -> Result<Json<Team>, (StatusCode, Json<ErrorResponse>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    let team = TeamRepo::find_by_id(pool, team_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: ErrorDetail {
                        code: "get_failed".to_string(),
                        message: format!("Failed to get team: {}", e),
                    },
                }),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: ErrorDetail {
                        code: "not_found".to_string(),
                        message: "Team not found".to_string(),
                    },
                }),
            )
        })?;

    Ok(Json(team))
}

async fn update_team(
    State(_state): State<AppState>,
    Path(_team_id): Path<Uuid>,
    Json(_req): Json<CreateTeamRequest>,
) -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(ErrorResponse {
            error: ErrorDetail {
                code: "not_implemented".to_string(),
                message: "Update team not yet implemented".to_string(),
            },
        }),
    )
}

async fn delete_team(
    State(_state): State<AppState>,
    Path(_team_id): Path<Uuid>,
) -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(ErrorResponse {
            error: ErrorDetail {
                code: "not_implemented".to_string(),
                message: "Delete team not yet implemented".to_string(),
            },
        }),
    )
}

// ============================================================================
// Project Endpoints
// ============================================================================

async fn create_project(
    State(state): State<AppState>,
    Path(team_id): Path<Uuid>,
    Json(req): Json<CreateProjectRequest>,
) -> Result<(StatusCode, Json<Project>), (StatusCode, Json<ErrorResponse>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    let new_project = NewProject {
        team_id,
        name: req.name,
        slug: req.slug,
        description: req.description,
        monthly_token_limit: None,
        settings: None,
    };

    let project = ProjectRepo::create(pool, new_project).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "create_failed".to_string(),
                    message: format!("Failed to create project: {}", e),
                },
            }),
        )
    })?;

    Ok((StatusCode::CREATED, Json(project)))
}

async fn list_projects(
    State(state): State<AppState>,
    Path(team_id): Path<Uuid>,
) -> Result<Json<Vec<Project>>, (StatusCode, Json<ErrorResponse>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    let projects = ProjectRepo::get_by_team(pool, team_id).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "list_failed".to_string(),
                    message: format!("Failed to list projects: {}", e),
                },
            }),
        )
    })?;

    Ok(Json(projects))
}

async fn get_project(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Project>, (StatusCode, Json<ErrorResponse>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    let project = ProjectRepo::find_by_id(pool, project_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: ErrorDetail {
                        code: "get_failed".to_string(),
                        message: format!("Failed to get project: {}", e),
                    },
                }),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: ErrorDetail {
                        code: "not_found".to_string(),
                        message: "Project not found".to_string(),
                    },
                }),
            )
        })?;

    Ok(Json(project))
}

async fn update_project(
    State(_state): State<AppState>,
    Path(_project_id): Path<Uuid>,
    Json(_req): Json<CreateProjectRequest>,
) -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(ErrorResponse {
            error: ErrorDetail {
                code: "not_implemented".to_string(),
                message: "Update project not yet implemented".to_string(),
            },
        }),
    )
}

async fn delete_project(
    State(_state): State<AppState>,
    Path(_project_id): Path<Uuid>,
) -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(ErrorResponse {
            error: ErrorDetail {
                code: "not_implemented".to_string(),
                message: "Delete project not yet implemented".to_string(),
            },
        }),
    )
}

// ============================================================================
// End-User Endpoints
// ============================================================================

async fn create_end_user(
    State(state): State<AppState>,
    Path(org_id): Path<Uuid>,
    Json(req): Json<CreateEndUserRequest>,
) -> Result<(StatusCode, Json<EndUser>), (StatusCode, Json<ErrorResponse>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    let new_user = NewEndUser {
        organization_id: org_id,
        external_id: req.external_id,
        name: req.name,
        email: req.email,
        metadata: req.metadata,
    };

    let user = EndUserRepo::upsert(pool, new_user).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "create_failed".to_string(),
                    message: format!("Failed to create end-user: {}", e),
                },
            }),
        )
    })?;

    Ok((StatusCode::CREATED, Json(user)))
}

async fn list_end_users(
    State(state): State<AppState>,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<EndUser>>, (StatusCode, Json<ErrorResponse>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    let users = EndUserRepo::get_by_organization(pool, org_id, 100, 0)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: ErrorDetail {
                        code: "list_failed".to_string(),
                        message: format!("Failed to list end-users: {}", e),
                    },
                }),
            )
        })?;

    Ok(Json(users))
}

async fn get_end_user(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<EndUser>, (StatusCode, Json<ErrorResponse>)> {
    let pool = state.db_pool().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: ErrorDetail {
                    code: "database_unavailable".to_string(),
                    message: "Database not configured".to_string(),
                },
            }),
        )
    })?;

    let user = EndUserRepo::find_by_id(pool, user_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: ErrorDetail {
                        code: "get_failed".to_string(),
                        message: format!("Failed to get end-user: {}", e),
                    },
                }),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: ErrorDetail {
                        code: "not_found".to_string(),
                        message: "End-user not found".to_string(),
                    },
                }),
            )
        })?;

    Ok(Json(user))
}

async fn update_end_user(
    State(_state): State<AppState>,
    Path(_user_id): Path<Uuid>,
    Json(_req): Json<CreateEndUserRequest>,
) -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(ErrorResponse {
            error: ErrorDetail {
                code: "not_implemented".to_string(),
                message: "Update end-user not yet implemented".to_string(),
            },
        }),
    )
}
