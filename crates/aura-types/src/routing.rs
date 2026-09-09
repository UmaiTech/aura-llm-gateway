//! Auto model routing types (Aura extension)
//!
//! These types describe the request-side surface of the complexity-based
//! auto router: the `model: "auto"` alias, its `auto:<mode>` sugar, the
//! optional `routing` object on `CreateResponseRequest`, and the tier
//! vocabulary shared between the request, the router and the recorded
//! decision.
//!
//! The router itself lives in `aura-core::router::auto`; this module only
//! carries the wire types so that `aura-types` stays dependency-free.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// The model alias that turns on automatic model selection.
pub const AUTO_MODEL_ALIAS: &str = "auto";

/// Complexity tier a request is classified into.
///
/// Tiers are ordered: `Simple < Medium < Complex < Reasoning`. A higher tier
/// maps to more capable (and more expensive) candidate models.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, ToSchema,
)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    /// Short factual questions, rewrites, translations, greetings.
    Simple,
    /// Everyday assistant work, light code, tool calls.
    Medium,
    /// Multi-step engineering work, long context, hard analysis.
    Complex,
    /// Explicit deep reasoning, proofs, derivations, research.
    Reasoning,
}

impl Tier {
    /// All tiers in ascending order of capability.
    pub const ALL: [Tier; 4] = [Tier::Simple, Tier::Medium, Tier::Complex, Tier::Reasoning];

    /// The next tier up, if any.
    pub fn up(self) -> Option<Tier> {
        match self {
            Tier::Simple => Some(Tier::Medium),
            Tier::Medium => Some(Tier::Complex),
            Tier::Complex => Some(Tier::Reasoning),
            Tier::Reasoning => None,
        }
    }

    /// The next tier down, if any.
    pub fn down(self) -> Option<Tier> {
        match self {
            Tier::Simple => None,
            Tier::Medium => Some(Tier::Simple),
            Tier::Complex => Some(Tier::Medium),
            Tier::Reasoning => Some(Tier::Complex),
        }
    }

    /// Stable lowercase name used in metadata, metrics and the database.
    pub fn as_str(self) -> &'static str {
        match self {
            Tier::Simple => "simple",
            Tier::Medium => "medium",
            Tier::Complex => "complex",
            Tier::Reasoning => "reasoning",
        }
    }

    /// Parse a tier name (case-insensitive).
    pub fn parse(s: &str) -> Option<Tier> {
        match s.trim().to_ascii_lowercase().as_str() {
            "simple" => Some(Tier::Simple),
            "medium" => Some(Tier::Medium),
            "complex" => Some(Tier::Complex),
            "reasoning" => Some(Tier::Reasoning),
            _ => None,
        }
    }
}

impl std::fmt::Display for Tier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Cost/quality preference for auto routing.
///
/// Modes are implemented as an offset on the complexity score, so one
/// classifier serves all three (the same trick Cursor Router uses for its
/// Cost / Balance / Intelligence settings).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, Default)]
#[serde(rename_all = "lowercase")]
pub enum RoutingMode {
    /// Prefer cheaper models; only clearly hard requests move up a tier.
    Cost,
    /// Neutral offset.
    #[default]
    Balanced,
    /// Prefer stronger models; borderline requests move up a tier.
    Quality,
}

impl RoutingMode {
    /// Stable lowercase name.
    pub fn as_str(self) -> &'static str {
        match self {
            RoutingMode::Cost => "cost",
            RoutingMode::Balanced => "balanced",
            RoutingMode::Quality => "quality",
        }
    }

    /// Parse a mode name (case-insensitive).
    pub fn parse(s: &str) -> Option<RoutingMode> {
        match s.trim().to_ascii_lowercase().as_str() {
            "cost" | "cheap" => Some(RoutingMode::Cost),
            "balanced" | "balance" => Some(RoutingMode::Balanced),
            "quality" | "intelligence" => Some(RoutingMode::Quality),
            _ => None,
        }
    }
}

impl std::fmt::Display for RoutingMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Which classifier produces the complexity score.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, Default)]
#[serde(rename_all = "lowercase")]
pub enum ClassifierKind {
    /// Rule-based weighted scoring, sub-millisecond, no external calls.
    #[default]
    Heuristic,
    /// A small LLM call that returns a tier; falls back to heuristic.
    Llm,
    /// A model trained offline on routing outcomes; falls back to heuristic.
    Learned,
}

impl ClassifierKind {
    /// Stable lowercase name.
    pub fn as_str(self) -> &'static str {
        match self {
            ClassifierKind::Heuristic => "heuristic",
            ClassifierKind::Llm => "llm",
            ClassifierKind::Learned => "learned",
        }
    }
}

/// Result of parsing a request's `model` field for the auto alias.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AutoModelAlias {
    /// Mode given inline as `auto:<mode>`, if any.
    pub mode: Option<RoutingMode>,
}

/// Parse `"auto"` / `"auto:cost"` / `"auto:balanced"` / `"auto:quality"`.
///
/// Returns `None` for any other model string, including `auto:<unknown>`
/// (which is treated as a plain, unroutable model name so that the request
/// fails with `model_not_found` instead of silently routing).
pub fn parse_auto_model(model: &str) -> Option<AutoModelAlias> {
    let model = model.trim();
    if model.eq_ignore_ascii_case(AUTO_MODEL_ALIAS) {
        return Some(AutoModelAlias { mode: None });
    }
    let (head, tail) = model.split_once(':')?;
    if !head.eq_ignore_ascii_case(AUTO_MODEL_ALIAS) {
        return None;
    }
    RoutingMode::parse(tail).map(|mode| AutoModelAlias { mode: Some(mode) })
}

/// Per-request routing options (Aura extension).
///
/// Sent as a top-level `routing` object next to `validation`, `consistency`
/// and `compression`. Every field is optional; the organization / gateway
/// defaults fill the gaps.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema, Default)]
#[serde(default)]
pub struct RoutingOptions {
    /// Cost/quality preference. Overrides the `auto:<mode>` alias suffix.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<RoutingMode>,

    /// Never route below this tier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_tier: Option<Tier>,

    /// Never route above this tier (budget guard).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tier: Option<Tier>,

    /// Only consider models matching one of these patterns.
    ///
    /// Patterns are matched against the model id and `provider/model`.
    /// A trailing `*` is a prefix wildcard (`anthropic/*`, `gpt-5.4-*`).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub allow: Vec<String>,

    /// Never consider models matching one of these patterns.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub deny: Vec<String>,

    /// Keep the previous turn's model when this request continues a tool
    /// loop (has `function_call_output` items and `previous_response_id`).
    /// Defaults to the gateway setting (`true`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sticky: Option<bool>,
    /// Second allow list applied by organization policy; a candidate must
    /// be permitted by both `allow` and this list. Never on the wire: the
    /// gateway fills it from the organization override.
    #[serde(skip)]
    pub policy_allow: Vec<String>,

    /// Which classifier to use for this request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub classifier: Option<ClassifierKind>,

    /// Budget for this request in USD. Candidates whose predicted cost
    /// (from the learned cost model) exceeds it are skipped; when none fit,
    /// the budget is ignored and the decision says so.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_cost_usd: Option<f64>,
}

/// `*` matches any run of characters (including none) anywhere in the
/// pattern: `anthropic/*`, `*-preview`, `gpt-5.4-*`, `*/gemini-*`.
fn glob_matches(pattern: &str, text: &str) -> bool {
    let parts: Vec<&str> = pattern.split('*').collect();
    let (first, last) = (parts[0], parts[parts.len() - 1]);
    if !text.starts_with(first) || !text.ends_with(last) {
        return false;
    }
    if parts.len() == 2 {
        return text.len() >= first.len() + last.len();
    }
    // Middle segments must appear in order between the fixed ends.
    let mut pos = first.len();
    let end = text.len() - last.len();
    for seg in &parts[1..parts.len() - 1] {
        if seg.is_empty() {
            continue;
        }
        match text[pos..end].find(seg) {
            Some(i) => pos += i + seg.len(),
            None => return false,
        }
    }
    true
}

impl RoutingOptions {
    /// Returns true when a pattern matches a model id or `provider/model`.
    ///
    /// Matching is case-insensitive. A trailing `*` matches any suffix; a
    /// bare `*` matches everything.
    pub fn pattern_matches(pattern: &str, provider: &str, model: &str) -> bool {
        let pattern = pattern.trim().to_ascii_lowercase();
        if pattern.is_empty() {
            return false;
        }
        let model_l = model.to_ascii_lowercase();
        let qualified = format!("{}/{}", provider.to_ascii_lowercase(), model_l);
        if pattern == "*" {
            return true;
        }
        if !pattern.contains('*') {
            return model_l == pattern || qualified == pattern;
        }
        glob_matches(&pattern, &model_l) || glob_matches(&pattern, &qualified)
    }

    /// Apply the allow / deny lists to a candidate.
    pub fn permits(&self, provider: &str, model: &str) -> bool {
        if self
            .deny
            .iter()
            .any(|p| Self::pattern_matches(p, provider, model))
        {
            return false;
        }
        let allowed = |list: &[String]| {
            list.is_empty()
                || list
                    .iter()
                    .any(|p| Self::pattern_matches(p, provider, model))
        };
        allowed(&self.allow) && allowed(&self.policy_allow)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tier_ordering_and_neighbours() {
        assert!(Tier::Simple < Tier::Medium);
        assert!(Tier::Complex < Tier::Reasoning);
        assert_eq!(Tier::Simple.up(), Some(Tier::Medium));
        assert_eq!(Tier::Reasoning.up(), None);
        assert_eq!(Tier::Simple.down(), None);
        assert_eq!(Tier::Reasoning.down(), Some(Tier::Complex));
        assert_eq!(Tier::parse("COMPLEX"), Some(Tier::Complex));
        assert_eq!(Tier::parse("nope"), None);
    }

    #[test]
    fn parses_auto_alias() {
        assert_eq!(
            parse_auto_model("auto"),
            Some(AutoModelAlias { mode: None })
        );
        assert_eq!(
            parse_auto_model("AUTO"),
            Some(AutoModelAlias { mode: None })
        );
        assert_eq!(
            parse_auto_model("auto:cost"),
            Some(AutoModelAlias {
                mode: Some(RoutingMode::Cost)
            })
        );
        assert_eq!(
            parse_auto_model("auto:quality"),
            Some(AutoModelAlias {
                mode: Some(RoutingMode::Quality)
            })
        );
        assert_eq!(parse_auto_model("auto:turbo"), None);
        assert_eq!(parse_auto_model("gpt-4o"), None);
        assert_eq!(parse_auto_model("automatic"), None);
    }

    #[test]
    fn serde_round_trip() {
        let opts = RoutingOptions {
            mode: Some(RoutingMode::Cost),
            min_tier: Some(Tier::Medium),
            max_tier: None,
            allow: vec!["anthropic/*".into()],
            deny: vec![],
            policy_allow: vec![],
            sticky: Some(false),
            classifier: Some(ClassifierKind::Heuristic),
            max_cost_usd: Some(0.01),
        };
        let json = serde_json::to_string(&opts).unwrap();
        assert!(json.contains("\"mode\":\"cost\""));
        assert!(json.contains("\"min_tier\":\"medium\""));
        assert!(!json.contains("max_tier"));
        let back: RoutingOptions = serde_json::from_str(&json).unwrap();
        assert_eq!(back, opts);

        let empty: RoutingOptions = serde_json::from_str("{}").unwrap();
        assert_eq!(empty, RoutingOptions::default());
    }

    #[test]
    fn allow_deny_patterns() {
        assert!(RoutingOptions::pattern_matches(
            "anthropic/*",
            "anthropic",
            "claude-haiku-4-5"
        ));
        assert!(RoutingOptions::pattern_matches(
            "gpt-5.4-*",
            "openai",
            "gpt-5.4-mini"
        ));
        assert!(RoutingOptions::pattern_matches(
            "*",
            "openai",
            "gpt-5.4-mini"
        ));
        assert!(!RoutingOptions::pattern_matches(
            "openai/*",
            "anthropic",
            "claude-haiku-4-5"
        ));
        assert!(RoutingOptions::pattern_matches(
            "GPT-5.6-Sol",
            "openai",
            "gpt-5.6-sol"
        ));
        // Suffix and infix wildcards.
        assert!(RoutingOptions::pattern_matches(
            "*-preview",
            "google",
            "gemini-3-pro-preview"
        ));
        assert!(!RoutingOptions::pattern_matches(
            "*-preview",
            "google",
            "gemini-3.5-flash"
        ));
        assert!(RoutingOptions::pattern_matches(
            "*/gemini-*",
            "google",
            "gemini-3.5-flash"
        ));
        assert!(RoutingOptions::pattern_matches(
            "gpt-*-mini",
            "openai",
            "gpt-5.4-mini"
        ));
        assert!(!RoutingOptions::pattern_matches(
            "gpt-*-mini",
            "openai",
            "gpt-5.4-nano"
        ));

        let opts = RoutingOptions {
            allow: vec!["anthropic/*".into(), "gpt-5.4-mini".into()],
            deny: vec!["*-preview".into(), "claude-opus-*".into()],
            ..Default::default()
        };
        assert!(opts.permits("anthropic", "claude-sonnet-5"));
        assert!(!opts.permits("anthropic", "claude-opus-5"));
        assert!(opts.permits("openai", "gpt-5.4-mini"));
        assert!(!opts.permits("openai", "gpt-5.6-sol"));
        assert!(!opts.permits("google", "gemini-3-pro-preview"));

        // Organization policy narrows what the request may allow.
        let policy = RoutingOptions {
            allow: vec!["openai/*".into()],
            policy_allow: vec!["anthropic/*".into()],
            ..Default::default()
        };
        assert!(!policy.permits("openai", "gpt-5.5"));
        assert!(!policy.permits("anthropic", "claude-sonnet-4-6"));
        let policy_only = RoutingOptions {
            policy_allow: vec!["anthropic/*".into()],
            ..Default::default()
        };
        assert!(policy_only.permits("anthropic", "claude-sonnet-4-6"));
        assert!(!policy_only.permits("openai", "gpt-5.5"));

        let deny_only = RoutingOptions {
            deny: vec!["google/*".into()],
            ..Default::default()
        };
        assert!(deny_only.permits("openai", "gpt-5.6-sol"));
        assert!(!deny_only.permits("google", "gemini-3.5-flash"));
    }
}
