//! Outcome rollup for auto-router decisions.
//!
//! Periodically (and on `POST /admin/routing/rollup`) scores decisions
//! that are old enough for the user's next turn to have arrived, writes
//! `routing_outcomes`, recomputes `routing_arm_stats`, and refreshes the
//! in-memory arm statistics the Thompson strategy reads.

use aura_core::router::auto::{evaluate, ArmStats, NextTurn, NextTurnInputs, OutcomeInputs};
use aura_db::{NewRoutingOutcome, PendingRoutingOutcome, RoutingOutcomeRepo};
use aura_types::{ContentPart, InputContent, InputItem, Role, Tier};
use serde::Serialize;
use std::collections::HashMap;
use std::time::Duration;
use tracing::{debug, info, warn};

use crate::AppState;

/// Rows scored per database round trip.
const BATCH: i64 = 500;
/// Upper bound on batches per run so a huge backlog can't starve the loop.
const MAX_BATCHES: usize = 20;

/// Summary of one rollup run.
#[derive(Debug, Clone, Serialize, Default)]
pub struct RollupReport {
    /// Decisions scored in this run.
    pub scored: usize,
    /// Counts per next-turn signal.
    pub by_next_turn: HashMap<String, usize>,
    /// Arm rows after recomputation.
    pub arms: usize,
    /// Wall time in milliseconds.
    pub elapsed_ms: u64,
}

fn text_of(content: &InputContent) -> String {
    match content {
        InputContent::Text(t) => t.clone(),
        InputContent::Parts(parts) => parts
            .iter()
            .filter_map(|p| match p {
                ContentPart::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

/// Parse stored `input_items` JSON into items; malformed rows yield none.
fn items_of(value: Option<&serde_json::Value>) -> Vec<InputItem> {
    value
        .cloned()
        .and_then(|v| serde_json::from_value::<Vec<InputItem>>(v).ok())
        .unwrap_or_default()
}

/// Last user message text in a turn's input.
fn last_user_text(items: &[InputItem]) -> Option<String> {
    items.iter().rev().find_map(|item| match item {
        InputItem::Message { role, content } if *role == Role::User => Some(text_of(content)),
        _ => None,
    })
}

/// Build the scorer inputs for one pending row.
fn inputs_for(state: &AppState, row: &PendingRoutingOutcome) -> OutcomeInputs {
    let tier = Tier::parse(&row.tier).unwrap_or(Tier::Medium);
    let current = items_of(row.input_items.as_ref());
    let next = row.next_model.as_ref().map(|next_model| {
        let next_items = items_of(row.next_input_items.as_ref());
        let user_text = last_user_text(&next_items);
        let has_outputs = next_items
            .iter()
            .any(|i| matches!(i, InputItem::FunctionCallOutput { .. }));
        NextTurnInputs {
            user_text: user_text.clone(),
            model: next_model.clone(),
            model_tier: state
                .auto_router()
                .and_then(|r| r.catalog().tier_of(next_model)),
            is_tool_continuation: has_outputs && user_text.is_none(),
        }
    });
    OutcomeInputs {
        status: row.status.clone(),
        feedback: row.feedback.clone(),
        tool_calls: row.tool_calls_count,
        user_text: last_user_text(&current),
        tier,
        selected_model: row.selected_model.clone(),
        next,
    }
}

/// Score pending decisions, recompute arm statistics and refresh the
/// in-memory copy. Safe to call concurrently with request handling.
pub async fn run_rollup(state: &AppState) -> Result<RollupReport, String> {
    let started = std::time::Instant::now();
    let pool = state.db_pool().ok_or("database not configured")?;
    let cfg = state
        .auto_router()
        .map(|r| r.config().clone())
        .ok_or("auto routing not configured")?;

    let mut report = RollupReport::default();
    for _ in 0..MAX_BATCHES {
        let pending = RoutingOutcomeRepo::pending(
            pool,
            cfg.outcome_grace_secs as i64,
            cfg.arm_stats_window_days as i32,
            BATCH,
        )
        .await
        .map_err(|e| e.to_string())?;
        let n = pending.len();
        for row in pending {
            let inputs = inputs_for(state, &row);
            let outcome = evaluate(&inputs);
            *report
                .by_next_turn
                .entry(outcome.next_turn.as_str().to_string())
                .or_insert(0) += 1;
            let new = NewRoutingOutcome {
                response_id: row.response_id.clone(),
                tier: row.tier.clone(),
                selected_model: row.selected_model.clone(),
                shadow: row.shadow,
                status: row.status.clone(),
                feedback: row.feedback.clone(),
                next_turn: outcome.next_turn.as_str().to_string(),
                next_model: if outcome.next_turn == NextTurn::None {
                    None
                } else {
                    row.next_model.clone()
                },
                reward: outcome.reward,
                decided_at: row.created_at,
            };
            if let Err(e) = RoutingOutcomeRepo::upsert(pool, new).await {
                warn!(error = %e, response_id = %row.response_id, "routing rollup: upsert failed");
                continue;
            }
            report.scored += 1;
        }
        if (n as i64) < BATCH {
            break;
        }
    }

    let arms = RoutingOutcomeRepo::recompute_arm_stats(pool, cfg.arm_stats_window_days as i32)
        .await
        .map_err(|e| e.to_string())?;
    report.arms = arms.len();
    state
        .replace_arm_stats(
            arms.into_iter()
                .map(|a| {
                    (
                        (a.tier, a.model),
                        ArmStats {
                            alpha: a.alpha,
                            beta: a.beta,
                        },
                    )
                })
                .collect(),
        )
        .await;

    report.elapsed_ms = started.elapsed().as_millis() as u64;
    info!(
        scored = report.scored,
        arms = report.arms,
        by_next_turn = ?report.by_next_turn,
        elapsed_ms = report.elapsed_ms,
        "routing rollup complete"
    );
    Ok(report)
}

/// Load arm statistics from the database without scoring anything.
pub async fn load_arm_stats(state: &AppState) {
    let Some(pool) = state.db_pool() else {
        return;
    };
    match RoutingOutcomeRepo::load_arm_stats(pool).await {
        Ok(arms) => {
            let n = arms.len();
            state
                .replace_arm_stats(
                    arms.into_iter()
                        .map(|a| {
                            (
                                (a.tier, a.model),
                                ArmStats {
                                    alpha: a.alpha,
                                    beta: a.beta,
                                },
                            )
                        })
                        .collect(),
                )
                .await;
            debug!(arms = n, "routing arm statistics loaded");
        }
        Err(e) => warn!(error = %e, "failed to load routing arm statistics"),
    }
}

/// Spawn the periodic rollup when configured (database present, router
/// configured, interval > 0).
pub fn spawn_rollup_loop(state: AppState) {
    let Some(interval_secs) = state
        .auto_router()
        .map(|r| r.config().outcome_rollup_interval_secs)
        .filter(|s| *s > 0)
    else {
        return;
    };
    if state.db_pool().is_none() {
        return;
    }
    tokio::spawn(async move {
        load_arm_stats(&state).await;
        let mut ticker = tokio::time::interval(Duration::from_secs(interval_secs));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            if let Err(e) = run_rollup(&state).await {
                warn!(error = %e, "routing rollup failed");
            }
        }
    });
    info!(interval_secs, "routing outcome rollup scheduled");
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_core::router::auto::{AutoRoutingConfig, TierModels};
    use aura_core::Config;
    use chrono::Utc;

    async fn state() -> AppState {
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
        AppState::new(config, None, None).await
    }

    fn row(
        next_model: Option<&str>,
        next_items: Option<serde_json::Value>,
    ) -> PendingRoutingOutcome {
        PendingRoutingOutcome {
            response_id: "aura_1".into(),
            provider_response_id: Some("resp_1".into()),
            conversation_id: None,
            tier: "medium".into(),
            selected_model: "llama3.1".into(),
            shadow: false,
            created_at: Utc::now(),
            status: Some("completed".into()),
            feedback: None,
            tool_calls_count: 0,
            input_items: Some(serde_json::json!([
                {"type": "message", "role": "user", "content": "Write a CSV parser"}
            ])),
            next_input_items: next_items,
            next_model: next_model.map(|s| s.to_string()),
        }
    }

    #[tokio::test]
    async fn inputs_map_next_turn_and_catalog_tier() {
        let st = state().await;
        let r = row(
            Some("llama3.3"),
            Some(serde_json::json!([
                {"type": "message", "role": "user", "content": "Now add tests"}
            ])),
        );
        let inputs = inputs_for(&st, &r);
        assert_eq!(inputs.tier, Tier::Medium);
        assert_eq!(inputs.user_text.as_deref(), Some("Write a CSV parser"));
        let next = inputs.next.unwrap();
        assert_eq!(next.model, "llama3.3");
        assert_eq!(next.model_tier, Some(Tier::Complex));
        assert!(!next.is_tool_continuation);
        assert_eq!(next.user_text.as_deref(), Some("Now add tests"));
    }

    #[tokio::test]
    async fn tool_continuation_is_detected() {
        let st = state().await;
        let r = row(
            Some("llama3.1"),
            Some(serde_json::json!([
                {"type": "function_call_output", "call_id": "c1", "output": "{}"}
            ])),
        );
        let inputs = inputs_for(&st, &r);
        assert!(inputs.next.as_ref().unwrap().is_tool_continuation);
        assert_eq!(evaluate(&inputs).next_turn, NextTurn::None);
    }

    #[tokio::test]
    async fn rollup_without_database_is_an_error() {
        let st = state().await;
        assert!(run_rollup(&st).await.is_err());
    }
}
