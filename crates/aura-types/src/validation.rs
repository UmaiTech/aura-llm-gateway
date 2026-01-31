//! Validation types for response quality and confidence scoring
//!
//! This module provides types for validating LLM responses to reduce
//! hallucinations and improve output quality. It supports multiple
//! validation strategies depending on provider capabilities.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Validation configuration for a request
///
/// This is an Aura-specific extension to the Open Responses API that
/// enables response validation and quality scoring.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(default)]
pub struct ValidationConfig {
    /// Validation strategy to use
    pub strategy: ValidationStrategy,

    /// Minimum confidence threshold (0.0 to 1.0)
    /// Responses below this threshold may be retried or flagged
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_confidence: Option<f32>,

    /// Number of candidates to generate for best-of-n strategies
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n: Option<u8>,

    /// Selection criteria for choosing among candidates
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selection: Option<SelectionCriteria>,

    /// Whether to include detailed logprobs in response (OpenAI only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_logprobs: Option<bool>,

    /// Number of top logprobs to return per token (1-20, OpenAI only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_logprobs: Option<u8>,
}

impl Default for ValidationConfig {
    fn default() -> Self {
        Self {
            strategy: ValidationStrategy::None,
            min_confidence: None,
            n: None,
            selection: None,
            include_logprobs: None,
            top_logprobs: None,
        }
    }
}

impl ValidationConfig {
    /// Create a config with no validation
    pub fn none() -> Self {
        Self::default()
    }

    /// Create a config for logprobs-based validation (OpenAI)
    pub fn logprobs(min_confidence: f32, top_logprobs: u8) -> Self {
        Self {
            strategy: ValidationStrategy::Logprobs,
            min_confidence: Some(min_confidence),
            include_logprobs: Some(true),
            top_logprobs: Some(top_logprobs.min(20)),
            ..Default::default()
        }
    }

    /// Create a config for best-of-n validation
    pub fn best_of_n(n: u8, selection: SelectionCriteria) -> Self {
        Self {
            strategy: ValidationStrategy::BestOfN,
            n: Some(n.max(2).min(5)),
            selection: Some(selection),
            ..Default::default()
        }
    }

    /// Create a config for self-consistency validation
    pub fn self_consistency(n: u8, min_confidence: f32) -> Self {
        Self {
            strategy: ValidationStrategy::SelfConsistency,
            n: Some(n.max(2).min(5)),
            min_confidence: Some(min_confidence),
            ..Default::default()
        }
    }

    /// Create a config for confidence threshold validation
    pub fn confidence_threshold(min_confidence: f32) -> Self {
        Self {
            strategy: ValidationStrategy::ConfidenceThreshold,
            min_confidence: Some(min_confidence),
            ..Default::default()
        }
    }
}

/// Validation strategy to apply
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ValidationStrategy {
    /// No validation (default)
    #[default]
    None,

    /// Use logprobs for confidence scoring (OpenAI only)
    /// Falls back to heuristic scoring for other providers
    Logprobs,

    /// Generate N responses and select the best one
    /// Works with all providers
    BestOfN,

    /// Generate N responses and pick the most consistent
    /// Best for factual/reasoning tasks
    SelfConsistency,

    /// Apply confidence threshold, retry if below
    /// Uses logprobs if available, otherwise heuristics
    ConfidenceThreshold,

    /// Query multiple providers and aggregate results
    Ensemble,
}

/// Criteria for selecting among multiple candidates
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum SelectionCriteria {
    /// Select by highest confidence/logprob score
    #[default]
    HighestConfidence,

    /// Select the longest response (more detail)
    Longest,

    /// Select by semantic similarity to prompt
    MostRelevant,

    /// Select the shortest response (conciseness)
    Shortest,

    /// Select by lowest perplexity (most fluent)
    LowestPerplexity,
}

/// Validation metadata included in response
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct ValidationMetadata {
    /// Validation strategy that was used
    pub strategy: ValidationStrategy,

    /// Overall confidence score (0.0 to 1.0)
    /// Higher is more confident
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,

    /// Perplexity score (lower is better)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub perplexity: Option<f32>,

    /// Number of candidates that were generated
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidates_generated: Option<u8>,

    /// Index of the selected candidate (0-based)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_index: Option<u8>,

    /// Why this response was selected
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selection_reason: Option<String>,

    /// Whether the response passed validation
    pub passed: bool,

    /// Warning message if validation had issues
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,

    /// Token-level logprobs (if requested)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logprobs: Option<LogprobsData>,
}

impl ValidationMetadata {
    /// Create metadata indicating no validation was performed
    pub fn none() -> Self {
        Self {
            strategy: ValidationStrategy::None,
            confidence: None,
            perplexity: None,
            candidates_generated: None,
            selected_index: None,
            selection_reason: None,
            passed: true,
            warning: None,
            logprobs: None,
        }
    }

    /// Create metadata with a confidence score
    pub fn with_confidence(strategy: ValidationStrategy, confidence: f32) -> Self {
        Self {
            strategy,
            confidence: Some(confidence),
            perplexity: None,
            candidates_generated: None,
            selected_index: None,
            selection_reason: None,
            passed: true,
            warning: None,
            logprobs: None,
        }
    }

    /// Create metadata for best-of-n selection
    pub fn best_of_n(n: u8, selected_index: u8, confidence: f32, selection_reason: String) -> Self {
        Self {
            strategy: ValidationStrategy::BestOfN,
            confidence: Some(confidence),
            perplexity: None,
            candidates_generated: Some(n),
            selected_index: Some(selected_index),
            selection_reason: Some(selection_reason),
            passed: true,
            warning: None,
            logprobs: None,
        }
    }

    /// Set the passed flag
    pub fn with_passed(mut self, passed: bool) -> Self {
        self.passed = passed;
        self
    }

    /// Add a warning message
    pub fn with_warning(mut self, warning: impl Into<String>) -> Self {
        self.warning = Some(warning.into());
        self
    }

    /// Add logprobs data
    pub fn with_logprobs(mut self, logprobs: LogprobsData) -> Self {
        self.logprobs = Some(logprobs);
        self
    }

    /// Set perplexity
    pub fn with_perplexity(mut self, perplexity: f32) -> Self {
        self.perplexity = Some(perplexity);
        self
    }
}

/// Token-level log probability data
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct LogprobsData {
    /// List of token logprobs
    pub tokens: Vec<TokenLogprob>,
}

impl LogprobsData {
    /// Create new logprobs data
    pub fn new(tokens: Vec<TokenLogprob>) -> Self {
        Self { tokens }
    }

    /// Calculate average log probability
    pub fn average_logprob(&self) -> f32 {
        if self.tokens.is_empty() {
            return 0.0;
        }
        self.tokens.iter().map(|t| t.logprob).sum::<f32>() / self.tokens.len() as f32
    }

    /// Calculate perplexity (lower is better/more confident)
    pub fn perplexity(&self) -> f32 {
        let avg_neg_logprob = -self.average_logprob();
        avg_neg_logprob.exp()
    }

    /// Calculate normalized confidence score (0.0 to 1.0)
    pub fn confidence_score(&self) -> f32 {
        let perplexity = self.perplexity();
        // Sigmoid-like transform: low perplexity -> high confidence
        // Perplexity of 1 = 100% confidence, perplexity of 100 = ~9% confidence
        1.0 / (1.0 + (perplexity / 10.0).ln().max(0.0))
    }
}

/// Log probability for a single token
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct TokenLogprob {
    /// The token string
    pub token: String,

    /// Log probability of this token
    pub logprob: f32,

    /// Byte offsets of the token in the output
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes: Option<Vec<u8>>,

    /// Top alternative tokens with their logprobs
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_logprobs: Option<Vec<TopLogprob>>,
}

impl TokenLogprob {
    /// Create a new token logprob
    pub fn new(token: impl Into<String>, logprob: f32) -> Self {
        Self {
            token: token.into(),
            logprob,
            bytes: None,
            top_logprobs: None,
        }
    }

    /// Add top alternatives
    pub fn with_top_logprobs(mut self, top_logprobs: Vec<TopLogprob>) -> Self {
        self.top_logprobs = Some(top_logprobs);
        self
    }
}

/// Alternative token with its log probability
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct TopLogprob {
    /// The alternative token
    pub token: String,

    /// Log probability of this alternative
    pub logprob: f32,

    /// Byte representation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes: Option<Vec<u8>>,
}

impl TopLogprob {
    /// Create a new top logprob
    pub fn new(token: impl Into<String>, logprob: f32) -> Self {
        Self {
            token: token.into(),
            logprob,
            bytes: None,
        }
    }
}

/// Heuristic confidence analyzer for providers without logprobs
pub struct HeuristicAnalyzer;

impl HeuristicAnalyzer {
    /// Estimate confidence without logprobs using heuristics
    pub fn estimate_confidence(response: &str, _prompt: &str) -> f32 {
        let mut score = 0.5; // Base score

        let response_lower = response.to_lowercase();

        // Hedging language reduces confidence
        let hedges = [
            "i think",
            "maybe",
            "possibly",
            "might",
            "not sure",
            "i believe",
            "probably",
            "perhaps",
            "it seems",
            "i'm not certain",
        ];
        for hedge in hedges {
            if response_lower.contains(hedge) {
                score -= 0.05;
            }
        }

        // Confident language increases score
        let confident = [
            "certainly",
            "definitely",
            "the answer is",
            "clearly",
            "without a doubt",
            "it is",
            "this is",
        ];
        for c in confident {
            if response_lower.contains(c) {
                score += 0.03;
            }
        }

        // Very short responses are less confident
        if response.len() < 20 {
            score -= 0.15;
        } else if response.len() < 50 {
            score -= 0.1;
        }

        // Very long responses with no structure might be rambling
        if response.len() > 2000 && !response.contains('\n') {
            score -= 0.1;
        }

        // Check for repetition (sign of degeneration)
        let repetition_penalty = Self::repetition_score(response);
        score -= repetition_penalty * 0.3;

        // Contains code blocks - usually more factual
        if response.contains("```") {
            score += 0.1;
        }

        // Contains lists or structure - usually more organized
        if response.contains("1.") || response.contains("- ") || response.contains("* ") {
            score += 0.05;
        }

        score.clamp(0.0, 1.0)
    }

    /// Calculate a repetition score (0.0 = no repetition, 1.0 = highly repetitive)
    fn repetition_score(text: &str) -> f32 {
        let words: Vec<&str> = text.split_whitespace().collect();
        if words.len() < 10 {
            return 0.0;
        }

        // Check for repeated phrases (3-grams)
        let mut trigrams = std::collections::HashMap::new();
        for window in words.windows(3) {
            let trigram = window.join(" ").to_lowercase();
            *trigrams.entry(trigram).or_insert(0) += 1;
        }

        // Count repeated trigrams
        let repeated: usize = trigrams.values().filter(|&&v| v > 1).map(|&v| v - 1).sum();
        let total_trigrams = words.len().saturating_sub(2);

        if total_trigrams == 0 {
            return 0.0;
        }

        (repeated as f32 / total_trigrams as f32).min(1.0)
    }

    /// Compare consistency between multiple responses
    pub fn consistency_score(responses: &[&str]) -> f32 {
        if responses.len() < 2 {
            return 1.0;
        }

        // Simple Jaccard similarity between word sets
        let word_sets: Vec<std::collections::HashSet<&str>> = responses
            .iter()
            .map(|r| r.split_whitespace().collect())
            .collect();

        let mut total_similarity = 0.0;
        let mut comparisons = 0;

        for i in 0..word_sets.len() {
            for j in (i + 1)..word_sets.len() {
                let intersection = word_sets[i].intersection(&word_sets[j]).count();
                let union = word_sets[i].union(&word_sets[j]).count();
                if union > 0 {
                    total_similarity += intersection as f32 / union as f32;
                    comparisons += 1;
                }
            }
        }

        if comparisons == 0 {
            return 0.5;
        }

        total_similarity / comparisons as f32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validation_config_default() {
        let config = ValidationConfig::default();
        assert_eq!(config.strategy, ValidationStrategy::None);
        assert!(config.min_confidence.is_none());
    }

    #[test]
    fn test_validation_config_logprobs() {
        let config = ValidationConfig::logprobs(0.8, 5);
        assert_eq!(config.strategy, ValidationStrategy::Logprobs);
        assert_eq!(config.min_confidence, Some(0.8));
        assert_eq!(config.top_logprobs, Some(5));
    }

    #[test]
    fn test_validation_config_best_of_n() {
        let config = ValidationConfig::best_of_n(3, SelectionCriteria::HighestConfidence);
        assert_eq!(config.strategy, ValidationStrategy::BestOfN);
        assert_eq!(config.n, Some(3));
        assert_eq!(config.selection, Some(SelectionCriteria::HighestConfidence));
    }

    #[test]
    fn test_logprobs_data_calculations() {
        let logprobs = LogprobsData::new(vec![
            TokenLogprob::new("hello", -0.1),
            TokenLogprob::new("world", -0.2),
            TokenLogprob::new("!", -0.05),
        ]);

        let avg = logprobs.average_logprob();
        assert!((avg - (-0.1166667)).abs() < 0.01);

        let perplexity = logprobs.perplexity();
        assert!(perplexity > 1.0 && perplexity < 2.0);

        let confidence = logprobs.confidence_score();
        assert!(confidence > 0.5 && confidence <= 1.0);
    }

    #[test]
    fn test_heuristic_analyzer_hedging() {
        let confident = "The capital of France is Paris.";
        let hedging = "I think maybe the capital of France might be Paris.";

        let confident_score = HeuristicAnalyzer::estimate_confidence(confident, "");
        let hedging_score = HeuristicAnalyzer::estimate_confidence(hedging, "");

        assert!(confident_score > hedging_score);
    }

    #[test]
    fn test_heuristic_analyzer_repetition() {
        let normal = "The quick brown fox jumps over the lazy dog.";
        let repetitive = "The fox the fox the fox the fox the fox the fox.";

        let normal_score = HeuristicAnalyzer::repetition_score(normal);
        let repetitive_score = HeuristicAnalyzer::repetition_score(repetitive);

        assert!(repetitive_score > normal_score);
    }

    #[test]
    fn test_consistency_score() {
        let similar = vec![
            "The capital of France is Paris.",
            "Paris is the capital of France.",
            "France's capital is Paris.",
        ];

        let different = vec![
            "The capital of France is Paris.",
            "Hello world, how are you?",
            "The weather is nice today.",
        ];

        let similar_score =
            HeuristicAnalyzer::consistency_score(&similar.iter().map(|s| *s).collect::<Vec<_>>());
        let different_score =
            HeuristicAnalyzer::consistency_score(&different.iter().map(|s| *s).collect::<Vec<_>>());

        assert!(similar_score > different_score);
    }

    #[test]
    fn test_validation_metadata_builder() {
        let meta = ValidationMetadata::with_confidence(ValidationStrategy::Logprobs, 0.85)
            .with_perplexity(1.5)
            .with_passed(true);

        assert_eq!(meta.confidence, Some(0.85));
        assert_eq!(meta.perplexity, Some(1.5));
        assert!(meta.passed);
    }

    #[test]
    fn test_strategy_serialization() {
        assert_eq!(
            serde_json::to_string(&ValidationStrategy::BestOfN).unwrap(),
            "\"best_of_n\""
        );
        assert_eq!(
            serde_json::to_string(&ValidationStrategy::Logprobs).unwrap(),
            "\"logprobs\""
        );
    }
}
