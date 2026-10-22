//! `GET /v1/models` — the models this gateway can serve, with what the
//! auto router knows about each one.
//!
//! Shape follows the OpenAI list convention (`object: "list"`, `data: [...]`)
//! so existing clients can point a model picker at it, with an `aura`
//! object per entry carrying tier, capabilities, prices and context window,
//! and a top-level `auto` object describing the `model: "auto"` aliases.

use aura_types::{RoutingMode, Tier, AUTO_MODEL_ALIAS};
use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;
use utoipa::ToSchema;

use crate::AppState;

/// Creates the models router
pub fn router() -> Router<AppState> {
    Router::new().route("/v1/models", get(list_models))
}

/// Gateway-specific details for a model.
#[derive(Debug, Serialize, ToSchema)]
pub struct ModelAuraInfo {
    /// Tier the auto router lists the model in, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<Tier>,
    /// Capability tags from the pricing catalog.
    pub capabilities: Vec<String>,
    /// One-line summary of what the model is good at, when known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub good_at: Option<String>,
    /// USD per million input tokens, when known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_per_million: Option<f64>,
    /// USD per million output tokens, when known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_per_million: Option<f64>,
    /// Context window in tokens, when known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u32>,
    /// Whether the model accepts image input.
    pub supports_vision: bool,
    /// Whether the model supports tool calling.
    pub supports_tools: bool,
}

/// One model entry.
#[derive(Debug, Serialize, ToSchema)]
pub struct ModelEntry {
    /// Model id to send as `model`.
    pub id: String,
    /// Always `"model"`.
    pub object: &'static str,
    /// Provider name, or `"aura"` for gateway aliases.
    pub owned_by: String,
    /// Gateway details.
    pub aura: ModelAuraInfo,
}

/// Description of the `auto` aliases.
#[derive(Debug, Serialize, ToSchema)]
pub struct AutoInfo {
    /// Whether `model: "auto"` is accepted on this gateway.
    pub enabled: bool,
    /// Whether pinned-model requests are shadow-scored.
    pub shadow_for_pinned_models: bool,
    /// Mode used when none is given.
    pub default_mode: RoutingMode,
    /// Accepted aliases.
    pub aliases: Vec<String>,
    /// Candidate models per tier.
    pub tiers: TierListing,
}

/// Candidate models per tier.
#[derive(Debug, Serialize, ToSchema, Default)]
pub struct TierListing {
    pub simple: Vec<String>,
    pub medium: Vec<String>,
    pub complex: Vec<String>,
    pub reasoning: Vec<String>,
}

/// `GET /v1/models` response.
#[derive(Debug, Serialize, ToSchema)]
pub struct ListModelsResponse {
    /// Always `"list"`.
    pub object: &'static str,
    /// Models, gateway aliases first.
    pub data: Vec<ModelEntry>,
    /// Auto-routing details, when the router is configured.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto: Option<AutoInfo>,
}

/// List models this gateway can serve.
#[utoipa::path(
    get,
    path = "/v1/models",
    tag = "models",
    responses(
        (status = 200, description = "Servable models and auto-routing details", body = ListModelsResponse),
        (status = 401, description = "Missing or invalid authentication")
    ),
    security(("bearer_auth" = []))
)]
pub async fn list_models(State(state): State<AppState>) -> Json<ListModelsResponse> {
    let catalog = state.model_catalog();
    let router = state.auto_router();
    let tiers = router.as_ref().map(|r| r.catalog().tiers().clone());

    let mut data: Vec<ModelEntry> = Vec::new();

    if let Some(r) = router.as_ref().filter(|r| r.is_enabled()) {
        for (alias, mode) in [
            (AUTO_MODEL_ALIAS.to_string(), None),
            (
                format!("{}:cost", AUTO_MODEL_ALIAS),
                Some(RoutingMode::Cost),
            ),
            (
                format!("{}:balanced", AUTO_MODEL_ALIAS),
                Some(RoutingMode::Balanced),
            ),
            (
                format!("{}:quality", AUTO_MODEL_ALIAS),
                Some(RoutingMode::Quality),
            ),
        ] {
            let mode = mode.unwrap_or(r.config().default_mode);
            data.push(ModelEntry {
                id: alias,
                object: "model",
                owned_by: "aura".to_string(),
                aura: ModelAuraInfo {
                    tier: None,
                    capabilities: vec!["auto-routing".into(), format!("mode:{}", mode)],
                    good_at: Some(
                        "Picks the cheapest model expected to answer well; see metadata.aura.routing"
                            .into(),
                    ),
                    input_per_million: None,
                    output_per_million: None,
                    context_window: None,
                    supports_vision: true,
                    supports_tools: true,
                },
            });
        }
    }

    for entry in catalog.entries() {
        data.push(ModelEntry {
            id: entry.model.clone(),
            object: "model",
            owned_by: entry.provider.clone(),
            aura: ModelAuraInfo {
                tier: tiers.as_ref().and_then(|t| t.tier_of(&entry.model)),
                capabilities: entry.capabilities.clone(),
                good_at: entry.good_at.clone(),
                input_per_million: entry.input_per_million,
                output_per_million: entry.output_per_million,
                context_window: entry.context_window,
                supports_vision: entry.supports_vision(),
                supports_tools: entry.supports_tools(),
            },
        });
    }

    let auto = router.map(|r| {
        let t = r.catalog().tiers();
        AutoInfo {
            enabled: r.is_enabled(),
            shadow_for_pinned_models: r.config().shadow_for_pinned_models,
            default_mode: r.config().default_mode,
            aliases: vec![
                AUTO_MODEL_ALIAS.into(),
                "auto:cost".into(),
                "auto:balanced".into(),
                "auto:quality".into(),
            ],
            tiers: TierListing {
                simple: t.simple.clone(),
                medium: t.medium.clone(),
                complex: t.complex.clone(),
                reasoning: t.reasoning.clone(),
            },
        }
    });

    Json(ListModelsResponse {
        object: "list",
        data,
        auto,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_core::router::auto::{AutoRoutingConfig, TierModels};
    use aura_core::Config;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    async fn fetch(state: AppState) -> serde_json::Value {
        let app = router().with_state(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/v1/models")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn lists_catalog_and_auto_aliases() {
        let mut config = Config::default();
        config.providers.ollama_base_url = Some("http://127.0.0.1:1".into());
        config.routing.auto = AutoRoutingConfig {
            enabled: true,
            tiers: TierModels {
                simple: vec!["llama3.2".into()],
                medium: vec!["llama3.1".into()],
                complex: vec!["llama3.3".into()],
                reasoning: vec!["deepseek-r1".into()],
            },
            ..Default::default()
        };
        let state = AppState::new(config, None, None).await;
        let json = fetch(state).await;

        assert_eq!(json["object"], "list");
        let ids: Vec<&str> = json["data"]
            .as_array()
            .unwrap()
            .iter()
            .map(|m| m["id"].as_str().unwrap())
            .collect();
        assert_eq!(
            &ids[..4],
            &["auto", "auto:cost", "auto:balanced", "auto:quality"]
        );
        assert!(ids.contains(&"llama3.2"));
        let llama = json["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["id"] == "llama3.2")
            .unwrap();
        assert_eq!(llama["owned_by"], "ollama");
        assert_eq!(llama["aura"]["tier"], "simple");
        assert_eq!(json["auto"]["enabled"], true);
        assert_eq!(json["auto"]["tiers"]["reasoning"][0], "deepseek-r1");
    }

    #[tokio::test]
    async fn no_aliases_when_auto_disabled() {
        let mut config = Config::default();
        config.providers.ollama_base_url = Some("http://127.0.0.1:1".into());
        config.routing.auto = AutoRoutingConfig {
            enabled: false,
            shadow_for_pinned_models: false,
            ..Default::default()
        };
        let state = AppState::new(config, None, None).await;
        let json = fetch(state).await;
        let ids: Vec<&str> = json["data"]
            .as_array()
            .unwrap()
            .iter()
            .map(|m| m["id"].as_str().unwrap())
            .collect();
        assert!(!ids.contains(&"auto"));
        assert!(json.get("auto").is_none());
    }
}
