//! API routes for the Aura LLM Gateway

pub mod health;
pub mod responses;

use axum::Router;

use crate::AppState;

/// Creates the main application router with all routes
pub fn app_router() -> Router<AppState> {
    Router::new()
        // Health check endpoint
        .merge(health::router())
        // Response creation endpoint
        .merge(responses::router())
}
