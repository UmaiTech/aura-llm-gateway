//! Gateway-wide runtime settings for the admin app.
//!
//! `GET /admin/settings` returns three views of the same knobs:
//!
//! - `boot`: what the YAML file and environment set at start-up,
//! - `overrides`: the stored document an operator edited (all optional),
//! - `effective`: what the gateway is running right now,
//!
//! plus a read-only `environment` block (listen address, providers,
//! connections, auth mode) that can only change with a redeploy.
//!
//! `PUT /admin/settings` replaces the overrides, applies them immediately
//! (flags flip, the auto router is rebuilt) and persists them when a
//! database is configured.

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use aura_core::router::auto::{
    AutoRoutingConfig, ModeOffsets, TierBoundaries, TierModels, WithinTierStrategy,
};
use aura_core::GatewaySettings;
use aura_types::{ClassifierKind, RoutingMode};

use crate::AppState;

/// One view of the runtime-adjustable knobs.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RuntimeValues {
    pub routing: RoutingValues,
    pub features: FeatureValues,
    pub cache: CacheValues,
    pub rate_limit: RateLimitValues,
}

/// Auto-routing values.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoutingValues {
    /// A router exists (some tier has a servable model) and could act.
    pub available: bool,
    pub enabled: bool,
    pub shadow_for_pinned_models: bool,
    pub default_mode: RoutingMode,
    pub default_classifier: ClassifierKind,
    pub within_tier: WithinTierStrategy,
    pub sticky_tool_loops: bool,
    pub tiers: TierModels,
    pub llm_classifier_model: String,
    pub gold_sample_rate: f64,
    pub escalation_enabled: bool,
    /// Fixed at boot; shown for context.
    pub boundaries: TierBoundaries,
    pub mode_offsets: ModeOffsets,
}

/// Feature flags.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FeatureValues {
    pub payload_capture: bool,
    pub replay_tool_context: bool,
}

/// Response cache.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CacheValues {
    /// Redis is connected, so caching can work at all.
    pub available: bool,
    pub enabled: bool,
    pub default_ttl_secs: u64,
}

/// Rate limiting.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RateLimitValues {
    /// Redis is connected, so limits can be enforced at all.
    pub available: bool,
    pub enabled: bool,
    pub default_rpm: u32,
}

/// Read-only facts about this process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentInfo {
    pub version: String,
    pub host: String,
    pub port: u16,
    pub config_file: Option<String>,
    pub log_level: String,
    pub database_connected: bool,
    pub redis_connected: bool,
    /// `key` (AURA_ADMIN_KEY set), `open` (AURA_ADMIN_NO_AUTH), or
    /// `blocked` (neither: admin routes refuse every request).
    pub admin_auth: String,
    /// Origins from AURA_CORS_ALLOWED_ORIGINS; empty means permissive.
    pub cors_allowed_origins: Vec<String>,
    pub providers: Vec<String>,
    pub model_count: usize,
    pub learned_classifier: Option<String>,
    pub cost_model: Option<String>,
    /// Tier models dropped at the last router build (`tier:model`).
    pub dropped_tier_models: Vec<String>,
}

/// `GET` / `PUT /admin/settings` body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsResponse {
    pub boot: RuntimeValues,
    pub overrides: GatewaySettings,
    pub effective: RuntimeValues,
    pub environment: EnvironmentInfo,
    /// The overrides are stored in the database (false without one:
    /// they last until the next restart).
    pub persisted: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

fn routing_values(cfg: &AutoRoutingConfig, available: bool) -> RoutingValues {
    RoutingValues {
        available,
        enabled: cfg.enabled,
        shadow_for_pinned_models: cfg.shadow_for_pinned_models,
        default_mode: cfg.default_mode,
        default_classifier: cfg.default_classifier,
        within_tier: cfg.within_tier,
        sticky_tool_loops: cfg.sticky_tool_loops,
        tiers: cfg.tiers.clone(),
        llm_classifier_model: cfg.llm_classifier.model.clone(),
        gold_sample_rate: cfg.gold_sample_rate,
        escalation_enabled: cfg.escalation.enabled,
        boundaries: cfg.boundaries,
        mode_offsets: cfg.mode_offsets,
    }
}

/// Boot values: config file + environment, no overrides.
fn boot_values(state: &AppState) -> RuntimeValues {
    let redis = state.redis_pool().is_some();
    RuntimeValues {
        routing: routing_values(&state.config.routing.auto, state.auto_router().is_some()),
        features: FeatureValues {
            payload_capture: state.config.payload_capture_enabled(),
            replay_tool_context: crate::routes::tool_context_replay_from_env(),
        },
        cache: CacheValues {
            available: redis,
            enabled: true,
            default_ttl_secs: aura_core::cache::DEFAULT_CACHE_TTL,
        },
        rate_limit: RateLimitValues {
            available: redis,
            enabled: true,
            default_rpm: crate::DEFAULT_RATE_LIMIT_RPM,
        },
    }
}

/// What the gateway is running right now.
fn effective_values(state: &AppState) -> RuntimeValues {
    let redis = state.redis_pool().is_some();
    // The live router carries the pruned tier lists; fall back to the
    // unpruned effective config when nothing was servable.
    let cfg = state
        .auto_router()
        .map(|r| r.config().clone())
        .unwrap_or_else(|| state.effective_auto_config());
    RuntimeValues {
        routing: routing_values(&cfg, state.auto_router().is_some()),
        features: FeatureValues {
            payload_capture: state.payload_capture_enabled(),
            replay_tool_context: state.replay_tool_context_enabled(),
        },
        cache: CacheValues {
            available: redis,
            enabled: state.cache_enabled(),
            default_ttl_secs: state.cache_ttl_secs(),
        },
        rate_limit: RateLimitValues {
            available: redis,
            enabled: state.rate_limit_enabled(),
            default_rpm: state.default_rate_limit_rpm(),
        },
    }
}

fn environment_info(state: &AppState) -> EnvironmentInfo {
    let admin_auth = if std::env::var("AURA_ADMIN_KEY")
        .map(|k| !k.is_empty())
        .unwrap_or(false)
    {
        "key"
    } else {
        let no_auth = std::env::var("AURA_ADMIN_NO_AUTH").unwrap_or_default();
        if no_auth == "1" || no_auth.eq_ignore_ascii_case("true") {
            "open"
        } else {
            "blocked"
        }
    };
    let cors_allowed_origins: Vec<String> = std::env::var("AURA_CORS_ALLOWED_ORIGINS")
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let mut providers: Vec<String> = state
        .provider_names()
        .into_iter()
        .map(String::from)
        .collect();
    providers.sort();
    EnvironmentInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        host: state.config.server.host.clone(),
        port: state.config.server.port,
        config_file: state.config.config_file.clone(),
        log_level: state.config.logging.level.clone(),
        database_connected: state.db_pool().is_some(),
        redis_connected: state.redis_pool().is_some(),
        admin_auth: admin_auth.to_string(),
        cors_allowed_origins,
        providers,
        model_count: state.available_models().len(),
        learned_classifier: state.learned_model().map(|m| m.classifier_label()),
        cost_model: state.cost_model().map(|m| m.label()),
        dropped_tier_models: state.router_dropped_models(),
    }
}

fn snapshot(state: &AppState, persisted: bool, warnings: Vec<String>) -> SettingsResponse {
    SettingsResponse {
        boot: boot_values(state),
        overrides: state.gateway_settings(),
        effective: effective_values(state),
        environment: environment_info(state),
        persisted,
        warnings,
    }
}

fn error(status: StatusCode, message: impl Into<String>) -> (StatusCode, Json<serde_json::Value>) {
    (status, Json(serde_json::json!({ "error": message.into() })))
}

/// `GET /admin/settings`
pub async fn get_settings(State(state): State<AppState>) -> Json<SettingsResponse> {
    let persisted = state.db_pool().is_some();
    Json(snapshot(&state, persisted, Vec::new()))
}

/// `PUT /admin/settings`: replace the overrides. Send `{}` to clear them.
pub async fn put_settings(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<SettingsResponse>, (StatusCode, Json<serde_json::Value>)> {
    let settings: GatewaySettings = serde_json::from_value(body)
        .map_err(|e| error(StatusCode::BAD_REQUEST, format!("invalid settings: {e}")))?;
    settings
        .validate()
        .map_err(|e| error(StatusCode::BAD_REQUEST, e))?;

    // Persist first so a database error leaves the running gateway as it
    // was; without a database the overrides apply to this process only.
    let persisted = state.save_gateway_settings(&settings).await.map_err(|e| {
        error(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to store settings: {e}"),
        )
    })?;

    let dropped = state.apply_gateway_settings(settings);
    let mut warnings = Vec::new();
    if !dropped.is_empty() {
        warnings.push(format!(
            "dropped tier models this gateway cannot serve: {}",
            dropped.join(", ")
        ));
    }
    if !persisted {
        warnings.push("no database configured: these settings last until the next restart".into());
    }
    let effective = effective_values(&state);
    if effective.routing.enabled && !effective.routing.available {
        warnings
            .push("auto routing is enabled but no tier has a model this gateway can serve".into());
    }
    Ok(Json(snapshot(&state, persisted, warnings)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_core::router::auto::AutoRoutingConfig;
    use aura_core::Config;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    fn ollama_tiers() -> TierModels {
        TierModels {
            simple: vec!["llama3.2".into()],
            medium: vec!["llama3.1".into()],
            complex: vec!["llama3.3".into()],
            reasoning: vec!["deepseek-r1".into()],
        }
    }

    async fn state() -> AppState {
        let mut config = Config::default();
        config.providers.ollama_base_url = Some("http://127.0.0.1:1".into());
        config.routing.auto = AutoRoutingConfig {
            enabled: false,
            tiers: ollama_tiers(),
            ..Default::default()
        };
        AppState::new(config, None, None).await
    }

    async fn call(
        state: &AppState,
        method: &str,
        body: Option<serde_json::Value>,
    ) -> (StatusCode, serde_json::Value) {
        let app = crate::routes::admin::router().with_state(state.clone());
        let req = Request::builder()
            .method(method)
            .uri("/admin/settings")
            .header("content-type", "application/json")
            .body(Body::from(body.map(|b| b.to_string()).unwrap_or_default()))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        let status = resp.status();
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, json)
    }

    #[tokio::test]
    async fn get_reports_boot_values_without_overrides() {
        let state = state().await;
        let (status, json) = call(&state, "GET", None).await;
        assert_eq!(status, StatusCode::OK, "{json}");
        assert_eq!(json["persisted"], false);
        assert_eq!(json["effective"]["routing"]["enabled"], false);
        assert_eq!(json["effective"]["routing"]["available"], true);
        assert_eq!(
            json["effective"]["routing"]["tiers"]["simple"][0],
            "llama3.2"
        );
        assert_eq!(json["boot"], json["effective"]);
        assert_eq!(json["overrides"]["routing"], serde_json::json!({}));
        assert_eq!(json["environment"]["providers"][0], "ollama");
        assert_eq!(json["effective"]["cache"]["available"], false);
    }

    #[tokio::test]
    async fn put_applies_overrides_immediately() {
        let state = state().await;
        assert!(!state.auto_router().unwrap().is_enabled());
        let (status, json) = call(
            &state,
            "PUT",
            Some(serde_json::json!({
                "routing": {
                    "enabled": true,
                    "default_mode": "quality",
                    "tiers": {
                        "simple": ["llama3.2", "not-served"],
                        "medium": ["llama3.1"],
                        "complex": [],
                        "reasoning": []
                    }
                },
                "features": {"payload_capture": true, "replay_tool_context": false},
                "cache": {"enabled": false, "default_ttl_secs": 42},
                "rate_limit": {"default_rpm": 5}
            })),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{json}");
        // Applied to the live state.
        let router = state.auto_router().expect("router rebuilt");
        assert!(router.is_enabled());
        assert_eq!(router.config().default_mode, RoutingMode::Quality);
        assert_eq!(router.config().tiers.simple, vec!["llama3.2".to_string()]);
        assert!(router.config().tiers.complex.is_empty());
        assert!(state.payload_capture_enabled());
        assert!(!state.replay_tool_context_enabled());
        assert!(!state.cache_enabled());
        assert_eq!(state.cache_ttl_secs(), 42);
        assert_eq!(state.default_rate_limit_rpm(), 5);
        // Reported back.
        assert_eq!(json["effective"]["routing"]["enabled"], true);
        assert_eq!(
            json["effective"]["routing"]["tiers"]["simple"],
            serde_json::json!(["llama3.2"])
        );
        assert_eq!(json["boot"]["routing"]["enabled"], false);
        assert_eq!(json["overrides"]["routing"]["enabled"], true);
        assert_eq!(
            json["environment"]["dropped_tier_models"][0],
            "simple:not-served"
        );
        let warnings = json["warnings"].as_array().unwrap();
        assert!(warnings
            .iter()
            .any(|w| w.as_str().unwrap().contains("not-served")));
        assert!(warnings
            .iter()
            .any(|w| w.as_str().unwrap().contains("no database")));

        // Clearing restores the boot values.
        let (status, json) = call(&state, "PUT", Some(serde_json::json!({}))).await;
        assert_eq!(status, StatusCode::OK, "{json}");
        assert!(!state.auto_router().unwrap().is_enabled());
        assert!(!state.payload_capture_enabled());
        assert!(state.cache_enabled());
        assert_eq!(
            state.default_rate_limit_rpm(),
            crate::DEFAULT_RATE_LIMIT_RPM
        );
        assert_eq!(json["boot"], json["effective"]);
    }

    #[tokio::test]
    async fn put_rejects_invalid_documents() {
        let state = state().await;
        let (status, json) = call(
            &state,
            "PUT",
            Some(serde_json::json!({"routing": {"gold_sample_rate": 7}})),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{json}");
        assert!(json["error"].as_str().unwrap().contains("gold_sample_rate"));

        let (status, json) = call(
            &state,
            "PUT",
            Some(serde_json::json!({"routing": {"enabld": true}})),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{json}");
        assert!(json["error"].as_str().unwrap().contains("unknown field"));

        // Nothing changed.
        assert!(state.gateway_settings().is_empty());
    }

    #[tokio::test]
    async fn disabling_shadow_and_routing_removes_the_router() {
        let state = state().await;
        assert!(state.auto_router().is_some());
        let (status, json) = call(
            &state,
            "PUT",
            Some(serde_json::json!({"routing": {"enabled": false, "shadow_for_pinned_models": false}})),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{json}");
        assert!(state.auto_router().is_none());
        assert_eq!(json["effective"]["routing"]["available"], false);
        // The effective view still shows the configured tiers.
        assert_eq!(
            json["effective"]["routing"]["tiers"]["simple"][0],
            "llama3.2"
        );
    }
}
