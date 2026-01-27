//! API routes for the Aura LLM Gateway

pub mod auth;
pub mod conversations;
pub mod health;
pub mod openapi;
pub mod organizations;
pub mod responses;

use axum::Router;

use crate::AppState;

pub use auth::auth_middleware;
#[allow(unused_imports)]
pub use auth::{AuthContext, AuthError};

/// Creates the main application router with all routes
pub fn app_router() -> Router<AppState> {
    Router::new()
        // Health check endpoint
        .merge(health::router())
        // Response creation endpoint
        .merge(responses::router())
        // Conversation management endpoints
        .merge(conversations::router())
        // API key management endpoints
        .merge(auth::router())
        // Organization management endpoints
        .merge(organizations::router())
        // OpenAPI documentation and Swagger UI
        .merge(openapi::router())
}
