//! Response consistency types for cross-model output normalization
//!
//! This module provides types for ensuring consistent responses across
//! different LLM providers and models. It implements multiple strategies
//! based on research in Constitutional AI, model calibration, and
//! prompt engineering.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use utoipa::ToSchema;

/// Consistency configuration for a request
///
/// This is an Aura-specific extension that enables consistent responses
/// across different models and providers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(default)]
pub struct ConsistencyConfig {
    /// Primary consistency strategy
    pub strategy: ConsistencyStrategy,

    /// Constitutional principles to inject (for constitutional strategy)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub principles: Option<Vec<String>>,

    /// Reference response to anchor style/format (for reference_anchoring)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_response: Option<String>,

    /// Few-shot examples for priming (for few_shot_priming)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub examples: Option<Vec<ConsistencyExample>>,

    /// Output format schema (for format_schema)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_schema: Option<serde_json::Value>,

    /// Style profile to apply
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_profile: Option<StyleProfile>,

    /// Whether to apply model-specific calibration
    #[serde(default)]
    pub apply_calibration: bool,

    /// Custom model calibration overrides
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calibration_overrides: Option<HashMap<String, ModelCalibration>>,
}

impl Default for ConsistencyConfig {
    fn default() -> Self {
        Self {
            strategy: ConsistencyStrategy::None,
            principles: None,
            reference_response: None,
            examples: None,
            output_schema: None,
            style_profile: None,
            apply_calibration: false,
            calibration_overrides: None,
        }
    }
}

impl ConsistencyConfig {
    /// Create a config with no consistency enforcement
    pub fn none() -> Self {
        Self::default()
    }

    /// Create a constitutional consistency config
    pub fn constitutional(principles: Vec<String>) -> Self {
        Self {
            strategy: ConsistencyStrategy::Constitutional,
            principles: Some(principles),
            ..Default::default()
        }
    }

    /// Create a reference anchoring config
    pub fn reference_anchoring(reference: impl Into<String>) -> Self {
        Self {
            strategy: ConsistencyStrategy::ReferenceAnchoring,
            reference_response: Some(reference.into()),
            ..Default::default()
        }
    }

    /// Create a few-shot priming config
    pub fn few_shot_priming(examples: Vec<ConsistencyExample>) -> Self {
        Self {
            strategy: ConsistencyStrategy::FewShotPriming,
            examples: Some(examples),
            ..Default::default()
        }
    }

    /// Create a format schema config
    pub fn format_schema(schema: serde_json::Value) -> Self {
        Self {
            strategy: ConsistencyStrategy::FormatSchema,
            output_schema: Some(schema),
            ..Default::default()
        }
    }

    /// Create a style profile config
    pub fn with_style(style: StyleProfile) -> Self {
        Self {
            strategy: ConsistencyStrategy::StyleProfile,
            style_profile: Some(style),
            ..Default::default()
        }
    }

    /// Enable model calibration
    pub fn with_calibration(mut self) -> Self {
        self.apply_calibration = true;
        self
    }
}

/// Consistency strategy to apply
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConsistencyStrategy {
    /// No consistency enforcement (default)
    #[default]
    None,

    /// Inject constitutional principles to guide behavior
    /// Based on Anthropic's Constitutional AI approach
    Constitutional,

    /// Use a reference response to anchor style/format
    /// The model is shown an exemplary response and asked to match it
    ReferenceAnchoring,

    /// Apply model-specific calibration adjustments
    /// Adjusts temperature, prompts based on known model biases
    ModelCalibration,

    /// Force structured output via JSON schema
    /// Ensures consistent format across models
    FormatSchema,

    /// Inject few-shot examples to prime consistent style
    /// Shows examples of desired input->output pairs
    FewShotPriming,

    /// Apply a predefined style profile
    /// Uses style directives to normalize tone and format
    StyleProfile,

    /// Extract semantic content and regenerate
    /// Two-pass: extract facts, then format consistently
    SemanticNormalization,

    /// Query multiple models and find consensus
    /// Returns the most agreed-upon response
    EnsembleVoting,
}

/// A few-shot example for consistency priming
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct ConsistencyExample {
    /// The input/query
    pub input: String,
    /// The desired output format/style
    pub output: String,
    /// Optional explanation of why this is the correct format
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
}

impl ConsistencyExample {
    /// Create a new example
    pub fn new(input: impl Into<String>, output: impl Into<String>) -> Self {
        Self {
            input: input.into(),
            output: output.into(),
            explanation: None,
        }
    }

    /// Add an explanation
    pub fn with_explanation(mut self, explanation: impl Into<String>) -> Self {
        self.explanation = Some(explanation.into());
        self
    }
}

/// Style profile for response normalization
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(default)]
pub struct StyleProfile {
    /// Tone of the response
    pub tone: Tone,
    /// Formality level
    pub formality: Formality,
    /// Verbosity level
    pub verbosity: Verbosity,
    /// Whether to use markdown formatting
    pub use_markdown: bool,
    /// Whether to use bullet points for lists
    pub use_bullet_points: bool,
    /// Whether to include code blocks with language hints
    pub format_code: bool,
    /// Maximum response length (approximate words)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_length: Option<u32>,
    /// Custom style directives
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_directives: Option<Vec<String>>,
}

impl Default for StyleProfile {
    fn default() -> Self {
        Self {
            tone: Tone::Neutral,
            formality: Formality::Standard,
            verbosity: Verbosity::Balanced,
            use_markdown: true,
            use_bullet_points: true,
            format_code: true,
            max_length: None,
            custom_directives: None,
        }
    }
}

impl StyleProfile {
    /// Create a concise technical style
    pub fn technical() -> Self {
        Self {
            tone: Tone::Professional,
            formality: Formality::Formal,
            verbosity: Verbosity::Concise,
            use_markdown: true,
            use_bullet_points: true,
            format_code: true,
            max_length: None,
            custom_directives: Some(vec![
                "Use precise technical terminology".to_string(),
                "Avoid hedging language".to_string(),
                "Include code examples where relevant".to_string(),
            ]),
        }
    }

    /// Create a friendly conversational style
    pub fn conversational() -> Self {
        Self {
            tone: Tone::Friendly,
            formality: Formality::Casual,
            verbosity: Verbosity::Balanced,
            use_markdown: false,
            use_bullet_points: false,
            format_code: true,
            max_length: None,
            custom_directives: Some(vec![
                "Use a warm, approachable tone".to_string(),
                "Explain concepts simply".to_string(),
            ]),
        }
    }

    /// Create a formal academic style
    pub fn academic() -> Self {
        Self {
            tone: Tone::Neutral,
            formality: Formality::Formal,
            verbosity: Verbosity::Detailed,
            use_markdown: true,
            use_bullet_points: false,
            format_code: true,
            max_length: None,
            custom_directives: Some(vec![
                "Use formal academic language".to_string(),
                "Cite relevant concepts".to_string(),
                "Structure arguments logically".to_string(),
            ]),
        }
    }

    /// Convert to instruction text for injection
    pub fn to_instructions(&self) -> String {
        let mut instructions: Vec<String> = Vec::new();

        // Tone
        instructions.push(
            match self.tone {
                Tone::Professional => "Maintain a professional tone.",
                Tone::Friendly => "Use a friendly, approachable tone.",
                Tone::Neutral => "Use a neutral, objective tone.",
                Tone::Authoritative => "Use an authoritative, confident tone.",
                Tone::Empathetic => "Use an empathetic, understanding tone.",
            }
            .to_string(),
        );

        // Formality
        instructions.push(
            match self.formality {
                Formality::Formal => "Use formal language and complete sentences.",
                Formality::Standard => "Use standard professional language.",
                Formality::Casual => "Use casual, conversational language.",
            }
            .to_string(),
        );

        // Verbosity
        instructions.push(
            match self.verbosity {
                Verbosity::Concise => "Be concise and direct. Avoid unnecessary elaboration.",
                Verbosity::Balanced => "Provide sufficient detail without being verbose.",
                Verbosity::Detailed => "Provide comprehensive, detailed explanations.",
            }
            .to_string(),
        );

        // Formatting
        if self.use_markdown {
            instructions.push("Use markdown formatting for structure.".to_string());
        }
        if self.use_bullet_points {
            instructions.push("Use bullet points for lists.".to_string());
        }
        if self.format_code {
            instructions.push("Format code in fenced code blocks with language hints.".to_string());
        }

        // Length
        if let Some(max_len) = self.max_length {
            instructions.push(format!("Keep response under {} words.", max_len));
        }

        // Custom directives
        if let Some(ref directives) = self.custom_directives {
            for directive in directives {
                instructions.push(directive.clone());
            }
        }

        instructions.join(" ")
    }
}

/// Tone of the response
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Tone {
    /// Professional business tone
    Professional,
    /// Warm, friendly tone
    Friendly,
    /// Neutral, objective tone
    #[default]
    Neutral,
    /// Confident, authoritative tone
    Authoritative,
    /// Understanding, empathetic tone
    Empathetic,
}

/// Formality level of the response
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Formality {
    /// Formal language with complete sentences
    Formal,
    /// Standard professional language
    #[default]
    Standard,
    /// Casual, conversational language
    Casual,
}

/// Verbosity level of the response
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Verbosity {
    /// Short, direct responses
    Concise,
    /// Balanced detail level
    #[default]
    Balanced,
    /// Comprehensive, detailed responses
    Detailed,
}

/// Model-specific calibration settings
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(default)]
pub struct ModelCalibration {
    /// Temperature adjustment (added to requested temperature)
    pub temperature_offset: f32,

    /// Whether this model tends to be verbose (apply conciseness bias)
    pub verbose_bias: bool,

    /// Whether this model tends to hedge (apply confidence bias)
    pub hedge_bias: bool,

    /// Whether this model needs explicit formatting instructions
    pub needs_format_instructions: bool,

    /// Custom prompt prefix for this model
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_prefix: Option<String>,

    /// Custom prompt suffix for this model
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_suffix: Option<String>,

    /// Known output quirks to normalize
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quirks: Option<Vec<ModelQuirk>>,
}

impl Default for ModelCalibration {
    fn default() -> Self {
        Self {
            temperature_offset: 0.0,
            verbose_bias: false,
            hedge_bias: false,
            needs_format_instructions: false,
            prompt_prefix: None,
            prompt_suffix: None,
            quirks: None,
        }
    }
}

/// Known model quirks that can be normalized
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ModelQuirk {
    /// Model tends to apologize excessively
    ExcessiveApologies,
    /// Model adds unnecessary preambles
    UnnecessaryPreamble,
    /// Model adds unnecessary conclusions
    UnnecessaryConclusion,
    /// Model uses excessive hedging language
    ExcessiveHedging,
    /// Model adds safety disclaimers unnecessarily
    UnnecessaryDisclaimers,
    /// Model tends to repeat the question
    RepeatsQuestion,
    /// Model adds "I hope this helps" type endings
    ClosingPhrases,
}

/// Default model calibration profiles based on known behaviors
pub struct DefaultCalibrations;

impl DefaultCalibrations {
    /// Get default calibration for GPT models
    pub fn gpt() -> ModelCalibration {
        ModelCalibration {
            temperature_offset: 0.0,
            verbose_bias: false,
            hedge_bias: false,
            needs_format_instructions: false,
            prompt_prefix: None,
            prompt_suffix: None,
            quirks: Some(vec![ModelQuirk::ClosingPhrases]),
        }
    }

    /// Get default calibration for Claude models
    pub fn claude() -> ModelCalibration {
        ModelCalibration {
            temperature_offset: 0.0,
            verbose_bias: true,
            hedge_bias: false,
            needs_format_instructions: false,
            prompt_prefix: None,
            prompt_suffix: None,
            quirks: Some(vec![
                ModelQuirk::ExcessiveApologies,
                ModelQuirk::UnnecessaryPreamble,
            ]),
        }
    }

    /// Get default calibration for Gemini models
    pub fn gemini() -> ModelCalibration {
        ModelCalibration {
            temperature_offset: 0.0,
            verbose_bias: false,
            hedge_bias: true,
            needs_format_instructions: true,
            prompt_prefix: None,
            prompt_suffix: None,
            quirks: Some(vec![ModelQuirk::UnnecessaryDisclaimers]),
        }
    }

    /// Get calibration by model name
    pub fn for_model(model: &str) -> ModelCalibration {
        let model_lower = model.to_lowercase();
        if model_lower.contains("gpt") || model_lower.contains("o1") {
            Self::gpt()
        } else if model_lower.contains("claude") {
            Self::claude()
        } else if model_lower.contains("gemini") {
            Self::gemini()
        } else {
            ModelCalibration::default()
        }
    }
}

/// Consistency metadata included in response
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct ConsistencyMetadata {
    /// Strategy that was applied
    pub strategy: ConsistencyStrategy,

    /// Whether calibration was applied
    pub calibration_applied: bool,

    /// Model-specific adjustments made
    #[serde(skip_serializing_if = "Option::is_none")]
    pub adjustments: Option<Vec<String>>,

    /// Style profile that was applied
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_applied: Option<String>,

    /// Number of principles injected (for constitutional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub principles_injected: Option<u8>,

    /// Number of examples injected (for few-shot)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub examples_injected: Option<u8>,

    /// Ensemble voting results (for ensemble strategy)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ensemble_votes: Option<EnsembleVotes>,
}

impl ConsistencyMetadata {
    /// Create metadata indicating no consistency was applied
    pub fn none() -> Self {
        Self {
            strategy: ConsistencyStrategy::None,
            calibration_applied: false,
            adjustments: None,
            style_applied: None,
            principles_injected: None,
            examples_injected: None,
            ensemble_votes: None,
        }
    }

    /// Create metadata for a strategy
    pub fn new(strategy: ConsistencyStrategy) -> Self {
        Self {
            strategy,
            calibration_applied: false,
            adjustments: None,
            style_applied: None,
            principles_injected: None,
            examples_injected: None,
            ensemble_votes: None,
        }
    }

    /// Mark calibration as applied
    pub fn with_calibration(mut self, adjustments: Vec<String>) -> Self {
        self.calibration_applied = true;
        self.adjustments = Some(adjustments);
        self
    }

    /// Set style applied
    pub fn with_style(mut self, style: impl Into<String>) -> Self {
        self.style_applied = Some(style.into());
        self
    }

    /// Set principles count
    pub fn with_principles(mut self, count: u8) -> Self {
        self.principles_injected = Some(count);
        self
    }

    /// Set examples count
    pub fn with_examples(mut self, count: u8) -> Self {
        self.examples_injected = Some(count);
        self
    }
}

/// Ensemble voting results
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct EnsembleVotes {
    /// Models that were queried
    pub models: Vec<String>,
    /// Which model's response was selected
    pub selected_model: String,
    /// Agreement score (0.0 to 1.0)
    pub agreement_score: f32,
    /// Reason for selection
    pub selection_reason: String,
}

/// Default constitutional principles for common use cases
pub struct DefaultConstitution;

impl DefaultConstitution {
    /// Principles for factual accuracy
    pub fn factual() -> Vec<String> {
        vec![
            "Only state facts that you are confident about.".to_string(),
            "Clearly distinguish between facts and opinions.".to_string(),
            "If uncertain, explicitly state your uncertainty level.".to_string(),
            "Do not fabricate information, citations, or sources.".to_string(),
            "Prefer specific, verifiable claims over vague statements.".to_string(),
        ]
    }

    /// Principles for consistent formatting
    pub fn formatting() -> Vec<String> {
        vec![
            "Use consistent heading levels and structure.".to_string(),
            "Format code blocks with appropriate language hints.".to_string(),
            "Use bullet points for lists of 3 or more items.".to_string(),
            "Keep paragraphs focused on single topics.".to_string(),
            "Use tables for comparing multiple items.".to_string(),
        ]
    }

    /// Principles for concise responses
    pub fn concise() -> Vec<String> {
        vec![
            "Get to the point immediately.".to_string(),
            "Avoid unnecessary preambles like 'Great question!'.".to_string(),
            "Do not repeat the question back.".to_string(),
            "Skip obvious disclaimers unless specifically relevant.".to_string(),
            "End with the answer, not with 'Hope this helps!'.".to_string(),
        ]
    }

    /// Principles for technical accuracy
    pub fn technical() -> Vec<String> {
        vec![
            "Use precise technical terminology.".to_string(),
            "Include relevant code examples.".to_string(),
            "Mention version numbers when discussing APIs or libraries.".to_string(),
            "Explain trade-offs when recommending solutions.".to_string(),
            "Cite documentation or specifications when relevant.".to_string(),
        ]
    }

    /// Principles for helpful assistant behavior
    pub fn helpful() -> Vec<String> {
        vec![
            "Focus on solving the user's actual problem.".to_string(),
            "Provide actionable, specific advice.".to_string(),
            "Anticipate follow-up questions and address them.".to_string(),
            "Offer alternatives when the primary solution may not work.".to_string(),
            "Be direct about limitations or things you cannot help with.".to_string(),
        ]
    }

    /// Combined principles for general use
    pub fn general() -> Vec<String> {
        let mut principles = Self::factual();
        principles.extend(Self::concise());
        principles.extend(Self::helpful());
        principles
    }
}

/// Prompt augmentation utilities for consistency
pub struct PromptAugmenter;

impl PromptAugmenter {
    /// Augment system prompt with constitutional principles
    pub fn with_constitution(system_prompt: Option<&str>, principles: &[String]) -> String {
        let constitution = principles
            .iter()
            .enumerate()
            .map(|(i, p)| format!("{}. {}", i + 1, p))
            .collect::<Vec<_>>()
            .join("\n");

        let base = system_prompt.unwrap_or("You are a helpful assistant.");

        format!(
            "{}\n\n## Response Principles\n\nFollow these principles in all responses:\n\n{}",
            base, constitution
        )
    }

    /// Augment with reference response
    pub fn with_reference(system_prompt: Option<&str>, reference: &str) -> String {
        let base = system_prompt.unwrap_or("You are a helpful assistant.");

        format!(
            "{}\n\n## Response Style Guide\n\nMatch the style, tone, and format of this example response:\n\n---\n{}\n---\n\nYour responses should follow the same patterns.",
            base, reference
        )
    }

    /// Augment with few-shot examples
    pub fn with_examples(system_prompt: Option<&str>, examples: &[ConsistencyExample]) -> String {
        let base = system_prompt.unwrap_or("You are a helpful assistant.");

        let examples_text = examples
            .iter()
            .enumerate()
            .map(|(i, ex)| {
                let explanation = ex
                    .explanation
                    .as_ref()
                    .map(|e| format!("\n(Note: {})", e))
                    .unwrap_or_default();

                format!(
                    "### Example {}\n\n**Input:** {}\n\n**Output:** {}{}",
                    i + 1,
                    ex.input,
                    ex.output,
                    explanation
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n");

        format!(
            "{}\n\n## Response Examples\n\nFollow the format and style shown in these examples:\n\n{}\n\n---\n\nNow respond to the user's query following the same patterns.",
            base, examples_text
        )
    }

    /// Augment with style profile
    pub fn with_style(system_prompt: Option<&str>, style: &StyleProfile) -> String {
        let base = system_prompt.unwrap_or("You are a helpful assistant.");
        let instructions = style.to_instructions();

        format!("{}\n\n## Style Guidelines\n\n{}", base, instructions)
    }

    /// Apply model-specific calibration to prompt
    pub fn with_calibration(system_prompt: Option<&str>, calibration: &ModelCalibration) -> String {
        let base = system_prompt.unwrap_or("You are a helpful assistant.");

        let mut augmented = base.to_string();

        // Add prefix if specified
        if let Some(ref prefix) = calibration.prompt_prefix {
            augmented = format!("{}\n\n{}", prefix, augmented);
        }

        // Add quirk-specific instructions
        if let Some(ref quirks) = calibration.quirks {
            let mut quirk_instructions = Vec::new();

            for quirk in quirks {
                match quirk {
                    ModelQuirk::ExcessiveApologies => {
                        quirk_instructions
                            .push("Do not apologize unless you made an actual error.");
                    }
                    ModelQuirk::UnnecessaryPreamble => {
                        quirk_instructions.push("Start directly with the answer, no preamble.");
                    }
                    ModelQuirk::UnnecessaryConclusion => {
                        quirk_instructions.push("End with the information, no summary needed.");
                    }
                    ModelQuirk::ExcessiveHedging => {
                        quirk_instructions
                            .push("Be confident in your responses when you know the answer.");
                    }
                    ModelQuirk::UnnecessaryDisclaimers => {
                        quirk_instructions
                            .push("Skip safety disclaimers unless the topic requires them.");
                    }
                    ModelQuirk::RepeatsQuestion => {
                        quirk_instructions.push("Do not repeat the question back.");
                    }
                    ModelQuirk::ClosingPhrases => {
                        quirk_instructions
                            .push("End with the content, not 'Hope this helps' or similar.");
                    }
                }
            }

            if !quirk_instructions.is_empty() {
                augmented = format!(
                    "{}\n\n## Communication Style\n\n{}",
                    augmented,
                    quirk_instructions.join(" ")
                );
            }
        }

        // Add suffix if specified
        if let Some(ref suffix) = calibration.prompt_suffix {
            augmented = format!("{}\n\n{}", augmented, suffix);
        }

        augmented
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_consistency_config_default() {
        let config = ConsistencyConfig::default();
        assert_eq!(config.strategy, ConsistencyStrategy::None);
    }

    #[test]
    fn test_constitutional_config() {
        let principles = DefaultConstitution::concise();
        let config = ConsistencyConfig::constitutional(principles.clone());
        assert_eq!(config.strategy, ConsistencyStrategy::Constitutional);
        assert_eq!(config.principles.unwrap().len(), principles.len());
    }

    #[test]
    fn test_style_profile_instructions() {
        let style = StyleProfile::technical();
        let instructions = style.to_instructions();
        assert!(instructions.contains("professional"));
        assert!(instructions.contains("concise"));
    }

    #[test]
    fn test_prompt_augmenter_constitution() {
        let principles = vec!["Be concise.".to_string(), "Be accurate.".to_string()];
        let augmented = PromptAugmenter::with_constitution(Some("Base prompt."), &principles);
        assert!(augmented.contains("Base prompt."));
        assert!(augmented.contains("1. Be concise."));
        assert!(augmented.contains("2. Be accurate."));
    }

    #[test]
    fn test_prompt_augmenter_examples() {
        let examples = vec![
            ConsistencyExample::new("What is 2+2?", "4"),
            ConsistencyExample::new("What is the capital of France?", "Paris"),
        ];
        let augmented = PromptAugmenter::with_examples(None, &examples);
        assert!(augmented.contains("Example 1"));
        assert!(augmented.contains("Example 2"));
        assert!(augmented.contains("4"));
        assert!(augmented.contains("Paris"));
    }

    #[test]
    fn test_model_calibration() {
        let calibration = DefaultCalibrations::claude();
        assert!(calibration.verbose_bias);
        assert!(calibration
            .quirks
            .as_ref()
            .unwrap()
            .contains(&ModelQuirk::ExcessiveApologies));
    }

    #[test]
    fn test_strategy_serialization() {
        assert_eq!(
            serde_json::to_string(&ConsistencyStrategy::Constitutional).unwrap(),
            "\"constitutional\""
        );
        assert_eq!(
            serde_json::to_string(&ConsistencyStrategy::FewShotPriming).unwrap(),
            "\"few_shot_priming\""
        );
    }
}
