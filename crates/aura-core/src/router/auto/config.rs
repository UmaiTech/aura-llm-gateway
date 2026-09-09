//! Configuration for the complexity-based auto router.
//!
//! Lives under `routing.auto` in the gateway YAML config. Every field has a
//! default so an empty `auto: {}` block (or none at all) is valid; the
//! router is off unless `enabled: true`.

use aura_types::{ClassifierKind, RoutingMode, RoutingOptions, Tier};
use serde::{Deserialize, Serialize};

/// Top-level auto-routing configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AutoRoutingConfig {
    /// Master switch. When `false`, `model: "auto"` is rejected as an
    /// unknown model.
    pub enabled: bool,
    /// Mode used when neither the alias suffix nor the request sets one.
    pub default_mode: RoutingMode,
    /// Classifier used when the request doesn't pick one.
    pub default_classifier: ClassifierKind,
    /// Settings for the optional LLM classifier.
    pub llm_classifier: LlmClassifierConfig,
    /// When `true`, requests that pin a concrete model are still scored and
    /// the decision `auto` would have made is recorded (never applied).
    pub shadow_for_pinned_models: bool,
    /// Candidate models per tier, in preference order.
    pub tiers: TierModels,
    /// Score boundaries between tiers.
    pub boundaries: TierBoundaries,
    /// Score offsets per mode.
    pub mode_offsets: ModeOffsets,
    /// Feature weights for the heuristic scorer.
    pub weights: FeatureWeights,
    /// Token thresholds used by the token-count feature.
    pub token_thresholds: TokenThresholds,
    /// Keyword lists used by the heuristic scorer.
    pub keywords: KeywordLists,
    /// How to pick among the candidates of the chosen tier.
    pub within_tier: WithinTierStrategy,
    /// Pin the previous turn's model on tool-loop continuation turns.
    pub sticky_tool_loops: bool,
    /// Requests that carry tools never go below this tier.
    pub tools_min_tier: Option<Tier>,
    /// Number of distinct reasoning-marker hits that force the
    /// `reasoning` tier regardless of the weighted score.
    pub reasoning_override_matches: u32,
    /// Outcome rollup: how often the gateway scores past decisions from
    /// the conversation graph and refreshes arm statistics. `0` disables
    /// the background job (the admin endpoint can still trigger it).
    pub outcome_rollup_interval_secs: u64,
    /// Outcome rollup: decisions younger than this are skipped so the
    /// user's next turn has had time to arrive.
    pub outcome_grace_secs: u64,
    /// Outcome rollup: how far back arm statistics look.
    pub arm_stats_window_days: u32,
    /// Gold labels: fraction of eligible requests (0.0–1.0) whose prompt
    /// is also answered by the cheap and strong tiers in the background
    /// and graded by the judge model. `0` disables collection. Every
    /// sampled request costs two extra completions plus one judge call.
    pub gold_sample_rate: f64,
    /// Also sample requests that pinned a concrete model (shadow
    /// decisions). Off by default: sampling sends the prompt to other
    /// providers than the one the tenant chose.
    pub gold_sample_shadow: bool,
    /// Gold labels: model that grades the pair.
    pub gold_judge_model: String,
    /// Gold labels: characters of each text stored and sent to the judge.
    pub gold_max_text_chars: usize,
    /// Learned classifier: path to a weights JSON file produced by
    /// `scripts/router/train.py`, for gateways without a database or to
    /// pin a model. The active row in `router_models` takes precedence.
    pub learned_weights_file: Option<String>,
}

impl Default for AutoRoutingConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            default_mode: RoutingMode::Balanced,
            default_classifier: ClassifierKind::Heuristic,
            llm_classifier: LlmClassifierConfig::default(),
            shadow_for_pinned_models: true,
            tiers: TierModels::default(),
            boundaries: TierBoundaries::default(),
            mode_offsets: ModeOffsets::default(),
            weights: FeatureWeights::default(),
            token_thresholds: TokenThresholds::default(),
            keywords: KeywordLists::default(),
            within_tier: WithinTierStrategy::Cheapest,
            sticky_tool_loops: true,
            tools_min_tier: Some(Tier::Medium),
            reasoning_override_matches: 3,
            outcome_rollup_interval_secs: 900,
            outcome_grace_secs: 1800,
            arm_stats_window_days: 30,
            gold_sample_rate: 0.0,
            gold_sample_shadow: false,
            gold_judge_model: "claude-sonnet-4-6".to_string(),
            gold_max_text_chars: 4000,
            learned_weights_file: None,
        }
    }
}

impl AutoRoutingConfig {
    /// Drop tier candidates the gateway can't serve.
    ///
    /// `is_known` is asked once per configured model id. Returns the list of
    /// dropped ids so the caller can log them. Tiers left empty after
    /// pruning are still valid: selection escalates to a neighbouring tier.
    pub fn prune_unknown_models(&mut self, is_known: impl Fn(&str) -> bool) -> Vec<String> {
        let mut dropped = Vec::new();
        for tier in Tier::ALL {
            let list = self.tiers.get_mut(tier);
            list.retain(|m| {
                let keep = is_known(m);
                if !keep {
                    dropped.push(format!("{}:{}", tier, m));
                }
                keep
            });
        }
        dropped
    }

    /// True when at least one tier has a candidate.
    pub fn has_candidates(&self) -> bool {
        Tier::ALL.iter().any(|t| !self.tiers.get(*t).is_empty())
    }
}

/// Per-organization override, stored at `organizations.settings.routing.auto`.
///
/// Every field is optional; unset fields inherit the gateway config. The
/// admin app edits this object, and the proxy merges it under the
/// request's own `routing` options (request beats org beats gateway).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct OrgAutoRoutingOverride {
    /// Turn `model: "auto"` on or off for this organization.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    /// Score pinned-model requests for this organization.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow_for_pinned_models: Option<bool>,
    /// Default mode for this organization.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_mode: Option<RoutingMode>,
    /// Default classifier for this organization (A/B the learned model
    /// per org).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_classifier: Option<ClassifierKind>,
    /// Never route below this tier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_tier: Option<Tier>,
    /// Never route above this tier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tier: Option<Tier>,
    /// Only consider models matching these patterns.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub allow: Vec<String>,
    /// Never consider models matching these patterns.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub deny: Vec<String>,
}

impl OrgAutoRoutingOverride {
    /// Parse from an organization's `settings` JSON (`settings.routing.auto`).
    /// Missing or malformed sections yield the empty override.
    pub fn from_org_settings(settings: &serde_json::Value) -> Self {
        settings
            .get("routing")
            .and_then(|r| r.get("auto"))
            .cloned()
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default()
    }

    /// True when nothing is overridden.
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }

    /// Merge the organization override under the request's own options.
    ///
    /// Preferences follow request > alias > organization > gateway: the
    /// org's `default_mode` only applies when neither the request's
    /// `routing.mode` nor the `auto:<mode>` alias chose one. Policy
    /// bounds cannot be loosened by the request: `min_tier` is the
    /// stronger of the two, `max_tier` the weaker, deny lists concatenate,
    /// and the org's allow list is kept as `policy_allow` so both lists
    /// must permit a candidate.
    pub fn merged_with(
        &self,
        request: Option<&RoutingOptions>,
        alias_mode: Option<RoutingMode>,
    ) -> RoutingOptions {
        let req = request.cloned().unwrap_or_default();
        let mut deny = self.deny.clone();
        deny.extend(req.deny.iter().cloned());
        let min_tier = match (req.min_tier, self.min_tier) {
            (Some(r), Some(o)) => Some(r.max(o)),
            (r, o) => r.or(o),
        };
        let max_tier = match (req.max_tier, self.max_tier) {
            (Some(r), Some(o)) => Some(r.min(o)),
            (r, o) => r.or(o),
        };
        RoutingOptions {
            mode: req.mode.or(alias_mode).or(self.default_mode),
            min_tier,
            max_tier,
            allow: req.allow.clone(),
            policy_allow: self.allow.clone(),
            deny,
            sticky: req.sticky,
            classifier: req.classifier.or(self.default_classifier),
        }
    }
}

/// Settings for the LLM classifier (`classifier: llm`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LlmClassifierConfig {
    /// Model that classifies the request. Should be a fast, cheap model.
    pub model: String,
    /// Hard timeout; on expiry the heuristic result is used.
    pub timeout_ms: u64,
}

impl Default for LlmClassifierConfig {
    fn default() -> Self {
        Self {
            model: "claude-haiku-4-5".to_string(),
            timeout_ms: 800,
        }
    }
}

/// Candidate models per tier, in preference order.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct TierModels {
    /// Cheapest capable models.
    pub simple: Vec<String>,
    /// Everyday models.
    pub medium: Vec<String>,
    /// Frontier non-reasoning models.
    pub complex: Vec<String>,
    /// Deep-reasoning models.
    pub reasoning: Vec<String>,
}

impl Default for TierModels {
    fn default() -> Self {
        Self {
            simple: vec![
                "gemini-3.1-flash-lite".into(),
                "gpt-5.4-nano".into(),
                "claude-haiku-4-5".into(),
            ],
            medium: vec![
                "gemini-3.5-flash".into(),
                "gpt-5.4-mini".into(),
                "claude-sonnet-4-6".into(),
            ],
            complex: vec![
                "claude-sonnet-4-6".into(),
                "gpt-5.5".into(),
                "gemini-3.1-pro-preview".into(),
            ],
            reasoning: vec![
                "claude-opus-4-7".into(),
                "gpt-5.5-pro".into(),
                "o3-mini".into(),
            ],
        }
    }
}

impl TierModels {
    /// Candidates for a tier.
    pub fn get(&self, tier: Tier) -> &[String] {
        match tier {
            Tier::Simple => &self.simple,
            Tier::Medium => &self.medium,
            Tier::Complex => &self.complex,
            Tier::Reasoning => &self.reasoning,
        }
    }

    /// Mutable candidates for a tier.
    pub fn get_mut(&mut self, tier: Tier) -> &mut Vec<String> {
        match tier {
            Tier::Simple => &mut self.simple,
            Tier::Medium => &mut self.medium,
            Tier::Complex => &mut self.complex,
            Tier::Reasoning => &mut self.reasoning,
        }
    }

    /// The highest tier a model is listed in, if any.
    pub fn tier_of(&self, model: &str) -> Option<Tier> {
        Tier::ALL
            .iter()
            .rev()
            .copied()
            .find(|t| self.get(*t).iter().any(|m| m == model))
    }
}

/// Score boundaries between tiers (inclusive lower bound of the upper tier).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct TierBoundaries {
    /// Scores at or above this are at least `medium`.
    pub simple_medium: f64,
    /// Scores at or above this are at least `complex`.
    pub medium_complex: f64,
    /// Scores at or above this are `reasoning`.
    pub complex_reasoning: f64,
}

impl Default for TierBoundaries {
    fn default() -> Self {
        Self {
            simple_medium: 0.15,
            medium_complex: 0.35,
            complex_reasoning: 0.60,
        }
    }
}

impl TierBoundaries {
    /// Map a score in `[0, 1]` to a tier.
    pub fn tier_for(&self, score: f64) -> Tier {
        if score >= self.complex_reasoning {
            Tier::Reasoning
        } else if score >= self.medium_complex {
            Tier::Complex
        } else if score >= self.simple_medium {
            Tier::Medium
        } else {
            Tier::Simple
        }
    }
}

/// Score offsets per mode.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct ModeOffsets {
    /// Added to the score in `cost` mode (negative).
    pub cost: f64,
    /// Added to the score in `balanced` mode.
    pub balanced: f64,
    /// Added to the score in `quality` mode (positive).
    pub quality: f64,
}

impl Default for ModeOffsets {
    fn default() -> Self {
        Self {
            cost: -0.10,
            balanced: 0.0,
            quality: 0.15,
        }
    }
}

impl ModeOffsets {
    /// Offset for a mode.
    pub fn for_mode(&self, mode: RoutingMode) -> f64 {
        match mode {
            RoutingMode::Cost => self.cost,
            RoutingMode::Balanced => self.balanced,
            RoutingMode::Quality => self.quality,
        }
    }
}

/// Weights for the heuristic scorer. Feature values are in `[-1, 1]`; the
/// weighted sum is clamped to `[0, 1]`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct FeatureWeights {
    /// Estimated input token count (short ⇒ −1, long ⇒ +1).
    pub tokens: f64,
    /// Code presence.
    pub code: f64,
    /// Reasoning markers.
    pub reasoning: f64,
    /// Technical vocabulary.
    pub technical: f64,
    /// Simple-question indicators (negative feature).
    pub simple: f64,
    /// Multi-step instructions.
    pub multi_step: f64,
    /// Number of questions asked.
    pub questions: f64,
    /// Tools attached / required.
    pub tools: f64,
    /// Explicit user intent ("quick" ⇒ −1, "think hard" ⇒ +1).
    pub explicit_intent: f64,
    /// Request continues a conversation.
    pub continuation: f64,
    /// Large `max_output_tokens`.
    pub output_length: f64,
}

impl Default for FeatureWeights {
    fn default() -> Self {
        Self {
            tokens: 0.10,
            code: 0.30,
            reasoning: 0.25,
            technical: 0.25,
            simple: 0.05,
            multi_step: 0.03,
            questions: 0.02,
            tools: 0.15,
            explicit_intent: 0.30,
            continuation: 0.05,
            output_length: 0.05,
        }
    }
}

/// Token thresholds for the token-count feature.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct TokenThresholds {
    /// At or below this many estimated tokens the feature is −1.
    pub short: u32,
    /// At or above this many estimated tokens the feature is +1.
    pub long: u32,
    /// `max_output_tokens` at or above this counts as a long-output request.
    pub long_output: u32,
}

impl Default for TokenThresholds {
    fn default() -> Self {
        Self {
            short: 15,
            long: 400,
            long_output: 2000,
        }
    }
}

/// Keyword lists for the heuristic scorer. All matching is
/// case-insensitive; single words match on word boundaries, phrases match
/// as substrings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct KeywordLists {
    /// Programming vocabulary.
    pub code: Vec<String>,
    /// Phrases that ask for reasoning.
    pub reasoning: Vec<String>,
    /// Domain-specific technical vocabulary.
    pub technical: Vec<String>,
    /// Phrases typical of trivial requests.
    pub simple: Vec<String>,
    /// Phrases asking for a short answer.
    pub intent_quick: Vec<String>,
    /// Phrases asking for a thorough answer.
    pub intent_deep: Vec<String>,
}

impl Default for KeywordLists {
    fn default() -> Self {
        fn v(items: &[&str]) -> Vec<String> {
            items.iter().map(|s| s.to_string()).collect()
        }
        Self {
            code: v(&[
                "function",
                "class",
                "def",
                "import",
                "return",
                "const",
                "let",
                "var",
                "async",
                "await",
                "struct",
                "impl",
                "enum",
                "trait",
                "#include",
                "select",
                "from",
                "where",
                "join",
                "npm",
                "cargo",
                "pip",
                "git",
                "docker",
                "kubernetes",
                "stack trace",
                "traceback",
                "exception",
                "error:",
                "regex",
                "compile",
                "compiler",
                "refactor",
                "unit test",
                "debug",
                "bug",
                "endpoint",
                "json",
                "yaml",
                "sql",
                "typescript",
                "python",
                "rust",
                "javascript",
                "java",
                "golang",
                "c++",
                "html",
                "css",
                "react",
                "api",
                "cli",
                "script",
                "linter",
                "lint",
                "null pointer",
                "segfault",
                "panic",
                "undefined",
                "nan",
                "deploy",
                "ci/cd",
                "pipeline",
                "terraform",
                "helm",
            ]),
            reasoning: v(&[
                "step by step",
                "step-by-step",
                "think carefully",
                "explain your reasoning",
                "analyze",
                "analyse",
                "compare and contrast",
                "prove",
                "proof",
                "derive",
                "derivation",
                "calculate",
                "why does",
                "why is",
                "trade-off",
                "tradeoff",
                "reason about",
                "evaluate",
                "justify",
                "optimize",
                "optimise",
                "design a",
                "architecture",
                "algorithm",
                "complexity",
                "theorem",
                "hypothesis",
                "root cause",
                "pros and cons",
                "implications",
                "critique",
                "strategy",
            ]),
            technical: v(&[
                "distributed",
                "concurrency",
                "concurrent",
                "latency",
                "throughput",
                "encryption",
                "cryptography",
                "neural",
                "gradient",
                "tensor",
                "kernel",
                "protocol",
                "tcp",
                "http",
                "database",
                "index",
                "transaction",
                "schema",
                "migration",
                "microservice",
                "cache",
                "consensus",
                "raft",
                "paxos",
                "quantum",
                "differential",
                "integral",
                "matrix",
                "eigenvalue",
                "statistic",
                "statistical",
                "regression",
                "bayesian",
                "probability",
                "thermodynamic",
                "molecular",
                "genome",
                "pharmacokinetic",
                "jurisdiction",
                "liability",
                "amortization",
                "derivative",
                "arbitrage",
                "asynchronous",
                "idempotent",
                "invariant",
                "topology",
                "manifold",
                "entropy",
                "stochastic",
                "heuristic",
                "recursion",
                "recursive",
                "memoization",
                "amortized",
                "sharding",
                "replication",
                "quorum",
                "byzantine",
            ]),
            simple: v(&[
                "what is",
                "what's",
                "what are",
                "define",
                "definition of",
                "who is",
                "who was",
                "when did",
                "when was",
                "where is",
                "translate",
                "how do you say",
                "capital of",
                "synonym",
                "antonym",
                "spell",
                "rewrite this sentence",
                "fix the grammar",
                "correct the grammar",
                "hello",
                "hi there",
                "thanks",
                "thank you",
                "yes or no",
                "meaning of",
                "how many",
                "how old",
                "convert",
            ]),
            intent_quick: v(&[
                "quick answer",
                "quickly",
                "briefly",
                "brief",
                "one word",
                "one sentence",
                "in a sentence",
                "short answer",
                "tl;dr",
                "tldr",
                "just tell me",
                "no explanation",
                "keep it short",
                "in short",
            ]),
            intent_deep: v(&[
                "think hard",
                "think deeply",
                "think carefully",
                "thorough",
                "thoroughly",
                "in depth",
                "in-depth",
                "detailed analysis",
                "comprehensive",
                "rigorous",
                "rigorously",
                "exhaustive",
                "take your time",
                "double-check",
                "double check",
                "be careful",
                "carefully",
            ]),
        }
    }
}

/// How to pick among the candidates of the chosen tier.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum WithinTierStrategy {
    /// Lowest blended price among eligible candidates; config order breaks
    /// ties and models without a known price come last.
    #[default]
    Cheapest,
    /// Configured order, first eligible wins.
    ConfigOrder,
    /// Rotate through eligible candidates.
    RoundRobin,
    /// Thompson sampling over per-(tier, model) outcome statistics learned
    /// from the routing decision log; unknown models use a uniform prior.
    Thompson,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_off_and_populated() {
        let cfg = AutoRoutingConfig::default();
        assert!(!cfg.enabled);
        assert!(cfg.has_candidates());
        assert_eq!(cfg.tiers.tier_of("gpt-5.4-nano"), Some(Tier::Simple));
        // claude-sonnet-4-6 appears in medium and complex: highest wins.
        assert_eq!(cfg.tiers.tier_of("claude-sonnet-4-6"), Some(Tier::Complex));
        assert_eq!(cfg.tiers.tier_of("nope"), None);
    }

    #[test]
    fn boundaries_map_scores() {
        let b = TierBoundaries::default();
        assert_eq!(b.tier_for(0.0), Tier::Simple);
        assert_eq!(b.tier_for(0.149), Tier::Simple);
        assert_eq!(b.tier_for(0.15), Tier::Medium);
        assert_eq!(b.tier_for(0.35), Tier::Complex);
        assert_eq!(b.tier_for(0.6), Tier::Reasoning);
        assert_eq!(b.tier_for(1.0), Tier::Reasoning);
    }

    #[test]
    fn prune_drops_unknown_models() {
        let mut cfg = AutoRoutingConfig::default();
        let dropped = cfg.prune_unknown_models(|m| m.starts_with("gpt-"));
        assert!(dropped.iter().any(|d| d == "simple:claude-haiku-4-5"));
        assert_eq!(cfg.tiers.simple, vec!["gpt-5.4-nano".to_string()]);
        assert_eq!(cfg.tiers.reasoning, vec!["gpt-5.5-pro".to_string()]);
        assert!(cfg.has_candidates());

        let mut none = AutoRoutingConfig::default();
        none.prune_unknown_models(|_| false);
        assert!(!none.has_candidates());
    }

    #[test]
    fn org_override_parses_and_merges() {
        let settings = serde_json::json!({
            "capture_payloads": true,
            "routing": {"auto": {"enabled": true, "default_mode": "cost", "max_tier": "complex",
                                  "deny": ["*-preview"]}}
        });
        let o = OrgAutoRoutingOverride::from_org_settings(&settings);
        assert_eq!(o.enabled, Some(true));
        assert_eq!(o.default_mode, Some(RoutingMode::Cost));
        assert_eq!(o.max_tier, Some(Tier::Complex));
        assert!(!o.is_empty());

        let req = RoutingOptions {
            mode: Some(RoutingMode::Quality),
            deny: vec!["google/*".into()],
            ..Default::default()
        };
        let merged = o.merged_with(Some(&req), None);
        assert_eq!(merged.mode, Some(RoutingMode::Quality), "request wins");
        assert_eq!(merged.max_tier, Some(Tier::Complex), "org fills the gap");
        // The alias beats the org default; the org default only fills a gap.
        let bare = RoutingOptions::default();
        assert_eq!(
            o.merged_with(Some(&bare), Some(RoutingMode::Quality)).mode,
            Some(RoutingMode::Quality)
        );
        assert_eq!(o.merged_with(None, None).mode, Some(RoutingMode::Cost));
        // Policy bounds cannot be loosened: the request's max_tier is capped.
        let loose = RoutingOptions {
            max_tier: Some(Tier::Reasoning),
            allow: vec!["openai/*".into()],
            ..Default::default()
        };
        let m = o.merged_with(Some(&loose), None);
        assert_eq!(m.max_tier, Some(Tier::Complex));
        assert_eq!(m.allow, vec!["openai/*".to_string()]);
        assert!(m.policy_allow.is_empty());
        let strict = OrgAutoRoutingOverride {
            allow: vec!["anthropic/*".into()],
            min_tier: Some(Tier::Medium),
            ..Default::default()
        };
        let m = strict.merged_with(Some(&loose), None);
        assert_eq!(m.policy_allow, vec!["anthropic/*".to_string()]);
        assert!(!m.permits("openai", "gpt-5.5"), "org policy still applies");
        assert_eq!(m.min_tier, Some(Tier::Medium));
        assert_eq!(
            merged.deny,
            vec!["*-preview".to_string(), "google/*".to_string()]
        );

        let none = OrgAutoRoutingOverride::from_org_settings(&serde_json::json!({"x": 1}));
        assert!(none.is_empty());
        assert_eq!(none.merged_with(None, None), RoutingOptions::default());
    }

    #[test]
    fn yaml_partial_override() {
        let yaml = r#"
enabled: true
default_mode: cost
tiers:
  simple: [gpt-5.4-nano]
boundaries:
  simple_medium: 0.2
within_tier: round_robin
"#;
        let cfg: AutoRoutingConfig = serde_yaml::from_str(yaml).unwrap();
        assert!(cfg.enabled);
        assert_eq!(cfg.default_mode, RoutingMode::Cost);
        assert_eq!(cfg.tiers.simple, vec!["gpt-5.4-nano".to_string()]);
        // Untouched tiers keep defaults.
        assert_eq!(cfg.tiers.medium, TierModels::default().medium);
        assert_eq!(cfg.boundaries.simple_medium, 0.2);
        assert_eq!(cfg.boundaries.medium_complex, 0.35);
        assert_eq!(cfg.within_tier, WithinTierStrategy::RoundRobin);
    }
}
