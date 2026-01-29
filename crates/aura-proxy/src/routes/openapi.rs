//! OpenAPI documentation and Swagger UI for the Aura LLM Gateway
//!
//! This module provides:
//! - OpenAPI 3.1 specification at `/openapi.json`
//! - Interactive Swagger UI at `/swagger-ui`

use axum::Router;
use utoipa::openapi::security::{Http, HttpAuthScheme, SecurityScheme};
use utoipa::{Modify, OpenApi};
use utoipa_swagger_ui::SwaggerUi;

use crate::AppState;

/// Security scheme addon for Bearer authentication
struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearer_auth",
                SecurityScheme::Http(
                    Http::builder()
                        .scheme(HttpAuthScheme::Bearer)
                        .bearer_format("JWT")
                        .description(Some(
                            "API key for authentication. Include in the Authorization header as 'Bearer <api_key>'",
                        ))
                        .build(),
                ),
            );
        }
    }
}

/// OpenAPI documentation for the Aura LLM Gateway
#[derive(OpenApi)]
#[openapi(
    info(
        title = "Aura LLM Gateway",
        version = env!("CARGO_PKG_VERSION"),
        description = "A unified gateway for LLM providers implementing the Open Responses API specification. \
                       Provides a single interface to route requests to OpenAI, Anthropic, Google, and other providers.",
        license(
            name = "MIT",
            identifier = "MIT"
        ),
        contact(
            name = "Umai Tech",
            email = "marcus@umai-tech.com",
            url = "https://github.com/umaitech/aura-llm-gateway"
        )
    ),
    servers(
        (url = "/", description = "Current server")
    ),
    tags(
        (name = "responses", description = "Create LLM responses (streaming and non-streaming)"),
        (name = "conversations", description = "Manage conversation history"),
        (name = "auth", description = "API key management"),
        (name = "organizations", description = "Organization, team, and project management"),
        (name = "health", description = "Health check endpoints")
    ),
    paths(
        // Health
        super::health::health_check,
        // Responses
        super::responses::create_response,
        // Auth
        super::auth::create_api_key,
        super::auth::list_api_keys,
        super::auth::get_api_key,
        super::auth::revoke_api_key,
        // Conversations
        super::conversations::list_conversations,
        super::conversations::get_conversation,
        super::conversations::delete_conversation,
    ),
    modifiers(&SecurityAddon),
    components(
        schemas(
            // Response types
            aura_types::Response,
            aura_types::CreateResponseRequest,
            aura_types::ResponseStatus,
            aura_types::ResponseError,
            aura_types::IncompleteReason,
            aura_types::Usage,
            aura_types::Tool,
            aura_types::FunctionDefinition,
            aura_types::ToolChoice,
            aura_types::ToolChoiceAuto,
            aura_types::ToolChoiceFunction,
            // Item types
            aura_types::Item,
            aura_types::InputItem,
            aura_types::InputContent,
            aura_types::MessageItem,
            aura_types::FunctionCallItem,
            aura_types::FunctionCallOutputItem,
            aura_types::ReasoningItem,
            aura_types::ReasoningContent,
            aura_types::ContentPart,
            aura_types::Role,
            aura_types::ItemStatus,
            // Stream types
            aura_types::StreamEvent,
            aura_types::StreamError,
            aura_types::RateLimitInfo,
            // Auth types
            super::auth::CreateApiKeyRequest,
            super::auth::CreateApiKeyResponse,
            super::auth::ApiKeyInfo,
            super::auth::ListApiKeysResponse,
        )
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub struct ApiDoc;

/// Creates the OpenAPI documentation router
///
/// This router provides:
/// - `GET /openapi.json` - Raw OpenAPI 3.1 specification
/// - `GET /swagger-ui/*` - Interactive Swagger UI
pub fn router() -> Router<AppState> {
    // SwaggerUi::url() registers both the UI and the spec endpoint
    Router::new().merge(SwaggerUi::new("/swagger-ui").url("/openapi.json", ApiDoc::openapi()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_openapi_spec_generation() {
        let spec = ApiDoc::openapi();
        assert_eq!(spec.info.title, "Aura LLM Gateway");
        assert!(!spec.info.version.is_empty());
    }

    #[test]
    fn test_openapi_has_schemas() {
        let spec = ApiDoc::openapi();
        let schemas = spec.components.as_ref().unwrap().schemas.clone();

        // Verify key schemas are present
        assert!(schemas.contains_key("Response"));
        assert!(schemas.contains_key("CreateResponseRequest"));
        assert!(schemas.contains_key("StreamEvent"));
    }

    #[test]
    fn test_openapi_has_security() {
        let spec = ApiDoc::openapi();
        let security_schemes = spec.components.as_ref().unwrap().security_schemes.clone();

        assert!(security_schemes.contains_key("bearer_auth"));
    }
}
