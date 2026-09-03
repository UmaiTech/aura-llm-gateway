//! Heuristic complexity scorer.
//!
//! Combines `RequestFeatures` into a single `[0, 1]` score with configurable
//! weights, applies the mode offset and the tier boundaries, and reports
//! which signals fired so the decision explains itself.

use super::config::AutoRoutingConfig;
use super::features::{IntentHint, RequestFeatures};
use aura_types::{RoutingMode, Tier};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Version tag recorded with every heuristic decision. Bump when weights,
/// features or keyword defaults change in a way that shifts scores.
pub const HEURISTIC_VERSION: &str = "heuristic@v1";

/// Output of the scorer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScoreResult {
    /// Weighted sum before the mode offset, clamped to `[0, 1]`.
    pub raw_score: f64,
    /// Score after the mode offset, clamped to `[0, 1]`. This is what the
    /// tier boundaries are applied to.
    pub score: f64,
    /// Tier from the boundaries (before request-level clamps and floors).
    pub tier: Tier,
    /// Per-feature contributions (`weight × value`), only non-zero ones.
    pub signals: BTreeMap<String, f64>,
    /// Human-readable notes about overrides that fired.
    pub notes: Vec<String>,
}

/// Rule-based scorer.
#[derive(Debug, Clone)]
pub struct HeuristicScorer {
    weights: super::config::FeatureWeights,
    thresholds: super::config::TokenThresholds,
    boundaries: super::config::TierBoundaries,
    offsets: super::config::ModeOffsets,
    reasoning_override_matches: u32,
}

fn clamp01(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}

impl HeuristicScorer {
    /// Build a scorer from config.
    pub fn new(config: &AutoRoutingConfig) -> Self {
        Self {
            weights: config.weights,
            thresholds: config.token_thresholds,
            boundaries: config.boundaries,
            offsets: config.mode_offsets,
            reasoning_override_matches: config.reasoning_override_matches,
        }
    }

    /// Token-count feature in `[-1, 1]`.
    ///
    /// At or below the short threshold the prompt is a strong "simple"
    /// signal (−1). Between the thresholds the feature rises linearly from
    /// 0 to 1; at or above the long threshold it is 1.
    fn token_feature(&self, tokens: u32) -> f64 {
        let short = f64::from(self.thresholds.short);
        let long = f64::from(self.thresholds.long).max(short + 1.0);
        let t = f64::from(tokens);
        if t <= short {
            -1.0
        } else {
            ((t - short) / (long - short)).clamp(0.0, 1.0)
        }
    }

    /// Score a feature vector under a mode.
    pub fn score(&self, f: &RequestFeatures, mode: RoutingMode) -> ScoreResult {
        let w = &self.weights;
        let mut signals = BTreeMap::new();
        let mut notes = Vec::new();

        let mut add = |name: &str, weight: f64, value: f64| -> f64 {
            let c = weight * value;
            if c.abs() > f64::EPSILON {
                signals.insert(name.to_string(), (c * 1000.0).round() / 1000.0);
            }
            c
        };

        let mut raw = 0.0;
        raw += add("tokens", w.tokens, self.token_feature(f.est_input_tokens));
        raw += add("code", w.code, f.code);
        raw += add("reasoning", w.reasoning, f.reasoning);
        raw += add("technical", w.technical, f.technical);
        raw += add("simple", w.simple, -f.simple);
        raw += add("multi_step", w.multi_step, f.multi_step);
        raw += add(
            "questions",
            w.questions,
            if f.question_marks > 3 { 0.5 } else { 0.0 },
        );
        let tools_value = if f.tool_required {
            1.0
        } else if f.tool_count > 0 {
            0.5
        } else {
            0.0
        };
        raw += add("tools", w.tools, tools_value);
        let intent_value = match f.explicit_intent {
            Some(IntentHint::Quick) => -1.0,
            Some(IntentHint::Deep) => 1.0,
            None => 0.0,
        };
        raw += add("explicit_intent", w.explicit_intent, intent_value);
        raw += add(
            "continuation",
            w.continuation,
            if f.is_continuation { 0.5 } else { 0.0 },
        );
        let long_output = f
            .max_output_tokens
            .map(|m| m >= self.thresholds.long_output)
            .unwrap_or(false);
        raw += add(
            "output_length",
            w.output_length,
            if long_output { 0.5 } else { 0.0 },
        );

        let raw_score = clamp01(raw);
        let offset = self.offsets.for_mode(mode);
        let score = clamp01(raw_score + offset);
        if offset.abs() > f64::EPSILON {
            signals.insert("mode_offset".to_string(), offset);
        }

        let mut tier = self.boundaries.tier_for(score);

        if self.reasoning_override_matches > 0
            && f.reasoning_matches >= self.reasoning_override_matches
            && f.explicit_intent != Some(IntentHint::Quick)
        {
            if tier < Tier::Reasoning {
                notes.push(format!(
                    "reasoning override: {} reasoning markers",
                    f.reasoning_matches
                ));
            }
            tier = Tier::Reasoning;
        }

        ScoreResult {
            raw_score: (raw_score * 1000.0).round() / 1000.0,
            score: (score * 1000.0).round() / 1000.0,
            tier,
            signals,
            notes,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::config::KeywordLists;
    use super::super::features::{extract_features, KeywordMatcher};
    use super::*;
    use aura_types::CreateResponseRequest;

    fn scorer() -> HeuristicScorer {
        HeuristicScorer::new(&AutoRoutingConfig::default())
    }

    fn score_text(text: &str, mode: RoutingMode) -> ScoreResult {
        let cfg = AutoRoutingConfig::default();
        let matcher = KeywordMatcher::new(&KeywordLists::default());
        let req = CreateResponseRequest::text("auto", text);
        let f = extract_features(&req, &matcher, &cfg.token_thresholds);
        scorer().score(&f, mode)
    }

    #[test]
    fn token_feature_is_linear_and_clamped() {
        let s = scorer();
        assert_eq!(s.token_feature(0), -1.0);
        assert_eq!(s.token_feature(15), -1.0);
        assert!(s.token_feature(16) < 0.01);
        assert_eq!(s.token_feature(400), 1.0);
        assert_eq!(s.token_feature(10_000), 1.0);
        let mid = s.token_feature(208);
        assert!((mid - 0.5).abs() < 0.01, "mid={}", mid);
    }

    #[test]
    fn fixture_prompts_land_in_expected_tiers() {
        let cases: &[(&str, Tier)] = &[
            ("What is the capital of France?", Tier::Simple),
            ("Translate 'good morning' to Spanish.", Tier::Simple),
            ("hi", Tier::Simple),
            (
                "Write a Python function that parses a CSV file and returns the rows as dicts. Include a unit test.",
                Tier::Medium,
            ),
            (
                "Here is my code:\n```python\ndef f(x):\n    return x/0\n```\nIt raises an exception. Debug it and explain the root cause.",
                Tier::Complex,
            ),
            (
                "Compare and contrast Raft and Paxos consensus protocols. Analyze the trade-offs for a distributed database with strong consistency, justify which one you would pick, and prove the safety property step by step.",
                Tier::Reasoning,
            ),
        ];
        for (prompt, expected) in cases {
            let r = score_text(prompt, RoutingMode::Balanced);
            assert_eq!(
                r.tier, *expected,
                "prompt {:?} scored {} ({:?}) expected {:?}",
                prompt, r.score, r.signals, expected
            );
        }
    }

    #[test]
    fn mode_offsets_shift_the_tier() {
        let prompt = "Write a Python function that parses a CSV file and returns the rows as dicts. Include a unit test.";
        let balanced = score_text(prompt, RoutingMode::Balanced);
        let cost = score_text(prompt, RoutingMode::Cost);
        let quality = score_text(prompt, RoutingMode::Quality);
        assert!(cost.score < balanced.score);
        assert!(quality.score > balanced.score);
        assert!(cost.tier <= balanced.tier);
        assert!(quality.tier >= balanced.tier);
        assert_eq!(cost.signals.get("mode_offset"), Some(&-0.10));
    }

    #[test]
    fn explicit_quick_intent_pulls_down_and_blocks_override() {
        let deep = score_text(
            "Prove, derive and justify: analyze why the algorithm is optimal. Evaluate its complexity.",
            RoutingMode::Balanced,
        );
        assert_eq!(deep.tier, Tier::Reasoning);
        let quick = score_text(
            "Briefly, in one sentence: prove, derive and justify why the algorithm is optimal. Evaluate its complexity.",
            RoutingMode::Balanced,
        );
        assert!(quick.score < deep.score);
        assert_ne!(quick.tier, Tier::Reasoning);
    }

    #[test]
    fn reasoning_override_note_is_recorded() {
        let r = score_text(
            "Prove the theorem, derive the bound and justify each step.",
            RoutingMode::Cost,
        );
        assert_eq!(r.tier, Tier::Reasoning);
        assert!(r.notes.iter().any(|n| n.contains("reasoning override")));
    }

    #[test]
    fn signals_only_include_non_zero_contributions() {
        let r = score_text("hi", RoutingMode::Balanced);
        assert!(r.signals.contains_key("tokens"));
        assert!(!r.signals.contains_key("code"));
        assert!(!r.signals.contains_key("tools"));
    }
}
