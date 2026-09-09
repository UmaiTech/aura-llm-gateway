//! Outcome signals and rewards for auto-router decisions.
//!
//! A decision is scored after the fact from what the traces already hold:
//! the request's own status and feedback, and what the user did next in
//! the same conversation. The classification here is pure so it can be
//! unit-tested; the rollup job in the proxy feeds it rows from
//! `routing_decisions`, `request_logs`, `responses` and `feedback_samples`.

use aura_types::Tier;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// What the user did after this turn.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NextTurn {
    /// No follow-up turn was recorded (conversation ended or is still open).
    None,
    /// The next turn is a different task: the strongest positive signal.
    MoveOn,
    /// The next turn repeats (near-identical) the previous prompt.
    Retry,
    /// The next turn opens by correcting the assistant.
    Correction,
    /// The conversation was continued on a stronger model.
    Escalation,
}

impl NextTurn {
    /// Stable lowercase name for storage.
    pub fn as_str(self) -> &'static str {
        match self {
            NextTurn::None => "none",
            NextTurn::MoveOn => "move_on",
            NextTurn::Retry => "retry",
            NextTurn::Correction => "correction",
            NextTurn::Escalation => "escalation",
        }
    }
}

/// Everything the reward function needs about one decision.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OutcomeInputs {
    /// `request_logs.status` (`completed`, `failed`, `incomplete`, …).
    pub status: Option<String>,
    /// Explicit feedback (`approved` / `rejected`).
    pub feedback: Option<String>,
    /// Tool calls the response made (agentic requests).
    pub tool_calls: i32,
    /// Text of this turn's last user message, if known.
    pub user_text: Option<String>,
    /// Tier the decision dispatched to.
    pub tier: Tier,
    /// Model the decision dispatched to.
    pub selected_model: String,
    /// The next turn in the conversation, if any.
    pub next: Option<NextTurnInputs>,
}

/// The follow-up turn, when one exists.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct NextTurnInputs {
    /// Text of the next turn's first user message.
    pub user_text: Option<String>,
    /// Model the next turn used.
    pub model: String,
    /// Tier of that model in the current catalog, if listed.
    pub model_tier: Option<Tier>,
    /// Whether the next turn was a tool-loop continuation (function
    /// outputs, no fresh user message).
    pub is_tool_continuation: bool,
}

/// Classified outcome.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Outcome {
    /// What happened next.
    pub next_turn: NextTurn,
    /// Reward in `[-1, 1]`.
    pub reward: f64,
}

/// Phrases that open a correction. Matched case-insensitively at the
/// start of the next user message (after trimming punctuation).
const CORRECTION_OPENERS: &[&str] = &[
    "no,",
    "no.",
    "no ",
    "nope",
    "wrong",
    "that's wrong",
    "thats wrong",
    "that is wrong",
    "incorrect",
    "not what i asked",
    "not what i meant",
    "that's not",
    "thats not",
    "that is not",
    "try again",
    "still wrong",
    "still doesn't",
    "still does not",
    "didn't work",
    "did not work",
    "doesn't work",
    "does not work",
    "you missed",
    "you forgot",
    "you ignored",
    "you didn't",
    "you did not",
    "this is wrong",
    "this doesn't",
    "this does not",
    "that doesn't",
    "that does not",
    "actually,",
    "actually ",
    "fix this",
    "redo",
];

/// Jaccard similarity of lowercase word sets, `0.0` when either is empty.
pub fn word_jaccard(a: &str, b: &str) -> f64 {
    let words = |s: &str| -> HashSet<String> {
        s.split(|c: char| !c.is_alphanumeric())
            .filter(|w| w.len() > 1)
            .map(|w| w.to_lowercase())
            .collect()
    };
    let wa = words(a);
    let wb = words(b);
    if wa.is_empty() || wb.is_empty() {
        return 0.0;
    }
    let inter = wa.intersection(&wb).count() as f64;
    let union = wa.union(&wb).count() as f64;
    inter / union
}

/// True when the text opens with a correction phrase.
pub fn is_correction(text: &str) -> bool {
    let t = text
        .trim_start_matches(|c: char| !c.is_alphanumeric())
        .to_lowercase();
    let head: String = t.chars().take(80).collect();
    CORRECTION_OPENERS.iter().any(|p| head.starts_with(p))
}

/// Classify the next turn relative to this one.
pub fn classify_next_turn(inputs: &OutcomeInputs) -> NextTurn {
    let Some(next) = inputs.next.as_ref() else {
        return NextTurn::None;
    };
    if next.is_tool_continuation {
        // A tool roundtrip is part of the same task, not a verdict.
        return NextTurn::None;
    }
    if let Some(next_tier) = next.model_tier {
        if next.model != inputs.selected_model && next_tier > inputs.tier {
            return NextTurn::Escalation;
        }
    }
    match next.user_text.as_deref() {
        Some(text) if is_correction(text) => NextTurn::Correction,
        Some(text) => {
            let prev = inputs.user_text.as_deref().unwrap_or("");
            if word_jaccard(prev, text) >= 0.8 {
                NextTurn::Retry
            } else {
                NextTurn::MoveOn
            }
        }
        None => NextTurn::MoveOn,
    }
}

/// Reward for a decision in `[-1, 1]`.
///
/// Priorities, strongest first: explicit feedback, hard failures, the
/// next-turn signal, and finally "completed with no complaint" as a weak
/// positive.
pub fn reward_for(inputs: &OutcomeInputs, next_turn: NextTurn) -> f64 {
    match inputs.feedback.as_deref() {
        Some("approved") => return 1.0,
        Some("rejected") => return -1.0,
        _ => {}
    }
    match inputs.status.as_deref() {
        Some("failed") => return -1.0,
        Some("incomplete") | Some("cancelled") => return -0.5,
        _ => {}
    }
    match next_turn {
        NextTurn::Escalation | NextTurn::Correction => -1.0,
        NextTurn::Retry => -0.5,
        NextTurn::MoveOn => 1.0,
        NextTurn::None => {
            if inputs.status.as_deref() == Some("completed") {
                0.5
            } else {
                0.0
            }
        }
    }
}

/// Classify and score in one step.
pub fn evaluate(inputs: &OutcomeInputs) -> Outcome {
    let next_turn = classify_next_turn(inputs);
    Outcome {
        next_turn,
        reward: reward_for(inputs, next_turn),
    }
}

/// Beta-distribution arm statistics used by Thompson sampling.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ArmStats {
    /// Successes plus one (prior).
    pub alpha: f64,
    /// Failures plus one (prior).
    pub beta: f64,
}

impl Default for ArmStats {
    fn default() -> Self {
        Self {
            alpha: 1.0,
            beta: 1.0,
        }
    }
}

impl ArmStats {
    /// Fold a reward into the arm: positive rewards add to alpha,
    /// negative ones to beta, each scaled by magnitude.
    pub fn observe(&mut self, reward: f64) {
        if reward > 0.0 {
            self.alpha += reward;
        } else if reward < 0.0 {
            self.beta += -reward;
        }
    }

    /// Mean of the Beta distribution.
    pub fn mean(&self) -> f64 {
        self.alpha / (self.alpha + self.beta)
    }
}

/// Sample from `Gamma(shape, 1)` (Marsaglia–Tsang), for shapes `>= 1`
/// with the standard boost for smaller shapes.
fn sample_gamma<R: rand::Rng>(rng: &mut R, shape: f64) -> f64 {
    if shape < 1.0 {
        // Gamma(a) = Gamma(a + 1) * U^(1/a)
        let u: f64 = rng.gen_range(f64::EPSILON..1.0);
        return sample_gamma(rng, shape + 1.0) * u.powf(1.0 / shape);
    }
    let d = shape - 1.0 / 3.0;
    let c = 1.0 / (9.0 * d).sqrt();
    loop {
        // Standard normal via Box–Muller.
        let u1: f64 = rng.gen_range(f64::EPSILON..1.0);
        let u2: f64 = rng.gen_range(0.0..1.0);
        let x = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
        let v = (1.0 + c * x).powi(3);
        if v <= 0.0 {
            continue;
        }
        let u: f64 = rng.gen_range(f64::EPSILON..1.0);
        if u.ln() < 0.5 * x * x + d - d * v + d * v.ln() {
            return d * v;
        }
    }
}

/// Sample from `Beta(alpha, beta)`.
pub fn sample_beta<R: rand::Rng>(rng: &mut R, alpha: f64, beta: f64) -> f64 {
    // Shapes come from the database; keep them finite and bounded so the
    // rejection sampler always terminates.
    let clamp = |v: f64| {
        if v.is_finite() {
            v.clamp(1e-3, 1e6)
        } else {
            1.0
        }
    };
    let a = clamp(alpha);
    let b = clamp(beta);
    let x = sample_gamma(rng, a);
    let y = sample_gamma(rng, b);
    if x + y == 0.0 {
        0.5
    } else {
        x / (x + y)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn beta_sampling_survives_bad_shapes() {
        let mut rng = rand::thread_rng();
        for (a, b) in [
            (f64::INFINITY, 1.0),
            (1.0, f64::NAN),
            (1e12, 1e12),
            (0.0, 0.0),
        ] {
            let x = sample_beta(&mut rng, a, b);
            assert!((0.0..=1.0).contains(&x), "{a} {b} -> {x}");
        }
    }

    fn base() -> OutcomeInputs {
        OutcomeInputs {
            status: Some("completed".into()),
            feedback: None,
            tool_calls: 0,
            user_text: Some("Write a Python function that parses a CSV file".into()),
            tier: Tier::Medium,
            selected_model: "gpt-5.4-mini".into(),
            next: None,
        }
    }

    fn next(text: &str, model: &str, tier: Option<Tier>) -> NextTurnInputs {
        NextTurnInputs {
            user_text: Some(text.into()),
            model: model.into(),
            model_tier: tier,
            is_tool_continuation: false,
        }
    }

    #[test]
    fn no_next_turn_completed_is_weak_positive() {
        let o = evaluate(&base());
        assert_eq!(o.next_turn, NextTurn::None);
        assert_eq!(o.reward, 0.5);
    }

    #[test]
    fn move_on_is_strong_positive() {
        let mut i = base();
        i.next = Some(next(
            "Now write the unit tests for the parser",
            "gpt-5.4-mini",
            Some(Tier::Medium),
        ));
        let o = evaluate(&i);
        assert_eq!(o.next_turn, NextTurn::MoveOn);
        assert_eq!(o.reward, 1.0);
    }

    #[test]
    fn retry_is_near_identical_prompt() {
        let mut i = base();
        i.next = Some(next(
            "Write a Python function that parses a CSV file please",
            "gpt-5.4-mini",
            Some(Tier::Medium),
        ));
        let o = evaluate(&i);
        assert_eq!(o.next_turn, NextTurn::Retry);
        assert_eq!(o.reward, -0.5);
    }

    #[test]
    fn correction_openers() {
        assert!(is_correction("No, that's not what I asked."));
        assert!(is_correction("  That's wrong — the file has a header row"));
        assert!(is_correction("try again but with pandas"));
        assert!(is_correction("You missed the header"));
        assert!(!is_correction("Nothing else, thanks"));
        assert!(!is_correction("Now write the tests"));
        let mut i = base();
        i.next = Some(next(
            "Wrong, it should skip the header",
            "gpt-5.4-mini",
            Some(Tier::Medium),
        ));
        let o = evaluate(&i);
        assert_eq!(o.next_turn, NextTurn::Correction);
        assert_eq!(o.reward, -1.0);
    }

    #[test]
    fn escalation_to_stronger_model() {
        let mut i = base();
        i.next = Some(next(
            "Same question, better answer please",
            "gpt-5.5",
            Some(Tier::Complex),
        ));
        let o = evaluate(&i);
        assert_eq!(o.next_turn, NextTurn::Escalation);
        assert_eq!(o.reward, -1.0);

        // Same tier on a different model is not an escalation.
        let mut i = base();
        i.next = Some(next("Next task", "claude-sonnet-4-6", Some(Tier::Medium)));
        assert_eq!(evaluate(&i).next_turn, NextTurn::MoveOn);
    }

    #[test]
    fn tool_continuation_is_not_a_verdict() {
        let mut i = base();
        i.next = Some(NextTurnInputs {
            user_text: None,
            model: "gpt-5.4-mini".into(),
            model_tier: Some(Tier::Medium),
            is_tool_continuation: true,
        });
        assert_eq!(evaluate(&i).next_turn, NextTurn::None);
    }

    #[test]
    fn explicit_feedback_and_failures_dominate() {
        let mut i = base();
        i.feedback = Some("rejected".into());
        i.next = Some(next("Next task", "gpt-5.4-mini", Some(Tier::Medium)));
        assert_eq!(evaluate(&i).reward, -1.0);

        let mut i = base();
        i.feedback = Some("approved".into());
        i.next = Some(next("Wrong!", "gpt-5.4-mini", Some(Tier::Medium)));
        assert_eq!(evaluate(&i).reward, 1.0);

        let mut i = base();
        i.status = Some("failed".into());
        assert_eq!(evaluate(&i).reward, -1.0);
        let mut i = base();
        i.status = Some("incomplete".into());
        assert_eq!(evaluate(&i).reward, -0.5);
    }

    #[test]
    fn jaccard_basics() {
        assert_eq!(word_jaccard("", "a b"), 0.0);
        assert!((word_jaccard("hello world", "hello world") - 1.0).abs() < 1e-9);
        assert!(word_jaccard("hello world", "goodbye moon") < 0.01);
    }

    #[test]
    fn arm_stats_fold_rewards() {
        let mut a = ArmStats::default();
        a.observe(1.0);
        a.observe(-0.5);
        a.observe(0.0);
        assert_eq!(a.alpha, 2.0);
        assert_eq!(a.beta, 1.5);
        assert!((a.mean() - 2.0 / 3.5).abs() < 1e-9);
    }

    #[test]
    fn beta_sampler_is_in_range_and_tracks_the_mean() {
        let mut rng = rand::thread_rng();
        let n = 4000;
        let mut sum = 0.0;
        for _ in 0..n {
            let x = sample_beta(&mut rng, 8.0, 2.0);
            assert!((0.0..=1.0).contains(&x));
            sum += x;
        }
        let mean = sum / n as f64;
        assert!((mean - 0.8).abs() < 0.05, "mean={}", mean);
        // Small shapes take the boost path.
        let x = sample_beta(&mut rng, 0.5, 0.5);
        assert!((0.0..=1.0).contains(&x));
    }
}
