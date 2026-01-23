//! Conversation management endpoints

use aura_db::{ConversationRepo, MessageRepo, ResponseRepo};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/conversations", get(list_conversations))
        .route("/v1/conversations/{id}", get(get_conversation))
        .route("/v1/conversations/{id}", delete(delete_conversation))
}

#[derive(Debug, Deserialize)]
struct ListParams {
    user_id: Option<String>,
    #[serde(default = "default_limit")]
    limit: i64,
}

fn default_limit() -> i64 {
    20
}

#[derive(Debug, Serialize)]
struct ConversationDetail {
    #[serde(flatten)]
    conversation: aura_db::Conversation,
    messages: Vec<aura_db::Message>,
    responses: Vec<aura_db::ResponseRecord>,
}

/// List conversations
async fn list_conversations(
    State(state): State<AppState>,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<aura_db::Conversation>>, (StatusCode, String)> {
    let pool = state.db_pool().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "Database not configured".to_string(),
    ))?;

    let conversations = if let Some(user_id) = params.user_id {
        ConversationRepo::get_by_user(pool, &user_id, params.limit)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    } else {
        vec![]
    };

    Ok(Json(conversations))
}

/// Get conversation detail with messages and responses
async fn get_conversation(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ConversationDetail>, (StatusCode, String)> {
    let pool = state.db_pool().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "Database not configured".to_string(),
    ))?;

    let conversation = ConversationRepo::get_by_id(pool, id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Conversation not found".to_string()))?;

    let messages = MessageRepo::get_by_conversation(pool, id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let responses = ResponseRepo::get_by_conversation(pool, id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(ConversationDetail {
        conversation,
        messages,
        responses,
    }))
}

/// Delete conversation and all associated data
async fn delete_conversation(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    let pool = state.db_pool().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "Database not configured".to_string(),
    ))?;

    ConversationRepo::delete(pool, id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}
