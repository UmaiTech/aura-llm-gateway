//! Auto-router decisions explorer (admin app).
//!
//! - `GET /admin/routing/decisions`: filtered, cursor-paginated list of
//!   decisions joined with their outcomes, newest first.
//! - `GET /admin/routing/decisions/{response_id}`: one decision with its
//!   outcome and the tier boundaries to draw its score against.
//! - `GET /admin/stats/routing/auto/timeline`: applied / shadow volume,
//!   reward and shadow savings per hour or day.
//!
//! Admin-authenticated by the `/admin` prefix check in `auth_middleware`.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Duration, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use aura_core::router::auto::TierBoundaries;
use aura_db::{RoutingDecisionFilter, RoutingDecisionListItem, SyntheticFilter};

use crate::AppState;

type ApiError = (StatusCode, Json<serde_json::Value>);

const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 200;
const TIERS: [&str; 4] = ["simple", "medium", "complex", "reasoning"];
const MODES: [&str; 3] = ["cost", "balanced", "quality"];
const OUTCOMES: [&str; 6] = [
    "none",
    "move_on",
    "retry",
    "correction",
    "escalation",
    "unscored",
];
const FEEDBACK: [&str; 2] = ["approved", "rejected"];

fn bad_request(msg: impl Into<String>) -> ApiError {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({"error": msg.into()})),
    )
}

fn db_unavailable() -> ApiError {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(serde_json::json!({"error": "Database not configured"})),
    )
}

fn db_error(context: &'static str) -> impl Fn(aura_db::DbError) -> ApiError {
    move |e| {
        tracing::error!(error = %e, "{context}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("Database error: {}", e)})),
        )
    }
}

/// Raw query string for the list endpoint. Everything is parsed by hand
/// so a bad value yields a JSON 400 naming the parameter.
#[derive(Debug, Default, Deserialize)]
pub struct DecisionListQuery {
    /// `24h`, `7d`, `30d` or `all`; ignored when `from` is set.
    pub period: Option<String>,
    /// RFC 3339 lower bound (inclusive).
    pub from: Option<String>,
    /// RFC 3339 upper bound (exclusive).
    pub to: Option<String>,
    pub mode: Option<String>,
    pub tier: Option<String>,
    pub classified_tier: Option<String>,
    pub tier_changed: Option<String>,
    pub model: Option<String>,
    pub shadow: Option<String>,
    /// `exclude` (default), `include` or `only`.
    pub synthetic: Option<String>,
    pub escalated: Option<String>,
    pub sticky: Option<String>,
    pub status: Option<String>,
    pub outcome: Option<String>,
    pub feedback: Option<String>,
    pub min_reward: Option<String>,
    pub max_reward: Option<String>,
    pub organization_id: Option<String>,
    pub api_key_id: Option<String>,
    pub min_cost: Option<String>,
    pub max_cost: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DecisionListResponse {
    pub decisions: Vec<RoutingDecisionListItem>,
    /// Pass back as `cursor` for the next (older) page; `null` on the last
    /// page.
    pub next_cursor: Option<String>,
    pub limit: i64,
}

/// Normalise an optional query value: trimmed, empty means unset.
fn opt(v: &Option<String>) -> Option<&str> {
    v.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

fn parse_bool(name: &str, v: &Option<String>) -> Result<Option<bool>, ApiError> {
    match opt(v) {
        None | Some("any") => Ok(None),
        Some("true") | Some("1") | Some("yes") => Ok(Some(true)),
        Some("false") | Some("0") | Some("no") => Ok(Some(false)),
        Some(other) => Err(bad_request(format!(
            "`{name}` must be true or false, got `{other}`"
        ))),
    }
}

fn parse_f64(name: &str, v: &Option<String>) -> Result<Option<f64>, ApiError> {
    match opt(v) {
        None => Ok(None),
        Some(s) => s
            .parse::<f64>()
            .ok()
            .filter(|x| x.is_finite())
            .map(Some)
            .ok_or_else(|| bad_request(format!("`{name}` must be a number, got `{s}`"))),
    }
}

fn parse_uuid(name: &str, v: &Option<String>) -> Result<Option<Uuid>, ApiError> {
    match opt(v) {
        None => Ok(None),
        Some(s) => Uuid::parse_str(s)
            .map(Some)
            .map_err(|_| bad_request(format!("`{name}` must be a UUID, got `{s}`"))),
    }
}

fn parse_time(name: &str, v: &Option<String>) -> Result<Option<DateTime<Utc>>, ApiError> {
    match opt(v) {
        None => Ok(None),
        Some(s) => DateTime::parse_from_rfc3339(s)
            .map(|t| Some(t.with_timezone(&Utc)))
            .map_err(|_| bad_request(format!("`{name}` must be an RFC 3339 timestamp"))),
    }
}

fn parse_enum(
    name: &str,
    v: &Option<String>,
    allowed: &[&str],
) -> Result<Option<String>, ApiError> {
    match opt(v) {
        None | Some("any") => Ok(None),
        Some(s) if allowed.contains(&s) => Ok(Some(s.to_string())),
        Some(s) => Err(bad_request(format!(
            "`{name}` must be one of {}, got `{s}`",
            allowed.join(", ")
        ))),
    }
}

fn parse_text(name: &str, v: &Option<String>, max: usize) -> Result<Option<String>, ApiError> {
    match opt(v) {
        None => Ok(None),
        Some(s) if s.len() <= max => Ok(Some(s.to_string())),
        Some(_) => Err(bad_request(format!(
            "`{name}` is longer than {max} characters"
        ))),
    }
}

/// Lower time bound for a `period` shorthand; `None` for `all`.
fn period_start(
    period: Option<&str>,
    now: DateTime<Utc>,
) -> Result<Option<DateTime<Utc>>, ApiError> {
    let span = match period {
        None | Some("all") => return Ok(None),
        Some("1h") => Duration::hours(1),
        Some("24h") | Some("1d") => Duration::hours(24),
        Some("7d") => Duration::days(7),
        Some("30d") => Duration::days(30),
        Some("90d") => Duration::days(90),
        Some(other) => {
            return Err(bad_request(format!(
                "`period` must be one of 1h, 24h, 7d, 30d, 90d, all, got `{other}`"
            )))
        }
    };
    Ok(Some(now - span))
}

/// Cursor: `<created_at unix micros>_<decision id>`.
pub fn encode_cursor(created_at: DateTime<Utc>, id: Uuid) -> String {
    format!("{}_{}", created_at.timestamp_micros(), id)
}

pub fn decode_cursor(cursor: &str) -> Option<(DateTime<Utc>, Uuid)> {
    let (micros, id) = cursor.split_once('_')?;
    let micros: i64 = micros.parse().ok()?;
    let ts = Utc.timestamp_micros(micros).single()?;
    Some((ts, Uuid::parse_str(id).ok()?))
}

/// Validate the query into a repository filter and page size.
pub fn parse_list_query(
    q: &DecisionListQuery,
    now: DateTime<Utc>,
) -> Result<(RoutingDecisionFilter, i64), ApiError> {
    let from = match parse_time("from", &q.from)? {
        Some(t) => Some(t),
        None => period_start(opt(&q.period), now)?,
    };
    let to = parse_time("to", &q.to)?;
    if let (Some(a), Some(b)) = (from, to) {
        if a >= b {
            return Err(bad_request("`from` must be before `to`"));
        }
    }
    let synthetic = match opt(&q.synthetic) {
        None | Some("exclude") | Some("false") => SyntheticFilter::Exclude,
        Some("include") | Some("any") => SyntheticFilter::Include,
        Some("only") | Some("true") => SyntheticFilter::Only,
        Some(other) => {
            return Err(bad_request(format!(
                "`synthetic` must be exclude, include or only, got `{other}`"
            )))
        }
    };
    let min_reward = parse_f64("min_reward", &q.min_reward)?;
    let max_reward = parse_f64("max_reward", &q.max_reward)?;
    if let (Some(a), Some(b)) = (min_reward, max_reward) {
        if a > b {
            return Err(bad_request("`min_reward` must not exceed `max_reward`"));
        }
    }
    let min_cost_usd = parse_f64("min_cost", &q.min_cost)?;
    let max_cost_usd = parse_f64("max_cost", &q.max_cost)?;
    if let (Some(a), Some(b)) = (min_cost_usd, max_cost_usd) {
        if a > b {
            return Err(bad_request("`min_cost` must not exceed `max_cost`"));
        }
    }
    let before = match opt(&q.cursor) {
        None => None,
        Some(c) => Some(decode_cursor(c).ok_or_else(|| bad_request("`cursor` is malformed"))?),
    };
    let limit = match opt(&q.limit) {
        None => DEFAULT_LIMIT,
        Some(s) => s
            .parse::<i64>()
            .map_err(|_| bad_request(format!("`limit` must be an integer, got `{s}`")))?
            .clamp(1, MAX_LIMIT),
    };
    let filter = RoutingDecisionFilter {
        from,
        to,
        mode: parse_enum("mode", &q.mode, &MODES)?,
        tier: parse_enum("tier", &q.tier, &TIERS)?,
        classified_tier: parse_enum("classified_tier", &q.classified_tier, &TIERS)?,
        tier_changed: parse_bool("tier_changed", &q.tier_changed)?,
        selected_model: parse_text("model", &q.model, 100)?,
        shadow: parse_bool("shadow", &q.shadow)?,
        synthetic,
        escalated: parse_bool("escalated", &q.escalated)?,
        sticky: parse_bool("sticky", &q.sticky)?,
        status: parse_text("status", &q.status, 20)?,
        outcome: parse_enum("outcome", &q.outcome, &OUTCOMES)?,
        feedback: parse_enum("feedback", &q.feedback, &FEEDBACK)?,
        min_reward,
        max_reward,
        organization_id: parse_uuid("organization_id", &q.organization_id)?,
        api_key_id: parse_uuid("api_key_id", &q.api_key_id)?,
        min_cost_usd,
        max_cost_usd,
        before,
    };
    Ok((filter, limit))
}

/// `GET /admin/routing/decisions`
pub async fn list_routing_decisions(
    State(state): State<AppState>,
    Query(q): Query<DecisionListQuery>,
) -> Result<Json<DecisionListResponse>, ApiError> {
    let (filter, limit) = parse_list_query(&q, Utc::now())?;
    let pool = state.db_pool().ok_or_else(db_unavailable)?;
    // One extra row tells us whether another page exists.
    let mut decisions = aura_db::RoutingDecisionRepo::list(pool, &filter, limit + 1)
        .await
        .map_err(db_error("Failed to list routing decisions"))?;
    let next_cursor = if decisions.len() as i64 > limit {
        decisions.truncate(limit as usize);
        decisions.last().map(|d| encode_cursor(d.created_at, d.id))
    } else {
        None
    };
    Ok(Json(DecisionListResponse {
        decisions,
        next_cursor,
        limit,
    }))
}

/// One decision with its outcome. The stored decision's fields are
/// flattened so existing readers of the endpoint keep working.
#[derive(Debug, Serialize)]
pub struct RoutingDecisionDetail {
    #[serde(flatten)]
    pub decision: aura_db::RoutingDecision,
    pub outcome: Option<aura_db::RoutingDecisionOutcome>,
    /// Boundaries to draw the score against.
    pub boundaries_in_force: TierBoundaries,
    /// `recorded` (stored with the decision), `config` (the router's
    /// current boundaries; the row predates recording) or `default`.
    pub boundaries_source: &'static str,
}

/// Recorded boundaries when present and well-formed, else the router's
/// current ones, else the defaults.
fn resolve_boundaries(
    recorded: Option<&serde_json::Value>,
    current: Option<TierBoundaries>,
) -> (TierBoundaries, &'static str) {
    if let Some(b) = recorded
        .filter(|v| v.is_object())
        .and_then(|v| serde_json::from_value::<TierBoundaries>(v.clone()).ok())
    {
        return (b, "recorded");
    }
    match current {
        Some(b) => (b, "config"),
        None => (TierBoundaries::default(), "default"),
    }
}

/// `GET /admin/routing/decisions/{response_id}`: by gateway request id
/// (`aura_...`) or provider response id (`resp_...`).
pub async fn get_routing_decision(
    State(state): State<AppState>,
    Path(response_id): Path<String>,
) -> Result<Json<RoutingDecisionDetail>, ApiError> {
    let pool = state.db_pool().ok_or_else(db_unavailable)?;
    let err = db_error("Failed to fetch routing decision");
    let Some(decision) = aura_db::RoutingDecisionRepo::find_by_response_id(pool, &response_id)
        .await
        .map_err(&err)?
    else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "No routing decision for this response"})),
        ));
    };
    let outcome = aura_db::RoutingDecisionRepo::outcome(pool, &decision.response_id)
        .await
        .map_err(&err)?;
    let (boundaries_in_force, boundaries_source) = resolve_boundaries(
        decision.boundaries.as_ref(),
        state.auto_router().map(|r| r.config().boundaries),
    );
    Ok(Json(RoutingDecisionDetail {
        decision,
        outcome,
        boundaries_in_force,
        boundaries_source,
    }))
}

#[derive(Debug, Deserialize)]
pub struct TimelineQuery {
    /// `24h` (hourly buckets), `7d`, `30d` or `90d` (daily buckets).
    pub period: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RoutingTimelineResponse {
    pub period: String,
    /// `hour` or `day`.
    pub bucket: &'static str,
    pub points: Vec<aura_db::RoutingTimelinePoint>,
}

fn timeline_window(
    period: Option<&str>,
) -> Result<(&'static str, Duration, &'static str), ApiError> {
    match period {
        None | Some("24h") | Some("1d") => Ok(("24h", Duration::hours(24), "hour")),
        Some("7d") => Ok(("7d", Duration::days(7), "day")),
        Some("30d") => Ok(("30d", Duration::days(30), "day")),
        Some("90d") => Ok(("90d", Duration::days(90), "day")),
        Some(other) => Err(bad_request(format!(
            "`period` must be one of 24h, 7d, 30d, 90d, got `{other}`"
        ))),
    }
}

/// `GET /admin/stats/routing/auto/timeline`
pub async fn get_routing_timeline(
    State(state): State<AppState>,
    Query(q): Query<TimelineQuery>,
) -> Result<Json<RoutingTimelineResponse>, ApiError> {
    let (period, span, bucket) = timeline_window(opt(&q.period))?;
    let pool = state.db_pool().ok_or_else(db_unavailable)?;
    let points = aura_db::RoutingDecisionRepo::timeline(pool, Utc::now() - span, bucket)
        .await
        .map_err(db_error("Failed to fetch routing timeline"))?;
    Ok(Json(RoutingTimelineResponse {
        period: period.to_string(),
        bucket,
        points,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_core::Config;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    fn query(pairs: &[(&str, &str)]) -> DecisionListQuery {
        let qs = pairs
            .iter()
            .map(|(k, v)| format!("{k}={}", v.replace(' ', "%20")))
            .collect::<Vec<_>>()
            .join("&");
        let uri: axum::http::Uri = format!("/?{qs}").parse().expect("valid uri");
        Query::<DecisionListQuery>::try_from_uri(&uri)
            .expect("valid query string")
            .0
    }

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 1, 12, 0, 0).unwrap()
    }

    #[test]
    fn defaults_exclude_synthetic_with_no_time_bound() {
        let (f, limit) = parse_list_query(&DecisionListQuery::default(), now()).unwrap();
        assert_eq!(limit, DEFAULT_LIMIT);
        assert_eq!(f.synthetic, SyntheticFilter::Exclude);
        assert!(f.from.is_none() && f.to.is_none() && f.before.is_none());
        assert!(f.tier.is_none() && f.shadow.is_none() && f.escalated.is_none());
    }

    #[test]
    fn parses_every_filter() {
        let org = Uuid::new_v4();
        let key = Uuid::new_v4();
        let cursor = encode_cursor(now(), Uuid::nil());
        let q = query(&[
            ("period", "7d"),
            ("to", "2026-10-01T11:00:00Z"),
            ("mode", "cost"),
            ("tier", "complex"),
            ("classified_tier", "medium"),
            ("tier_changed", "true"),
            ("model", "gpt-4o-mini"),
            ("shadow", "false"),
            ("synthetic", "include"),
            ("escalated", "1"),
            ("sticky", "no"),
            ("status", "completed"),
            ("outcome", "retry"),
            ("feedback", "rejected"),
            ("min_reward", "-1"),
            ("max_reward", "0.5"),
            ("organization_id", &org.to_string()),
            ("api_key_id", &key.to_string()),
            ("min_cost", "0.001"),
            ("max_cost", "0.25"),
            ("cursor", &cursor),
            ("limit", "500"),
        ]);
        let (f, limit) = parse_list_query(&q, now()).unwrap();
        assert_eq!(limit, MAX_LIMIT, "limit is clamped");
        assert_eq!(f.from, Some(now() - Duration::days(7)));
        assert_eq!(
            f.to,
            Some(Utc.with_ymd_and_hms(2026, 10, 1, 11, 0, 0).unwrap())
        );
        assert_eq!(f.mode.as_deref(), Some("cost"));
        assert_eq!(f.tier.as_deref(), Some("complex"));
        assert_eq!(f.classified_tier.as_deref(), Some("medium"));
        assert_eq!(f.tier_changed, Some(true));
        assert_eq!(f.selected_model.as_deref(), Some("gpt-4o-mini"));
        assert_eq!(f.shadow, Some(false));
        assert_eq!(f.synthetic, SyntheticFilter::Include);
        assert_eq!(f.escalated, Some(true));
        assert_eq!(f.sticky, Some(false));
        assert_eq!(f.status.as_deref(), Some("completed"));
        assert_eq!(f.outcome.as_deref(), Some("retry"));
        assert_eq!(f.feedback.as_deref(), Some("rejected"));
        assert_eq!((f.min_reward, f.max_reward), (Some(-1.0), Some(0.5)));
        assert_eq!(f.organization_id, Some(org));
        assert_eq!(f.api_key_id, Some(key));
        assert_eq!((f.min_cost_usd, f.max_cost_usd), (Some(0.001), Some(0.25)));
        assert_eq!(f.before, Some((now(), Uuid::nil())));
    }

    #[test]
    fn explicit_from_wins_over_period_and_any_means_unset() {
        let q = query(&[
            ("period", "24h"),
            ("from", "2026-09-01T00:00:00Z"),
            ("tier", "any"),
            ("shadow", "any"),
            ("synthetic", "only"),
            ("model", "  "),
        ]);
        let (f, _) = parse_list_query(&q, now()).unwrap();
        assert_eq!(
            f.from,
            Some(Utc.with_ymd_and_hms(2026, 9, 1, 0, 0, 0).unwrap())
        );
        assert!(f.tier.is_none() && f.shadow.is_none() && f.selected_model.is_none());
        assert_eq!(f.synthetic, SyntheticFilter::Only);
    }

    #[test]
    fn rejects_bad_values_with_the_parameter_name() {
        let cases: &[(&[(&str, &str)], &str)] = &[
            (&[("tier", "huge")], "tier"),
            (&[("classified_tier", "x")], "classified_tier"),
            (&[("mode", "cheap")], "mode"),
            (&[("shadow", "maybe")], "shadow"),
            (&[("synthetic", "yes please")], "synthetic"),
            (&[("outcome", "great")], "outcome"),
            (&[("feedback", "meh")], "feedback"),
            (&[("min_cost", "abc")], "min_cost"),
            (&[("min_cost", "NaN")], "min_cost"),
            (&[("min_cost", "2"), ("max_cost", "1")], "min_cost"),
            (&[("min_reward", "1"), ("max_reward", "-1")], "min_reward"),
            (&[("organization_id", "acme")], "organization_id"),
            (&[("from", "yesterday")], "from"),
            (
                &[
                    ("from", "2026-10-02T00:00:00Z"),
                    ("to", "2026-10-01T00:00:00Z"),
                ],
                "from",
            ),
            (&[("period", "1y")], "period"),
            (&[("cursor", "nope")], "cursor"),
            (&[("limit", "ten")], "limit"),
        ];
        for (pairs, name) in cases {
            let (status, Json(body)) = parse_list_query(&query(pairs), now()).unwrap_err();
            assert_eq!(status, StatusCode::BAD_REQUEST, "{pairs:?}");
            let msg = body["error"].as_str().unwrap();
            assert!(msg.contains(name), "{pairs:?}: {msg}");
        }
    }

    #[test]
    fn cursor_round_trips() {
        let id = Uuid::new_v4();
        let ts = Utc.with_ymd_and_hms(2026, 10, 1, 12, 34, 56).unwrap()
            + Duration::microseconds(123_456);
        assert_eq!(decode_cursor(&encode_cursor(ts, id)), Some((ts, id)));
        assert_eq!(decode_cursor("123"), None);
        assert_eq!(decode_cursor("abc_def"), None);
        assert_eq!(decode_cursor(&format!("x_{id}")), None);
    }

    #[test]
    fn boundaries_prefer_recorded_then_config_then_default() {
        let config = TierBoundaries {
            simple_medium: 0.2,
            medium_complex: 0.4,
            complex_reasoning: 0.7,
        };
        let recorded = serde_json::json!({
            "simple_medium": 0.1, "medium_complex": 0.3, "complex_reasoning": 0.5
        });
        let (b, src) = resolve_boundaries(Some(&recorded), Some(config));
        assert_eq!((b.simple_medium, src), (0.1, "recorded"));
        let (b, src) = resolve_boundaries(None, Some(config));
        assert_eq!((b.simple_medium, src), (0.2, "config"));
        let (b, src) = resolve_boundaries(Some(&serde_json::Value::Null), None);
        assert_eq!((b, src), (TierBoundaries::default(), "default"));
    }

    #[test]
    fn timeline_picks_bucket_by_period() {
        assert_eq!(timeline_window(None).unwrap().2, "hour");
        assert_eq!(timeline_window(Some("7d")).unwrap().2, "day");
        assert_eq!(timeline_window(Some("90d")).unwrap().0, "90d");
        assert!(timeline_window(Some("all")).is_err());
    }

    async fn get(state: &AppState, uri: &str) -> (StatusCode, serde_json::Value) {
        let app = crate::routes::admin::router().with_state(state.clone());
        let req = Request::builder().uri(uri).body(Body::empty()).unwrap();
        let resp = app.oneshot(req).await.unwrap();
        let status = resp.status();
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, json)
    }

    #[tokio::test]
    async fn routes_validate_before_needing_a_database() {
        let state = AppState::new(Config::default(), None, None).await;
        let (status, json) = get(&state, "/admin/routing/decisions?tier=nope").await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{json}");
        let (status, _) = get(&state, "/admin/routing/decisions?tier=simple&limit=10").await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        let (status, _) = get(&state, "/admin/routing/decisions/aura_123").await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        let (status, _) = get(&state, "/admin/stats/routing/auto/timeline?period=7d").await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        let (status, _) = get(&state, "/admin/stats/routing/auto/timeline?period=1y").await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn list_requires_admin_auth() {
        // Fail-closed without AURA_ADMIN_KEY (and without a bearer token
        // when it is set); never reaches the handler either way.
        if std::env::var("AURA_ADMIN_NO_AUTH").is_ok() {
            return;
        }
        let state = AppState::new(Config::default(), None, None).await;
        let app = crate::routes::admin::router()
            .layer(axum::middleware::from_fn_with_state(
                state.clone(),
                crate::routes::auth_middleware,
            ))
            .with_state(state);
        let req = Request::builder()
            .uri("/admin/routing/decisions")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    /// End-to-end against Postgres. Runs only when `AURA_TEST_DATABASE_URL`
    /// points at a scratch database (migrations are applied to it).
    #[tokio::test]
    async fn list_filters_and_pages_against_postgres() {
        let Ok(url) = std::env::var("AURA_TEST_DATABASE_URL") else {
            return;
        };
        let pool = aura_db::create_pool(aura_db::PoolConfig::new(url))
            .await
            .expect("connect test database");
        aura_db::run_migrations(&pool).await.expect("migrate");

        // Rows scoped to a fresh org so the test ignores anything else in
        // the database.
        let org = Uuid::new_v4();
        let run = Uuid::new_v4().simple().to_string();
        let mk = |i: usize, tier: &str, shadow: bool, synthetic: bool, escalated: bool| {
            aura_db::NewRoutingDecision {
                response_id: format!("aura_test_{run}_{i}"),
                provider_response_id: Some(format!("resp_test_{run}_{i}")),
                organization_id: Some(org),
                api_key_id: None,
                conversation_id: None,
                requested_model: if shadow {
                    "gpt-4o".into()
                } else {
                    "auto".into()
                },
                mode: "balanced".into(),
                classifier: "heuristic@v1".into(),
                score: 0.1 * i as f64,
                raw_score: 0.1 * i as f64,
                classified_tier: "simple".into(),
                tier: tier.into(),
                selected_model: format!("model-{tier}"),
                selected_provider: Some("openai".into()),
                reason: "test".into(),
                shadow,
                features: serde_json::json!({}),
                signals: serde_json::json!({"code": 0.1}),
                hard_filters: if i == 0 {
                    vec!["sticky tool loop".into()]
                } else {
                    vec![]
                },
                candidates: serde_json::json!([
                    {"model": format!("model-{tier}"), "tier": tier, "eligible": true,
                     "predicted_cost_usd": 0.002},
                    {"model": "other", "tier": tier, "eligible": false}
                ]),
                requested_blended_per_million: if shadow { Some(10.0) } else { None },
                selected_blended_per_million: Some(1.0),
                decision_latency_us: 120,
                escalations: if escalated {
                    serde_json::json!([{"from_model": "a", "from_tier": "simple",
                        "to_model": "b", "to_tier": "medium", "error_code": "timeout"}])
                } else {
                    serde_json::json!([])
                },
                synthetic,
                boundaries: Some(serde_json::json!({
                    "simple_medium": 0.15, "medium_complex": 0.35, "complex_reasoning": 0.6
                })),
            }
        };
        let rows = [
            mk(0, "simple", false, false, false),
            mk(1, "medium", false, false, true),
            mk(2, "medium", true, false, false),
            mk(3, "complex", false, true, false),
            mk(4, "complex", false, false, false),
        ];
        for r in rows {
            aura_db::RoutingDecisionRepo::upsert(&pool, r)
                .await
                .unwrap();
        }
        // Outcome + cost for row 4.
        sqlx::query(
            "INSERT INTO request_logs (response_id, provider_name, model_id, status, cost_usd, latency_ms, input_tokens, output_tokens)
             VALUES ($1, 'openai', 'model-complex', 'completed', 0.0123, 900, 100, 50)",
        )
        .bind(format!("aura_test_{run}_4"))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO routing_outcomes (response_id, tier, selected_model, shadow, status, next_turn, reward, decided_at)
             VALUES ($1, 'complex', 'model-complex', FALSE, 'completed', 'retry', -0.5, NOW())",
        )
        .bind(format!("aura_test_{run}_4"))
        .execute(&pool)
        .await
        .unwrap();

        let state = AppState::new(Config::default(), Some(pool), None).await;
        let base = format!("/admin/routing/decisions?organization_id={org}");
        let ids = |json: &serde_json::Value| -> Vec<String> {
            json["decisions"]
                .as_array()
                .unwrap()
                .iter()
                .map(|d| {
                    d["response_id"]
                        .as_str()
                        .unwrap()
                        .rsplit('_')
                        .next()
                        .unwrap()
                        .to_string()
                })
                .collect()
        };

        // Default: synthetic row 3 excluded, newest first.
        let (status, json) = get(&state, &base).await;
        assert_eq!(status, StatusCode::OK, "{json}");
        assert_eq!(ids(&json), ["4", "2", "1", "0"]);
        assert!(json["next_cursor"].is_null());

        // Pagination: 2 per page, cursor continues without overlap.
        let (_, p1) = get(&state, &format!("{base}&limit=2")).await;
        assert_eq!(ids(&p1), ["4", "2"]);
        let cursor = p1["next_cursor"].as_str().expect("more pages");
        let (_, p2) = get(&state, &format!("{base}&limit=2&cursor={cursor}")).await;
        assert_eq!(ids(&p2), ["1", "0"]);
        assert!(p2["next_cursor"].is_null());

        let check = |q: &'static str, want: &'static [&'static str]| {
            let state = state.clone();
            let base = base.clone();
            async move {
                let (status, json) = get(&state, &format!("{base}&{q}")).await;
                assert_eq!(status, StatusCode::OK, "{q}: {json}");
                assert_eq!(ids(&json), want, "{q}");
                json
            }
        };
        check("synthetic=only", &["3"]).await;
        check("synthetic=include&tier=complex", &["4", "3"]).await;
        check("shadow=true", &["2"]).await;
        check("escalated=true", &["1"]).await;
        check("sticky=true", &["0"]).await;
        check("tier_changed=false", &["0"]).await;
        check("model=model-medium&shadow=false", &["1"]).await;
        check("outcome=retry", &["4"]).await;
        check("outcome=unscored", &["2", "1", "0"]).await;
        check("max_reward=0", &["4"]).await;
        check("min_cost=0.01&max_cost=0.02", &["4"]).await;
        check("status=pending", &["2", "1", "0"]).await;

        let json = check("outcome=retry", &["4"]).await;
        let row = &json["decisions"][0];
        assert_eq!(row["candidates_count"], 2);
        assert_eq!(row["eligible_count"], 1);
        assert_eq!(row["predicted_cost_usd"], 0.002);
        assert_eq!(row["cost_usd"], 0.0123);
        assert_eq!(row["reward"], -0.5);
        assert_eq!(row["status"], "completed");

        // Detail: flattened decision + outcome + recorded boundaries.
        let (status, json) = get(
            &state,
            &format!("/admin/routing/decisions/resp_test_{run}_4"),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{json}");
        assert_eq!(json["response_id"], format!("aura_test_{run}_4"));
        assert_eq!(json["outcome"]["next_turn"], "retry");
        assert_eq!(json["outcome"]["latency_ms"], 900);
        assert_eq!(json["boundaries_source"], "recorded");
        assert_eq!(json["boundaries_in_force"]["medium_complex"], 0.35);

        let (status, json) = get(&state, "/admin/stats/routing/auto/timeline?period=24h").await;
        assert_eq!(status, StatusCode::OK, "{json}");
        assert_eq!(json["bucket"], "hour");
        assert!(!json["points"].as_array().unwrap().is_empty());
    }
}
