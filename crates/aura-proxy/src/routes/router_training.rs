//! Per-request router training status for the admin trace view.
//!
//! The auto-router trainers read straight from the database:
//!
//! - `scripts/router/train.py` (tier classifier) reads labelled
//!   `routing_gold_pairs` rows (verdict or label_tier set; `holdout` rows
//!   are evaluation only) and non-shadow `routing_outcomes` whose reward
//!   is at least 0.5 in magnitude;
//! - `scripts/router/train_cost.py` (cost model) reads every
//!   `routing_decisions` row joined to a completed `request_logs` row
//!   with output tokens, synthetic ones included.
//!
//! This module answers "is this request in those data sets" for a page of
//! request logs. The gateway does not record which rows a given training
//! run consumed (trainers also take a `--days` window), so the answer is
//! "part of the router training data", not "used by the active model".

use std::collections::HashMap;

use serde::Serialize;
use sqlx::Row;

/// Router training status of one request.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RouterTraining {
    /// `training` (in at least one trainer's data), `holdout` (labelled but
    /// kept for evaluation) or `not_used`.
    pub status: &'static str,
    /// Trainer data sets the request is part of: `tier_gold` (live gold
    /// pair), `tier_outcome` (next-turn reward), `cost_model`.
    pub used_by: Vec<&'static str>,
    /// Decision was recorded as synthetic (routing lab or
    /// `x-aura-synthetic`): kept out of gold sampling and outcome rewards.
    pub synthetic: bool,
    /// Tier the auto router picked.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
    /// Gold pair split (`train` / `holdout`) when the request was sampled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gold_split: Option<String>,
    /// Tier label the gold pair contributes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gold_label: Option<String>,
    /// Outcome reward computed from the next turn.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reward: Option<f64>,
}

/// Raw joined row for one request id.
#[derive(Debug, Default, Clone)]
pub struct TrainingRow {
    pub synthetic: bool,
    pub tier: Option<String>,
    pub outcome_shadow: Option<bool>,
    pub reward: Option<f64>,
    pub gold_split: Option<String>,
    pub gold_verdict: Option<String>,
    pub gold_label_tier: Option<String>,
    pub gold_tier_a: Option<String>,
    pub gold_tier_b: Option<String>,
}

/// Classify a request with a routing decision. `completed_with_output` is
/// the cost-model condition on the request log.
pub fn classify(row: &TrainingRow, completed_with_output: bool) -> RouterTraining {
    let mut used_by = Vec::new();
    let mut holdout = false;

    // Same label rule as train.py: label_tier, else tier_a on a/tie and
    // tier_b on b. Unlabelled rows (judge failed) are skipped.
    let gold_label = row
        .gold_label_tier
        .clone()
        .or_else(|| match row.gold_verdict.as_deref() {
            Some("a") | Some("tie") => row.gold_tier_a.clone(),
            Some(_) => row.gold_tier_b.clone(),
            None => None,
        });
    if gold_label.is_some() {
        if row.gold_split.as_deref() == Some("holdout") {
            holdout = true;
        } else {
            used_by.push("tier_gold");
        }
    }
    if row.outcome_shadow == Some(false) && row.reward.is_some_and(|r| r.abs() >= 0.5) {
        used_by.push("tier_outcome");
    }
    if completed_with_output {
        used_by.push("cost_model");
    }

    let status = if used_by.iter().any(|u| u.starts_with("tier_")) {
        "training"
    } else if holdout {
        "holdout"
    } else if !used_by.is_empty() {
        "training"
    } else {
        "not_used"
    };

    RouterTraining {
        status,
        used_by,
        synthetic: row.synthetic,
        tier: row.tier.clone(),
        gold_split: row.gold_split.clone(),
        gold_label,
        reward: row.reward,
    }
}

/// Load training rows for a set of gateway request ids. Requests without
/// a routing decision are absent from the map (not auto-routed, so no
/// trainer reads them).
pub async fn fetch_training_rows(
    pool: &sqlx::PgPool,
    response_ids: &[String],
) -> Result<HashMap<String, TrainingRow>, sqlx::Error> {
    if response_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query(
        r#"
        SELECT
            d.response_id,
            d.synthetic,
            d.tier,
            o.shadow AS outcome_shadow,
            o.reward,
            g.split AS gold_split,
            g.verdict AS gold_verdict,
            g.label_tier AS gold_label_tier,
            g.tier_a AS gold_tier_a,
            g.tier_b AS gold_tier_b
        FROM (
            SELECT DISTINCT ON (response_id) response_id, synthetic, tier
            FROM routing_decisions
            WHERE response_id = ANY($1)
            ORDER BY response_id, created_at DESC
        ) d
        LEFT JOIN routing_outcomes o ON o.response_id = d.response_id
        LEFT JOIN LATERAL (
            SELECT gp.split, gp.verdict, gp.label_tier, gp.tier_a, gp.tier_b
            FROM routing_gold_pairs gp
            WHERE gp.response_id = d.response_id
            ORDER BY gp.created_at DESC
            LIMIT 1
        ) g ON TRUE
        "#,
    )
    .bind(response_ids)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .iter()
        .map(|row| {
            (
                row.get::<String, _>("response_id"),
                TrainingRow {
                    synthetic: row.try_get("synthetic").unwrap_or(false),
                    tier: row.try_get("tier").ok().flatten(),
                    outcome_shadow: row.try_get("outcome_shadow").ok().flatten(),
                    reward: row.try_get("reward").ok().flatten(),
                    gold_split: row.try_get("gold_split").ok().flatten(),
                    gold_verdict: row.try_get("gold_verdict").ok().flatten(),
                    gold_label_tier: row.try_get("gold_label_tier").ok().flatten(),
                    gold_tier_a: row.try_get("gold_tier_a").ok().flatten(),
                    gold_tier_b: row.try_get("gold_tier_b").ok().flatten(),
                },
            )
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthetic_lab_request_feeds_only_the_cost_model() {
        let row = TrainingRow {
            synthetic: true,
            tier: Some("simple".into()),
            ..Default::default()
        };
        let t = classify(&row, true);
        assert_eq!(t.status, "training");
        assert_eq!(t.used_by, vec!["cost_model"]);
        assert!(t.synthetic);
    }

    #[test]
    fn failed_request_without_labels_is_not_used() {
        let t = classify(&TrainingRow::default(), false);
        assert_eq!(t.status, "not_used");
        assert!(t.used_by.is_empty());
    }

    #[test]
    fn gold_pair_label_follows_verdict() {
        let row = TrainingRow {
            gold_split: Some("train".into()),
            gold_verdict: Some("tie".into()),
            gold_tier_a: Some("simple".into()),
            gold_tier_b: Some("complex".into()),
            ..Default::default()
        };
        let t = classify(&row, true);
        assert_eq!(t.used_by, vec!["tier_gold", "cost_model"]);
        assert_eq!(t.gold_label.as_deref(), Some("simple"));

        let b = classify(
            &TrainingRow {
                gold_verdict: Some("b".into()),
                ..row
            },
            false,
        );
        assert_eq!(b.gold_label.as_deref(), Some("complex"));
    }

    #[test]
    fn unjudged_gold_pair_is_skipped() {
        let row = TrainingRow {
            gold_split: Some("train".into()),
            gold_tier_a: Some("simple".into()),
            ..Default::default()
        };
        assert_eq!(classify(&row, false).status, "not_used");
    }

    #[test]
    fn holdout_gold_pair_is_evaluation_only() {
        let row = TrainingRow {
            gold_split: Some("holdout".into()),
            gold_label_tier: Some("medium".into()),
            ..Default::default()
        };
        let t = classify(&row, false);
        assert_eq!(t.status, "holdout");
        assert!(t.used_by.is_empty());
    }

    #[test]
    fn outcome_needs_live_decision_and_strong_reward() {
        let strong = TrainingRow {
            outcome_shadow: Some(false),
            reward: Some(-0.8),
            ..Default::default()
        };
        assert_eq!(classify(&strong, false).used_by, vec!["tier_outcome"]);

        let weak = TrainingRow {
            reward: Some(0.2),
            ..strong.clone()
        };
        assert!(classify(&weak, false).used_by.is_empty());

        let shadow = TrainingRow {
            outcome_shadow: Some(true),
            ..strong
        };
        assert!(classify(&shadow, false).used_by.is_empty());
    }
}
