//! Admin endpoints backing `scripts/router/synth.py`: a privacy-safe
//! feature profile of real traffic to calibrate generated requests, the
//! gateway's own judge exposed for ladder labelling, and batch ingestion of
//! synthetic gold rows.
//!
//! Synthetic requests themselves go through `/v1/responses` like any other
//! traffic, marked with the `x-aura-synthetic` header so their decisions
//! are recorded but excluded from stats, rewards, arm statistics and live
//! gold sampling (see [`crate::routes::auto_routing::SYNTHETIC_HEADER`]).

use aura_core::router::auto::{featurize, RequestFeatures, FEATURE_NAMES};
use aura_db::{GoldProvenance, NewRoutingGoldPair, RoutingDecisionRepo, RoutingGoldPairRepo};
use aura_types::Tier;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::routes::routing_gold::{judge_pair, JudgeOutcome};
use crate::AppState;

type ApiResult<T> = Result<Json<T>, (StatusCode, Json<serde_json::Value>)>;

fn err(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<serde_json::Value>) {
    (status, Json(serde_json::json!({"error": msg.into()})))
}

fn db_unavailable() -> (StatusCode, Json<serde_json::Value>) {
    err(
        StatusCode::SERVICE_UNAVAILABLE,
        "Database not configured (DATABASE_URL)",
    )
}

// ---------------------------------------------------------------------------
// Feature profile
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct FeatureProfileQuery {
    /// Trailing window in days (default 30).
    pub days: Option<i32>,
    /// Newest decisions to sample (default 20 000, max 100 000).
    pub limit: Option<i64>,
}

/// Quantiles of one feature.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FeatureQuantiles {
    pub p10: f64,
    pub p25: f64,
    pub p50: f64,
    pub p75: f64,
    pub p90: f64,
    pub mean: f64,
}

/// Distribution of the feature vector and request shapes for one tier (or
/// all tiers).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TierProfile {
    pub rows: usize,
    /// Per feature (in `FEATURE_NAMES` order) quantiles of the *featurized*
    /// value, i.e. what the classifier sees.
    pub features: BTreeMap<String, FeatureQuantiles>,
    /// Share of rows with each shape trait, in `[0, 1]`.
    pub shapes: BTreeMap<String, f64>,
}

/// `GET /admin/routing/feature-profile` response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureProfile {
    pub days: i32,
    pub rows: usize,
    pub feature_names: Vec<String>,
    /// Share of rows per tier.
    pub tier_shares: BTreeMap<String, f64>,
    pub overall: TierProfile,
    pub per_tier: BTreeMap<String, TierProfile>,
}

fn quantile(sorted: &[f64], q: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let pos = q * (sorted.len() - 1) as f64;
    let lo = pos.floor() as usize;
    let hi = pos.ceil() as usize;
    if lo == hi {
        sorted[lo]
    } else {
        let w = pos - lo as f64;
        sorted[lo] * (1.0 - w) + sorted[hi] * w
    }
}

fn shape_traits(f: &RequestFeatures) -> Vec<(&'static str, bool)> {
    vec![
        ("continuation", f.is_continuation),
        ("tool_loop_turn", f.is_tool_loop_turn),
        ("tools_declared", f.tool_count > 0),
        ("tool_required", f.tool_required),
        ("images", f.has_images),
        ("multi_turn", f.user_messages > 1),
        ("long_input", f.est_input_tokens >= 2_000),
        ("very_long_input", f.est_input_tokens >= 10_000),
        ("non_ascii", f.non_ascii_ratio > 0.2),
        ("explicit_intent", f.explicit_intent.is_some()),
        ("max_output_set", f.max_output_tokens.is_some()),
    ]
}

fn profile_rows(rows: &[&RequestFeatures]) -> TierProfile {
    let mut out = TierProfile {
        rows: rows.len(),
        ..Default::default()
    };
    if rows.is_empty() {
        return out;
    }
    let vectors: Vec<Vec<f64>> = rows.iter().map(|f| featurize(f)).collect();
    for (j, name) in FEATURE_NAMES.iter().enumerate() {
        let mut col: Vec<f64> = vectors.iter().map(|v| v[j]).collect();
        col.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let mean = col.iter().sum::<f64>() / col.len() as f64;
        out.features.insert(
            name.to_string(),
            FeatureQuantiles {
                p10: quantile(&col, 0.10),
                p25: quantile(&col, 0.25),
                p50: quantile(&col, 0.50),
                p75: quantile(&col, 0.75),
                p90: quantile(&col, 0.90),
                mean,
            },
        );
    }
    let n = rows.len() as f64;
    let mut counts: BTreeMap<&'static str, usize> = BTreeMap::new();
    for f in rows {
        for (name, hit) in shape_traits(f) {
            if hit {
                *counts.entry(name).or_default() += 1;
            }
        }
    }
    for (name, _) in shape_traits(rows[0]) {
        let c = counts.get(name).copied().unwrap_or(0);
        out.shapes.insert(name.to_string(), c as f64 / n);
    }
    out
}

/// Build the profile from `(tier, features)` rows. Pure, for tests.
pub fn build_feature_profile(days: i32, rows: &[(String, RequestFeatures)]) -> FeatureProfile {
    let all: Vec<&RequestFeatures> = rows.iter().map(|(_, f)| f).collect();
    let mut per_tier: BTreeMap<String, TierProfile> = BTreeMap::new();
    let mut tier_shares = BTreeMap::new();
    for tier in [Tier::Simple, Tier::Medium, Tier::Complex, Tier::Reasoning] {
        let subset: Vec<&RequestFeatures> = rows
            .iter()
            .filter(|(t, _)| t == tier.as_str())
            .map(|(_, f)| f)
            .collect();
        if rows.is_empty() {
            tier_shares.insert(tier.as_str().to_string(), 0.0);
        } else {
            tier_shares.insert(
                tier.as_str().to_string(),
                subset.len() as f64 / rows.len() as f64,
            );
        }
        per_tier.insert(tier.as_str().to_string(), profile_rows(&subset));
    }
    FeatureProfile {
        days,
        rows: rows.len(),
        feature_names: FEATURE_NAMES.iter().map(|s| s.to_string()).collect(),
        tier_shares,
        overall: profile_rows(&all),
        per_tier,
    }
}

/// Numeric quantiles of the feature vector and request-shape shares of
/// recent live decisions, per tier. Contains no prompt text; safe to export
/// from production for `synth.py --profile`.
pub async fn get_feature_profile(
    State(state): State<AppState>,
    Query(q): Query<FeatureProfileQuery>,
) -> ApiResult<FeatureProfile> {
    let Some(pool) = state.db_pool() else {
        return Err(db_unavailable());
    };
    let days = q.days.unwrap_or(30).clamp(1, 365);
    let limit = q.limit.unwrap_or(20_000).clamp(100, 100_000);
    let sample = RoutingDecisionRepo::feature_sample(pool, days, limit)
        .await
        .map_err(|e| {
            tracing::error!("Failed to sample routing decisions: {}", e);
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            )
        })?;
    let rows: Vec<(String, RequestFeatures)> = sample
        .into_iter()
        .filter_map(|(tier, features)| {
            serde_json::from_value::<RequestFeatures>(features)
                .ok()
                .map(|f| (tier, f))
        })
        .collect();
    Ok(Json(build_feature_profile(days, &rows)))
}

// ---------------------------------------------------------------------------
// Judge
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct JudgeRequest {
    /// The user's request (last user message, or a description of the
    /// expected tool call for tool-loop rows).
    pub user_text: String,
    pub answer_a: String,
    pub answer_b: String,
    /// Overrides `routing.auto.gold_judge_model`.
    #[serde(default)]
    pub judge_model: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct JudgeResponse {
    pub judge_model: String,
    #[serde(flatten)]
    pub outcome: JudgeOutcome,
}

/// Grade two answers to one request with the gateway's gold judge, the
/// same prompt and parser live gold sampling uses.
pub async fn judge_answers(
    State(state): State<AppState>,
    Json(req): Json<JudgeRequest>,
) -> ApiResult<JudgeResponse> {
    let Some(router) = state.auto_router() else {
        return Err(err(StatusCode::NOT_FOUND, "auto routing is not configured"));
    };
    let cfg = router.config();
    let judge_model = req
        .judge_model
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| cfg.gold_judge_model.clone());
    if req.user_text.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "user_text must not be empty"));
    }
    let outcome = judge_pair(
        &state,
        &judge_model,
        &req.user_text,
        &req.answer_a,
        &req.answer_b,
        cfg.gold_max_text_chars,
    )
    .await;
    Ok(Json(JudgeResponse {
        judge_model,
        outcome,
    }))
}

// ---------------------------------------------------------------------------
// Synthetic gold ingest
// ---------------------------------------------------------------------------

/// One synthetic gold row as produced by `synth.py label`.
#[derive(Debug, Clone, Deserialize)]
pub struct SyntheticGoldRow {
    /// SHA-256 of the prompt text; the row's identity.
    pub prompt_hash: String,
    /// `RequestFeatures` JSON, as returned by `POST /admin/routing/score`.
    pub features: serde_json::Value,
    #[serde(default)]
    pub user_text: Option<String>,
    /// Level the generator was asked for.
    pub intended_tier: String,
    /// Ladder result: lowest tier that tied the reference.
    pub label_tier: String,
    #[serde(default)]
    pub family: Option<String>,
    #[serde(default)]
    pub shape: Option<String>,
    /// `train` (default) or `holdout`.
    #[serde(default)]
    pub split: Option<String>,
    /// Sample weight (default 1.0; the trainer scales synthetic rows again).
    #[serde(default)]
    pub weight: Option<f64>,
    #[serde(default)]
    pub generator_model: Option<String>,
    /// Per-tier ladder results, free-form.
    #[serde(default)]
    pub ladder: Option<serde_json::Value>,
    /// Tier the heuristic router assigned (from the score endpoint).
    #[serde(default)]
    pub decided_tier: Option<String>,
    #[serde(default)]
    pub heuristic_score: Option<f64>,
    /// Best cheap answer (the labelled tier) and the reference answer, so
    /// the row also reads as a classic pair.
    pub tier_a: String,
    pub model_a: String,
    #[serde(default)]
    pub text_a: Option<String>,
    #[serde(default)]
    pub cost_a: Option<f64>,
    #[serde(default)]
    pub latency_a_ms: Option<i32>,
    pub tier_b: String,
    pub model_b: String,
    #[serde(default)]
    pub text_b: Option<String>,
    #[serde(default)]
    pub cost_b: Option<f64>,
    #[serde(default)]
    pub latency_b_ms: Option<i32>,
    pub judge_model: String,
    /// `a`, `b` or `tie`.
    #[serde(default)]
    pub verdict: Option<String>,
    #[serde(default)]
    pub judge_confidence: Option<f64>,
    #[serde(default)]
    pub judge_rationale: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SyntheticGoldBatch {
    pub batch_id: String,
    pub rows: Vec<SyntheticGoldRow>,
}

#[derive(Debug, Serialize)]
pub struct RejectedRow {
    pub index: usize,
    pub prompt_hash: String,
    pub error: String,
}

#[derive(Debug, Serialize)]
pub struct SyntheticGoldIngestResponse {
    pub batch_id: String,
    pub inserted: usize,
    pub updated: usize,
    pub rejected: Vec<RejectedRow>,
}

fn validate_tier(name: &str, value: &str) -> Result<String, String> {
    Tier::parse(value)
        .map(|t| t.as_str().to_string())
        .ok_or_else(|| format!("{name}: unknown tier `{value}`"))
}

/// Convert and validate one row. Pure, for tests.
pub fn synthetic_row_to_new(
    batch_id: &str,
    max_chars: usize,
    row: SyntheticGoldRow,
) -> Result<NewRoutingGoldPair, String> {
    if row.prompt_hash.len() < 16 || !row.prompt_hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("prompt_hash must be a hex digest".into());
    }
    let features: RequestFeatures =
        serde_json::from_value(row.features.clone()).map_err(|e| format!("features: {e}"))?;
    let intended_tier = validate_tier("intended_tier", &row.intended_tier)?;
    let label_tier = validate_tier("label_tier", &row.label_tier)?;
    let tier_a = validate_tier("tier_a", &row.tier_a)?;
    let tier_b = validate_tier("tier_b", &row.tier_b)?;
    let decided_tier = match row.decided_tier.as_deref() {
        Some(t) => validate_tier("decided_tier", t)?,
        None => label_tier.clone(),
    };
    let split = row.split.unwrap_or_else(|| "train".into());
    if !matches!(split.as_str(), "train" | "holdout") {
        return Err(format!("split: expected train or holdout, got `{split}`"));
    }
    let weight = row.weight.unwrap_or(1.0);
    if !(weight.is_finite() && weight >= 0.0) {
        return Err("weight must be a non-negative number".into());
    }
    if let Some(v) = row.verdict.as_deref() {
        if !matches!(v, "a" | "b" | "tie") {
            return Err(format!("verdict: expected a, b or tie, got `{v}`"));
        }
    }
    let clip = |s: Option<String>| s.map(|t| t.chars().take(max_chars).collect::<String>());
    let short_hash: String = row.prompt_hash.chars().take(16).collect();
    Ok(NewRoutingGoldPair {
        response_id: format!("synthetic:{batch_id}:{short_hash}"),
        organization_id: None,
        decided_tier,
        heuristic_score: row.heuristic_score.unwrap_or(0.0),
        features: serde_json::to_value(&features).unwrap_or(serde_json::json!({})),
        prompt_hash: row.prompt_hash,
        user_text: clip(row.user_text),
        tier_a,
        model_a: row.model_a,
        text_a: clip(row.text_a),
        cost_a: row.cost_a,
        latency_a_ms: row.latency_a_ms,
        tier_b,
        model_b: row.model_b,
        text_b: clip(row.text_b),
        cost_b: row.cost_b,
        latency_b_ms: row.latency_b_ms,
        judge_model: row.judge_model,
        verdict: row.verdict,
        judge_confidence: row.judge_confidence,
        judge_rationale: row.judge_rationale,
        error: row.error,
        provenance: GoldProvenance {
            source: "synthetic".into(),
            batch_id: Some(batch_id.to_string()),
            split,
            intended_tier: Some(intended_tier),
            label_tier: Some(label_tier),
            family: row.family,
            shape: row.shape,
            weight,
            generator_model: row.generator_model,
            ladder: row.ladder,
        },
    })
}

/// Store a batch of synthetic gold rows (upsert by prompt hash). Rows that
/// fail validation are reported, not stored; the rest still land.
pub async fn ingest_synthetic_gold(
    State(state): State<AppState>,
    Json(batch): Json<SyntheticGoldBatch>,
) -> ApiResult<SyntheticGoldIngestResponse> {
    let Some(pool) = state.db_pool() else {
        return Err(db_unavailable());
    };
    if batch.batch_id.trim().is_empty() || batch.batch_id.len() > 100 {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "batch_id must be 1 to 100 characters",
        ));
    }
    if batch.rows.is_empty() || batch.rows.len() > 2_000 {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "rows must contain 1 to 2000 entries per request",
        ));
    }
    let max_chars = state
        .auto_router()
        .map(|r| r.config().gold_max_text_chars)
        .unwrap_or(4_000);
    let mut inserted = 0;
    let mut updated = 0;
    let mut rejected = Vec::new();
    for (index, row) in batch.rows.into_iter().enumerate() {
        let prompt_hash = row.prompt_hash.clone();
        match synthetic_row_to_new(&batch.batch_id, max_chars, row) {
            Ok(new) => match RoutingGoldPairRepo::upsert_synthetic(pool, new).await {
                Ok(true) => inserted += 1,
                Ok(false) => updated += 1,
                Err(e) => rejected.push(RejectedRow {
                    index,
                    prompt_hash,
                    error: format!("database error: {e}"),
                }),
            },
            Err(e) => rejected.push(RejectedRow {
                index,
                prompt_hash,
                error: e,
            }),
        }
    }
    tracing::info!(
        batch_id = %batch.batch_id,
        inserted,
        updated,
        rejected = rejected.len(),
        "synthetic gold batch ingested"
    );
    Ok(Json(SyntheticGoldIngestResponse {
        batch_id: batch.batch_id,
        inserted,
        updated,
        rejected,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feats(tokens: u32, tools: u32, cont: bool) -> RequestFeatures {
        RequestFeatures {
            est_input_tokens: tokens,
            est_last_user_tokens: tokens,
            tool_count: tools,
            is_continuation: cont,
            user_messages: 1,
            ..Default::default()
        }
    }

    #[test]
    fn quantiles_interpolate() {
        let v = [1.0, 2.0, 3.0, 4.0, 5.0];
        assert_eq!(quantile(&v, 0.0), 1.0);
        assert_eq!(quantile(&v, 0.5), 3.0);
        assert_eq!(quantile(&v, 1.0), 5.0);
        assert!((quantile(&v, 0.25) - 2.0).abs() < 1e-9);
        assert_eq!(quantile(&[], 0.5), 0.0);
    }

    #[test]
    fn profile_reports_shares_and_feature_quantiles() {
        let rows = vec![
            ("simple".to_string(), feats(10, 0, false)),
            ("simple".to_string(), feats(20, 0, false)),
            ("medium".to_string(), feats(300, 2, true)),
            ("complex".to_string(), feats(5000, 3, false)),
        ];
        let p = build_feature_profile(30, &rows);
        assert_eq!(p.rows, 4);
        assert_eq!(p.feature_names.len(), FEATURE_NAMES.len());
        assert!((p.tier_shares["simple"] - 0.5).abs() < 1e-9);
        assert!((p.tier_shares["reasoning"]).abs() < 1e-9);
        assert_eq!(p.per_tier["simple"].rows, 2);
        assert_eq!(p.per_tier["reasoning"].rows, 0);
        assert!((p.overall.shapes["tools_declared"] - 0.5).abs() < 1e-9);
        assert!((p.overall.shapes["continuation"] - 0.25).abs() < 1e-9);
        assert!((p.overall.shapes["long_input"] - 0.25).abs() < 1e-9);
        // log_input_tokens is the first feature; the complex row has the
        // largest value so p90 is above the simple tier's p90.
        let overall = &p.overall.features["log_input_tokens"];
        let simple = &p.per_tier["simple"].features["log_input_tokens"];
        assert!(overall.p90 > simple.p90);
        assert!(overall.p10 <= overall.p50 && overall.p50 <= overall.p90);
    }

    fn row() -> SyntheticGoldRow {
        SyntheticGoldRow {
            prompt_hash: "ab".repeat(32),
            features: serde_json::to_value(feats(120, 0, false)).unwrap(),
            user_text: Some("x".repeat(10_000)),
            intended_tier: "medium".into(),
            label_tier: "simple".into(),
            family: Some("qa".into()),
            shape: Some("single_turn".into()),
            split: None,
            weight: None,
            generator_model: Some("gpt-5.6-luna".into()),
            ladder: Some(serde_json::json!([{"tier": "simple", "verdict": "tie"}])),
            decided_tier: None,
            heuristic_score: Some(0.2),
            tier_a: "simple".into(),
            model_a: "gpt-5.4-nano".into(),
            text_a: Some("a".into()),
            cost_a: Some(0.0001),
            latency_a_ms: Some(300),
            tier_b: "reasoning".into(),
            model_b: "claude-opus-4-7".into(),
            text_b: Some("b".into()),
            cost_b: Some(0.01),
            latency_b_ms: Some(3000),
            judge_model: "claude-sonnet-4-6".into(),
            verdict: Some("tie".into()),
            judge_confidence: Some(0.8),
            judge_rationale: None,
            error: None,
        }
    }

    #[test]
    fn synthetic_rows_validate_and_convert() {
        let new = synthetic_row_to_new("batch-1", 4_000, row()).unwrap();
        assert_eq!(new.provenance.source, "synthetic");
        assert_eq!(new.provenance.split, "train");
        assert_eq!(new.provenance.batch_id.as_deref(), Some("batch-1"));
        assert_eq!(new.provenance.label_tier.as_deref(), Some("simple"));
        assert_eq!(new.provenance.intended_tier.as_deref(), Some("medium"));
        assert_eq!(new.decided_tier, "simple");
        assert_eq!(new.user_text.as_ref().unwrap().len(), 4_000);
        assert!(new.response_id.starts_with("synthetic:batch-1:abababab"));

        let mut bad = row();
        bad.label_tier = "huge".into();
        assert!(synthetic_row_to_new("b", 4_000, bad)
            .unwrap_err()
            .contains("label_tier"));
        let mut bad = row();
        bad.split = Some("test".into());
        assert!(synthetic_row_to_new("b", 4_000, bad)
            .unwrap_err()
            .contains("split"));
        let mut bad = row();
        bad.prompt_hash = "zz".into();
        assert!(synthetic_row_to_new("b", 4_000, bad)
            .unwrap_err()
            .contains("prompt_hash"));
        let mut bad = row();
        bad.features = serde_json::json!({"est_input_tokens": "many"});
        assert!(synthetic_row_to_new("b", 4_000, bad)
            .unwrap_err()
            .contains("features"));
        let mut bad = row();
        bad.verdict = Some("c".into());
        assert!(synthetic_row_to_new("b", 4_000, bad)
            .unwrap_err()
            .contains("verdict"));
    }
}
