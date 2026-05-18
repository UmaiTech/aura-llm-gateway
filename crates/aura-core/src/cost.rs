//! Cost tracking and pricing for LLM providers
//!
//! This module provides pricing information for various LLM models
//! and utilities for calculating costs based on token usage.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Pricing information for a model (per 1M tokens)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ModelPricing {
    /// Cost per 1M input tokens in USD
    pub input_per_million: f64,
    /// Cost per 1M output tokens in USD
    pub output_per_million: f64,
    /// Cost per 1M cached input tokens in USD (if applicable)
    pub cached_input_per_million: Option<f64>,
    /// Cost per 1M reasoning tokens in USD (if applicable)
    pub reasoning_per_million: Option<f64>,
}

impl ModelPricing {
    /// Create new pricing
    pub const fn new(input_per_million: f64, output_per_million: f64) -> Self {
        Self {
            input_per_million,
            output_per_million,
            cached_input_per_million: None,
            reasoning_per_million: None,
        }
    }

    /// Create pricing with cached input cost
    pub const fn with_cached(mut self, cached_per_million: f64) -> Self {
        self.cached_input_per_million = Some(cached_per_million);
        self
    }

    /// Create pricing with reasoning token cost
    pub const fn with_reasoning(mut self, reasoning_per_million: f64) -> Self {
        self.reasoning_per_million = Some(reasoning_per_million);
        self
    }

    /// Calculate cost for given token counts
    pub fn calculate_cost(
        &self,
        input_tokens: u32,
        output_tokens: u32,
        cached_tokens: Option<u32>,
        reasoning_tokens: Option<u32>,
    ) -> f64 {
        let input_cost = (input_tokens as f64 / 1_000_000.0) * self.input_per_million;
        let output_cost = (output_tokens as f64 / 1_000_000.0) * self.output_per_million;

        let cached_cost = cached_tokens
            .and_then(|tokens| {
                self.cached_input_per_million
                    .map(|rate| (tokens as f64 / 1_000_000.0) * rate)
            })
            .unwrap_or(0.0);

        let reasoning_cost = reasoning_tokens
            .and_then(|tokens| {
                self.reasoning_per_million
                    .map(|rate| (tokens as f64 / 1_000_000.0) * rate)
            })
            .unwrap_or(0.0);

        input_cost + output_cost + cached_cost + reasoning_cost
    }
}

/// Cost calculator with pricing data for all models
#[derive(Debug, Clone)]
pub struct CostCalculator {
    pricing: HashMap<String, ModelPricing>,
}

impl Default for CostCalculator {
    fn default() -> Self {
        Self::new()
    }
}

impl CostCalculator {
    /// Create a new cost calculator with default pricing data
    /// Pricing last updated: May 2026
    /// Sources:
    /// - OpenAI: <https://openai.com/api/pricing/>
    /// - Anthropic: <https://www.anthropic.com/pricing>
    /// - Google: <https://ai.google.dev/gemini-api/docs/pricing>
    /// - Mistral: <https://mistral.ai/technology/#pricing>
    /// - Ollama: local inference, no cost
    /// - HuggingFace Inference Endpoints: <https://huggingface.co/pricing#endpoints>
    ///   NOTE: HF Inference Endpoints are billed per compute-hour, not per token.
    ///   The per-token prices below are placeholders for a mid-tier instance.
    ///   Actual cost depends on instance type and duration.
    /// - AWS Bedrock: <https://aws.amazon.com/bedrock/pricing/>
    ///   Bedrock Claude pricing matches Anthropic direct pricing (Bedrock adds a
    ///   small regional surcharge in practice; matching Anthropic prices is conservative).
    pub fn new() -> Self {
        let mut pricing = HashMap::new();

        // =================================================================
        // OpenAI pricing (as of May 2026)
        // =================================================================

        // GPT-5.5 family (2026)
        pricing.insert("gpt-5.5-pro".to_string(), ModelPricing::new(30.00, 180.00));
        pricing.insert(
            "gpt-5.5".to_string(),
            ModelPricing::new(5.00, 30.00).with_cached(0.50),
        );

        // GPT-5.4 family (2026)
        pricing.insert(
            "gpt-5.4".to_string(),
            ModelPricing::new(2.50, 15.00).with_cached(0.25),
        );
        pricing.insert(
            "gpt-5.4-mini".to_string(),
            ModelPricing::new(0.75, 4.50).with_cached(0.075),
        );
        pricing.insert(
            "gpt-5.4-nano".to_string(),
            ModelPricing::new(0.20, 1.25).with_cached(0.02),
        );

        // GPT-4o family
        pricing.insert(
            "gpt-4o".to_string(),
            ModelPricing::new(2.50, 10.00).with_cached(1.25),
        );
        pricing.insert(
            "gpt-4o-2024-11-20".to_string(),
            ModelPricing::new(2.50, 10.00).with_cached(1.25),
        );
        pricing.insert(
            "gpt-4o-2024-08-06".to_string(),
            ModelPricing::new(2.50, 10.00).with_cached(1.25),
        );
        pricing.insert(
            "chatgpt-4o-latest".to_string(),
            ModelPricing::new(5.00, 15.00).with_cached(2.50),
        );

        // GPT-4o mini
        pricing.insert(
            "gpt-4o-mini".to_string(),
            ModelPricing::new(0.15, 0.60).with_cached(0.075),
        );
        pricing.insert(
            "gpt-4o-mini-2024-07-18".to_string(),
            ModelPricing::new(0.15, 0.60).with_cached(0.075),
        );

        // GPT-4.1 family (2025)
        pricing.insert(
            "gpt-4.1".to_string(),
            ModelPricing::new(2.00, 8.00).with_cached(0.50),
        );
        pricing.insert(
            "gpt-4.1-mini".to_string(),
            ModelPricing::new(0.40, 1.60).with_cached(0.10),
        );
        pricing.insert(
            "gpt-4.1-nano".to_string(),
            ModelPricing::new(0.10, 0.40).with_cached(0.025),
        );

        // GPT-5 family (2026)
        pricing.insert(
            "gpt-5".to_string(),
            ModelPricing::new(5.00, 20.00).with_cached(1.25),
        );
        pricing.insert(
            "gpt-5-2025-12-15".to_string(),
            ModelPricing::new(5.00, 20.00).with_cached(1.25),
        );
        pricing.insert(
            "gpt-5-mini".to_string(),
            ModelPricing::new(0.50, 2.00).with_cached(0.125),
        );
        pricing.insert(
            "gpt-5.2".to_string(),
            ModelPricing::new(5.00, 20.00).with_cached(1.25),
        );
        pricing.insert(
            "gpt-5.2-2026-01-10".to_string(),
            ModelPricing::new(5.00, 20.00).with_cached(1.25),
        );

        // GPT-4 Turbo (legacy)
        pricing.insert("gpt-4-turbo".to_string(), ModelPricing::new(10.00, 30.00));
        pricing.insert(
            "gpt-4-turbo-2024-04-09".to_string(),
            ModelPricing::new(10.00, 30.00),
        );

        // GPT-4 (legacy)
        pricing.insert("gpt-4".to_string(), ModelPricing::new(30.00, 60.00));
        pricing.insert("gpt-4-0613".to_string(), ModelPricing::new(30.00, 60.00));

        // GPT-3.5 Turbo (legacy)
        pricing.insert("gpt-3.5-turbo".to_string(), ModelPricing::new(0.50, 1.50));
        pricing.insert(
            "gpt-3.5-turbo-0125".to_string(),
            ModelPricing::new(0.50, 1.50),
        );

        // o1 reasoning models
        pricing.insert(
            "o1".to_string(),
            ModelPricing::new(15.00, 60.00).with_cached(7.50),
        );
        pricing.insert(
            "o1-2024-12-17".to_string(),
            ModelPricing::new(15.00, 60.00).with_cached(7.50),
        );
        pricing.insert("o1-preview".to_string(), ModelPricing::new(15.00, 60.00));
        pricing.insert(
            "o1-mini".to_string(),
            ModelPricing::new(3.00, 12.00).with_cached(1.50),
        );
        pricing.insert(
            "o1-pro".to_string(),
            ModelPricing::new(150.00, 600.00).with_cached(75.00),
        );

        // o3 reasoning models (2025)
        pricing.insert(
            "o3".to_string(),
            ModelPricing::new(2.00, 8.00).with_cached(1.00),
        );
        pricing.insert(
            "o3-mini".to_string(),
            ModelPricing::new(1.10, 4.40).with_cached(0.55),
        );
        pricing.insert(
            "o3-mini-2025-01-31".to_string(),
            ModelPricing::new(1.10, 4.40).with_cached(0.55),
        );

        // o4-mini (2025)
        pricing.insert(
            "o4-mini".to_string(),
            ModelPricing::new(1.10, 4.40).with_cached(0.55),
        );

        // =================================================================
        // Anthropic pricing (as of May 2026)
        // =================================================================

        // Claude 4.7 family (2026 — Opus only in this line, no Sonnet 4.7 shipped)
        pricing.insert(
            "claude-opus-4-7-20260416".to_string(),
            ModelPricing::new(5.00, 25.00).with_cached(0.50),
        );
        pricing.insert(
            "claude-opus-4-7".to_string(),
            ModelPricing::new(5.00, 25.00).with_cached(0.50),
        );

        // Claude 4.6 family (2026)
        pricing.insert(
            "claude-opus-4-6".to_string(),
            ModelPricing::new(5.00, 25.00).with_cached(0.50),
        );
        pricing.insert(
            "claude-sonnet-4-6".to_string(),
            ModelPricing::new(3.00, 15.00).with_cached(0.30),
        );

        // Claude 4.5 family (2025-2026)
        pricing.insert(
            "claude-opus-4-5-20251101".to_string(),
            ModelPricing::new(15.00, 75.00).with_cached(1.50),
        );
        pricing.insert(
            "claude-opus-4-5".to_string(),
            ModelPricing::new(15.00, 75.00).with_cached(1.50),
        );
        pricing.insert(
            "claude-sonnet-4-5-20251022".to_string(),
            ModelPricing::new(3.00, 15.00).with_cached(0.30),
        );
        pricing.insert(
            "claude-sonnet-4-5".to_string(),
            ModelPricing::new(3.00, 15.00).with_cached(0.30),
        );
        pricing.insert(
            "claude-haiku-4-5-20251001".to_string(),
            ModelPricing::new(1.00, 5.00).with_cached(0.10),
        );
        pricing.insert(
            "claude-haiku-4-5-20251201".to_string(),
            ModelPricing::new(1.00, 5.00).with_cached(0.10),
        );
        pricing.insert(
            "claude-haiku-4-5".to_string(),
            ModelPricing::new(1.00, 5.00).with_cached(0.10),
        );

        // Claude 3.5 Sonnet
        pricing.insert(
            "claude-3-5-sonnet-20241022".to_string(),
            ModelPricing::new(3.00, 15.00).with_cached(0.30),
        );
        pricing.insert(
            "claude-3-5-sonnet-20240620".to_string(),
            ModelPricing::new(3.00, 15.00).with_cached(0.30),
        );
        pricing.insert(
            "claude-3-5-sonnet-latest".to_string(),
            ModelPricing::new(3.00, 15.00).with_cached(0.30),
        );

        // Claude 3.5 Haiku
        pricing.insert(
            "claude-3-5-haiku-20241022".to_string(),
            ModelPricing::new(0.80, 4.00).with_cached(0.08),
        );
        pricing.insert(
            "claude-3-5-haiku-latest".to_string(),
            ModelPricing::new(0.80, 4.00).with_cached(0.08),
        );

        // Claude 3 Opus
        pricing.insert(
            "claude-3-opus-20240229".to_string(),
            ModelPricing::new(15.00, 75.00).with_cached(1.50),
        );
        pricing.insert(
            "claude-3-opus-latest".to_string(),
            ModelPricing::new(15.00, 75.00).with_cached(1.50),
        );

        // Claude 3 Sonnet
        pricing.insert(
            "claude-3-sonnet-20240229".to_string(),
            ModelPricing::new(3.00, 15.00).with_cached(0.30),
        );

        // Claude 3 Haiku
        pricing.insert(
            "claude-3-haiku-20240307".to_string(),
            ModelPricing::new(0.25, 1.25).with_cached(0.03),
        );

        // =================================================================
        // Google Gemini pricing (as of January 2026)
        // =================================================================

        // Gemini 3 family (2026)
        pricing.insert(
            "gemini-3-pro".to_string(),
            ModelPricing::new(2.50, 10.00).with_cached(0.625),
        );
        pricing.insert(
            "gemini-3-flash".to_string(),
            ModelPricing::new(0.15, 0.60).with_cached(0.0375),
        );
        pricing.insert(
            "gemini-3-pro-latest".to_string(),
            ModelPricing::new(2.50, 10.00).with_cached(0.625),
        );

        // Gemini 2.5 family (2025)
        pricing.insert(
            "gemini-2.5-pro".to_string(),
            ModelPricing::new(1.25, 10.00).with_cached(0.3125),
        );
        pricing.insert(
            "gemini-2.5-flash".to_string(),
            ModelPricing::new(0.30, 2.50).with_cached(0.075),
        );

        // Gemini 2.0 Flash
        pricing.insert(
            "gemini-2.0-flash".to_string(),
            ModelPricing::new(0.10, 0.40).with_cached(0.025),
        );
        pricing.insert(
            "gemini-2.0-flash-exp".to_string(),
            ModelPricing::new(0.10, 0.40).with_cached(0.025),
        );
        pricing.insert(
            "gemini-2.0-flash-lite".to_string(),
            ModelPricing::new(0.075, 0.30).with_cached(0.02),
        );

        // Gemini 1.5 Pro
        pricing.insert(
            "gemini-1.5-pro".to_string(),
            ModelPricing::new(1.25, 5.00).with_cached(0.3125),
        );
        pricing.insert(
            "gemini-1.5-pro-latest".to_string(),
            ModelPricing::new(1.25, 5.00).with_cached(0.3125),
        );

        // Gemini 1.5 Flash
        pricing.insert(
            "gemini-1.5-flash".to_string(),
            ModelPricing::new(0.075, 0.30).with_cached(0.01875),
        );
        pricing.insert(
            "gemini-1.5-flash-latest".to_string(),
            ModelPricing::new(0.075, 0.30).with_cached(0.01875),
        );

        // Gemini 1.5 Flash-8B
        pricing.insert(
            "gemini-1.5-flash-8b".to_string(),
            ModelPricing::new(0.0375, 0.15).with_cached(0.01),
        );

        // =================================================================
        // Mistral AI pricing (as of May 2026)
        // Source: https://mistral.ai/technology/#pricing
        // =================================================================

        pricing.insert(
            "mistral-large-latest".to_string(),
            ModelPricing::new(2.00, 6.00),
        );
        pricing.insert(
            "mistral-large-2411".to_string(),
            ModelPricing::new(2.00, 6.00),
        );
        pricing.insert(
            "mistral-medium-latest".to_string(),
            ModelPricing::new(0.40, 2.00),
        );
        pricing.insert(
            "mistral-small-latest".to_string(),
            ModelPricing::new(0.20, 0.60),
        );
        pricing.insert(
            "codestral-latest".to_string(),
            ModelPricing::new(0.30, 0.90),
        );
        // Pixtral large uses mistral-large tier pricing
        pricing.insert(
            "pixtral-large-latest".to_string(),
            ModelPricing::new(2.00, 6.00),
        );
        pricing.insert(
            "ministral-8b-latest".to_string(),
            ModelPricing::new(0.10, 0.10),
        );
        pricing.insert(
            "ministral-3b-latest".to_string(),
            ModelPricing::new(0.04, 0.04),
        );

        // =================================================================
        // Ollama (local inference — $0.00 for all models)
        // =================================================================

        for model in &[
            "llama3.3",
            "llama3.2",
            "llama3.1",
            "qwen2.5",
            "mistral",
            "mixtral",
            "phi3",
            "gemma2",
            "codellama",
            "deepseek-r1",
        ] {
            pricing.insert(model.to_string(), ModelPricing::new(0.00, 0.00));
        }

        // =================================================================
        // HuggingFace TGI Inference Endpoints
        // NOTE: HF endpoints are billed per compute-hour, not per token.
        // The placeholder below ($0.50 in / $1.50 out per 1M tokens) approximates
        // a medium GPU instance. Set pricing.set_pricing() at runtime for accuracy.
        // =================================================================

        // No static model keys — TGI endpoints are deployment-specific.
        // Use set_pricing() if you want cost tracking for a specific endpoint.

        // =================================================================
        // AWS Bedrock — Anthropic Claude on Bedrock
        // Prices match Anthropic direct (Bedrock has a small regional surcharge
        // in reality; using Anthropic list prices is a reasonable approximation).
        // Source: https://aws.amazon.com/bedrock/pricing/
        // =================================================================

        pricing.insert(
            "anthropic.claude-opus-4-5-20251001-v1:0".to_string(),
            ModelPricing::new(15.00, 75.00).with_cached(1.50),
        );
        pricing.insert(
            "anthropic.claude-sonnet-4-5-20250929-v1:0".to_string(),
            ModelPricing::new(3.00, 15.00).with_cached(0.30),
        );
        pricing.insert(
            "anthropic.claude-haiku-4-5-20251001-v1:0".to_string(),
            ModelPricing::new(0.80, 4.00).with_cached(0.08),
        );
        pricing.insert(
            "anthropic.claude-3-7-sonnet-20250219-v1:0".to_string(),
            ModelPricing::new(3.00, 15.00).with_cached(0.30),
        );

        Self { pricing }
    }

    /// Get pricing for a specific model
    pub fn get_pricing(&self, model: &str) -> Option<&ModelPricing> {
        self.pricing.get(model)
    }

    /// Calculate cost for a request
    pub fn calculate_cost(
        &self,
        model: &str,
        input_tokens: u32,
        output_tokens: u32,
        cached_tokens: Option<u32>,
        reasoning_tokens: Option<u32>,
    ) -> Option<f64> {
        self.get_pricing(model).map(|pricing| {
            pricing.calculate_cost(input_tokens, output_tokens, cached_tokens, reasoning_tokens)
        })
    }

    /// Add or update pricing for a model
    pub fn set_pricing(&mut self, model: impl Into<String>, pricing: ModelPricing) {
        self.pricing.insert(model.into(), pricing);
    }

    /// Get all available models with pricing
    pub fn models(&self) -> impl Iterator<Item = &str> {
        self.pricing.keys().map(|s| s.as_str())
    }
}

/// Usage statistics with cost calculation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageWithCost {
    /// Number of input tokens
    pub input_tokens: u32,
    /// Number of output tokens
    pub output_tokens: u32,
    /// Total tokens
    pub total_tokens: u32,
    /// Number of cached tokens (if applicable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_tokens: Option<u32>,
    /// Number of reasoning tokens (if applicable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_tokens: Option<u32>,
    /// Calculated cost in USD
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
}

impl UsageWithCost {
    /// Create from aura_types::Usage with cost calculation
    pub fn from_usage(usage: &aura_types::Usage, calculator: &CostCalculator, model: &str) -> Self {
        let cost = calculator.calculate_cost(
            model,
            usage.input_tokens,
            usage.output_tokens,
            usage.cached_tokens,
            usage.reasoning_tokens,
        );

        Self {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            total_tokens: usage.total_tokens,
            cached_tokens: usage.cached_tokens,
            reasoning_tokens: usage.reasoning_tokens,
            cost_usd: cost,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_pricing_calculation() {
        let pricing = ModelPricing::new(2.50, 10.00);
        let cost = pricing.calculate_cost(1_000_000, 1_000_000, None, None);
        assert!((cost - 12.50).abs() < 0.001);
    }

    #[test]
    fn test_model_pricing_with_cached() {
        let pricing = ModelPricing::new(2.50, 10.00).with_cached(1.25);
        let cost = pricing.calculate_cost(1_000_000, 1_000_000, Some(500_000), None);
        // 2.50 + 10.00 + 0.625 = 13.125
        assert!((cost - 13.125).abs() < 0.001);
    }

    #[test]
    fn test_cost_calculator_gpt4o() {
        let calculator = CostCalculator::new();
        let cost = calculator.calculate_cost("gpt-4o", 1000, 500, None, None);
        // (1000/1M * 2.50) + (500/1M * 10.00) = 0.0025 + 0.005 = 0.0075
        assert!(cost.is_some());
        assert!((cost.unwrap() - 0.0075).abs() < 0.00001);
    }

    #[test]
    fn test_cost_calculator_gpt4o_mini() {
        let calculator = CostCalculator::new();
        let cost = calculator.calculate_cost("gpt-4o-mini", 10000, 5000, None, None);
        // (10000/1M * 0.15) + (5000/1M * 0.60) = 0.0015 + 0.003 = 0.0045
        assert!(cost.is_some());
        assert!((cost.unwrap() - 0.0045).abs() < 0.00001);
    }

    #[test]
    fn test_cost_calculator_claude() {
        let calculator = CostCalculator::new();
        let cost = calculator.calculate_cost("claude-3-5-sonnet-20241022", 10000, 5000, None, None);
        // (10000/1M * 3.00) + (5000/1M * 15.00) = 0.03 + 0.075 = 0.105
        assert!(cost.is_some());
        assert!((cost.unwrap() - 0.105).abs() < 0.00001);
    }

    #[test]
    fn test_cost_calculator_unknown_model() {
        let calculator = CostCalculator::new();
        let cost = calculator.calculate_cost("unknown-model", 1000, 500, None, None);
        assert!(cost.is_none());
    }

    #[test]
    fn test_custom_pricing() {
        let mut calculator = CostCalculator::new();
        calculator.set_pricing("custom-model", ModelPricing::new(1.00, 2.00));
        let cost = calculator.calculate_cost("custom-model", 1_000_000, 1_000_000, None, None);
        assert!(cost.is_some());
        assert!((cost.unwrap() - 3.00).abs() < 0.001);
    }
}
