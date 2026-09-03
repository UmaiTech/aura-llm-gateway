//! Feature extraction for the auto router.
//!
//! Turns a `CreateResponseRequest` into a flat, numeric `RequestFeatures`
//! vector. The same vector feeds the heuristic scorer today and the learned
//! classifier later, and it is what gets recorded with every decision, so
//! keep it free of raw prompt text.

use super::config::{KeywordLists, TokenThresholds};
use aura_types::{
    ContentPart, CreateResponseRequest, InputContent, InputItem, Role, ToolChoice, ToolChoiceAuto,
};
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// Explicit user intent about answer depth.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IntentHint {
    /// "briefly", "one word", "tl;dr" …
    Quick,
    /// "think hard", "thorough", "rigorous" …
    Deep,
}

/// Numeric features describing one request.
///
/// Scores are in `[0, 1]` unless documented otherwise. Counts are raw.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct RequestFeatures {
    /// Estimated input tokens across instructions and all input items.
    pub est_input_tokens: u32,
    /// Estimated tokens in the latest user message only.
    pub est_last_user_tokens: u32,
    /// Number of input items.
    pub input_items: u32,
    /// Number of user messages in the input.
    pub user_messages: u32,
    /// Number of `function_call_output` items (tool results being fed back).
    pub function_call_outputs: u32,
    /// Request carries `previous_response_id`.
    pub is_continuation: bool,
    /// `function_call_outputs > 0 && is_continuation`.
    pub is_tool_loop_turn: bool,
    /// Number of tools attached.
    pub tool_count: u32,
    /// `tool_choice` is `required` or names a function.
    pub tool_required: bool,
    /// Input contains image parts.
    pub has_images: bool,
    /// Input contains audio parts.
    pub has_audio: bool,
    /// `max_output_tokens` if set.
    pub max_output_tokens: Option<u32>,
    /// Code presence score.
    pub code: f64,
    /// Distinct code keyword / pattern hits.
    pub code_matches: u32,
    /// Reasoning marker score.
    pub reasoning: f64,
    /// Distinct reasoning marker hits.
    pub reasoning_matches: u32,
    /// Technical vocabulary score.
    pub technical: f64,
    /// Distinct technical keyword hits.
    pub technical_matches: u32,
    /// Simple-indicator score (higher ⇒ more trivial).
    pub simple: f64,
    /// Distinct simple-indicator hits.
    pub simple_matches: u32,
    /// Multi-step instruction score.
    pub multi_step: f64,
    /// Number of question marks in user text.
    pub question_marks: u32,
    /// Explicit intent hint, if any.
    pub explicit_intent: Option<IntentHint>,
    /// Fraction of alphabetic characters outside ASCII (rough non-English
    /// / non-Latin indicator).
    pub non_ascii_ratio: f64,
    /// Number of fenced code blocks in user text.
    pub code_fences: u32,
}

/// Rough token estimate: ~4 characters per token.
pub fn estimate_tokens(text: &str) -> u32 {
    (text.chars().count() as u32).div_ceil(4)
}

/// Text collected from the request for scoring.
struct Collected {
    /// All user-authored text (messages + instructions), newest last.
    user_text: String,
    /// Text of the last user message only.
    last_user: String,
    /// Everything that reaches the model (for token estimation).
    all_text: String,
}

fn content_text(content: &InputContent, has_images: &mut bool, has_audio: &mut bool) -> String {
    match content {
        InputContent::Text(t) => t.clone(),
        InputContent::Parts(parts) => {
            let mut out = String::new();
            for p in parts {
                match p {
                    ContentPart::Text { text } => {
                        if !out.is_empty() {
                            out.push('\n');
                        }
                        out.push_str(text);
                    }
                    ContentPart::Image { .. } => *has_images = true,
                    ContentPart::Audio { .. } => *has_audio = true,
                }
            }
            out
        }
    }
}

fn collect(request: &CreateResponseRequest, f: &mut RequestFeatures) -> Collected {
    let mut user_text = String::new();
    let mut last_user = String::new();
    let mut all_text = String::new();

    if let Some(ref instr) = request.instructions {
        all_text.push_str(instr);
        all_text.push('\n');
        // Instructions are user-authored too; they carry intent ("be brief").
        user_text.push_str(instr);
        user_text.push('\n');
    }

    for item in &request.input {
        f.input_items += 1;
        match item {
            InputItem::Message { role, content } => {
                let text = content_text(content, &mut f.has_images, &mut f.has_audio);
                all_text.push_str(&text);
                all_text.push('\n');
                match role {
                    Role::User | Role::System => {
                        if *role == Role::User {
                            f.user_messages += 1;
                            last_user = text.clone();
                        }
                        user_text.push_str(&text);
                        user_text.push('\n');
                    }
                    Role::Assistant | Role::Tool => {}
                }
            }
            InputItem::FunctionCall { arguments, .. } => {
                all_text.push_str(arguments);
                all_text.push('\n');
            }
            InputItem::FunctionCallOutput { output, .. } => {
                f.function_call_outputs += 1;
                all_text.push_str(output);
                all_text.push('\n');
            }
            // Any other item kinds contribute nothing to scoring.
            #[allow(unreachable_patterns)]
            _ => {}
        }
    }

    Collected {
        user_text,
        last_user,
        all_text,
    }
}

/// Compiled keyword matcher.
pub struct KeywordMatcher {
    code: Vec<Matcher>,
    reasoning: Vec<Matcher>,
    technical: Vec<Matcher>,
    simple: Vec<Matcher>,
    intent_quick: Vec<Matcher>,
    intent_deep: Vec<Matcher>,
}

enum Matcher {
    /// Single word: word-boundary regex, case-insensitive.
    Word(Regex),
    /// Phrase: lowercase substring.
    Phrase(String),
}

impl Matcher {
    fn compile(keyword: &str) -> Option<Matcher> {
        let kw = keyword.trim();
        if kw.is_empty() {
            return None;
        }
        let single_word = !kw.contains(char::is_whitespace)
            && kw
                .chars()
                .all(|c| c.is_alphanumeric() || c == '_' || c == '-');
        if single_word {
            let pattern = format!(r"\b{}\b", regex::escape(kw));
            RegexBuilder::new(&pattern)
                .case_insensitive(true)
                .build()
                .ok()
                .map(Matcher::Word)
        } else {
            Some(Matcher::Phrase(kw.to_ascii_lowercase()))
        }
    }

    fn is_match(&self, text: &str, text_lower: &str) -> bool {
        match self {
            Matcher::Word(re) => re.is_match(text),
            Matcher::Phrase(p) => text_lower.contains(p.as_str()),
        }
    }
}

fn compile_all(list: &[String]) -> Vec<Matcher> {
    list.iter().filter_map(|k| Matcher::compile(k)).collect()
}

fn count_matches(matchers: &[Matcher], text: &str, text_lower: &str) -> u32 {
    matchers
        .iter()
        .filter(|m| m.is_match(text, text_lower))
        .count() as u32
}

impl KeywordMatcher {
    /// Compile the configured keyword lists.
    pub fn new(lists: &KeywordLists) -> Self {
        Self {
            code: compile_all(&lists.code),
            reasoning: compile_all(&lists.reasoning),
            technical: compile_all(&lists.technical),
            simple: compile_all(&lists.simple),
            intent_quick: compile_all(&lists.intent_quick),
            intent_deep: compile_all(&lists.intent_deep),
        }
    }
}

fn multi_step_regexes() -> &'static [Regex] {
    static RES: OnceLock<Vec<Regex>> = OnceLock::new();
    RES.get_or_init(|| {
        [
            r"(?is)\bfirst\b.*\bthen\b",
            r"(?im)^\s*\d+[.)]\s+\S",
            r"(?im)^\s*[a-z][.)]\s+\S",
            r"(?i)\b(after that|finally|and then|next,|lastly|subsequently)\b",
        ]
        .iter()
        .filter_map(|p| Regex::new(p).ok())
        .collect()
    })
}

fn code_pattern_regexes() -> &'static [Regex] {
    static RES: OnceLock<Vec<Regex>> = OnceLock::new();
    RES.get_or_init(|| {
        [
            // fenced code block
            r"```",
            // file paths with a source extension
            r"(?i)\b[\w./-]+\.(rs|py|ts|tsx|js|jsx|go|java|rb|cpp|cc|c|h|hpp|cs|kt|swift|sql|yaml|yml|json|toml|sh|proto)\b",
            // function call / brace soup
            r"[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*(\{|=>|->|:)",
            // stack frames
            r"(?m)^\s+at\s+[\w$.<>]+\s*\(",
            r"(?i)\bline \d+\b",
        ]
        .iter()
        .filter_map(|p| Regex::new(p).ok())
        .collect()
    })
}

/// Map a match count to a `[0, 1]` score with two thresholds.
fn tiered_score(matches: u32, half: u32, full: u32) -> f64 {
    if matches >= full {
        1.0
    } else if matches >= half {
        0.5
    } else {
        0.0
    }
}

/// Extract features from a request.
///
/// `matcher` carries the compiled keyword lists; `thresholds` is only used
/// for documentation symmetry here (the scorer applies them) but is
/// accepted so callers can extend the extractor without changing the
/// signature later.
pub fn extract_features(
    request: &CreateResponseRequest,
    matcher: &KeywordMatcher,
    _thresholds: &TokenThresholds,
) -> RequestFeatures {
    let mut f = RequestFeatures::default();
    let collected = collect(request, &mut f);

    f.est_input_tokens = estimate_tokens(&collected.all_text);
    f.est_last_user_tokens = estimate_tokens(&collected.last_user);
    f.is_continuation = request.previous_response_id.is_some();
    f.is_tool_loop_turn = f.is_continuation && f.function_call_outputs > 0;
    f.tool_count = request.tools.as_ref().map(|t| t.len() as u32).unwrap_or(0);
    f.tool_required = matches!(
        request.tool_choice,
        Some(ToolChoice::Auto(ToolChoiceAuto::Required)) | Some(ToolChoice::Function { .. })
    );
    f.max_output_tokens = request.max_output_tokens;

    let text = collected.user_text.as_str();
    let lower = text.to_ascii_lowercase();

    // Code: keywords + structural patterns.
    let code_kw = count_matches(&matcher.code, text, &lower);
    let code_pat = code_pattern_regexes()
        .iter()
        .filter(|re| re.is_match(text))
        .count() as u32;
    f.code_fences = text.matches("```").count() as u32 / 2;
    f.code_matches = code_kw + code_pat;
    // One code keyword is already a medium-tier signal; two make it
    // definite. Structural pattern hits count double, a fence is
    // definitive.
    f.code = if f.code_fences > 0 {
        1.0
    } else {
        tiered_score(code_kw + 2 * code_pat, 1, 2)
    };

    f.reasoning_matches = count_matches(&matcher.reasoning, text, &lower);
    f.reasoning = tiered_score(f.reasoning_matches, 1, 2);

    f.technical_matches = count_matches(&matcher.technical, text, &lower);
    f.technical = tiered_score(f.technical_matches, 2, 4);

    f.simple_matches = count_matches(&matcher.simple, text, &lower);
    f.simple = tiered_score(f.simple_matches, 1, 2);

    let multi_hits = multi_step_regexes()
        .iter()
        .filter(|re| re.is_match(text))
        .count() as u32;
    f.multi_step = tiered_score(multi_hits, 1, 3);

    f.question_marks = text.matches('?').count() as u32;

    let quick = count_matches(&matcher.intent_quick, text, &lower);
    let deep = count_matches(&matcher.intent_deep, text, &lower);
    f.explicit_intent = match (quick, deep) {
        (0, 0) => None,
        (q, d) if q > d => Some(IntentHint::Quick),
        (q, d) if d > q => Some(IntentHint::Deep),
        _ => None,
    };

    let (alpha, non_ascii) = text.chars().fold((0u32, 0u32), |(a, n), c| {
        if c.is_alphabetic() {
            (a + 1, n + u32::from(!c.is_ascii()))
        } else {
            (a, n)
        }
    });
    f.non_ascii_ratio = if alpha == 0 {
        0.0
    } else {
        f64::from(non_ascii) / f64::from(alpha)
    };

    f
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::{FunctionDefinition, Tool};

    fn matcher() -> KeywordMatcher {
        KeywordMatcher::new(&KeywordLists::default())
    }

    fn features(req: &CreateResponseRequest) -> RequestFeatures {
        extract_features(req, &matcher(), &TokenThresholds::default())
    }

    #[test]
    fn trivial_question() {
        let req = CreateResponseRequest::text("auto", "What is the capital of France?");
        let f = features(&req);
        assert!(f.est_input_tokens < 15);
        assert_eq!(f.user_messages, 1);
        assert!(f.simple >= 0.5, "simple={}", f.simple);
        assert_eq!(f.code, 0.0);
        assert_eq!(f.reasoning, 0.0);
        assert_eq!(f.question_marks, 1);
        assert_eq!(f.explicit_intent, None);
        assert!(!f.has_images);
    }

    #[test]
    fn code_with_fence_and_stack_trace() {
        let prompt = "My Rust program panics. Here is main.rs:\n```rust\nfn main() { let v: Vec<u8> = vec![]; v[3]; }\n```\nthread 'main' panicked at 'index out of bounds', src/main.rs line 2. Why?";
        let req = CreateResponseRequest::text("auto", prompt);
        let f = features(&req);
        assert_eq!(f.code, 1.0);
        assert_eq!(f.code_fences, 1);
        assert!(f.code_matches >= 3);
    }

    #[test]
    fn reasoning_and_technical() {
        let prompt = "Compare and contrast Raft and Paxos consensus protocols. Analyze the trade-offs for a distributed database with strong consistency, and justify which one you would pick. Think step by step.";
        let req = CreateResponseRequest::text("auto", prompt);
        let f = features(&req);
        assert!(
            f.reasoning_matches >= 3,
            "reasoning_matches={}",
            f.reasoning_matches
        );
        assert_eq!(f.reasoning, 1.0);
        assert!(
            f.technical_matches >= 4,
            "technical_matches={}",
            f.technical_matches
        );
        assert_eq!(f.technical, 1.0);
        assert_eq!(f.explicit_intent, None);
    }

    #[test]
    fn explicit_intent_quick_and_deep() {
        let quick = CreateResponseRequest::text("auto", "Briefly, is Rust memory safe? One word.");
        assert_eq!(features(&quick).explicit_intent, Some(IntentHint::Quick));

        let deep = CreateResponseRequest::text(
            "auto",
            "Think hard and give a thorough, rigorous review of this design.",
        );
        assert_eq!(features(&deep).explicit_intent, Some(IntentHint::Deep));
    }

    #[test]
    fn instructions_count_as_user_text() {
        let req = CreateResponseRequest::text("auto", "Summarise the attached notes.")
            .with_instructions("Always answer briefly.");
        let f = features(&req);
        assert_eq!(f.explicit_intent, Some(IntentHint::Quick));
    }

    #[test]
    fn multi_step_instructions() {
        let prompt = "First, read the CSV. Then dedupe rows by email.\n1. Sort by signup date\n2. Export to JSON\n3. Upload to S3\nFinally report the counts.";
        let req = CreateResponseRequest::text("auto", prompt);
        let f = features(&req);
        assert_eq!(f.multi_step, 1.0);
    }

    #[test]
    fn tools_and_tool_loop() {
        let mut req = CreateResponseRequest::text("auto", "Look up the weather in Oslo");
        req.tools = Some(vec![Tool::function(FunctionDefinition {
            name: "get_weather".into(),
            description: Some("weather".into()),
            parameters: None,
            strict: None,
        })]);
        req.tool_choice = Some(ToolChoice::Auto(ToolChoiceAuto::Required));
        let f = features(&req);
        assert_eq!(f.tool_count, 1);
        assert!(f.tool_required);
        assert!(!f.is_tool_loop_turn);

        let mut cont = CreateResponseRequest::new(
            "auto",
            vec![InputItem::FunctionCallOutput {
                call_id: "call_1".into(),
                output: "{\"temp_c\": 12}".into(),
            }],
        );
        cont.previous_response_id = Some("resp_1".into());
        let f = features(&cont);
        assert!(f.is_continuation);
        assert_eq!(f.function_call_outputs, 1);
        assert!(f.is_tool_loop_turn);
        assert_eq!(f.user_messages, 0);
    }

    #[test]
    fn images_and_non_ascii() {
        let req = CreateResponseRequest::new(
            "auto",
            vec![InputItem::Message {
                role: Role::User,
                content: InputContent::Parts(vec![
                    ContentPart::text("Vad står det på skylten? Översätt till engelska."),
                    ContentPart::Image {
                        url: Some("https://example.com/sign.jpg".into()),
                        data: None,
                        media_type: None,
                    },
                ]),
            }],
        );
        let f = features(&req);
        assert!(f.has_images);
        assert!(f.non_ascii_ratio > 0.05);
    }

    #[test]
    fn keyword_matching_uses_word_boundaries() {
        // "error" must not match "terrorism"; "def" must not match "default".
        let req = CreateResponseRequest::text("auto", "Is terrorism the default topic?");
        let f = features(&req);
        assert_eq!(f.code_matches, 0);
    }

    #[test]
    fn token_estimate() {
        assert_eq!(estimate_tokens(""), 0);
        assert_eq!(estimate_tokens("abcd"), 1);
        assert_eq!(estimate_tokens("abcde"), 2);
    }
}
