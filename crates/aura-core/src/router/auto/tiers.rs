//! Tier catalog and within-tier candidate selection.
//!
//! The catalog knows which models belong to which tier. Selection takes a
//! tier and an `Eligibility` oracle (health, capabilities, allow/deny lists
//! are all the caller's business) and returns the model to dispatch to,
//! escalating to a neighbouring tier when the requested one has no
//! eligible candidate.

use super::config::{TierModels, WithinTierStrategy};
use super::outcomes::{sample_beta, ArmStats};
use aura_types::Tier;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicUsize, Ordering};

/// Answers questions about a candidate model on behalf of the caller.
pub trait Eligibility {
    /// Can this model be dispatched to right now?
    fn is_eligible(&self, model: &str) -> bool;
    /// Blended price per million tokens (used by `Cheapest`). `None` when
    /// unknown.
    fn blended_cost_per_million(&self, model: &str) -> Option<f64>;
    /// Provider that serves the model, for the decision record.
    fn provider_of(&self, model: &str) -> Option<String>;
    /// Learned arm statistics for Thompson sampling, when the caller has
    /// them. `None` means "no data": the uniform prior is used.
    fn arm_stats(&self, _tier: Tier, _model: &str) -> Option<ArmStats> {
        None
    }
    /// Predicted cost of *this request* on the model, in USD, when the
    /// caller has a cost model. `None` means unknown.
    fn predicted_cost_usd(&self, _model: &str) -> Option<f64> {
        None
    }
}

/// A candidate that was considered for a decision.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CandidateInfo {
    /// Model id.
    pub model: String,
    /// Provider, if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Tier the candidate was drawn from.
    pub tier: Tier,
    /// Blended price per million tokens, if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_per_million: Option<f64>,
    /// Predicted cost of this request on the model, if a cost model is
    /// loaded and the model is priced.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub predicted_cost_usd: Option<f64>,
    /// Whether the eligibility oracle accepted it.
    pub eligible: bool,
}

/// Outcome of tier selection.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TierSelection {
    /// Tier the model was drawn from (may differ from the requested tier
    /// when escalation happened).
    pub tier: Tier,
    /// Selected model.
    pub model: String,
    /// Provider, if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Every candidate looked at, in the order they were considered.
    pub candidates: Vec<CandidateInfo>,
    /// Why this model won.
    pub reason: String,
}

/// Tier catalog with a selection strategy.
#[derive(Debug)]
pub struct TierCatalog {
    tiers: TierModels,
    strategy: WithinTierStrategy,
    rr_counter: AtomicUsize,
}

impl TierCatalog {
    /// Build a catalog.
    pub fn new(tiers: TierModels, strategy: WithinTierStrategy) -> Self {
        Self {
            tiers,
            strategy,
            rr_counter: AtomicUsize::new(0),
        }
    }

    /// The configured tier lists.
    pub fn tiers(&self) -> &TierModels {
        &self.tiers
    }

    /// Highest tier a model is listed in.
    pub fn tier_of(&self, model: &str) -> Option<Tier> {
        self.tiers.tier_of(model)
    }

    /// Every distinct model in the catalog.
    pub fn all_models(&self) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        for t in Tier::ALL {
            for m in self.tiers.get(t) {
                if !out.iter().any(|x| x == m) {
                    out.push(m.clone());
                }
            }
        }
        out
    }

    /// Pick a model for `tier`, escalating outward when needed.
    ///
    /// Search order: the requested tier, then each tier above it (a stronger
    /// model is always acceptable), then each tier below it (better than
    /// failing). `max_tier` caps the upward search; `min_tier` caps the
    /// downward one.
    pub fn select(
        &self,
        tier: Tier,
        min_tier: Tier,
        max_tier: Tier,
        oracle: &dyn Eligibility,
    ) -> Option<TierSelection> {
        let mut candidates = Vec::new();

        let mut order = vec![tier];
        let mut up = tier.up();
        while let Some(t) = up {
            if t <= max_tier {
                order.push(t);
            }
            up = t.up();
        }
        let mut down = tier.down();
        while let Some(t) = down {
            if t >= min_tier {
                order.push(t);
            }
            down = t.down();
        }

        for t in order {
            if let Some(sel) = self.select_within(t, oracle, &mut candidates) {
                let reason = if t == tier {
                    sel.1
                } else if t > tier {
                    format!("escalated from {} (no eligible candidate); {}", tier, sel.1)
                } else {
                    format!(
                        "fell back to {} (no eligible candidate at or above {}); {}",
                        t, tier, sel.1
                    )
                };
                return Some(TierSelection {
                    tier: t,
                    provider: oracle.provider_of(&sel.0),
                    model: sel.0,
                    candidates,
                    reason,
                });
            }
        }
        None
    }

    fn select_within(
        &self,
        tier: Tier,
        oracle: &dyn Eligibility,
        candidates: &mut Vec<CandidateInfo>,
    ) -> Option<(String, String)> {
        let list = self.tiers.get(tier);
        let mut eligible: Vec<(usize, &String, Option<f64>)> = Vec::new();
        let mut predicted: Vec<Option<f64>> = Vec::new();
        for (idx, model) in list.iter().enumerate() {
            let ok = oracle.is_eligible(model);
            let cost = oracle.blended_cost_per_million(model);
            let pred = oracle.predicted_cost_usd(model);
            candidates.push(CandidateInfo {
                model: model.clone(),
                provider: oracle.provider_of(model),
                tier,
                cost_per_million: cost,
                predicted_cost_usd: pred,
                eligible: ok,
            });
            if ok {
                eligible.push((idx, model, cost));
                predicted.push(pred);
            }
        }
        if eligible.is_empty() {
            return None;
        }

        match self.strategy {
            WithinTierStrategy::PredictedCost => {
                // Lowest predicted request cost; candidates without a
                // prediction fall back to blended price order after the
                // predicted ones.
                let best_pred = eligible
                    .iter()
                    .zip(predicted.iter())
                    .filter_map(|((idx, m, _), p)| p.map(|p| (*idx, *m, p)))
                    .min_by(|a, b| {
                        a.2.partial_cmp(&b.2)
                            .unwrap_or(std::cmp::Ordering::Equal)
                            .then(a.0.cmp(&b.0))
                    });
                if let Some((_, m, p)) = best_pred {
                    return Some((
                        m.to_string(),
                        format!("lowest predicted cost in {} (${:.5})", tier, p),
                    ));
                }
                let best = eligible
                    .iter()
                    .filter(|(_, _, c)| c.is_some())
                    .min_by(|a, b| {
                        a.2.partial_cmp(&b.2)
                            .unwrap_or(std::cmp::Ordering::Equal)
                            .then(a.0.cmp(&b.0))
                    })
                    .or_else(|| eligible.first());
                let (_, m, _) = best?;
                Some((
                    m.to_string(),
                    format!("no cost prediction; cheapest by list price in {}", tier),
                ))
            }
            WithinTierStrategy::ConfigOrder => {
                let (_, m, _) = eligible[0];
                Some((m.clone(), format!("first eligible candidate in {}", tier)))
            }
            WithinTierStrategy::RoundRobin => {
                let n = self.rr_counter.fetch_add(1, Ordering::Relaxed);
                let (_, m, _) = eligible[n % eligible.len()];
                Some((
                    m.clone(),
                    format!("round-robin over {} eligible in {}", eligible.len(), tier),
                ))
            }
            WithinTierStrategy::Thompson => {
                // One Beta sample per eligible arm; highest sample wins.
                // Arms without data sample from Beta(1, 1), so new models
                // get explored rather than ignored. Ties (identical
                // samples are practically impossible) fall to config order.
                let mut rng = rand::thread_rng();
                let mut best: Option<(usize, &String, f64, ArmStats)> = None;
                for (idx, m, _) in &eligible {
                    let stats = oracle.arm_stats(tier, m).unwrap_or_default();
                    let sample = sample_beta(&mut rng, stats.alpha, stats.beta);
                    if best.map(|(_, _, s, _)| sample > s).unwrap_or(true) {
                        best = Some((*idx, m, sample, stats));
                    }
                }
                let (_, m, sample, stats) = best?;
                Some((
                    m.to_string(),
                    format!(
                        "thompson sample {:.2} (mean {:.2}, n={:.0}) over {} eligible in {}",
                        sample,
                        stats.mean(),
                        stats.alpha + stats.beta - 2.0,
                        eligible.len(),
                        tier
                    ),
                ))
            }
            WithinTierStrategy::Cheapest => {
                // Known prices first (ascending), then unknown in config order.
                let best = eligible
                    .iter()
                    .filter(|(_, _, c)| c.is_some())
                    .min_by(|a, b| {
                        a.2.partial_cmp(&b.2)
                            .unwrap_or(std::cmp::Ordering::Equal)
                            .then(a.0.cmp(&b.0))
                    })
                    .or_else(|| eligible.first());
                let (_, m, c) = best?;
                let reason = match c {
                    Some(c) => format!("cheapest eligible in {} (${:.2}/1M blended)", tier, c),
                    None => format!("first eligible in {} (no price known)", tier),
                };
                Some((m.to_string(), reason))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    struct Oracle {
        blocked: Vec<&'static str>,
        costs: HashMap<&'static str, f64>,
    }

    impl Eligibility for Oracle {
        fn is_eligible(&self, model: &str) -> bool {
            !self.blocked.contains(&model)
        }
        fn blended_cost_per_million(&self, model: &str) -> Option<f64> {
            self.costs.get(model).copied()
        }
        fn provider_of(&self, model: &str) -> Option<String> {
            Some(if model.starts_with("gpt") {
                "openai".into()
            } else if model.starts_with("claude") {
                "anthropic".into()
            } else {
                "google".into()
            })
        }
    }

    fn oracle(blocked: &[&'static str]) -> Oracle {
        let mut costs = HashMap::new();
        // gemini-3-pro-preview is deliberately left unpriced.
        costs.insert("gemini-3.1-flash-lite", 0.15);
        costs.insert("gemini-3.5-flash", 0.4);
        costs.insert("gpt-5.6-luna", 0.5);
        costs.insert("gemini-3.8-flash", 1.5);
        costs.insert("gpt-5.4-mini", 1.0);
        costs.insert("claude-haiku-4-5", 2.0);
        costs.insert("claude-sonnet-5", 4.0);
        costs.insert("gpt-5.6-terra", 5.0);
        costs.insert("claude-opus-5", 10.0);
        costs.insert("gpt-5.6-sol", 8.0);
        costs.insert("claude-fable-5-1", 20.0);
        Oracle {
            blocked: blocked.to_vec(),
            costs,
        }
    }

    #[test]
    fn cheapest_picks_lowest_known_price() {
        let cat = TierCatalog::new(TierModels::default(), WithinTierStrategy::Cheapest);
        let sel = cat
            .select(Tier::Medium, Tier::Simple, Tier::Reasoning, &oracle(&[]))
            .unwrap();
        assert_eq!(sel.model, "gpt-5.4-mini");
        assert_eq!(sel.tier, Tier::Medium);
        assert_eq!(sel.provider.as_deref(), Some("openai"));
        assert_eq!(sel.candidates.len(), 3);
        assert!(sel.reason.contains("cheapest"));
    }

    #[test]
    fn unknown_price_comes_last_but_is_still_usable() {
        let cat = TierCatalog::new(TierModels::default(), WithinTierStrategy::Cheapest);
        // Only the unpriced gemini-3-pro-preview is eligible in complex.
        let sel = cat
            .select(
                Tier::Complex,
                Tier::Complex,
                Tier::Complex,
                &oracle(&["claude-sonnet-5", "gpt-5.6-terra"]),
            )
            .unwrap();
        assert_eq!(sel.model, "gemini-3-pro-preview");
        assert!(sel.reason.contains("no price known"));
    }

    #[test]
    fn escalates_up_before_falling_down() {
        let cat = TierCatalog::new(TierModels::default(), WithinTierStrategy::Cheapest);
        let blocked = ["gemini-3.8-flash", "gpt-5.4-mini", "claude-haiku-4-5"];
        let sel = cat
            .select(
                Tier::Medium,
                Tier::Simple,
                Tier::Reasoning,
                &oracle(&blocked),
            )
            .unwrap();
        assert_eq!(sel.tier, Tier::Complex);
        assert_eq!(sel.model, "claude-sonnet-5");
        assert!(sel.reason.starts_with("escalated from medium"));
        // All three medium candidates were recorded as ineligible.
        assert_eq!(
            sel.candidates
                .iter()
                .filter(|c| c.tier == Tier::Medium && !c.eligible)
                .count(),
            3
        );
    }

    #[test]
    fn max_tier_caps_escalation_and_falls_back_down() {
        let cat = TierCatalog::new(TierModels::default(), WithinTierStrategy::Cheapest);
        let blocked = ["gemini-3.8-flash", "gpt-5.4-mini", "claude-haiku-4-5"];
        let sel = cat
            .select(Tier::Medium, Tier::Simple, Tier::Medium, &oracle(&blocked))
            .unwrap();
        assert_eq!(sel.tier, Tier::Simple);
        assert_eq!(sel.model, "gemini-3.1-flash-lite");
        assert!(sel.reason.starts_with("fell back to simple"));
    }

    #[test]
    fn returns_none_when_nothing_is_eligible() {
        let cat = TierCatalog::new(TierModels::default(), WithinTierStrategy::Cheapest);
        let all: Vec<&'static str> = vec![
            "gemini-3.1-flash-lite",
            "gemini-3.5-flash",
            "gpt-5.6-luna",
            "gemini-3.8-flash",
            "gpt-5.4-mini",
            "claude-haiku-4-5",
            "claude-sonnet-5",
            "gemini-3-pro-preview",
            "gpt-5.6-terra",
            "claude-opus-5",
            "gpt-5.6-sol",
            "claude-fable-5-1",
        ];
        assert!(cat
            .select(Tier::Simple, Tier::Simple, Tier::Reasoning, &oracle(&all))
            .is_none());
    }

    #[test]
    fn round_robin_rotates() {
        let cat = TierCatalog::new(TierModels::default(), WithinTierStrategy::RoundRobin);
        let o = oracle(&[]);
        let a = cat
            .select(Tier::Simple, Tier::Simple, Tier::Simple, &o)
            .unwrap();
        let b = cat
            .select(Tier::Simple, Tier::Simple, Tier::Simple, &o)
            .unwrap();
        let c = cat
            .select(Tier::Simple, Tier::Simple, Tier::Simple, &o)
            .unwrap();
        let d = cat
            .select(Tier::Simple, Tier::Simple, Tier::Simple, &o)
            .unwrap();
        assert_ne!(a.model, b.model);
        assert_ne!(b.model, c.model);
        assert_eq!(a.model, d.model);
    }

    struct ArmOracle;
    impl Eligibility for ArmOracle {
        fn is_eligible(&self, _: &str) -> bool {
            true
        }
        fn blended_cost_per_million(&self, _: &str) -> Option<f64> {
            None
        }
        fn provider_of(&self, _: &str) -> Option<String> {
            None
        }
        fn arm_stats(&self, _tier: Tier, model: &str) -> Option<ArmStats> {
            match model {
                // Strong but not certain, so the uniform prior of the
                // unknown arm still wins a draw now and then.
                "gpt-5.6-luna" => Some(ArmStats {
                    alpha: 20.0,
                    beta: 2.0,
                }),
                "gemini-3.1-flash-lite" => Some(ArmStats {
                    alpha: 2.0,
                    beta: 200.0,
                }),
                _ => None,
            }
        }
    }

    #[test]
    fn thompson_prefers_arms_with_better_history() {
        let cat = TierCatalog::new(TierModels::default(), WithinTierStrategy::Thompson);
        let mut wins = std::collections::HashMap::new();
        for _ in 0..200 {
            let sel = cat
                .select(Tier::Simple, Tier::Simple, Tier::Simple, &ArmOracle)
                .unwrap();
            *wins.entry(sel.model).or_insert(0) += 1;
            assert!(sel.reason.starts_with("thompson sample"));
        }
        let luna = wins.get("gpt-5.6-luna").copied().unwrap_or(0);
        let lite = wins.get("gemini-3.1-flash-lite").copied().unwrap_or(0);
        assert!(luna > 120, "luna={} wins={:?}", luna, wins);
        assert!(lite < 20, "lite={} wins={:?}", lite, wins);
        // The unknown arm (Beta(1,1)) is explored sometimes.
        assert!(wins.get("gemini-3.5-flash").copied().unwrap_or(0) > 0);
    }

    struct PredOracle;
    impl Eligibility for PredOracle {
        fn is_eligible(&self, _: &str) -> bool {
            true
        }
        fn blended_cost_per_million(&self, m: &str) -> Option<f64> {
            oracle(&[]).blended_cost_per_million(m)
        }
        fn provider_of(&self, _: &str) -> Option<String> {
            None
        }
        fn predicted_cost_usd(&self, model: &str) -> Option<f64> {
            match model {
                // Cheapest by list price but verbose: costs more per request.
                "gemini-3.1-flash-lite" => Some(0.0040),
                "gpt-5.6-luna" => Some(0.0012),
                _ => None,
            }
        }
    }

    #[test]
    fn predicted_cost_beats_list_price() {
        let cat = TierCatalog::new(TierModels::default(), WithinTierStrategy::PredictedCost);
        let sel = cat
            .select(Tier::Simple, Tier::Simple, Tier::Simple, &PredOracle)
            .unwrap();
        assert_eq!(sel.model, "gpt-5.6-luna");
        assert!(sel.reason.starts_with("lowest predicted cost"));
        let luna = sel
            .candidates
            .iter()
            .find(|c| c.model == "gpt-5.6-luna")
            .unwrap();
        assert_eq!(luna.predicted_cost_usd, Some(0.0012));

        // Without predictions the strategy degrades to list price.
        let sel = cat
            .select(Tier::Medium, Tier::Medium, Tier::Medium, &oracle(&[]))
            .unwrap();
        assert_eq!(sel.model, "gpt-5.4-mini");
        assert!(sel.reason.contains("no cost prediction"));
    }

    #[test]
    fn config_order_takes_first_eligible() {
        let cat = TierCatalog::new(TierModels::default(), WithinTierStrategy::ConfigOrder);
        let sel = cat
            .select(
                Tier::Simple,
                Tier::Simple,
                Tier::Simple,
                &oracle(&["gemini-3.1-flash-lite"]),
            )
            .unwrap();
        assert_eq!(sel.model, "gemini-3.5-flash");
    }

    #[test]
    fn all_models_is_deduplicated() {
        let mut tiers = TierModels::default();
        // List one model in two tiers; it must appear once.
        tiers.medium.push("claude-sonnet-5".into());
        let cat = TierCatalog::new(tiers, WithinTierStrategy::Cheapest);
        let all = cat.all_models();
        assert_eq!(
            all.iter()
                .filter(|m| m.as_str() == "claude-sonnet-5")
                .count(),
            1
        );
        assert_eq!(all.len(), 12);
    }
}
