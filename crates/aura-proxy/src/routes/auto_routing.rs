//! Gateway-side glue for the complexity-based auto router.
//!
//! `create_response` calls [`resolve_auto_model`] once, after tool-context
//! replay and preprocessing but before the cache lookup and the provider
//! lookup. When the request's `model` is `auto` / `auto:<mode>`, the
//! request is rewritten in place to the selected concrete model and the
//! decision is returned so it can be stamped into `metadata.aura.routing`.
//! When the request pins a real model and shadow mode is on, the decision
//! `auto` would have made is computed and returned with `shadow: true`
//! but the request is left untouched.

use aura_core::router::auto::{estimate_tokens, model_supports_tools, model_supports_vision};
use aura_core::{metrics, AutoDecision, AutoRouteError, DecisionContext, Eligibility};
use aura_types::{parse_auto_model, CreateResponseRequest, RoutingOptions};
use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::Json;
use tracing::{debug, warn};

use crate::routes::responses::ApiError;
use crate::AppState;

/// Response header carrying the concrete model a request was dispatched to.
pub const SELECTED_MODEL_HEADER: &str = "x-aura-selected-model";

/// Eligibility oracle backed by the gateway's provider registry, pricing
/// and static capability hints.
pub struct GatewayEligibility<'a> {
    state: &'a AppState,
    needs_vision: bool,
    needs_tools: bool,
    /// Rough tokens the model must fit: estimated input plus requested
    /// output. Compared against the catalog's context window when known.
    needs_context: u32,
}

impl<'a> GatewayEligibility<'a> {
    /// Build an oracle for one request.
    pub fn for_request(state: &'a AppState, request: &CreateResponseRequest) -> Self {
        let mut text_chars = request.instructions.as_ref().map(|s| s.len()).unwrap_or(0);
        let needs_vision = request.input.iter().any(|item| match item {
            aura_types::InputItem::Message { content, .. } => match content {
                aura_types::InputContent::Parts(parts) => parts.iter().any(|p| match p {
                    aura_types::ContentPart::Image { .. } => true,
                    aura_types::ContentPart::Text { text } => {
                        text_chars += text.len();
                        false
                    }
                    _ => false,
                }),
                aura_types::InputContent::Text(t) => {
                    text_chars += t.len();
                    false
                }
            },
            aura_types::InputItem::FunctionCallOutput { output, .. } => {
                text_chars += output.len();
                false
            }
            _ => false,
        });
        let needs_tools = request
            .tools
            .as_ref()
            .map(|t| !t.is_empty())
            .unwrap_or(false);
        let est_input = estimate_tokens(&"x".repeat(text_chars.min(4_000_000)));
        let needs_context = est_input.saturating_add(request.max_output_tokens.unwrap_or(0));
        Self {
            state,
            needs_vision,
            needs_tools,
            needs_context,
        }
    }
}

impl Eligibility for GatewayEligibility<'_> {
    fn is_eligible(&self, model: &str) -> bool {
        if self.state.provider_name_for_catalog_model(model).is_none() {
            return false;
        }
        let entry = self.state.model_catalog().get(model);
        let vision_ok = entry
            .map(|e| e.supports_vision())
            .unwrap_or_else(|| model_supports_vision(model));
        if self.needs_vision && !vision_ok {
            return false;
        }
        let tools_ok = entry
            .map(|e| e.supports_tools())
            .unwrap_or_else(|| model_supports_tools(model));
        if self.needs_tools && !tools_ok {
            return false;
        }
        if let Some(window) = entry.and_then(|e| e.context_window) {
            if self.needs_context > window {
                return false;
            }
        }
        true
    }

    fn blended_cost_per_million(&self, model: &str) -> Option<f64> {
        self.state
            .model_catalog()
            .get(model)
            .and_then(|e| e.blended_per_million())
            .or_else(|| self.state.cost_calculator().blended_cost_per_million(model))
    }

    fn provider_of(&self, model: &str) -> Option<String> {
        self.state.provider_name_for_catalog_model(model)
    }
}

/// Look up the model that produced `previous_response_id`, when the
/// database is available. Best effort: errors are logged and ignored.
async fn previous_turn_model(state: &AppState, request: &CreateResponseRequest) -> Option<String> {
    let prev = request.previous_response_id.as_deref()?;
    let pool = state.db_pool()?;
    match aura_db::ResponseRepo::find_model_by_id(pool, prev).await {
        Ok(model) => model,
        Err(e) => {
            debug!(error = %e, previous_response_id = %prev, "auto routing: previous model lookup failed");
            None
        }
    }
}

/// Resolve `model: "auto"` (or compute a shadow decision for a pinned
/// model). Rewrites `request.model` when a real decision is applied.
///
/// Returns `Ok(None)` when auto routing is not involved at all.
pub async fn resolve_auto_model(
    state: &AppState,
    request: &mut CreateResponseRequest,
    organization_id: Option<uuid::Uuid>,
) -> Result<Option<AutoDecision>, (StatusCode, Json<ApiError>)> {
    let alias = parse_auto_model(&request.model);
    let Some(router) = state.auto_router() else {
        if alias.is_some() {
            metrics::record_routing_failure("disabled");
            return Err((
                StatusCode::NOT_FOUND,
                Json(ApiError::with_param(
                    "model_not_found",
                    "Model 'auto' requires auto routing, which is not enabled on this gateway \
                     (set routing.auto.enabled: true or AURA_AUTO_ROUTING=on)",
                    "model",
                )),
            ));
        }
        return Ok(None);
    };

    // Organization override (settings.routing.auto): may switch auto on
    // or off for this org and narrows the request's options.
    let org = state.org_auto_routing_override(organization_id).await;
    let shadow = alias.is_none();
    let shadow_enabled = org
        .shadow_for_pinned_models
        .unwrap_or(router.config().shadow_for_pinned_models);
    if shadow && !shadow_enabled {
        return Ok(None);
    }
    let enabled = org.enabled.unwrap_or(router.is_enabled());
    if !shadow && !enabled {
        metrics::record_routing_failure("disabled");
        return Err((
            StatusCode::NOT_FOUND,
            Json(ApiError::with_param(
                "model_not_found",
                "Model 'auto' is not enabled for this organization",
                "model",
            )),
        ));
    }

    let previous_model = previous_turn_model(state, request).await;
    let requested_model = request.model.clone();
    let merged: Option<RoutingOptions> = if org.is_empty() {
        None
    } else {
        Some(org.merged_with(request.routing.as_ref()))
    };
    let options = merged.as_ref().or(request.routing.as_ref());
    let ctx = DecisionContext {
        requested_model: &requested_model,
        alias_mode: alias.and_then(|a| a.mode),
        options,
        previous_model: previous_model.as_deref(),
        // Only the org override can enable a router the gateway config
        // left disabled; tell the router to treat this as allowed.
        shadow: shadow || !router.is_enabled(),
    };
    let oracle = GatewayEligibility::for_request(state, request);

    match router.decide(request, &ctx, &oracle) {
        Ok(mut decision) => {
            decision.shadow = shadow;
            metrics::record_routing_decision(
                decision.mode.as_str(),
                decision.tier.as_str(),
                &decision.classifier,
                &decision.selected,
                decision.shadow,
                decision.latency_us as f64 / 1_000_000.0,
            );
            if shadow {
                debug!(
                    requested = %requested_model,
                    would_select = %decision.selected,
                    tier = %decision.tier,
                    score = decision.score,
                    "auto routing: shadow decision"
                );
            } else {
                debug!(
                    requested = %requested_model,
                    selected = %decision.selected,
                    tier = %decision.tier,
                    score = decision.score,
                    reason = %decision.reason,
                    latency_us = decision.latency_us,
                    "auto routing: applied decision"
                );
                request.model = decision.selected.clone();
            }
            Ok(Some(decision))
        }
        Err(AutoRouteError::Disabled) => {
            // A real `auto` request on a gateway that only runs shadow
            // scoring (routing.auto.enabled = false).
            metrics::record_routing_failure("disabled");
            Err((
                StatusCode::NOT_FOUND,
                Json(ApiError::with_param(
                    "model_not_found",
                    "Model 'auto' requires auto routing, which is not enabled on this gateway",
                    "model",
                )),
            ))
        }
        Err(err @ AutoRouteError::NoCandidate { .. }) => {
            if shadow {
                debug!(error = %err, "auto routing: shadow decision found no candidate");
                return Ok(None);
            }
            warn!(error = %err, requested = %requested_model, "auto routing: no eligible model");
            metrics::record_routing_failure("no_candidate");
            Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ApiError::with_param(
                    "no_eligible_model",
                    format!("Auto routing could not find an eligible model: {}", err),
                    "model",
                )),
            ))
        }
    }
}

/// Header pair announcing the selected model, when a decision was applied.
pub fn selected_model_header(decision: Option<&AutoDecision>) -> Option<(HeaderName, HeaderValue)> {
    let d = decision?;
    if d.shadow {
        return None;
    }
    let value = HeaderValue::from_str(&d.selected).ok()?;
    Some((HeaderName::from_static(SELECTED_MODEL_HEADER), value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_core::router::auto::{AutoRoutingConfig, TierModels};
    use aura_core::Config;
    use aura_types::{RoutingMode, RoutingOptions, Tier};
    use axum::body::Body;
    use axum::http::Request;
    use http_body_util::BodyExt;
    use tower::ServiceExt;
    use wiremock::matchers::{body_partial_json, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// Ollama accepts any model name and speaks the OpenAI chat shape, so a
    /// wiremock server posing as Ollama lets us drive the real handler with
    /// tier lists made of Ollama catalog models.
    fn ollama_tiers() -> TierModels {
        TierModels {
            simple: vec!["llama3.2".into(), "phi3".into()],
            medium: vec!["llama3.1".into(), "qwen2.5".into()],
            complex: vec!["llama3.3".into()],
            reasoning: vec!["deepseek-r1".into()],
        }
    }

    async fn state_with_router(base_url: &str, enabled: bool) -> AppState {
        let mut config = Config::default();
        config.providers.ollama_base_url = Some(base_url.to_string());
        config.routing.auto = AutoRoutingConfig {
            enabled,
            tiers: ollama_tiers(),
            ..Default::default()
        };
        AppState::new(config, None, None).await
    }

    fn chat_completion(model: &str, text: &str) -> serde_json::Value {
        serde_json::json!({
            "id": "chatcmpl-1",
            "object": "chat.completion",
            "model": model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop"
            }],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8}
        })
    }

    async fn post_responses(
        app: axum::Router,
        body: serde_json::Value,
    ) -> (StatusCode, axum::http::HeaderMap, serde_json::Value) {
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/responses")
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap_or(serde_json::json!({
            "raw": String::from_utf8_lossy(&bytes)
        }));
        (status, headers, json)
    }

    #[tokio::test]
    async fn auto_alias_routes_simple_prompt_to_simple_tier() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .and(body_partial_json(serde_json::json!({"model": "llama3.2"})))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(chat_completion("llama3.2", "Paris")),
            )
            .expect(1)
            .mount(&server)
            .await;

        let state = state_with_router(&server.uri(), true).await;
        let app = crate::routes::responses::router().with_state(state);
        let (status, headers, json) = post_responses(
            app,
            serde_json::json!({
                "model": "auto",
                "input": [{"type": "message", "role": "user", "content": "What is the capital of France?"}]
            }),
        )
        .await;

        assert_eq!(status, StatusCode::OK, "{json}");
        assert_eq!(json["model"], "llama3.2");
        assert_eq!(
            headers
                .get(SELECTED_MODEL_HEADER)
                .and_then(|v| v.to_str().ok()),
            Some("llama3.2")
        );
        let routing = &json["metadata"]["aura"]["routing"];
        assert_eq!(routing["requested_model"], "auto");
        assert_eq!(routing["tier"], "simple");
        assert_eq!(routing["selected"], "llama3.2");
        assert_eq!(routing["shadow"], false);
        assert_eq!(routing["mode"], "balanced");
        assert_eq!(json["metadata"]["aura"]["routing_strategy"], "auto:simple");
        assert!(routing["candidates"].as_array().unwrap().len() >= 2);
        assert!(routing["features"]["est_input_tokens"].is_number());
    }

    #[tokio::test]
    async fn quality_mode_and_min_tier_move_up() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .and(body_partial_json(serde_json::json!({"model": "llama3.3"})))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(chat_completion("llama3.3", "ok")),
            )
            .expect(1)
            .mount(&server)
            .await;

        let state = state_with_router(&server.uri(), true).await;
        let app = crate::routes::responses::router().with_state(state);
        let (status, _headers, json) = post_responses(
            app,
            serde_json::json!({
                "model": "auto:quality",
                "input": [{"type": "message", "role": "user", "content": "hi"}],
                "routing": {"min_tier": "complex"}
            }),
        )
        .await;

        assert_eq!(status, StatusCode::OK, "{json}");
        assert_eq!(json["model"], "llama3.3");
        let routing = &json["metadata"]["aura"]["routing"];
        assert_eq!(routing["mode"], "quality");
        assert_eq!(routing["classified_tier"], "simple");
        assert_eq!(routing["tier"], "complex");
        assert!(routing["hard_filters"]
            .as_array()
            .unwrap()
            .iter()
            .any(|f| f == "min_tier complex"));
    }

    #[tokio::test]
    async fn pinned_model_gets_shadow_decision_without_rerouting() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .and(body_partial_json(serde_json::json!({"model": "llama3.3"})))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(chat_completion("llama3.3", "Paris")),
            )
            .expect(1)
            .mount(&server)
            .await;

        let state = state_with_router(&server.uri(), true).await;
        let app = crate::routes::responses::router().with_state(state);
        let (status, headers, json) = post_responses(
            app,
            serde_json::json!({
                "model": "llama3.3",
                "input": [{"type": "message", "role": "user", "content": "What is the capital of France?"}]
            }),
        )
        .await;

        assert_eq!(status, StatusCode::OK, "{json}");
        assert_eq!(json["model"], "llama3.3");
        assert!(headers.get(SELECTED_MODEL_HEADER).is_none());
        let routing = &json["metadata"]["aura"]["routing"];
        assert_eq!(routing["shadow"], true);
        assert_eq!(routing["requested_model"], "llama3.3");
        assert_eq!(routing["selected"], "llama3.2");
        assert!(json["metadata"]["aura"].get("routing_strategy").is_none());
    }

    #[tokio::test]
    async fn auto_is_not_found_when_router_disabled() {
        let server = MockServer::start().await;
        let state = state_with_router(&server.uri(), false).await;
        // Shadow scoring is on by default, so the router exists but is not
        // enabled for real `auto` requests.
        assert!(!state.auto_router().map(|r| r.is_enabled()).unwrap_or(false));
        let app = crate::routes::responses::router().with_state(state);
        let (status, _headers, json) = post_responses(
            app,
            serde_json::json!({
                "model": "auto",
                "input": [{"type": "message", "role": "user", "content": "hi"}]
            }),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{json}");
        assert_eq!(json["error"]["code"], "model_not_found");
        assert_eq!(json["error"]["param"], "model");
    }

    #[tokio::test]
    async fn deny_list_that_excludes_everything_is_503() {
        let server = MockServer::start().await;
        let state = state_with_router(&server.uri(), true).await;
        let app = crate::routes::responses::router().with_state(state);
        let (status, _headers, json) = post_responses(
            app,
            serde_json::json!({
                "model": "auto",
                "input": [{"type": "message", "role": "user", "content": "hi"}],
                "routing": {"deny": ["*"]}
            }),
        )
        .await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{json}");
        assert_eq!(json["error"]["code"], "no_eligible_model");
    }

    #[tokio::test]
    async fn unknown_tier_models_are_pruned_and_empty_catalog_disables_router() {
        let server = MockServer::start().await;
        let mut config = Config::default();
        config.providers.ollama_base_url = Some(server.uri());
        config.routing.auto = AutoRoutingConfig {
            enabled: true,
            tiers: TierModels {
                simple: vec!["gpt-5.4-nano".into()],
                medium: vec!["claude-sonnet-4-6".into()],
                complex: vec![],
                reasoning: vec![],
            },
            ..Default::default()
        };
        // No OpenAI / Anthropic keys: those models are unknown to this gateway.
        let state = AppState::new(config, None, None).await;
        assert!(state.auto_router().is_none());
    }

    #[tokio::test]
    async fn gateway_eligibility_uses_strict_provider_resolution() {
        let server = MockServer::start().await;
        let state = state_with_router(&server.uri(), true).await;
        let req = CreateResponseRequest::text("auto", "hi");
        let oracle = GatewayEligibility::for_request(&state, &req);
        // Catalog models registered by the Ollama provider are eligible.
        assert!(oracle.is_eligible("llama3.2"));
        assert_eq!(oracle.provider_of("llama3.2").as_deref(), Some("ollama"));
        // Ollama's accept-anything supports_model must not make foreign
        // models look eligible.
        assert!(!oracle.is_eligible("gpt-5.4-nano"));
        assert!(oracle.provider_of("gpt-5.4-nano").is_none());
        assert!(!oracle.is_eligible("auto"));
    }

    #[test]
    fn selected_model_header_only_for_applied_decisions() {
        assert!(selected_model_header(None).is_none());
        let router = aura_core::AutoRouter::new(AutoRoutingConfig {
            enabled: true,
            ..Default::default()
        });
        struct AllOk;
        impl Eligibility for AllOk {
            fn is_eligible(&self, _: &str) -> bool {
                true
            }
            fn blended_cost_per_million(&self, _: &str) -> Option<f64> {
                None
            }
            fn provider_of(&self, _: &str) -> Option<String> {
                None
            }
        }
        let req = CreateResponseRequest::text("auto", "hi").with_routing(RoutingOptions {
            mode: Some(RoutingMode::Cost),
            max_tier: Some(Tier::Simple),
            ..Default::default()
        });
        let ctx = DecisionContext {
            requested_model: "auto",
            ..Default::default()
        };
        let mut d = router.decide(&req, &ctx, &AllOk).unwrap();
        let (name, value) = selected_model_header(Some(&d)).unwrap();
        assert_eq!(name.as_str(), SELECTED_MODEL_HEADER);
        assert_eq!(value.to_str().unwrap(), d.selected);
        d.shadow = true;
        assert!(selected_model_header(Some(&d)).is_none());
    }
}
