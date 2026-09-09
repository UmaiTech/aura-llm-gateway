//! Learned classifier: multinomial logistic regression over the numeric
//! feature vector, trained offline by `scripts/router/train.py` and
//! evaluated here.
//!
//! The model file is plain JSON so it can live in the `router_models`
//! table or on disk. Prediction gives a probability per tier; the
//! *expected tier position* `Σ p_i · i / 3` is a score in `[0, 1]` that
//! goes through the same boundaries and mode offsets as the heuristic,
//! so `cost` / `balanced` / `quality` keep working and the training
//! script can calibrate the boundaries to a target strong-model share.

use super::config::{ModeOffsets, TierBoundaries};
use super::features::{IntentHint, RequestFeatures};
use aura_types::{RoutingMode, Tier};
use serde::{Deserialize, Serialize};

/// Canonical feature order. `scripts/router/train.py` must emit the same
/// names in the same order; the loader checks them.
pub const FEATURE_NAMES: [&str; 24] = [
    "log_input_tokens",
    "log_last_user_tokens",
    "input_items",
    "user_messages",
    "function_call_outputs",
    "is_continuation",
    "is_tool_loop_turn",
    "tool_count",
    "tool_required",
    "has_images",
    "log_max_output_tokens",
    "code",
    "code_matches",
    "reasoning",
    "reasoning_matches",
    "technical",
    "technical_matches",
    "simple",
    "simple_matches",
    "multi_step",
    "question_marks",
    "intent_quick",
    "intent_deep",
    "non_ascii_ratio",
];

/// Turn a feature struct into the canonical numeric vector.
pub fn featurize(f: &RequestFeatures) -> Vec<f64> {
    let b = |x: bool| if x { 1.0 } else { 0.0 };
    let ln1p = |x: u32| (f64::from(x) + 1.0).ln();
    vec![
        ln1p(f.est_input_tokens),
        ln1p(f.est_last_user_tokens),
        f64::from(f.input_items.min(50)),
        f64::from(f.user_messages.min(50)),
        f64::from(f.function_call_outputs.min(50)),
        b(f.is_continuation),
        b(f.is_tool_loop_turn),
        f64::from(f.tool_count.min(50)),
        b(f.tool_required),
        b(f.has_images),
        ln1p(f.max_output_tokens.unwrap_or(0)),
        f.code,
        f64::from(f.code_matches.min(50)),
        f.reasoning,
        f64::from(f.reasoning_matches.min(50)),
        f.technical,
        f64::from(f.technical_matches.min(50)),
        f.simple,
        f64::from(f.simple_matches.min(50)),
        f.multi_step,
        f64::from(f.question_marks.min(50)),
        b(f.explicit_intent == Some(IntentHint::Quick)),
        b(f.explicit_intent == Some(IntentHint::Deep)),
        f.non_ascii_ratio,
    ]
}

/// A trained model as stored in `router_models.weights` / the JSON file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LearnedModel {
    /// Model name, e.g. `learned-lr`.
    pub name: String,
    /// Version label recorded on decisions (`learned@<version>`).
    pub version: String,
    /// Must equal [`FEATURE_NAMES`].
    pub feature_names: Vec<String>,
    /// Per-feature mean used for standardisation.
    pub mean: Vec<f64>,
    /// Per-feature scale (std, never zero).
    pub scale: Vec<f64>,
    /// Class order. Must be the four tiers in ascending order.
    pub classes: Vec<Tier>,
    /// `classes.len() × feature_names.len()` weights.
    pub coef: Vec<Vec<f64>>,
    /// One intercept per class.
    pub intercept: Vec<f64>,
    /// Boundaries calibrated by the training script.
    #[serde(default)]
    pub boundaries: Option<TierBoundaries>,
    /// Free-form training metrics for display.
    #[serde(default)]
    pub metrics: serde_json::Value,
}

/// Why a model file was rejected.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum LearnedModelError {
    /// Feature list differs from the evaluator's.
    #[error("feature names do not match the gateway's feature vector")]
    FeatureMismatch,
    /// Classes are not the four tiers in order.
    #[error("classes must be [simple, medium, complex, reasoning]")]
    ClassMismatch,
    /// Weight matrix shape is wrong.
    #[error("weights have the wrong shape")]
    Shape,
    /// A scale entry is zero or negative.
    #[error("scale entries must be positive")]
    Scale,
}

/// Prediction for one request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LearnedPrediction {
    /// Probability per tier, in class order.
    pub probs: [f64; 4],
    /// Expected tier position in `[0, 1]` (0 = simple, 1 = reasoning).
    pub score: f64,
    /// Most likely tier.
    pub argmax: Tier,
}

impl LearnedModel {
    /// Validate shapes and names.
    pub fn validate(&self) -> Result<(), LearnedModelError> {
        if self.feature_names.len() != FEATURE_NAMES.len()
            || self
                .feature_names
                .iter()
                .zip(FEATURE_NAMES.iter())
                .any(|(a, b)| a != b)
        {
            return Err(LearnedModelError::FeatureMismatch);
        }
        if self.classes != Tier::ALL {
            return Err(LearnedModelError::ClassMismatch);
        }
        let f = FEATURE_NAMES.len();
        if self.mean.len() != f
            || self.scale.len() != f
            || self.coef.len() != 4
            || self.coef.iter().any(|row| row.len() != f)
            || self.intercept.len() != 4
        {
            return Err(LearnedModelError::Shape);
        }
        if self.scale.iter().any(|s| *s <= 0.0 || !s.is_finite()) {
            return Err(LearnedModelError::Scale);
        }
        if self.coef.iter().flatten().any(|v| !v.is_finite())
            || self.intercept.iter().any(|v| !v.is_finite())
            || self.mean.iter().any(|v| !v.is_finite())
        {
            return Err(LearnedModelError::Shape);
        }
        Ok(())
    }

    /// Parse and validate a JSON model.
    pub fn from_json(json: &serde_json::Value) -> Result<Self, String> {
        let model: LearnedModel =
            serde_json::from_value(json.clone()).map_err(|e| format!("invalid model json: {e}"))?;
        model.validate().map_err(|e| e.to_string())?;
        Ok(model)
    }

    /// Class probabilities and expected score for a feature vector.
    pub fn predict(&self, features: &RequestFeatures) -> LearnedPrediction {
        let x = featurize(features);
        let mut logits = [0.0f64; 4];
        for (c, logit) in logits.iter_mut().enumerate() {
            let mut z = self.intercept[c];
            for (j, xj) in x.iter().enumerate() {
                let standardized = (xj - self.mean[j]) / self.scale[j];
                z += self.coef[c][j] * standardized;
            }
            *logit = z;
        }
        let max = logits.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let mut probs = [0.0f64; 4];
        let mut sum = 0.0;
        for (p, l) in probs.iter_mut().zip(logits.iter()) {
            *p = (l - max).exp();
            sum += *p;
        }
        for p in probs.iter_mut() {
            *p /= sum;
        }
        let score = probs
            .iter()
            .enumerate()
            .map(|(i, p)| p * i as f64 / 3.0)
            .sum::<f64>()
            .clamp(0.0, 1.0);
        let argmax = probs
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(i, _)| Tier::ALL[i])
            .unwrap_or(Tier::Medium);
        LearnedPrediction {
            probs,
            score,
            argmax,
        }
    }

    /// Tier for a request under a mode: expected score plus the mode
    /// offset, mapped through the model's calibrated boundaries (or the
    /// gateway's when the model has none). Returns the tier, the adjusted
    /// score and the confidence (probability mass on the chosen tier).
    pub fn classify(
        &self,
        features: &RequestFeatures,
        mode: RoutingMode,
        fallback_boundaries: &TierBoundaries,
        offsets: &ModeOffsets,
    ) -> (Tier, f64, f64) {
        let pred = self.predict(features);
        let boundaries = self.boundaries.unwrap_or(*fallback_boundaries);
        let score = (pred.score + offsets.for_mode(mode)).clamp(0.0, 1.0);
        let tier = boundaries.tier_for(score);
        let idx = Tier::ALL.iter().position(|t| *t == tier).unwrap_or(1);
        (tier, score, pred.probs[idx])
    }

    /// Label recorded on decisions.
    pub fn classifier_label(&self) -> String {
        format!("learned@{}", self.version)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A tiny hand-made model: reasoning grows with `reasoning`, code
    /// pushes to complex, short prompts to simple.
    fn model() -> LearnedModel {
        let f = FEATURE_NAMES.len();
        let mut coef = vec![vec![0.0; f]; 4];
        let idx = |name: &str| FEATURE_NAMES.iter().position(|n| *n == name).unwrap();
        coef[0][idx("log_input_tokens")] = -0.5;
        coef[0][idx("simple")] = 3.0;
        coef[2][idx("code")] = 3.0;
        coef[3][idx("reasoning")] = 4.0;
        coef[3][idx("technical")] = 1.0;
        LearnedModel {
            name: "test".into(),
            version: "t1".into(),
            feature_names: FEATURE_NAMES.iter().map(|s| s.to_string()).collect(),
            mean: vec![0.0; f],
            scale: vec![1.0; f],
            classes: Tier::ALL.to_vec(),
            coef,
            intercept: vec![0.5, 0.5, 0.0, -1.0],
            boundaries: None,
            metrics: serde_json::json!({}),
        }
    }

    #[test]
    fn featurize_has_canonical_length() {
        let v = featurize(&RequestFeatures::default());
        assert_eq!(v.len(), FEATURE_NAMES.len());
        let f = RequestFeatures {
            est_input_tokens: 99,
            explicit_intent: Some(IntentHint::Deep),
            ..Default::default()
        };
        let v = featurize(&f);
        assert!((v[0] - (100f64).ln()).abs() < 1e-9);
        assert_eq!(v[22], 1.0);
        assert_eq!(v[21], 0.0);
    }

    #[test]
    fn validation_catches_bad_models() {
        assert!(model().validate().is_ok());
        let mut m = model();
        m.feature_names[0] = "nope".into();
        assert_eq!(m.validate(), Err(LearnedModelError::FeatureMismatch));
        let mut m = model();
        m.classes = vec![Tier::Reasoning, Tier::Complex, Tier::Medium, Tier::Simple];
        assert_eq!(m.validate(), Err(LearnedModelError::ClassMismatch));
        let mut m = model();
        m.coef.pop();
        assert_eq!(m.validate(), Err(LearnedModelError::Shape));
        let mut m = model();
        m.scale[3] = 0.0;
        assert_eq!(m.validate(), Err(LearnedModelError::Scale));
        let json = serde_json::to_value(model()).unwrap();
        assert!(LearnedModel::from_json(&json).is_ok());
        assert!(LearnedModel::from_json(&serde_json::json!({"name": "x"})).is_err());
    }

    #[test]
    fn predictions_follow_the_weights() {
        let m = model();
        let probs_sum = |p: &[f64; 4]| p.iter().sum::<f64>();

        let simple = RequestFeatures {
            est_input_tokens: 3,
            simple: 1.0,
            ..Default::default()
        };
        let p = m.predict(&simple);
        assert!((probs_sum(&p.probs) - 1.0).abs() < 1e-9);
        assert_eq!(p.argmax, Tier::Simple);
        assert!(p.score < 0.3);

        let reasoning = RequestFeatures {
            est_input_tokens: 400,
            reasoning: 1.0,
            technical: 1.0,
            ..Default::default()
        };
        let p = m.predict(&reasoning);
        assert_eq!(p.argmax, Tier::Reasoning);
        assert!(p.score > 0.7);

        let code = RequestFeatures {
            est_input_tokens: 200,
            code: 1.0,
            ..Default::default()
        };
        assert_eq!(m.predict(&code).argmax, Tier::Complex);
    }

    /// A real export from `scripts/router/train.py` (synthetic labels)
    /// must load and behave sensibly, proving the two feature orders
    /// and the JSON shape agree.
    #[test]
    fn loads_train_py_export() {
        let json: serde_json::Value =
            serde_json::from_str(include_str!("testdata/train_py_export.json")).unwrap();
        let m = LearnedModel::from_json(&json).expect("train.py export must load");
        assert!(m.classifier_label().starts_with("learned@"));
        assert!(m.boundaries.is_some());

        let simple = RequestFeatures {
            est_input_tokens: 8,
            est_last_user_tokens: 8,
            simple: 1.0,
            simple_matches: 1,
            question_marks: 1,
            ..Default::default()
        };
        let reasoning = RequestFeatures {
            est_input_tokens: 300,
            est_last_user_tokens: 300,
            reasoning: 1.0,
            reasoning_matches: 4,
            technical: 1.0,
            technical_matches: 4,
            explicit_intent: Some(IntentHint::Deep),
            question_marks: 1,
            ..Default::default()
        };
        let ps = m.predict(&simple);
        let pr = m.predict(&reasoning);
        assert_eq!(ps.argmax, Tier::Simple);
        assert_eq!(pr.argmax, Tier::Reasoning);
        assert!(pr.score > ps.score);
        let (t, _, _) = m.classify(
            &reasoning,
            RoutingMode::Balanced,
            &TierBoundaries::default(),
            &ModeOffsets::default(),
        );
        assert!(t >= Tier::Complex);
    }

    #[test]
    fn classify_applies_mode_offsets_and_boundaries() {
        let m = model();
        let b = TierBoundaries::default();
        let o = ModeOffsets::default();
        let code = RequestFeatures {
            est_input_tokens: 200,
            code: 1.0,
            ..Default::default()
        };
        let (balanced, s_bal, conf) = m.classify(&code, RoutingMode::Balanced, &b, &o);
        let (cost, s_cost, _) = m.classify(&code, RoutingMode::Cost, &b, &o);
        let (quality, s_q, _) = m.classify(&code, RoutingMode::Quality, &b, &o);
        assert!(s_cost < s_bal && s_bal < s_q);
        assert!(cost <= balanced && balanced <= quality);
        assert!((0.0..=1.0).contains(&conf));

        let mut calibrated = model();
        calibrated.boundaries = Some(TierBoundaries {
            simple_medium: 0.9,
            medium_complex: 0.95,
            complex_reasoning: 0.99,
        });
        let (t, _, _) = calibrated.classify(&code, RoutingMode::Balanced, &b, &o);
        assert_eq!(t, Tier::Simple, "model boundaries beat the gateway's");
        assert_eq!(calibrated.classifier_label(), "learned@t1");
    }
}
