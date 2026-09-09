//! Gateway-wide runtime settings.
//!
//! The boot configuration ([`crate::Config`]) comes from a YAML file and
//! the environment and cannot change while the process runs. This module
//! holds the small set of knobs the admin app may flip at runtime: they
//! are stored as one JSON document (`gateway_settings` table), layered
//! over the boot values and applied immediately.
//!
//! Every field is optional. `None` means "inherit the boot value", so the
//! document only ever records what an operator deliberately changed.

use serde::{Deserialize, Serialize};

use crate::router::auto::{AutoRoutingConfig, TierModels, WithinTierStrategy};
use aura_types::{ClassifierKind, RoutingMode};

/// Longest response-cache TTL an operator may set (7 days).
pub const MAX_CACHE_TTL_SECS: u64 = 7 * 24 * 60 * 60;

/// Runtime overrides layered over the boot configuration.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct GatewaySettings {
    /// Auto-routing switches (`routing.auto` in the YAML file).
    pub routing: RoutingSettings,
    /// Feature flags otherwise controlled by environment variables.
    pub features: FeatureSettings,
    /// Response cache (requires Redis).
    pub cache: CacheSettings,
    /// Per-key rate limiting (requires Redis).
    pub rate_limit: RateLimitSettings,
}

/// Overrides for `routing.auto`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct RoutingSettings {
    /// Accept `model: "auto"` at all (`AURA_AUTO_ROUTING`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    /// Score pinned-model requests and record what `auto` would have done.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow_for_pinned_models: Option<bool>,
    /// Mode for bare `auto`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_mode: Option<RoutingMode>,
    /// Classifier for requests that do not choose one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_classifier: Option<ClassifierKind>,
    /// How to pick among a tier's candidates.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub within_tier: Option<WithinTierStrategy>,
    /// Keep the previous turn's model inside a tool loop.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sticky_tool_loops: Option<bool>,
    /// Replace the tier lists. Send all four: a tier left out falls back
    /// to the built-in default list, not the boot configuration. Models
    /// the gateway cannot serve are dropped when the router is rebuilt,
    /// and reported back.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tiers: Option<TierModels>,
    /// Model used by `classifier: llm`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub llm_classifier_model: Option<String>,
    /// Share of eligible requests sampled for gold labels, 0 to 1.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gold_sample_rate: Option<f64>,
    /// Retry one tier up after a provider failure.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub escalation_enabled: Option<bool>,
}

/// Overrides for feature flags.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct FeatureSettings {
    /// Top-level kill switch for payload capture (`AURA_PAYLOAD_CAPTURE`).
    /// Organizations still opt in individually.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload_capture: Option<bool>,
    /// Re-synthesize prior tool calls from `previous_response_id`
    /// (`AURA_REPLAY_TOOL_CONTEXT`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replay_tool_context: Option<bool>,
}

/// Overrides for the response cache.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct CacheSettings {
    /// Serve and store cached responses.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    /// TTL for cached responses, in seconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_ttl_secs: Option<u64>,
}

/// Overrides for rate limiting.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct RateLimitSettings {
    /// Enforce per-key limits at all.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    /// Requests per minute for keys without their own limit.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_rpm: Option<u32>,
}

impl GatewaySettings {
    /// True when no field is set.
    pub fn is_empty(&self) -> bool {
        self.routing == RoutingSettings::default()
            && self.features == FeatureSettings::default()
            && self.cache == CacheSettings::default()
            && self.rate_limit == RateLimitSettings::default()
    }

    /// Reject values the gateway could not apply.
    pub fn validate(&self) -> Result<(), String> {
        if let Some(rate) = self.routing.gold_sample_rate {
            if !(0.0..=1.0).contains(&rate) || rate.is_nan() {
                return Err("routing.gold_sample_rate must be between 0 and 1".into());
            }
        }
        if let Some(model) = &self.routing.llm_classifier_model {
            if model.trim().is_empty() {
                return Err("routing.llm_classifier_model must not be empty".into());
            }
        }
        if let Some(tiers) = &self.routing.tiers {
            for (name, list) in [
                ("simple", &tiers.simple),
                ("medium", &tiers.medium),
                ("complex", &tiers.complex),
                ("reasoning", &tiers.reasoning),
            ] {
                if list.iter().any(|m| m.trim().is_empty()) {
                    return Err(format!("routing.tiers.{name} contains an empty model id"));
                }
            }
            if !tiers.has_candidates() {
                return Err("routing.tiers must list at least one model".into());
            }
        }
        if let Some(ttl) = self.cache.default_ttl_secs {
            if ttl == 0 || ttl > MAX_CACHE_TTL_SECS {
                return Err(format!(
                    "cache.default_ttl_secs must be between 1 and {MAX_CACHE_TTL_SECS}"
                ));
            }
        }
        if let Some(rpm) = self.rate_limit.default_rpm {
            if rpm == 0 {
                return Err("rate_limit.default_rpm must be at least 1".into());
            }
        }
        Ok(())
    }

    /// The auto-routing configuration with these overrides applied.
    pub fn apply_to_auto(&self, base: &AutoRoutingConfig) -> AutoRoutingConfig {
        let mut cfg = base.clone();
        let r = &self.routing;
        if let Some(v) = r.enabled {
            cfg.enabled = v;
        }
        if let Some(v) = r.shadow_for_pinned_models {
            cfg.shadow_for_pinned_models = v;
        }
        if let Some(v) = r.default_mode {
            cfg.default_mode = v;
        }
        if let Some(v) = r.default_classifier {
            cfg.default_classifier = v;
        }
        if let Some(v) = r.within_tier {
            cfg.within_tier = v;
        }
        if let Some(v) = r.sticky_tool_loops {
            cfg.sticky_tool_loops = v;
        }
        if let Some(tiers) = &r.tiers {
            cfg.tiers = TierModels {
                simple: cleaned(&tiers.simple),
                medium: cleaned(&tiers.medium),
                complex: cleaned(&tiers.complex),
                reasoning: cleaned(&tiers.reasoning),
            };
        }
        if let Some(model) = &r.llm_classifier_model {
            cfg.llm_classifier.model = model.trim().to_string();
        }
        if let Some(rate) = r.gold_sample_rate {
            cfg.gold_sample_rate = rate;
        }
        if let Some(v) = r.escalation_enabled {
            cfg.escalation.enabled = v;
        }
        cfg
    }
}

/// Trimmed, de-duplicated model ids in their original order.
fn cleaned(models: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::with_capacity(models.len());
    for m in models {
        let m = m.trim();
        if !m.is_empty() && !out.iter().any(|x| x == m) {
            out.push(m.to_string());
        }
    }
    out
}

impl TierModels {
    /// True when at least one tier lists a model.
    pub fn has_candidates(&self) -> bool {
        !(self.simple.is_empty()
            && self.medium.is_empty()
            && self.complex.is_empty()
            && self.reasoning.is_empty())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_document_is_empty_and_changes_nothing() {
        let s: GatewaySettings = serde_json::from_str("{}").unwrap();
        assert!(s.is_empty());
        assert!(s.validate().is_ok());
        let base = AutoRoutingConfig::default();
        let same = s.apply_to_auto(&base);
        assert_eq!(same.enabled, base.enabled);
        assert_eq!(same.tiers, base.tiers);
        assert_eq!(same.default_mode, base.default_mode);
        assert_eq!(same.gold_sample_rate, base.gold_sample_rate);
        // Nothing but empty sections is written back.
        assert_eq!(
            serde_json::to_value(&s).unwrap(),
            serde_json::json!({"routing": {}, "features": {}, "cache": {}, "rate_limit": {}})
        );
    }

    #[test]
    fn overrides_apply_over_the_boot_config() {
        let s: GatewaySettings = serde_json::from_value(serde_json::json!({
            "routing": {
                "enabled": true,
                "default_mode": "cost",
                "within_tier": "predicted_cost",
                "tiers": {"simple": [" a ", "b", "a"], "medium": [], "complex": ["c"], "reasoning": []},
                "llm_classifier_model": " gpt-5.6-luna ",
                "gold_sample_rate": 0.02,
                "escalation_enabled": false
            },
            "features": {"payload_capture": true},
            "cache": {"default_ttl_secs": 60},
            "rate_limit": {"default_rpm": 120}
        }))
        .unwrap();
        assert!(!s.is_empty());
        s.validate().unwrap();
        let base = AutoRoutingConfig::default();
        assert!(!base.enabled);
        let cfg = s.apply_to_auto(&base);
        assert!(cfg.enabled);
        assert_eq!(cfg.default_mode, RoutingMode::Cost);
        assert_eq!(cfg.within_tier, WithinTierStrategy::PredictedCost);
        assert_eq!(cfg.tiers.simple, vec!["a".to_string(), "b".to_string()]);
        assert!(cfg.tiers.medium.is_empty());
        assert_eq!(cfg.tiers.complex, vec!["c".to_string()]);
        assert_eq!(cfg.llm_classifier.model, "gpt-5.6-luna");
        assert_eq!(cfg.gold_sample_rate, 0.02);
        assert!(!cfg.escalation.enabled);
        // Untouched values stay as booted.
        assert_eq!(cfg.boundaries, base.boundaries);
        assert_eq!(cfg.shadow_for_pinned_models, base.shadow_for_pinned_models);
    }

    #[test]
    fn validation_rejects_bad_values() {
        let bad = |v: serde_json::Value| -> String {
            serde_json::from_value::<GatewaySettings>(v)
                .unwrap()
                .validate()
                .unwrap_err()
        };
        assert!(bad(serde_json::json!({"routing": {"gold_sample_rate": 1.5}})).contains("gold"));
        assert!(
            bad(serde_json::json!({"routing": {"llm_classifier_model": "  "}})).contains("llm")
        );
        assert!(bad(serde_json::json!({"routing": {"tiers": {"simple": [""]}}})).contains("empty"));
        assert!(bad(serde_json::json!({"routing": {"tiers": {
            "simple": [], "medium": [], "complex": [], "reasoning": []
        }}}))
        .contains("at least one"));
        assert!(bad(serde_json::json!({"cache": {"default_ttl_secs": 0}})).contains("ttl"));
        assert!(bad(serde_json::json!({"rate_limit": {"default_rpm": 0}})).contains("rpm"));
    }

    #[test]
    fn unknown_fields_are_rejected() {
        let err = serde_json::from_value::<GatewaySettings>(serde_json::json!({
            "routing": {"enabld": true}
        }))
        .unwrap_err();
        assert!(err.to_string().contains("unknown field"));
    }
}
