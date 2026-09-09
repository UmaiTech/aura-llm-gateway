//! Prompts and parsers for the LLM classifier and the gold-label judge.
//!
//! Both are plain functions over strings so they can be unit-tested
//! without a provider. The proxy owns the actual model calls.

use super::features::RequestFeatures;
use aura_types::Tier;
use serde::{Deserialize, Serialize};

/// Maximum characters of user text sent to the classifier.
pub const CLASSIFIER_EXCERPT_CHARS: usize = 1500;

/// Build the classifier prompt: a numeric summary plus an excerpt of the
/// latest user text. Output must be a one-line JSON object.
pub fn classifier_prompt(features: &RequestFeatures, excerpt: &str) -> String {
    let excerpt: String = excerpt.chars().take(CLASSIFIER_EXCERPT_CHARS).collect();
    format!(
        "You route requests to LLM tiers. Classify the request below into exactly one tier:\n\
         - simple: short factual questions, rewrites, translations, greetings\n\
         - medium: everyday assistant work, light code, single tool calls\n\
         - complex: multi-step engineering, debugging, long context, hard analysis\n\
         - reasoning: proofs, derivations, deep multi-constraint planning, research\n\n\
         Signals: input_tokens={}, code={:.1}, reasoning_markers={}, technical_terms={}, \
         tools={}, images={}, continuation={}, explicit_intent={}\n\n\
         Latest user text (may be truncated):\n\"\"\"\n{}\n\"\"\"\n\n\
         Answer with one line of JSON and nothing else: \
         {{\"tier\":\"simple|medium|complex|reasoning\",\"confidence\":0.0-1.0}}",
        features.est_input_tokens,
        features.code,
        features.reasoning_matches,
        features.technical_matches,
        features.tool_count,
        features.has_images,
        features.is_continuation,
        features
            .explicit_intent
            .map(|i| format!("{:?}", i).to_lowercase())
            .unwrap_or_else(|| "none".into()),
        excerpt
    )
}

/// Parsed classifier answer.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ClassifierAnswer {
    /// Tier the model picked.
    pub tier: Tier,
    /// Self-reported confidence in `[0, 1]` (0.5 when absent).
    pub confidence: f64,
}

fn first_json_object(text: &str) -> Option<&str> {
    let start = text.find('{')?;
    let end = text[start..].rfind('}')? + start;
    Some(&text[start..=end])
}

/// Parse the classifier's reply. Accepts a bare JSON object, a JSON
/// object inside prose or fences, or a bare tier word as a last resort.
pub fn parse_classifier_output(text: &str) -> Option<ClassifierAnswer> {
    if let Some(json) = first_json_object(text) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(json) {
            if let Some(tier) = v.get("tier").and_then(|t| t.as_str()).and_then(Tier::parse) {
                let confidence = v
                    .get("confidence")
                    .and_then(|c| c.as_f64())
                    .unwrap_or(0.5)
                    .clamp(0.0, 1.0);
                return Some(ClassifierAnswer { tier, confidence });
            }
        }
    }
    let lower = text.to_ascii_lowercase();
    // Longest names first so "reasoning" isn't shadowed by nothing.
    for (name, tier) in [
        ("reasoning", Tier::Reasoning),
        ("complex", Tier::Complex),
        ("medium", Tier::Medium),
        ("simple", Tier::Simple),
    ] {
        if lower.split(|c: char| !c.is_alphabetic()).any(|w| w == name) {
            return Some(ClassifierAnswer {
                tier,
                confidence: 0.5,
            });
        }
    }
    None
}

/// Who won a gold-label comparison.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JudgeVerdict {
    /// The cheap-tier answer (A) is at least as good.
    A,
    /// The strong-tier answer (B) is clearly better.
    B,
    /// No meaningful difference.
    Tie,
}

impl JudgeVerdict {
    /// Stable lowercase name.
    pub fn as_str(self) -> &'static str {
        match self {
            JudgeVerdict::A => "a",
            JudgeVerdict::B => "b",
            JudgeVerdict::Tie => "tie",
        }
    }

    /// True when the cheap answer would have satisfied the user.
    pub fn cheap_sufficed(self) -> bool {
        !matches!(self, JudgeVerdict::B)
    }
}

/// Parsed judge answer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JudgeAnswer {
    /// Verdict.
    pub verdict: JudgeVerdict,
    /// Confidence in `[0, 1]`.
    pub confidence: f64,
    /// Short rationale, if given.
    pub rationale: Option<String>,
}

/// Build the pairwise judge prompt. Candidate order is fixed (A cheap,
/// B strong) because the label we want is "did the cheap one suffice".
pub fn judge_prompt(user_text: &str, answer_a: &str, answer_b: &str, max_chars: usize) -> String {
    let cut = |s: &str| -> String { s.chars().take(max_chars).collect() };
    format!(
        "You are grading two assistant answers to the same user request. Judge correctness, \
         completeness and how well each follows the request. Ignore length and style unless \
         the request asks for them.\n\n\
         USER REQUEST:\n\"\"\"\n{}\n\"\"\"\n\n\
         ANSWER A:\n\"\"\"\n{}\n\"\"\"\n\n\
         ANSWER B:\n\"\"\"\n{}\n\"\"\"\n\n\
         Reply with one line of JSON and nothing else: \
         {{\"verdict\":\"a\"|\"b\"|\"tie\",\"confidence\":0.0-1.0,\"rationale\":\"<=25 words\"}}. \
         Use \"a\" when A is at least as good as B, \"b\" when B is clearly better, \"tie\" \
         when they are equivalent.",
        cut(user_text),
        cut(answer_a),
        cut(answer_b)
    )
}

/// Parse the judge's reply.
pub fn parse_judge_output(text: &str) -> Option<JudgeAnswer> {
    let json = first_json_object(text)?;
    let v = serde_json::from_str::<serde_json::Value>(json).ok()?;
    let verdict = match v
        .get("verdict")
        .and_then(|x| x.as_str())?
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "a" => JudgeVerdict::A,
        "b" => JudgeVerdict::B,
        "tie" | "equal" | "same" => JudgeVerdict::Tie,
        _ => return None,
    };
    Some(JudgeAnswer {
        verdict,
        confidence: v
            .get("confidence")
            .and_then(|c| c.as_f64())
            .unwrap_or(0.5)
            .clamp(0.0, 1.0),
        rationale: v
            .get("rationale")
            .and_then(|r| r.as_str())
            .map(|r| r.chars().take(500).collect()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifier_prompt_mentions_signals_and_excerpt() {
        let f = RequestFeatures {
            est_input_tokens: 42,
            tool_count: 2,
            ..Default::default()
        };
        let p = classifier_prompt(&f, "Prove that sqrt(2) is irrational");
        assert!(p.contains("input_tokens=42"));
        assert!(p.contains("tools=2"));
        assert!(p.contains("sqrt(2)"));
        let long = "x".repeat(5000);
        let p = classifier_prompt(&f, &long);
        assert!(p.len() < 3000);
    }

    #[test]
    fn parses_classifier_json_prose_and_bare_words() {
        let a = parse_classifier_output(r#"{"tier":"complex","confidence":0.83}"#).unwrap();
        assert_eq!(a.tier, Tier::Complex);
        assert!((a.confidence - 0.83).abs() < 1e-9);

        let a = parse_classifier_output("Sure! ```json\n{\"tier\": \"Reasoning\"}\n```").unwrap();
        assert_eq!(a.tier, Tier::Reasoning);
        assert_eq!(a.confidence, 0.5);

        let a = parse_classifier_output("I would say this is medium.").unwrap();
        assert_eq!(a.tier, Tier::Medium);

        assert!(parse_classifier_output("no idea").is_none());
        assert!(parse_classifier_output(r#"{"tier":"huge"}"#).is_none());
    }

    #[test]
    fn parses_judge_output() {
        let j = parse_judge_output(
            r#"{"verdict":"B","confidence":0.9,"rationale":"A skipped the edge case"}"#,
        )
        .unwrap();
        assert_eq!(j.verdict, JudgeVerdict::B);
        assert!(!j.verdict.cheap_sufficed());
        assert_eq!(j.rationale.as_deref(), Some("A skipped the edge case"));

        let j = parse_judge_output("Result: {\"verdict\":\"tie\"}").unwrap();
        assert_eq!(j.verdict, JudgeVerdict::Tie);
        assert!(j.verdict.cheap_sufficed());
        assert_eq!(j.confidence, 0.5);

        assert!(parse_judge_output("{\"verdict\":\"maybe\"}").is_none());
        assert!(parse_judge_output("nope").is_none());
    }

    #[test]
    fn judge_prompt_truncates() {
        let p = judge_prompt("q", &"a".repeat(10_000), "b", 100);
        assert!(p.len() < 1500);
        assert!(p.contains("ANSWER A"));
    }
}
