//! Routing lab: the admin app's battle-test path for the auto router.
//!
//! `POST /admin/routing/lab/run` runs one request through the real
//! `/v1/responses` pipeline (auto routing, escalation, breaker, logging)
//! with the provider actually called, but on the admin path:
//!
//! - it sits under `/admin`, so only the admin key gets in; tenant API
//!   keys are refused by the auth middleware before the handler runs;
//! - the request carries no tenant `AuthContext`, so per-key rate limits,
//!   key quotas and the organization's `routing.auto` override (tier
//!   clamps, allow / deny lists, `max_cost_usd`) do not apply. Only the
//!   request's own `routing` options do;
//! - the response cache is bypassed, so repeated runs really dispatch;
//! - `synthetic` (default on) records the decision with `synthetic = true`,
//!   which keeps lab traffic out of routing stats, rollup rewards, arm
//!   statistics and gold sampling (the same marker as `x-aura-synthetic`).
//!
//! Every run is logged on the `aura_proxy::audit` tracing target and recorded in
//! `request_logs` with `user = "aura-routing-lab"` unless the body sets one.
//! Spend control (running total, confirmation above a threshold) lives in
//! the admin app; this endpoint never streams and runs one request per call.
//!
//! Dry runs that cost nothing use `POST /admin/routing/score` instead.

use std::time::Instant;

use axum::{
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::routes::auto_routing::SYNTHETIC_HEADER;
use crate::AppState;

/// `user` stamped on lab requests that don't set one, so lab traffic is
/// identifiable in `request_logs`.
pub const LAB_USER: &str = "aura-routing-lab";

/// Largest body the lab accepts back from the pipeline (16 MiB).
const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;

fn default_true() -> bool {
    true
}

/// `POST /admin/routing/lab/run` body.
#[derive(Debug, Deserialize)]
pub struct LabRunRequest {
    /// The `/v1/responses` body to run. `model` may be `auto`,
    /// `auto:<mode>` or a pinned model; `stream` is forced off.
    pub request: aura_types::CreateResponseRequest,
    /// Record the decision as synthetic (default true) so lab traffic stays
    /// out of routing stats, rewards and gold sampling.
    #[serde(default = "default_true")]
    pub synthetic: bool,
    /// Free-form label for the audit log (suite / prompt id).
    #[serde(default)]
    pub label: Option<String>,
}

/// `POST /admin/routing/lab/run` result. Provider and routing errors are
/// reported in the body (`ok: false`) so a batch keeps going.
#[derive(Debug, Serialize)]
pub struct LabRunResponse {
    pub ok: bool,
    /// HTTP status the `/v1/responses` pipeline returned.
    pub status: u16,
    /// Concrete model that answered.
    pub model: Option<String>,
    /// `metadata.aura.routing` (applied, or shadow for a pinned model).
    pub routing: Option<serde_json::Value>,
    /// Answer text.
    pub output_text: Option<String>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    /// Actual cost from the gateway's pricing table.
    pub cost_usd: Option<f64>,
    /// Wall time of the whole pipeline, including escalations.
    pub latency_ms: u64,
    pub synthetic: bool,
    /// The full response object.
    pub response: Option<serde_json::Value>,
    /// The error body when `ok` is false.
    pub error: Option<serde_json::Value>,
}

impl LabRunResponse {
    fn from_pipeline(
        status: StatusCode,
        body: serde_json::Value,
        latency_ms: u64,
        synthetic: bool,
    ) -> Self {
        if !status.is_success() {
            return Self {
                ok: false,
                status: status.as_u16(),
                model: None,
                routing: None,
                output_text: None,
                input_tokens: None,
                output_tokens: None,
                cost_usd: None,
                latency_ms,
                synthetic,
                response: None,
                error: Some(body),
            };
        }
        let output_text = serde_json::from_value::<aura_types::Response>(body.clone())
            .ok()
            .map(|r| r.text());
        let usage = body.get("usage");
        let num = |key: &str| usage.and_then(|u| u.get(key)).and_then(|v| v.as_u64());
        Self {
            ok: true,
            status: status.as_u16(),
            model: body.get("model").and_then(|v| v.as_str()).map(String::from),
            routing: body
                .pointer("/metadata/aura/routing")
                .filter(|v| !v.is_null())
                .cloned(),
            output_text,
            input_tokens: num("input_tokens"),
            output_tokens: num("output_tokens"),
            cost_usd: usage
                .and_then(|u| u.get("cost_usd"))
                .and_then(|v| v.as_f64()),
            latency_ms,
            synthetic,
            response: Some(body),
            error: None,
        }
    }
}

/// `POST /admin/routing/lab/run`: run one request live on the admin path.
pub async fn run_lab_request(
    State(state): State<AppState>,
    Json(body): Json<LabRunRequest>,
) -> Result<Json<LabRunResponse>, (StatusCode, Json<serde_json::Value>)> {
    let LabRunRequest {
        mut request,
        synthetic,
        label,
    } = body;
    request.stream = false;
    if request.user.is_none() {
        request.user = Some(LAB_USER.to_string());
    }

    let mut headers = HeaderMap::new();
    headers.insert("x-cache-control", HeaderValue::from_static("no-cache"));
    if synthetic {
        headers.insert(SYNTHETIC_HEADER, HeaderValue::from_static("1"));
    }

    let requested_model = request.model.clone();
    info!(
        target: "aura_proxy::audit",
        action = "routing_lab.run",
        model = %requested_model,
        synthetic,
        label = label.as_deref().unwrap_or(""),
        max_output_tokens = ?request.max_output_tokens,
        "admin routing lab run (no tenant limits)"
    );

    let start = Instant::now();
    // No AuthContext: no org override, no key quotas. The rate-limit
    // middleware already skips /admin paths.
    let result =
        crate::routes::responses::create_response(State(state), headers, None, Json(request)).await;
    let latency_ms = start.elapsed().as_millis() as u64;

    let (status, json) = match result {
        Ok(response) => {
            let status = response.status();
            let bytes = axum::body::to_bytes(response.into_body(), MAX_RESPONSE_BYTES)
                .await
                .map_err(|e| {
                    (
                        StatusCode::BAD_GATEWAY,
                        Json(serde_json::json!({"error": format!("unreadable response: {e}")})),
                    )
                })?;
            let json = serde_json::from_slice(&bytes)
                .unwrap_or_else(|_| serde_json::json!({"raw": String::from_utf8_lossy(&bytes)}));
            (status, json)
        }
        Err((status, Json(err))) => (
            status,
            serde_json::to_value(err).unwrap_or(serde_json::Value::Null),
        ),
    };

    let out = LabRunResponse::from_pipeline(status, json, latency_ms, synthetic);
    if out.ok {
        info!(
            target: "aura_proxy::audit",
            action = "routing_lab.result",
            requested = %requested_model,
            model = out.model.as_deref().unwrap_or(""),
            cost_usd = out.cost_usd.unwrap_or(0.0),
            latency_ms,
            synthetic,
            "admin routing lab run completed"
        );
    } else {
        warn!(
            target: "aura_proxy::audit",
            action = "routing_lab.result",
            requested = %requested_model,
            status = out.status,
            latency_ms,
            synthetic,
            "admin routing lab run failed"
        );
    }
    Ok(Json(out))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::auth::{authenticate, AdminAuthConfig};
    use aura_core::router::auto::{AutoRoutingConfig, TierModels};
    use aura_core::Config;
    use axum::body::Body;
    use axum::extract::Request;
    use axum::middleware::{self, Next};
    use tower::ServiceExt;
    use wiremock::matchers::{body_partial_json, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const ADMIN_KEY: &str = "lab-test-admin-key";

    async fn state_with_router(base_url: &str) -> AppState {
        let mut config = Config::default();
        config.providers.ollama_base_url = Some(base_url.to_string());
        config.routing.auto = AutoRoutingConfig {
            enabled: true,
            tiers: TierModels {
                simple: vec!["llama3.2".into(), "phi3".into()],
                medium: vec!["llama3.1".into(), "qwen2.5".into()],
                complex: vec!["llama3.3".into()],
                reasoning: vec!["deepseek-r1".into()],
            },
            ..Default::default()
        };
        AppState::new(config, None, None).await
    }

    /// The production middleware stack (auth, then rate limit) in front
    /// of every route, with a fixed admin key instead of the env.
    fn app(state: AppState) -> axum::Router {
        let admin = AdminAuthConfig {
            key: ADMIN_KEY.to_string(),
            no_auth: false,
        };
        crate::routes::app_router()
            .layer(middleware::from_fn_with_state(
                state.clone(),
                crate::routes::rate_limit_middleware,
            ))
            .layer(middleware::from_fn_with_state(
                state.clone(),
                move |State(s): State<AppState>, req: Request, next: Next| {
                    let admin = admin.clone();
                    async move { authenticate(s, req, next, &admin).await }
                },
            ))
            .with_state(state)
    }

    async fn mock_completion(server: &MockServer, model: &str, expect: u64) {
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .and(body_partial_json(serde_json::json!({"model": model})))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": "chatcmpl-1",
                "object": "chat.completion",
                "model": model,
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": "Paris"},
                    "finish_reason": "stop"
                }],
                "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8}
            })))
            .expect(expect)
            .mount(server)
            .await;
    }

    async fn post_lab(
        app: axum::Router,
        bearer: Option<&str>,
        body: serde_json::Value,
    ) -> (StatusCode, serde_json::Value) {
        let mut req = axum::http::Request::builder()
            .method("POST")
            .uri("/admin/routing/lab/run")
            .header("content-type", "application/json");
        if let Some(token) = bearer {
            req = req.header("authorization", format!("Bearer {token}"));
        }
        let response = app
            .oneshot(req.body(Body::from(body.to_string())).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, json)
    }

    fn capital_question(model: &str) -> serde_json::Value {
        serde_json::json!({
            "model": model,
            "input": [{"type": "message", "role": "user", "content": "What is the capital of France?"}],
            "stream": true
        })
    }

    #[tokio::test]
    async fn admin_key_runs_live_and_marks_synthetic() {
        let server = MockServer::start().await;
        mock_completion(&server, "llama3.2", 1).await;
        let state = state_with_router(&server.uri()).await;

        let (status, json) = post_lab(
            app(state),
            Some(ADMIN_KEY),
            serde_json::json!({"request": capital_question("auto"), "label": "smoke"}),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{json}");
        assert_eq!(json["ok"], true, "{json}");
        assert_eq!(json["model"], "llama3.2");
        assert_eq!(json["output_text"], "Paris");
        assert_eq!(json["synthetic"], true);
        assert_eq!(json["routing"]["tier"], "simple");
        assert_eq!(json["routing"]["synthetic"], true);
        assert_eq!(json["routing"]["shadow"], false);
        assert_eq!(json["input_tokens"], 5);
    }

    #[tokio::test]
    async fn synthetic_marking_is_a_toggle() {
        let server = MockServer::start().await;
        mock_completion(&server, "llama3.2", 1).await;
        let state = state_with_router(&server.uri()).await;

        let (status, json) = post_lab(
            app(state),
            Some(ADMIN_KEY),
            serde_json::json!({"request": capital_question("auto"), "synthetic": false}),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{json}");
        assert_eq!(json["synthetic"], false);
        assert!(json["routing"].get("synthetic").is_none(), "{json}");
    }

    #[tokio::test]
    async fn pinned_model_answers_with_a_shadow_decision() {
        let server = MockServer::start().await;
        mock_completion(&server, "llama3.3", 1).await;
        let state = state_with_router(&server.uri()).await;

        let (status, json) = post_lab(
            app(state),
            Some(ADMIN_KEY),
            serde_json::json!({"request": capital_question("llama3.3")}),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{json}");
        assert_eq!(json["model"], "llama3.3");
        assert_eq!(json["routing"]["shadow"], true);
        assert_eq!(json["routing"]["selected"], "llama3.2");
    }

    #[tokio::test]
    async fn routing_errors_come_back_in_the_body() {
        let server = MockServer::start().await;
        let state = state_with_router(&server.uri()).await;

        let mut request = capital_question("auto");
        request["routing"] = serde_json::json!({"deny": ["*"]});
        let (status, json) = post_lab(
            app(state),
            Some(ADMIN_KEY),
            serde_json::json!({ "request": request }),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{json}");
        assert_eq!(json["ok"], false);
        assert_eq!(json["status"], 503);
        assert_eq!(
            json["error"]["error"]["code"], "no_eligible_model",
            "{json}"
        );
    }

    #[tokio::test]
    async fn tenant_keys_and_missing_auth_are_refused() {
        let server = MockServer::start().await;
        // The provider must never be reached.
        mock_completion(&server, "llama3.2", 0).await;
        let state = state_with_router(&server.uri()).await;
        let body = serde_json::json!({"request": capital_question("auto")});

        for bearer in [
            Some("aura_live_abcdefgh_0123456789abcdef0123456789abcdef"),
            Some("aura_test_abcdefgh_0123456789abcdef0123456789abcdef"),
            Some("not-the-admin-key"),
            None,
        ] {
            let (status, json) = post_lab(app(state.clone()), bearer, body.clone()).await;
            assert_eq!(status, StatusCode::UNAUTHORIZED, "{bearer:?}: {json}");
            assert!(json.get("ok").is_none(), "{json}");
        }
    }

    #[tokio::test]
    async fn admin_routes_fail_closed_without_a_configured_key() {
        let server = MockServer::start().await;
        mock_completion(&server, "llama3.2", 0).await;
        let state = state_with_router(&server.uri()).await;
        let unconfigured = AdminAuthConfig::default();
        let app = crate::routes::app_router()
            .layer(middleware::from_fn_with_state(
                state.clone(),
                move |State(s): State<AppState>, req: Request, next: Next| {
                    let admin = unconfigured.clone();
                    async move { authenticate(s, req, next, &admin).await }
                },
            ))
            .with_state(state);
        let (status, _) = post_lab(
            app,
            Some(""),
            serde_json::json!({"request": capital_question("auto")}),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    /// The bypass is the admin path, not the header: a tenant request
    /// (organization context) that sets `x-aura-synthetic` without the
    /// org opting in is still recorded as real traffic.
    #[tokio::test]
    async fn tenant_requests_cannot_self_mark_synthetic() {
        let server = MockServer::start().await;
        let state = state_with_router(&server.uri()).await;
        let mut request: aura_types::CreateResponseRequest =
            serde_json::from_value(capital_question("auto")).unwrap();
        let decision = crate::routes::auto_routing::resolve_auto_model(
            &state,
            &mut request,
            Some(uuid::Uuid::new_v4()),
            "aura_test",
            true,
        )
        .await
        .unwrap()
        .unwrap();
        assert!(!decision.synthetic);
    }

    #[test]
    fn admin_auth_check() {
        let cfg = AdminAuthConfig {
            key: "secret".into(),
            no_auth: false,
        };
        assert!(cfg.check(Some("Bearer secret")).is_ok());
        assert!(cfg.check(Some("Bearer secret2")).is_err());
        assert!(cfg.check(Some("secret")).is_err());
        assert!(cfg.check(None).is_err());
        // The dev escape hatch only applies when no key is configured.
        let open = AdminAuthConfig {
            key: String::new(),
            no_auth: true,
        };
        assert!(open.check(None).is_ok());
        let with_key_and_flag = AdminAuthConfig {
            key: "secret".into(),
            no_auth: true,
        };
        assert!(with_key_and_flag.check(None).is_err());
        assert!(AdminAuthConfig::default().check(Some("Bearer ")).is_err());
    }
}
