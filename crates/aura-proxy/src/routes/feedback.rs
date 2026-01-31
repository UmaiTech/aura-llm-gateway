//! Feedback management endpoints for adaptive few-shot learning
//!
//! These endpoints allow users to submit and manage feedback on LLM responses,
//! which can be used to improve future responses through adaptive few-shot learning.

use aura_db::{FeedbackSampleRepo, NewFeedbackSample, ResponseRepo};
use aura_types::{
    FeedbackResponse, FeedbackSampleSummary, FeedbackStats, ListFeedbackQuery,
    ListFeedbackResponse, SubmitFeedbackRequest,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post},
    Json, Router,
};
use uuid::Uuid;

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/feedback", post(submit_feedback))
        .route("/v1/feedback", get(list_feedback))
        .route("/v1/feedback/stats", get(get_feedback_stats))
        .route("/v1/feedback/{id}", get(get_feedback))
        .route("/v1/feedback/{id}", delete(delete_feedback))
}

/// Submit feedback on a response
#[utoipa::path(
    post,
    path = "/v1/feedback",
    tag = "feedback",
    request_body = SubmitFeedbackRequest,
    responses(
        (status = 201, description = "Feedback recorded", body = FeedbackResponse),
        (status = 400, description = "Invalid request"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Response not found"),
        (status = 503, description = "Database unavailable")
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn submit_feedback(
    State(state): State<AppState>,
    Json(request): Json<SubmitFeedbackRequest>,
) -> Result<(StatusCode, Json<FeedbackResponse>), (StatusCode, String)> {
    let pool = state.db_pool().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "Database not configured".to_string(),
    ))?;

    // Find the response to get context
    let conv_id = ResponseRepo::find_conversation_by_response_id(pool, &request.response_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get the response details from the responses table
    // We need to extract input_text and output_text from the response
    let response_data = if let Some(conv_id) = conv_id {
        let responses = ResponseRepo::get_by_conversation(pool, conv_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        responses
            .into_iter()
            .find(|r| r.id == request.response_id)
            .map(|r| {
                // Extract input from input_items (first message content)
                let input_text = r
                    .input_items
                    .as_array()
                    .and_then(|items| items.first())
                    .and_then(|item| item.get("content"))
                    .and_then(|c| {
                        if let Some(s) = c.as_str() {
                            Some(s.to_string())
                        } else if let Some(arr) = c.as_array() {
                            arr.iter()
                                .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                                .next()
                                .map(|s| s.to_string())
                        } else {
                            None
                        }
                    })
                    .unwrap_or_default();

                // Extract output from output_items (first message content)
                let output_text = r
                    .output_items
                    .as_array()
                    .and_then(|items| items.first())
                    .and_then(|item| item.get("content"))
                    .and_then(|c| {
                        if let Some(s) = c.as_str() {
                            Some(s.to_string())
                        } else if let Some(arr) = c.as_array() {
                            arr.iter()
                                .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                                .next()
                                .map(|s| s.to_string())
                        } else {
                            None
                        }
                    })
                    .unwrap_or_default();

                (input_text, output_text, r.model_id, Some(conv_id))
            })
    } else {
        None
    };

    let (input_text, output_text, model_id, conversation_id) = response_data.ok_or((
        StatusCode::NOT_FOUND,
        format!("Response {} not found", request.response_id),
    ))?;

    // Create the feedback sample
    let new_sample = NewFeedbackSample {
        organization_id: None, // Could be extracted from auth context
        input_text,
        output_text,
        model_id: Some(model_id),
        feedback: request.signal.as_str().to_string(),
        feedback_reason: request.reason,
        feedback_by: None, // Could be extracted from auth context
        tags: request.tags,
        category: request.category,
        response_id: Some(request.response_id),
        conversation_id,
        confidence_score: None,
        metadata: None,
    };

    let sample = FeedbackSampleRepo::create(pool, new_sample)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(FeedbackResponse {
            id: sample.id.to_string(),
            recorded: true,
            message: Some("Feedback recorded successfully".to_string()),
        }),
    ))
}

/// List feedback samples
#[utoipa::path(
    get,
    path = "/v1/feedback",
    tag = "feedback",
    params(
        ("category" = Option<String>, Query, description = "Filter by category"),
        ("tags" = Option<Vec<String>>, Query, description = "Filter by tags (any match)"),
        ("feedback" = Option<String>, Query, description = "Filter by feedback type (approved/rejected)"),
        ("search" = Option<String>, Query, description = "Full-text search query"),
        ("limit" = Option<u32>, Query, description = "Maximum results (default: 50)"),
        ("offset" = Option<u32>, Query, description = "Offset for pagination")
    ),
    responses(
        (status = 200, description = "List of feedback samples", body = ListFeedbackResponse),
        (status = 401, description = "Unauthorized"),
        (status = 503, description = "Database unavailable")
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn list_feedback(
    State(state): State<AppState>,
    Query(params): Query<ListFeedbackQuery>,
) -> Result<Json<ListFeedbackResponse>, (StatusCode, String)> {
    let pool = state.db_pool().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "Database not configured".to_string(),
    ))?;

    let limit = params.limit as i64;

    // Choose query method based on parameters
    let samples = if let Some(ref search) = params.search {
        FeedbackSampleRepo::search(pool, None, search, params.feedback.as_deref(), limit).await
    } else if let Some(ref tags) = params.tags {
        FeedbackSampleRepo::get_by_tags(pool, None, tags, params.feedback.as_deref(), limit).await
    } else if let Some(ref category) = params.category {
        FeedbackSampleRepo::get_by_category(pool, None, category, params.feedback.as_deref(), limit)
            .await
    } else {
        FeedbackSampleRepo::get_recent(pool, None, limit).await
    }
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let summaries: Vec<FeedbackSampleSummary> = samples
        .into_iter()
        .map(|s| FeedbackSampleSummary {
            id: s.id.to_string(),
            input: s.input_text,
            output: s.output_text,
            model_id: s.model_id,
            feedback: s.feedback,
            reason: s.feedback_reason,
            tags: s.tags,
            category: s.category,
            use_count: s.use_count as u32,
            created_at: s.created_at.to_rfc3339(),
        })
        .collect();

    let total = summaries.len() as u64;

    Ok(Json(ListFeedbackResponse {
        samples: summaries,
        total,
    }))
}

/// Get feedback statistics
#[utoipa::path(
    get,
    path = "/v1/feedback/stats",
    tag = "feedback",
    responses(
        (status = 200, description = "Feedback statistics", body = FeedbackStats),
        (status = 401, description = "Unauthorized"),
        (status = 503, description = "Database unavailable")
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn get_feedback_stats(
    State(state): State<AppState>,
) -> Result<Json<FeedbackStats>, (StatusCode, String)> {
    let pool = state.db_pool().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "Database not configured".to_string(),
    ))?;

    let stats = FeedbackSampleRepo::get_stats(pool, None)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(FeedbackStats {
        total: stats.total,
        approved: stats.approved,
        rejected: stats.rejected,
        total_uses: stats.total_uses,
    }))
}

/// Get a single feedback sample
#[utoipa::path(
    get,
    path = "/v1/feedback/{id}",
    tag = "feedback",
    params(
        ("id" = Uuid, Path, description = "Feedback sample ID")
    ),
    responses(
        (status = 200, description = "Feedback sample details", body = FeedbackSampleSummary),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Sample not found"),
        (status = 503, description = "Database unavailable")
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn get_feedback(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<FeedbackSampleSummary>, (StatusCode, String)> {
    let pool = state.db_pool().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "Database not configured".to_string(),
    ))?;

    let sample = FeedbackSampleRepo::find_by_id(pool, id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Sample not found".to_string()))?;

    Ok(Json(FeedbackSampleSummary {
        id: sample.id.to_string(),
        input: sample.input_text,
        output: sample.output_text,
        model_id: sample.model_id,
        feedback: sample.feedback,
        reason: sample.feedback_reason,
        tags: sample.tags,
        category: sample.category,
        use_count: sample.use_count as u32,
        created_at: sample.created_at.to_rfc3339(),
    }))
}

/// Delete a feedback sample
#[utoipa::path(
    delete,
    path = "/v1/feedback/{id}",
    tag = "feedback",
    params(
        ("id" = Uuid, Path, description = "Feedback sample ID")
    ),
    responses(
        (status = 204, description = "Sample deleted"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Sample not found"),
        (status = 503, description = "Database unavailable")
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn delete_feedback(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    let pool = state.db_pool().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "Database not configured".to_string(),
    ))?;

    // Check if exists first
    let _sample = FeedbackSampleRepo::find_by_id(pool, id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Sample not found".to_string()))?;

    FeedbackSampleRepo::delete(pool, id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}
