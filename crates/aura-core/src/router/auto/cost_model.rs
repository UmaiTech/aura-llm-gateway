//! Learned cost model: predicts how many output tokens each model will
//! produce for a request, and from that the request's cost per candidate.
//!
//! Static prices per million tokens rank models the same way for every
//! request, but the real bill depends on output length, which varies by
//! model (some are verbose) and by request. `scripts/router/train_cost.py`
//! fits one ridge regression per model (plus a global fallback) of
//! `log1p(output_tokens)` on the same 24-number feature vector the
//! classifier uses, from `routing_decisions` joined with `request_logs`.
//! The gateway uses the predictions for the `predicted_cost` within-tier
//! strategy and the per-request `max_cost_usd` budget.

use super::features::RequestFeatures;
use super::learned::{featurize, FEATURE_NAMES};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Kind label stored in `router_models.kind` for cost models.
pub const COST_MODEL_KIND: &str = "cost_lr";

/// Upper bound on a predicted output length, to keep a bad fit from
/// producing absurd costs.
const MAX_PREDICTED_OUTPUT_TOKENS: f64 = 200_000.0;

/// One linear head: `log1p(output_tokens) = intercept + coef · z`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CostHead {
    /// Weights over the standardised feature vector.
    pub coef: Vec<f64>,
    /// Intercept.
    pub intercept: f64,
    /// Rows the head was fitted on (for display).
    #[serde(default)]
    pub rows: u64,
}

/// Prices captured at training time, used when the catalog has none.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct SnapshotPrice {
    /// USD per million input tokens.
    pub input_per_million: f64,
    /// USD per million output tokens.
    pub output_per_million: f64,
}

/// A trained cost model as stored in `router_models.weights` / a file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CostModel {
    /// Always `cost_lr`.
    #[serde(default = "default_kind")]
    pub kind: String,
    /// Model name, e.g. `cost-lr`.
    pub name: String,
    /// Version label recorded on decisions.
    pub version: String,
    /// Must equal the classifier's feature names.
    pub feature_names: Vec<String>,
    /// Per-feature mean used for standardisation.
    pub mean: Vec<f64>,
    /// Per-feature scale (never zero).
    pub scale: Vec<f64>,
    /// Per-model heads keyed by model id.
    pub heads: HashMap<String, CostHead>,
    /// Fallback head for models without their own.
    pub global: CostHead,
    /// Prices captured at training time, keyed by model id.
    #[serde(default)]
    pub prices: HashMap<String, SnapshotPrice>,
    /// Free-form training metrics for display.
    #[serde(default)]
    pub metrics: serde_json::Value,
}

fn default_kind() -> String {
    COST_MODEL_KIND.to_string()
}

/// Why a cost model was rejected.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum CostModelError {
    /// `kind` is not `cost_lr`.
    #[error("kind must be cost_lr")]
    Kind,
    /// Feature list differs from the evaluator's.
    #[error("feature names do not match the gateway's feature vector")]
    FeatureMismatch,
    /// A head has the wrong number of weights.
    #[error("head `{0}` has the wrong number of weights")]
    Shape(String),
    /// A scale entry is zero or negative.
    #[error("scale entries must be positive")]
    Scale,
}

/// A cost prediction for one candidate.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct CostPrediction {
    /// Predicted output tokens.
    pub output_tokens: f64,
    /// Predicted cost in USD for the request.
    pub cost_usd: f64,
    /// Whether the model had its own head (false = global fallback).
    pub model_specific: bool,
}

impl CostModel {
    /// Validate names and shapes.
    pub fn validate(&self) -> Result<(), CostModelError> {
        if self.kind != COST_MODEL_KIND {
            return Err(CostModelError::Kind);
        }
        if self.feature_names.len() != FEATURE_NAMES.len()
            || self
                .feature_names
                .iter()
                .zip(FEATURE_NAMES.iter())
                .any(|(a, b)| a != b)
        {
            return Err(CostModelError::FeatureMismatch);
        }
        let f = FEATURE_NAMES.len();
        if self.mean.len() != f || self.scale.len() != f {
            return Err(CostModelError::Shape("standardisation".into()));
        }
        if self.scale.iter().any(|s| *s <= 0.0 || !s.is_finite()) {
            return Err(CostModelError::Scale);
        }
        if self.mean.iter().any(|v| !v.is_finite()) {
            return Err(CostModelError::Shape("standardisation".into()));
        }
        let finite = |h: &CostHead| h.intercept.is_finite() && h.coef.iter().all(|v| v.is_finite());
        if !finite(&self.global) {
            return Err(CostModelError::Shape("global".into()));
        }
        if let Some((name, _)) = self.heads.iter().find(|(_, h)| !finite(h)) {
            return Err(CostModelError::Shape(name.clone()));
        }
        if self.global.coef.len() != f {
            return Err(CostModelError::Shape("global".into()));
        }
        for (name, head) in &self.heads {
            if head.coef.len() != f {
                return Err(CostModelError::Shape(name.clone()));
            }
        }
        Ok(())
    }

    /// Parse and validate a JSON model.
    pub fn from_json(json: &serde_json::Value) -> Result<Self, String> {
        let model: CostModel = serde_json::from_value(json.clone())
            .map_err(|e| format!("invalid cost model json: {e}"))?;
        model.validate().map_err(|e| e.to_string())?;
        Ok(model)
    }

    /// Label recorded on decisions.
    pub fn label(&self) -> String {
        format!("cost@{}", self.version)
    }

    /// Predicted output tokens for a model, and whether a model-specific
    /// head was used.
    pub fn predict_output_tokens(&self, features: &RequestFeatures, model: &str) -> (f64, bool) {
        let (head, specific) = match self.heads.get(model) {
            Some(h) => (h, true),
            None => (&self.global, false),
        };
        let x = featurize(features);
        let mut z = head.intercept;
        for (j, xj) in x.iter().enumerate() {
            z += head.coef[j] * ((xj - self.mean[j]) / self.scale[j]);
        }
        let tokens = z.exp_m1().clamp(1.0, MAX_PREDICTED_OUTPUT_TOKENS);
        (tokens, specific)
    }

    /// Predicted request cost for a model. `prices` come from the catalog
    /// when known, else from the training-time snapshot; `None` when the
    /// model has no price anywhere.
    pub fn predict_cost(
        &self,
        features: &RequestFeatures,
        model: &str,
        catalog_prices: Option<(f64, f64)>,
    ) -> Option<CostPrediction> {
        let (input_per_million, output_per_million) = catalog_prices.or_else(|| {
            self.prices
                .get(model)
                .map(|p| (p.input_per_million, p.output_per_million))
        })?;
        let (output_tokens, model_specific) = self.predict_output_tokens(features, model);
        let input_tokens = f64::from(features.est_input_tokens);
        let cost_usd =
            (input_tokens * input_per_million + output_tokens * output_per_million) / 1_000_000.0;
        Some(CostPrediction {
            output_tokens,
            cost_usd,
            model_specific,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn head(intercept: f64, log_tokens_coef: f64) -> CostHead {
        let mut coef = vec![0.0; FEATURE_NAMES.len()];
        coef[0] = log_tokens_coef;
        CostHead {
            coef,
            intercept,
            rows: 10,
        }
    }

    fn model() -> CostModel {
        let f = FEATURE_NAMES.len();
        let mut heads = HashMap::new();
        // Verbose model: ~e^6 ≈ 400 tokens baseline; terse: ~e^4 ≈ 55.
        heads.insert("verbose".to_string(), head(6.0, 0.5));
        heads.insert("terse".to_string(), head(4.0, 0.5));
        let mut prices = HashMap::new();
        prices.insert(
            "verbose".to_string(),
            SnapshotPrice {
                input_per_million: 1.0,
                output_per_million: 4.0,
            },
        );
        CostModel {
            kind: COST_MODEL_KIND.into(),
            name: "test".into(),
            version: "c1".into(),
            feature_names: FEATURE_NAMES.iter().map(|s| s.to_string()).collect(),
            mean: vec![0.0; f],
            scale: vec![1.0; f],
            heads,
            global: head(5.0, 0.5),
            prices,
            metrics: serde_json::json!({}),
        }
    }

    #[test]
    fn validation() {
        assert!(model().validate().is_ok());
        let mut m = model();
        m.kind = "learned_lr".into();
        assert_eq!(m.validate(), Err(CostModelError::Kind));
        let mut m = model();
        m.feature_names[3] = "x".into();
        assert_eq!(m.validate(), Err(CostModelError::FeatureMismatch));
        let mut m = model();
        m.heads.get_mut("terse").unwrap().coef.pop();
        assert_eq!(m.validate(), Err(CostModelError::Shape("terse".into())));
        let mut m = model();
        m.scale[0] = 0.0;
        assert_eq!(m.validate(), Err(CostModelError::Scale));
        let json = serde_json::to_value(model()).unwrap();
        assert!(CostModel::from_json(&json).is_ok());
        assert_eq!(model().label(), "cost@c1");
    }

    #[test]
    fn predictions_use_model_heads_and_global_fallback() {
        let m = model();
        let f = RequestFeatures {
            est_input_tokens: 100,
            ..Default::default()
        };
        let (verbose, s1) = m.predict_output_tokens(&f, "verbose");
        let (terse, s2) = m.predict_output_tokens(&f, "terse");
        let (other, s3) = m.predict_output_tokens(&f, "unknown-model");
        assert!(s1 && s2 && !s3);
        assert!(verbose > other && other > terse);
        // Longer prompts predict longer answers (positive log_tokens coef).
        let long = RequestFeatures {
            est_input_tokens: 5000,
            ..Default::default()
        };
        assert!(m.predict_output_tokens(&long, "terse").0 > terse);
    }

    #[test]
    fn cost_uses_catalog_prices_then_snapshot() {
        let m = model();
        let f = RequestFeatures {
            est_input_tokens: 1000,
            ..Default::default()
        };
        // Catalog price wins when provided.
        let c = m.predict_cost(&f, "verbose", Some((10.0, 40.0))).unwrap();
        let (out, _) = m.predict_output_tokens(&f, "verbose");
        let expected = (1000.0 * 10.0 + out * 40.0) / 1e6;
        assert!((c.cost_usd - expected).abs() < 1e-12);
        assert!(c.model_specific);
        // Snapshot price for a model the catalog can't price.
        let c = m.predict_cost(&f, "verbose", None).unwrap();
        let expected = (1000.0 * 1.0 + out * 4.0) / 1e6;
        assert!((c.cost_usd - expected).abs() < 1e-12);
        // No price anywhere: no prediction.
        assert!(m.predict_cost(&f, "terse", None).is_none());
    }

    /// A real export from `scripts/router/train_cost.py` (synthetic rows)
    /// must load and rank models the way the training data did, proving
    /// the JSON shape and feature order agree between the two.
    #[test]
    fn loads_train_cost_py_export() {
        let json: serde_json::Value =
            serde_json::from_str(include_str!("testdata/train_cost_py_export.json")).unwrap();
        let m = CostModel::from_json(&json).expect("train_cost.py export must load");
        assert_eq!(m.label(), "cost@test1");
        assert!(m.heads.contains_key("gpt-4o-mini"));

        let f = RequestFeatures {
            est_input_tokens: 400,
            est_last_user_tokens: 200,
            code: 1.0,
            code_matches: 4,
            ..Default::default()
        };
        // Training data made claude-sonnet-4 the most verbose model and
        // gpt-4o-mini the terse one.
        let (sonnet, s1) = m.predict_output_tokens(&f, "claude-sonnet-4");
        let (mini, s2) = m.predict_output_tokens(&f, "gpt-4o-mini");
        assert!(s1 && s2);
        assert!(sonnet > mini, "sonnet {sonnet} should out-talk mini {mini}");
        // Code prompts predict longer answers than plain ones.
        let plain = RequestFeatures {
            est_input_tokens: 400,
            est_last_user_tokens: 200,
            ..Default::default()
        };
        assert!(
            m.predict_output_tokens(&plain, "gpt-4o").0 < m.predict_output_tokens(&f, "gpt-4o").0
        );
        // Snapshot prices were recovered from the rows' cost column, so a
        // model the catalog can't price still gets a cost.
        let cost = m.predict_cost(&f, "gpt-4o-mini", None).unwrap();
        assert!(cost.cost_usd > 0.0 && cost.cost_usd < 0.01);
        // Unknown model falls back to the global head.
        assert!(!m.predict_output_tokens(&f, "small-rare").1);
    }
}
