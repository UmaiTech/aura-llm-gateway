//! Complexity-based auto model router.
//!
//! Resolves `model: "auto"` to a concrete model in four steps:
//!
//! 1. **Features** — `features::extract_features` turns the request into a
//!    numeric vector (no prompt text leaves this step).
//! 2. **Score** — `scorer::HeuristicScorer` weights the features into a
//!    `[0, 1]` complexity score, applies the mode offset, maps it to a
//!    `Tier`.
//! 3. **Clamp** — request-level `min_tier` / `max_tier` and the tools
//!    floor adjust the tier.
//! 4. **Select** — `tiers::TierCatalog` picks a model from the tier through
//!    the caller's `Eligibility` oracle (health, capabilities, allow/deny),
//!    escalating to a neighbouring tier when needed. Tool-loop
//!    continuation turns keep the previous model when it is eligible.
//!
//! The whole path is synchronous and allocation-light; the heuristic
//! classifier runs in well under a millisecond.

pub mod capabilities;
pub mod catalog;
pub mod config;
pub mod cost_model;
pub mod features;
pub mod learned;
pub mod llm;
pub mod outcomes;
pub mod scorer;
pub mod tiers;

pub use capabilities::{model_supports_tools, model_supports_vision};
pub use catalog::{canonical_slug, CatalogEntry, CatalogSource, ModelCatalog};
pub use config::{
    AutoRoutingConfig, FeatureWeights, KeywordLists, LlmClassifierConfig, ModeOffsets,
    OrgAutoRoutingOverride, TierBoundaries, TierModels, TokenThresholds, WithinTierStrategy,
};
pub use cost_model::{CostHead, CostModel, CostModelError, CostPrediction, COST_MODEL_KIND};
pub use features::{
    estimate_tokens, extract_features, IntentHint, KeywordMatcher, RequestFeatures,
};
pub use learned::{featurize, LearnedModel, LearnedModelError, LearnedPrediction, FEATURE_NAMES};
pub use llm::{
    classifier_prompt, judge_prompt, parse_classifier_output, parse_judge_output, ClassifierAnswer,
    JudgeAnswer, JudgeVerdict, CLASSIFIER_EXCERPT_CHARS,
};
pub use outcomes::{
    classify_next_turn, evaluate, is_correction, reward_for, sample_beta, word_jaccard, ArmStats,
    NextTurn, NextTurnInputs, Outcome, OutcomeInputs,
};
pub use scorer::{HeuristicScorer, ScoreResult, HEURISTIC_VERSION};
pub use tiers::{CandidateInfo, Eligibility, TierCatalog, TierSelection};

use aura_types::{ClassifierKind, CreateResponseRequest, RoutingMode, RoutingOptions, Tier};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::time::Instant;

/// Everything the router needs to know about one request beyond the
/// request body itself.
#[derive(Debug, Clone, Default)]
pub struct DecisionContext<'a> {
    /// The model string the client sent (`auto`, `auto:cost`, or a pinned
    /// model when shadowing).
    pub requested_model: &'a str,
    /// Mode from the alias suffix, if any.
    pub alias_mode: Option<RoutingMode>,
    /// Per-request options, if the client sent a `routing` object.
    pub options: Option<&'a RoutingOptions>,
    /// Model used by the previous turn of this conversation, when known.
    pub previous_model: Option<&'a str>,
    /// When `true`, the decision is recorded but not applied.
    pub shadow: bool,
}

/// A tier chosen by a non-heuristic classifier.
#[derive(Debug, Clone, PartialEq)]
pub struct ClassifierOverride {
    /// Tier to use instead of the heuristic one.
    pub tier: Tier,
    /// Classifier label recorded with the decision (e.g. `llm@claude-haiku-4-5`).
    pub classifier: String,
    /// Confidence in `[0, 1]`.
    pub confidence: f64,
}

/// One escalation step taken after a provider failure.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Escalation {
    /// Model that failed.
    pub from_model: String,
    /// Tier it was in.
    pub from_tier: Tier,
    /// Model tried next.
    pub to_model: String,
    /// Tier it is in.
    pub to_tier: Tier,
    /// Provider error code that triggered the step.
    pub error_code: String,
}

/// A recorded routing decision. Serialised into `metadata.aura.routing`
/// and, later, into the `routing_decisions` table.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AutoDecision {
    /// What the client asked for.
    pub requested_model: String,
    /// Effective mode.
    pub mode: RoutingMode,
    /// Classifier that produced the score (e.g. `heuristic@v1`).
    pub classifier: String,
    /// Score after the mode offset.
    pub score: f64,
    /// Score before the mode offset.
    pub raw_score: f64,
    /// Tier the classifier assigned before clamps.
    pub classified_tier: Tier,
    /// Score boundaries in force for this decision (inclusive lower bound
    /// of each upper tier), so clients can draw the score against them.
    #[serde(default)]
    pub boundaries: TierBoundaries,
    /// Tier after `min_tier` / `max_tier` / tools floor.
    pub tier: Tier,
    /// Feature contributions that fired.
    pub signals: BTreeMap<String, f64>,
    /// Full feature vector (numeric only).
    pub features: RequestFeatures,
    /// Constraints that shaped the decision, in order.
    pub hard_filters: Vec<String>,
    /// Candidates considered.
    pub candidates: Vec<CandidateInfo>,
    /// Model the request is (or would be) dispatched to.
    pub selected: String,
    /// Provider of the selected model, if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_provider: Option<String>,
    /// Why.
    pub reason: String,
    /// Decision was recorded only, not applied.
    pub shadow: bool,
    /// Wall time spent deciding.
    pub latency_us: u64,
    /// Escalations taken after provider failures, oldest first.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub escalations: Vec<Escalation>,
    /// Predicted cost of this request on the selected model, when a cost
    /// model is loaded.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub predicted_cost_usd: Option<f64>,
    /// The routing options in force for this decision: the request's own
    /// `routing` merged with any organization override. Echoed so callers
    /// can confirm what the gateway applied. Absent when none were sent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<RoutingOptions>,
}

/// Why no model could be selected.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AutoRouteError {
    /// Auto routing is disabled in config.
    #[error("auto routing is disabled")]
    Disabled,
    /// No tier had an eligible candidate.
    #[error("no eligible model for tier {tier} (considered {considered})")]
    NoCandidate {
        /// Tier that was requested.
        tier: Tier,
        /// Number of candidates looked at.
        considered: usize,
    },
}

/// The auto router. Cheap to share behind an `Arc`.
#[derive(Debug)]
pub struct AutoRouter {
    config: AutoRoutingConfig,
    matcher: KeywordMatcher,
    scorer: HeuristicScorer,
    catalog: TierCatalog,
}

impl std::fmt::Debug for KeywordMatcher {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("KeywordMatcher")
    }
}

impl AutoRouter {
    /// Build a router from config. Compiles keyword regexes once.
    pub fn new(config: AutoRoutingConfig) -> Self {
        let matcher = KeywordMatcher::new(&config.keywords);
        let scorer = HeuristicScorer::new(&config);
        let catalog = TierCatalog::new(config.tiers.clone(), config.within_tier);
        Self {
            config,
            matcher,
            scorer,
            catalog,
        }
    }

    /// The config this router was built from.
    pub fn config(&self) -> &AutoRoutingConfig {
        &self.config
    }

    /// Tier catalog.
    pub fn catalog(&self) -> &TierCatalog {
        &self.catalog
    }

    /// Whether the router is switched on.
    pub fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    /// Extract features only (used by shadow mode and offline tooling).
    pub fn features(&self, request: &CreateResponseRequest) -> RequestFeatures {
        extract_features(request, &self.matcher, &self.config.token_thresholds)
    }

    /// Score only, without selecting a model.
    pub fn score(&self, features: &RequestFeatures, mode: RoutingMode) -> ScoreResult {
        self.scorer.score(features, mode)
    }

    /// Resolve the effective mode for a request.
    pub fn effective_mode(&self, ctx: &DecisionContext<'_>) -> RoutingMode {
        ctx.options
            .and_then(|o| o.mode)
            .or(ctx.alias_mode)
            .unwrap_or(self.config.default_mode)
    }

    /// Resolve the effective classifier for a request.
    pub fn effective_classifier(&self, ctx: &DecisionContext<'_>) -> ClassifierKind {
        ctx.options
            .and_then(|o| o.classifier)
            .unwrap_or(self.config.default_classifier)
    }

    /// Make a decision with the heuristic classifier.
    ///
    /// `oracle` answers eligibility for each candidate. The router itself
    /// applies the request's allow / deny lists on top of the oracle so the
    /// caller doesn't have to.
    pub fn decide(
        &self,
        request: &CreateResponseRequest,
        ctx: &DecisionContext<'_>,
        oracle: &dyn Eligibility,
    ) -> Result<AutoDecision, AutoRouteError> {
        self.decide_with_override(request, ctx, oracle, None)
    }

    /// Make a decision, optionally replacing the heuristic tier with one
    /// produced by another classifier (LLM or learned). The heuristic
    /// still runs so its score, signals and features are recorded next to
    /// the override.
    pub fn decide_with_override(
        &self,
        request: &CreateResponseRequest,
        ctx: &DecisionContext<'_>,
        oracle: &dyn Eligibility,
        override_tier: Option<ClassifierOverride>,
    ) -> Result<AutoDecision, AutoRouteError> {
        if !self.config.enabled && !ctx.shadow {
            return Err(AutoRouteError::Disabled);
        }
        let started = Instant::now();

        let mode = self.effective_mode(ctx);
        let features = self.features(request);
        let mut scored = self.scorer.score(&features, mode);
        let mut classifier = HEURISTIC_VERSION.to_string();
        if let Some(ov) = override_tier {
            scored.notes.push(format!(
                "{} chose {} (confidence {:.2}); heuristic said {}",
                ov.classifier, ov.tier, ov.confidence, scored.tier
            ));
            scored
                .signals
                .insert("classifier_confidence".to_string(), ov.confidence);
            scored.tier = ov.tier;
            classifier = ov.classifier;
        }

        let mut hard_filters = Vec::new();
        let mut tier = scored.tier;

        let min_tier = ctx.options.and_then(|o| o.min_tier).unwrap_or(Tier::Simple);
        let max_tier = ctx
            .options
            .and_then(|o| o.max_tier)
            .unwrap_or(Tier::Reasoning);
        let (min_tier, max_tier) = if min_tier > max_tier {
            hard_filters.push(format!(
                "min_tier {} > max_tier {}: using max_tier for both",
                min_tier, max_tier
            ));
            (max_tier, max_tier)
        } else {
            (min_tier, max_tier)
        };

        if tier < min_tier {
            hard_filters.push(format!("min_tier {}", min_tier));
            tier = min_tier;
        }
        if tier > max_tier {
            hard_filters.push(format!("max_tier {}", max_tier));
            tier = max_tier;
        }
        // The tools floor is applied last: requests that carry tools never
        // go below it, even when `max_tier` asks for less (documented).
        if let Some(floor) = self.config.tools_min_tier {
            if features.tool_count > 0 && tier < floor {
                if floor > max_tier {
                    hard_filters.push(format!(
                        "tools present: floor {} overrides max_tier {}",
                        floor, max_tier
                    ));
                } else {
                    hard_filters.push(format!("tools present: floor {}", floor));
                }
                tier = floor;
            }
        }
        if features.has_images {
            hard_filters.push("needs vision".into());
        }
        if features.tool_count > 0 {
            hard_filters.push("needs tools".into());
        }

        let options = ctx.options;
        let has_lists = options
            .map(|o| !o.allow.is_empty() || !o.deny.is_empty())
            .unwrap_or(false);
        if has_lists {
            hard_filters.push("allow/deny lists".into());
        }
        let filtered = FilteredOracle {
            inner: oracle,
            options,
        };

        // Sticky tool loops: keep the previous turn's model when it is
        // eligible and at least as strong as the tier we just picked.
        let sticky_enabled = options
            .and_then(|o| o.sticky)
            .unwrap_or(self.config.sticky_tool_loops);
        if sticky_enabled && features.is_tool_loop_turn {
            if let Some(prev) = ctx.previous_model {
                // A previous model that is in no tier list (pinned, or
                // pruned since) has no known strength: never stick to it.
                let prev_tier = self.catalog.tier_of(prev);
                let strong_enough = prev_tier.map(|t| t >= tier).unwrap_or(false);
                if filtered.is_eligible(prev)
                    && strong_enough
                    && prev_tier.map(|t| t <= max_tier).unwrap_or(false)
                {
                    hard_filters.push("sticky tool loop".into());
                    let selected_tier = prev_tier.unwrap_or(tier);
                    return Ok(AutoDecision {
                        requested_model: ctx.requested_model.to_string(),
                        options: ctx.options.cloned(),
                        mode,
                        classifier: classifier.clone(),
                        score: scored.score,
                        raw_score: scored.raw_score,
                        classified_tier: scored.tier,
                        boundaries: self.config.boundaries,
                        tier: selected_tier,
                        signals: scored.signals,
                        features,
                        hard_filters,
                        candidates: vec![CandidateInfo {
                            model: prev.to_string(),
                            provider: oracle.provider_of(prev),
                            tier: selected_tier,
                            cost_per_million: oracle.blended_cost_per_million(prev),
                            eligible: true,
                            predicted_cost_usd: oracle.predicted_cost_usd(prev),
                        }],
                        selected: prev.to_string(),
                        selected_provider: oracle.provider_of(prev),
                        reason: "kept previous turn's model inside tool loop".into(),
                        shadow: ctx.shadow,
                        latency_us: started.elapsed().as_micros() as u64,
                        escalations: Vec::new(),
                        predicted_cost_usd: oracle.predicted_cost_usd(prev),
                    });
                }
            }
        }

        // Per-request budget: skip candidates whose predicted cost exceeds
        // it; when nothing fits, fall back to an unconstrained selection
        // and say so.
        let budget = options.and_then(|o| o.max_cost_usd).filter(|b| *b > 0.0);
        let mut budget_note = None;
        let selection = match budget {
            Some(limit) => {
                hard_filters.push(format!("max_cost_usd {:.5}", limit));
                let budgeted = BudgetOracle {
                    inner: &filtered,
                    limit,
                };
                match self.catalog.select(tier, min_tier, max_tier, &budgeted) {
                    Some(sel) => sel,
                    None => {
                        budget_note = Some(format!(
                            "no candidate within max_cost_usd {:.5}; budget ignored",
                            limit
                        ));
                        self.catalog.select(tier, min_tier, max_tier, &filtered)
                    }
                    .ok_or_else(|| AutoRouteError::NoCandidate {
                        tier,
                        considered: self.catalog.all_models().len(),
                    })?,
                }
            }
            None => self
                .catalog
                .select(tier, min_tier, max_tier, &filtered)
                .ok_or_else(|| AutoRouteError::NoCandidate {
                    tier,
                    considered: self.catalog.all_models().len(),
                })?,
        };

        let mut reason = selection.reason;
        for note in scored.notes.iter().chain(budget_note.iter()) {
            reason.push_str("; ");
            reason.push_str(note);
        }
        let predicted_cost_usd = filtered.predicted_cost_usd(&selection.model);

        Ok(AutoDecision {
            requested_model: ctx.requested_model.to_string(),
            options: ctx.options.cloned(),
            mode,
            classifier: classifier.clone(),
            score: scored.score,
            raw_score: scored.raw_score,
            classified_tier: scored.tier,
            boundaries: self.config.boundaries,
            tier: selection.tier,
            signals: scored.signals,
            features,
            hard_filters,
            candidates: selection.candidates,
            selected: selection.model,
            selected_provider: selection.provider,
            reason,
            shadow: ctx.shadow,
            latency_us: started.elapsed().as_micros() as u64,
            escalations: Vec::new(),
            predicted_cost_usd,
        })
    }
}

impl AutoRouter {
    /// After a provider failure, pick the next model to try: another
    /// eligible candidate in the decision's tier first, then tiers above it
    /// up to the request's `max_tier`. Models in `exclude` (those that
    /// already failed) are skipped. Returns `None` when nothing is left.
    pub fn next_candidate(
        &self,
        decision: &AutoDecision,
        options: Option<&RoutingOptions>,
        oracle: &dyn Eligibility,
        exclude: &[String],
    ) -> Option<TierSelection> {
        let max_tier = options.and_then(|o| o.max_tier).unwrap_or(Tier::Reasoning);
        let max_tier = max_tier.max(decision.tier);
        let filtered = FilteredOracle {
            inner: oracle,
            options,
        };
        let excluding = ExcludingOracle {
            inner: &filtered,
            exclude,
        };
        // Respect the request budget on escalation too; when nothing fits
        // it, fall back to the unconstrained pick like the first decision.
        if let Some(limit) = options.and_then(|o| o.max_cost_usd).filter(|b| *b > 0.0) {
            let budgeted = BudgetOracle {
                inner: &excluding,
                limit,
            };
            if let Some(sel) =
                self.catalog
                    .select(decision.tier, decision.tier, max_tier, &budgeted)
            {
                return Some(sel);
            }
        }
        self.catalog
            .select(decision.tier, decision.tier, max_tier, &excluding)
    }

    /// Apply an escalation to a decision in place: the selected model,
    /// tier and provider move to the new candidate and the step is
    /// recorded.
    pub fn apply_escalation(
        decision: &mut AutoDecision,
        selection: TierSelection,
        error_code: &str,
    ) {
        decision.escalations.push(Escalation {
            from_model: decision.selected.clone(),
            from_tier: decision.tier,
            to_model: selection.model.clone(),
            to_tier: selection.tier,
            error_code: error_code.to_string(),
        });
        decision.reason = format!(
            "{}; escalated from {} after {}: {}",
            decision.reason, decision.selected, error_code, selection.reason
        );
        decision.tier = selection.tier;
        decision.selected = selection.model;
        decision.selected_provider = selection.provider;
        decision.candidates.extend(selection.candidates);
    }
}

/// Wraps the caller's oracle with the request's allow / deny lists.
struct FilteredOracle<'a> {
    inner: &'a dyn Eligibility,
    options: Option<&'a RoutingOptions>,
}

impl Eligibility for FilteredOracle<'_> {
    fn is_eligible(&self, model: &str) -> bool {
        if let Some(opts) = self.options {
            let provider = self.inner.provider_of(model).unwrap_or_default();
            if !opts.permits(&provider, model) {
                return false;
            }
        }
        self.inner.is_eligible(model)
    }

    fn blended_cost_per_million(&self, model: &str) -> Option<f64> {
        self.inner.blended_cost_per_million(model)
    }

    fn provider_of(&self, model: &str) -> Option<String> {
        self.inner.provider_of(model)
    }

    fn arm_stats(&self, tier: Tier, model: &str) -> Option<ArmStats> {
        self.inner.arm_stats(tier, model)
    }

    fn predicted_cost_usd(&self, model: &str) -> Option<f64> {
        self.inner.predicted_cost_usd(model)
    }
}

/// Wraps an oracle to reject models whose predicted request cost exceeds
/// a budget. Models without a prediction are kept (unknown is not "over").
struct BudgetOracle<'a> {
    inner: &'a dyn Eligibility,
    limit: f64,
}

impl Eligibility for BudgetOracle<'_> {
    fn is_eligible(&self, model: &str) -> bool {
        if let Some(cost) = self.inner.predicted_cost_usd(model) {
            if cost > self.limit {
                return false;
            }
        }
        self.inner.is_eligible(model)
    }

    fn blended_cost_per_million(&self, model: &str) -> Option<f64> {
        self.inner.blended_cost_per_million(model)
    }

    fn provider_of(&self, model: &str) -> Option<String> {
        self.inner.provider_of(model)
    }

    fn arm_stats(&self, tier: Tier, model: &str) -> Option<ArmStats> {
        self.inner.arm_stats(tier, model)
    }

    fn predicted_cost_usd(&self, model: &str) -> Option<f64> {
        self.inner.predicted_cost_usd(model)
    }
}

/// Wraps an oracle to reject models that already failed this request.
struct ExcludingOracle<'a> {
    inner: &'a dyn Eligibility,
    exclude: &'a [String],
}

impl Eligibility for ExcludingOracle<'_> {
    fn is_eligible(&self, model: &str) -> bool {
        !self.exclude.iter().any(|m| m == model) && self.inner.is_eligible(model)
    }

    fn blended_cost_per_million(&self, model: &str) -> Option<f64> {
        self.inner.blended_cost_per_million(model)
    }

    fn provider_of(&self, model: &str) -> Option<String> {
        self.inner.provider_of(model)
    }

    fn arm_stats(&self, tier: Tier, model: &str) -> Option<ArmStats> {
        self.inner.arm_stats(tier, model)
    }

    fn predicted_cost_usd(&self, model: &str) -> Option<f64> {
        self.inner.predicted_cost_usd(model)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::{FunctionDefinition, InputItem, Tool};
    use std::collections::HashMap;

    struct Oracle {
        blocked: Vec<String>,
        costs: HashMap<&'static str, f64>,
    }

    impl Eligibility for Oracle {
        fn is_eligible(&self, model: &str) -> bool {
            !self.blocked.iter().any(|b| b == model)
        }
        fn blended_cost_per_million(&self, model: &str) -> Option<f64> {
            self.costs.get(model).copied()
        }
        fn provider_of(&self, model: &str) -> Option<String> {
            Some(if model.starts_with("gpt") || model.starts_with("o3") {
                "openai".into()
            } else if model.starts_with("claude") {
                "anthropic".into()
            } else {
                "google".into()
            })
        }
    }

    fn oracle() -> Oracle {
        let mut costs = HashMap::new();
        costs.insert("gemini-3.1-flash-lite", 0.15);
        costs.insert("gemini-3.5-flash", 0.4);
        costs.insert("gpt-5.6-luna", 0.5);
        costs.insert("gemini-3.8-flash", 1.5);
        costs.insert("gpt-5.4-mini", 1.0);
        costs.insert("claude-haiku-4-5", 2.0);
        costs.insert("claude-sonnet-5", 4.0);
        costs.insert("gemini-3-pro-preview", 3.0);
        costs.insert("gpt-5.6-terra", 5.0);
        costs.insert("claude-opus-5", 10.0);
        costs.insert("gpt-5.6-sol", 8.0);
        costs.insert("claude-fable-5-1", 20.0);
        Oracle {
            blocked: vec![],
            costs,
        }
    }

    fn router() -> AutoRouter {
        AutoRouter::new(AutoRoutingConfig {
            enabled: true,
            ..Default::default()
        })
    }

    fn ctx<'a>(requested: &'a str, options: Option<&'a RoutingOptions>) -> DecisionContext<'a> {
        let alias = aura_types::parse_auto_model(requested);
        DecisionContext {
            requested_model: requested,
            alias_mode: alias.and_then(|a| a.mode),
            options,
            previous_model: None,
            shadow: false,
        }
    }

    #[test]
    fn disabled_router_refuses_unless_shadow() {
        let r = AutoRouter::new(AutoRoutingConfig::default());
        let req = CreateResponseRequest::text("auto", "hi");
        assert_eq!(
            r.decide(&req, &ctx("auto", None), &oracle()).unwrap_err(),
            AutoRouteError::Disabled
        );
        let mut c = ctx("gpt-5.6-terra", None);
        c.shadow = true;
        let d = r.decide(&req, &c, &oracle()).unwrap();
        assert!(d.shadow);
        assert_eq!(d.requested_model, "gpt-5.6-terra");
    }

    #[test]
    fn simple_prompt_goes_to_cheapest_simple_model() {
        let r = router();
        let req = CreateResponseRequest::text("auto", "What is the capital of France?");
        // First call compiles the keyword patterns; time the second.
        let _ = r.decide(&req, &ctx("auto", None), &oracle()).unwrap();
        let d = r.decide(&req, &ctx("auto", None), &oracle()).unwrap();
        assert_eq!(d.tier, Tier::Simple);
        assert_eq!(d.selected, "gemini-3.1-flash-lite");
        assert_eq!(d.selected_provider.as_deref(), Some("google"));
        assert_eq!(d.mode, RoutingMode::Balanced);
        assert_eq!(d.classifier, HEURISTIC_VERSION);
        assert!(d.latency_us < 50_000);
        assert!(!d.shadow);
    }

    #[test]
    fn alias_mode_and_options_mode_precedence() {
        let r = router();
        let req = CreateResponseRequest::text("auto:quality", "hi");
        let d = r
            .decide(&req, &ctx("auto:quality", None), &oracle())
            .unwrap();
        assert_eq!(d.mode, RoutingMode::Quality);

        let opts = RoutingOptions {
            mode: Some(RoutingMode::Cost),
            ..Default::default()
        };
        let d = r
            .decide(&req, &ctx("auto:quality", Some(&opts)), &oracle())
            .unwrap();
        assert_eq!(d.mode, RoutingMode::Cost, "request options beat the alias");
    }

    #[test]
    fn tools_floor_to_medium() {
        let r = router();
        let mut req = CreateResponseRequest::text("auto", "weather in Oslo?");
        req.tools = Some(vec![Tool::function(FunctionDefinition {
            name: "get_weather".into(),
            description: None,
            parameters: None,
            strict: None,
        })]);
        let d = r.decide(&req, &ctx("auto", None), &oracle()).unwrap();
        assert!(d.tier >= Tier::Medium);
        assert!(d.hard_filters.iter().any(|f| f.contains("tools present")));
        assert!(d.hard_filters.iter().any(|f| f == "needs tools"));
    }

    #[test]
    fn min_and_max_tier_clamp() {
        let r = router();
        let req = CreateResponseRequest::text("auto", "hi");
        let opts = RoutingOptions {
            min_tier: Some(Tier::Complex),
            ..Default::default()
        };
        let d = r
            .decide(&req, &ctx("auto", Some(&opts)), &oracle())
            .unwrap();
        assert_eq!(d.tier, Tier::Complex);
        assert_eq!(d.classified_tier, Tier::Simple);
        assert_eq!(d.selected, "gemini-3-pro-preview");

        let hard = CreateResponseRequest::text(
            "auto",
            "Prove the theorem, derive the bound and justify each step rigorously.",
        );
        let opts = RoutingOptions {
            max_tier: Some(Tier::Medium),
            ..Default::default()
        };
        let d = r
            .decide(&hard, &ctx("auto", Some(&opts)), &oracle())
            .unwrap();
        assert_eq!(d.classified_tier, Tier::Reasoning);
        assert_eq!(d.tier, Tier::Medium);
        assert!(d.hard_filters.iter().any(|f| f == "max_tier medium"));
    }

    #[test]
    fn allow_deny_lists_apply() {
        let r = router();
        let req = CreateResponseRequest::text("auto", "What is the capital of France?");
        let opts = RoutingOptions {
            allow: vec!["anthropic/*".into()],
            ..Default::default()
        };
        let d = r
            .decide(&req, &ctx("auto", Some(&opts)), &oracle())
            .unwrap();
        assert_eq!(d.selected, "claude-haiku-4-5");
        assert!(d.hard_filters.iter().any(|f| f == "allow/deny lists"));

        let opts = RoutingOptions {
            deny: vec!["google/*".into(), "openai/*".into()],
            ..Default::default()
        };
        let d = r
            .decide(&req, &ctx("auto", Some(&opts)), &oracle())
            .unwrap();
        assert_eq!(d.selected, "claude-haiku-4-5");
    }

    #[test]
    fn unhealthy_candidates_escalate() {
        let r = router();
        let mut o = oracle();
        o.blocked = vec![
            "gemini-3.1-flash-lite".into(),
            "gemini-3.5-flash".into(),
            "gpt-5.6-luna".into(),
        ];
        let req = CreateResponseRequest::text("auto", "hi");
        let d = r.decide(&req, &ctx("auto", None), &o).unwrap();
        assert_eq!(d.classified_tier, Tier::Simple);
        assert_eq!(d.tier, Tier::Medium);
        assert!(d.reason.starts_with("escalated from simple"));
    }

    #[test]
    fn nothing_eligible_is_an_error() {
        let r = router();
        let mut o = oracle();
        o.blocked = r.catalog().all_models();
        let req = CreateResponseRequest::text("auto", "hi");
        match r.decide(&req, &ctx("auto", None), &o) {
            Err(AutoRouteError::NoCandidate { tier, considered }) => {
                assert_eq!(tier, Tier::Simple);
                assert_eq!(considered, 12);
            }
            other => panic!("expected NoCandidate, got {:?}", other),
        }
    }

    fn tool_loop_request() -> CreateResponseRequest {
        let mut req = CreateResponseRequest::new(
            "auto",
            vec![InputItem::FunctionCallOutput {
                call_id: "call_1".into(),
                output: "{\"temp_c\": 12}".into(),
            }],
        );
        req.previous_response_id = Some("resp_1".into());
        req.tools = Some(vec![Tool::function(FunctionDefinition {
            name: "get_weather".into(),
            description: None,
            parameters: None,
            strict: None,
        })]);
        req
    }

    #[test]
    fn sticky_tool_loop_keeps_previous_model() {
        let r = router();
        let req = tool_loop_request();
        let mut c = ctx("auto", None);
        c.previous_model = Some("gpt-5.6-terra");
        let d = r.decide(&req, &c, &oracle()).unwrap();
        assert_eq!(d.selected, "gpt-5.6-terra");
        assert_eq!(d.tier, Tier::Complex);
        assert!(d.hard_filters.iter().any(|f| f == "sticky tool loop"));
        assert!(d.reason.contains("tool loop"));
    }

    #[test]
    fn sticky_does_not_keep_a_weaker_or_unhealthy_model() {
        let r = router();
        let req = tool_loop_request();
        // Tools floor puts this turn at medium; a simple-tier previous
        // model is not strong enough.
        let mut c = ctx("auto", None);
        c.previous_model = Some("gpt-5.6-luna");
        let d = r.decide(&req, &c, &oracle()).unwrap();
        assert_ne!(d.selected, "gpt-5.6-luna");
        assert!(!d.hard_filters.iter().any(|f| f == "sticky tool loop"));

        let mut o = oracle();
        o.blocked = vec!["gpt-5.6-terra".into()];
        let mut c = ctx("auto", None);
        c.previous_model = Some("gpt-5.6-terra");
        let d = r.decide(&req, &c, &o).unwrap();
        assert_ne!(d.selected, "gpt-5.6-terra");
    }

    #[test]
    fn sticky_ignores_a_previous_model_of_unknown_tier() {
        let r = router();
        let req = tool_loop_request();
        // A pinned model that is in no tier list has no known strength.
        let mut c = ctx("auto", None);
        c.previous_model = Some("some-unlisted-model");
        let d = r.decide(&req, &c, &oracle()).unwrap();
        assert_ne!(d.selected, "some-unlisted-model");
        assert!(!d.hard_filters.iter().any(|f| f == "sticky tool loop"));
        assert_eq!(d.boundaries, TierBoundaries::default());
    }

    #[test]
    fn tools_floor_wins_over_max_tier() {
        let r = router();
        let mut req = CreateResponseRequest::text("auto", "What's the weather?");
        req.tools = Some(vec![aura_types::Tool::function(
            aura_types::FunctionDefinition {
                name: "get_weather".into(),
                description: None,
                parameters: None,
                strict: None,
            },
        )]);
        let opts = RoutingOptions {
            max_tier: Some(Tier::Simple),
            ..Default::default()
        };
        let d = r
            .decide(&req, &ctx("auto", Some(&opts)), &oracle())
            .unwrap();
        assert_eq!(d.tier, Tier::Medium);
        assert!(d
            .hard_filters
            .iter()
            .any(|f| f.contains("overrides max_tier simple")));
    }

    #[test]
    fn sticky_can_be_disabled_per_request() {
        let r = router();
        let req = tool_loop_request();
        let opts = RoutingOptions {
            sticky: Some(false),
            ..Default::default()
        };
        let mut c = ctx("auto", Some(&opts));
        c.previous_model = Some("gpt-5.6-terra");
        let d = r.decide(&req, &c, &oracle()).unwrap();
        assert_eq!(d.selected, "gpt-5.4-mini");
    }

    #[test]
    fn classifier_override_replaces_tier_and_is_recorded() {
        let r = router();
        let req = CreateResponseRequest::text("auto", "hi");
        let d = r
            .decide_with_override(
                &req,
                &ctx("auto", None),
                &oracle(),
                Some(ClassifierOverride {
                    tier: Tier::Complex,
                    classifier: "llm@test".into(),
                    confidence: 0.9,
                }),
            )
            .unwrap();
        assert_eq!(d.classified_tier, Tier::Complex);
        assert_eq!(d.tier, Tier::Complex);
        assert_eq!(d.classifier, "llm@test");
        assert_eq!(d.signals.get("classifier_confidence"), Some(&0.9));
        assert!(d.reason.contains("heuristic said simple"));
        // The heuristic score is still there for comparison.
        assert!(d.raw_score < 0.0);
    }

    struct CostOracle;
    impl Eligibility for CostOracle {
        fn is_eligible(&self, _: &str) -> bool {
            true
        }
        fn blended_cost_per_million(&self, m: &str) -> Option<f64> {
            oracle().blended_cost_per_million(m)
        }
        fn provider_of(&self, m: &str) -> Option<String> {
            oracle().provider_of(m)
        }
        fn predicted_cost_usd(&self, model: &str) -> Option<f64> {
            // Everything in complex/reasoning is pricey; medium fits a
            // tight budget only on gpt-5.4-mini.
            Some(match model {
                "gpt-5.4-mini" => 0.0008,
                "gemini-3.8-flash" => 0.0015,
                "claude-sonnet-5" => 0.0090,
                "gpt-5.6-terra" => 0.0100,
                "gemini-3-pro-preview" => 0.0080,
                _ => 0.0500,
            })
        }
    }

    #[test]
    fn max_cost_budget_skips_expensive_candidates_and_falls_back() {
        let r = router();
        // Complex prompt with a budget only the medium tier can meet: the
        // catalog escalates up first (nothing fits), then falls down.
        let req = CreateResponseRequest::text(
            "auto",
            "Here is my code:\n```python\ndef f(x):\n    return x/0\n```\nIt raises an exception. Debug it and explain the root cause.",
        );
        let opts = RoutingOptions {
            max_cost_usd: Some(0.001),
            ..Default::default()
        };
        let d = r
            .decide(&req, &ctx("auto", Some(&opts)), &CostOracle)
            .unwrap();
        assert_eq!(d.classified_tier, Tier::Complex);
        assert_eq!(d.selected, "gpt-5.4-mini");
        assert_eq!(d.predicted_cost_usd, Some(0.0008));
        assert!(d.hard_filters.iter().any(|f| f.starts_with("max_cost_usd")));
        assert!(!d.reason.contains("budget ignored"));

        // A budget nothing can meet is ignored, and the reason says so.
        let opts = RoutingOptions {
            max_cost_usd: Some(0.0001),
            ..Default::default()
        };
        let d = r
            .decide(&req, &ctx("auto", Some(&opts)), &CostOracle)
            .unwrap();
        assert_eq!(d.tier, Tier::Complex);
        assert!(d.reason.contains("budget ignored"));
        assert!(d.predicted_cost_usd.is_some());
    }

    #[test]
    fn next_candidate_stays_in_tier_then_escalates() {
        let r = router();
        let req = CreateResponseRequest::text("auto", "What is the capital of France?");
        let mut d = r.decide(&req, &ctx("auto", None), &oracle()).unwrap();
        assert_eq!(d.selected, "gemini-3.1-flash-lite");

        // Same tier first: the next cheapest simple model.
        let failed = vec![d.selected.clone()];
        let sel = r.next_candidate(&d, None, &oracle(), &failed).unwrap();
        assert_eq!(sel.tier, Tier::Simple);
        assert_eq!(sel.model, "gemini-3.5-flash");
        AutoRouter::apply_escalation(&mut d, sel, "service_unavailable");
        assert_eq!(d.selected, "gemini-3.5-flash");
        assert_eq!(d.escalations.len(), 1);
        assert_eq!(d.escalations[0].from_model, "gemini-3.1-flash-lite");
        assert!(d
            .reason
            .contains("escalated from gemini-3.1-flash-lite after service_unavailable"));

        // Exhaust the tier: moves up to medium.
        let failed = vec![
            "gemini-3.1-flash-lite".to_string(),
            "gemini-3.5-flash".to_string(),
            "gpt-5.6-luna".to_string(),
        ];
        let sel = r.next_candidate(&d, None, &oracle(), &failed).unwrap();
        assert_eq!(sel.tier, Tier::Medium);

        // max_tier caps it.
        let opts = RoutingOptions {
            max_tier: Some(Tier::Simple),
            ..Default::default()
        };
        assert!(r
            .next_candidate(&d, Some(&opts), &oracle(), &failed)
            .is_none());
    }

    #[test]
    fn decision_serialises_for_metadata() {
        let r = router();
        let req = CreateResponseRequest::text("auto", "hi");
        let d = r.decide(&req, &ctx("auto", None), &oracle()).unwrap();
        let v = serde_json::to_value(&d).unwrap();
        assert_eq!(v["tier"], "simple");
        assert_eq!(v["mode"], "balanced");
        assert_eq!(v["classifier"], "heuristic@v1");
        assert!(v["features"]["est_input_tokens"].is_number());
        assert!(v["candidates"].as_array().unwrap().len() >= 3);
        assert!(v.get("selected_provider").is_some());
    }
}
