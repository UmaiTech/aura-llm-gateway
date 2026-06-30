//! Cost tracking and pricing for LLM providers
//!
//! This module provides pricing information for various LLM models
//! and utilities for calculating costs based on token usage.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;

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

/// Cost calculator with pricing data for all models.
///
/// The pricing map is seeded with hardcoded defaults and can be refreshed at
/// runtime from the scraped `model_pricing` DB (see `apply_db_pricing`). The
/// map is behind a `RwLock` so a background task can update it while the
/// request hot path reads it concurrently — reads are uncontended and cheap.
#[derive(Debug)]
pub struct CostCalculator {
    pricing: RwLock<HashMap<String, ModelPricing>>,
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
    /// - Together AI: <https://docs.together.ai/docs/serverless/models>
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
        // Google Gemini pricing (verified 2026-05-22 vs Google's
        // models.list endpoint — ids must match SUPPORTED_MODELS in
        // crates/aura-core/src/provider/gemini.rs)
        //
        // Refresh by re-querying:
        //   GET https://generativelanguage.googleapis.com/v1beta/models?key=$KEY
        // and updating $/MTok from https://ai.google.dev/pricing.
        // =================================================================

        // Gemini 3.x family
        pricing.insert(
            "gemini-3-pro-preview".to_string(),
            ModelPricing::new(2.50, 10.00).with_cached(0.625),
        );
        pricing.insert(
            "gemini-3.1-pro-preview".to_string(),
            ModelPricing::new(2.50, 10.00).with_cached(0.625),
        );
        pricing.insert(
            "gemini-3-flash-preview".to_string(),
            ModelPricing::new(0.15, 0.60).with_cached(0.0375),
        );
        pricing.insert(
            "gemini-3.5-flash".to_string(),
            ModelPricing::new(0.20, 0.80).with_cached(0.05),
        );
        pricing.insert(
            "gemini-3.1-flash-lite".to_string(),
            ModelPricing::new(0.075, 0.30).with_cached(0.01875),
        );
        pricing.insert(
            "gemini-3.1-flash-lite-preview".to_string(),
            ModelPricing::new(0.075, 0.30).with_cached(0.01875),
        );

        // Gemini 2.5 family (GA)
        pricing.insert(
            "gemini-2.5-pro".to_string(),
            ModelPricing::new(1.25, 10.00).with_cached(0.3125),
        );
        pricing.insert(
            "gemini-2.5-flash".to_string(),
            ModelPricing::new(0.30, 2.50).with_cached(0.075),
        );
        pricing.insert(
            "gemini-2.5-flash-lite".to_string(),
            ModelPricing::new(0.075, 0.30).with_cached(0.01875),
        );

        // Gemini 2.0 family
        pricing.insert(
            "gemini-2.0-flash".to_string(),
            ModelPricing::new(0.10, 0.40).with_cached(0.025),
        );
        pricing.insert(
            "gemini-2.0-flash-001".to_string(),
            ModelPricing::new(0.10, 0.40).with_cached(0.025),
        );
        pricing.insert(
            "gemini-2.0-flash-lite".to_string(),
            ModelPricing::new(0.075, 0.30).with_cached(0.02),
        );
        pricing.insert(
            "gemini-2.0-flash-lite-001".to_string(),
            ModelPricing::new(0.075, 0.30).with_cached(0.02),
        );

        // Floating aliases — same pricing as the canonical model
        // they resolve to (best guess; Google may switch the
        // underlying model without notice).
        pricing.insert(
            "gemini-pro-latest".to_string(),
            ModelPricing::new(1.25, 10.00).with_cached(0.3125),
        );
        pricing.insert(
            "gemini-flash-latest".to_string(),
            ModelPricing::new(0.30, 2.50).with_cached(0.075),
        );
        pricing.insert(
            "gemini-flash-lite-latest".to_string(),
            ModelPricing::new(0.075, 0.30).with_cached(0.01875),
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
        // Together AI serverless chat pricing (captured 2026-05-21)
        // Source: https://docs.together.ai/docs/serverless/models
        // =================================================================

        pricing.insert(
            "meta-llama/Llama-3.3-70B-Instruct-Turbo".to_string(),
            ModelPricing::new(0.88, 0.88),
        );
        pricing.insert(
            "meta-llama/Meta-Llama-3-8B-Instruct-Lite".to_string(),
            ModelPricing::new(0.10, 0.10),
        );
        pricing.insert(
            "deepseek-ai/DeepSeek-V4-Pro".to_string(),
            ModelPricing::new(2.10, 4.40).with_cached(0.20),
        );
        pricing.insert(
            "Qwen/Qwen3.5-397B-A17B".to_string(),
            ModelPricing::new(0.60, 3.60),
        );
        pricing.insert(
            "Qwen/Qwen3.6-Plus".to_string(),
            ModelPricing::new(0.50, 3.00),
        );
        pricing.insert("Qwen/Qwen3.5-9B".to_string(), ModelPricing::new(0.10, 0.15));
        pricing.insert(
            "Qwen/Qwen2.5-7B-Instruct-Turbo".to_string(),
            ModelPricing::new(0.30, 0.30),
        );
        pricing.insert(
            "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8".to_string(),
            ModelPricing::new(2.00, 2.00),
        );
        pricing.insert(
            "Qwen/Qwen3-235B-A22B-Instruct-2507-tput".to_string(),
            ModelPricing::new(0.20, 0.60),
        );
        pricing.insert(
            "openai/gpt-oss-120b".to_string(),
            ModelPricing::new(0.15, 0.60),
        );
        pricing.insert(
            "openai/gpt-oss-20b".to_string(),
            ModelPricing::new(0.05, 0.20),
        );
        pricing.insert(
            "moonshotai/Kimi-K2.6".to_string(),
            ModelPricing::new(1.20, 4.50).with_cached(0.20),
        );
        pricing.insert(
            "moonshotai/Kimi-K2.5".to_string(),
            ModelPricing::new(0.50, 2.80),
        );
        pricing.insert("zai-org/GLM-5.1".to_string(), ModelPricing::new(1.40, 4.40));
        pricing.insert("zai-org/GLM-5".to_string(), ModelPricing::new(1.00, 3.20));
        pricing.insert(
            "essentialai/rnj-1-instruct".to_string(),
            ModelPricing::new(0.15, 0.15),
        );
        pricing.insert(
            "google/gemma-4-31B-it".to_string(),
            ModelPricing::new(0.20, 0.50),
        );
        pricing.insert(
            "google/gemma-3n-E4B-it".to_string(),
            ModelPricing::new(0.06, 0.12),
        );
        pricing.insert(
            "LiquidAI/LFM2-24B-A2B".to_string(),
            ModelPricing::new(0.03, 0.12),
        );
        pricing.insert(
            "deepcogito/cogito-v2-1-671b".to_string(),
            ModelPricing::new(1.25, 1.25),
        );

        // =================================================================
        // Fireworks AI serverless chat pricing (captured 2026-06-28)
        // Source: https://fireworks.ai/pricing (issue #209)
        // Model IDs are namespaced as accounts/fireworks/models/<slug>.
        // =================================================================

        pricing.insert(
            "accounts/fireworks/models/glm-5p2".to_string(),
            ModelPricing::new(1.40, 4.40).with_cached(0.20),
        );
        pricing.insert(
            "accounts/fireworks/models/kimi-k2p6".to_string(),
            ModelPricing::new(1.20, 4.50).with_cached(0.20),
        );
        pricing.insert(
            "accounts/fireworks/models/deepseek-v4-pro".to_string(),
            ModelPricing::new(2.10, 4.40).with_cached(0.20),
        );
        pricing.insert(
            "accounts/fireworks/models/qwen3p6-plus".to_string(),
            ModelPricing::new(0.50, 3.00),
        );
        pricing.insert(
            "accounts/fireworks/models/gpt-oss-120b".to_string(),
            ModelPricing::new(0.15, 0.60),
        );
        pricing.insert(
            "accounts/fireworks/models/gpt-oss-20b".to_string(),
            ModelPricing::new(0.05, 0.20),
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

        Self {
            pricing: RwLock::new(pricing),
        }
    }

    /// Get pricing for a specific model. Returns a copy (ModelPricing is Copy)
    /// since the map is behind a lock.
    pub fn get_pricing(&self, model: &str) -> Option<ModelPricing> {
        self.pricing
            .read()
            .expect("cost pricing lock poisoned")
            .get(model)
            .copied()
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

    /// Add or update pricing for a model. Uses interior mutability so it can
    /// be called through a shared `Arc<CostCalculator>` (e.g. background
    /// refresh) without `&mut`.
    pub fn set_pricing(&self, model: impl Into<String>, pricing: ModelPricing) {
        self.pricing
            .write()
            .expect("cost pricing lock poisoned")
            .insert(model.into(), pricing);
    }

    /// Get all available models with pricing (owned, since the map is locked).
    pub fn models(&self) -> Vec<String> {
        self.pricing
            .read()
            .expect("cost pricing lock poisoned")
            .keys()
            .cloned()
            .collect()
    }

    /// Override pricing from scraped DB rows.
    ///
    /// Each row is keyed by the *scraped* slug (e.g. `glm-5-2`); we map it to
    /// the gateway's *API* slug (e.g. `accounts/fireworks/models/glm-5p2`) via
    /// [`api_slug_for_scraped`] and only override models the gateway serves.
    /// Hardcoded seed prices remain the fallback for anything not matched.
    /// Returns the number of models updated.
    pub fn apply_db_pricing(&self, rows: &[ScrapedPricing]) -> usize {
        let mut updated = 0;
        for row in rows {
            let Some(api_slug) = api_slug_for_scraped(&row.provider, &row.scraped_model_id) else {
                continue;
            };
            let mut pricing = ModelPricing::new(row.input_per_million, row.output_per_million);
            if let Some(cached) = row.cached_input_per_million {
                pricing = pricing.with_cached(cached);
            }
            self.set_pricing(api_slug, pricing);
            updated += 1;
        }
        updated
    }
}

/// A scraped pricing row, decoupled from the aura-db model so aura-core has no
/// DB dependency. The caller (aura-proxy) adapts `ModelPricingSimple` to this.
#[derive(Debug, Clone)]
pub struct ScrapedPricing {
    pub provider: String,
    /// The slug as stored by the scraper in model_pricing.model_id.
    pub scraped_model_id: String,
    pub input_per_million: f64,
    pub output_per_million: f64,
    pub cached_input_per_million: Option<f64>,
}

/// Map a (provider, scraped slug) to the gateway's API model slug.
///
/// The scraper stores normalized *display* slugs from each provider's pricing
/// page (e.g. `glm-5-2`), which differ from the *API* model IDs the gateway
/// routes with (e.g. `accounts/fireworks/models/glm-5p2`). This curated map is
/// the bridge. Keep it in sync with each provider's `SUPPORTED_MODELS`.
/// Returns `None` for rows we don't (yet) map — those keep their seed price.
pub fn api_slug_for_scraped(provider: &str, scraped: &str) -> Option<&'static str> {
    match (provider, scraped) {
        // Fireworks — accounts/fireworks/models/<slug>
        ("fireworks", "glm-5-2") => Some("accounts/fireworks/models/glm-5p2"),
        ("fireworks", "kimi-k2-6") => Some("accounts/fireworks/models/kimi-k2p6"),
        ("fireworks", "deepseek-v4-pro") => Some("accounts/fireworks/models/deepseek-v4-pro"),
        ("fireworks", "qwen3-6-plus") => Some("accounts/fireworks/models/qwen3p6-plus"),
        ("fireworks", "gpt-oss-120b") => Some("accounts/fireworks/models/gpt-oss-120b"),
        ("fireworks", "gpt-oss-20b") => Some("accounts/fireworks/models/gpt-oss-20b"),
        // Together — vendor/Model-Name slugs
        ("together", "llama-3-3-70b") => Some("meta-llama/Llama-3.3-70B-Instruct-Turbo"),
        ("together", "deepseek-v4-pro") => Some("deepseek-ai/DeepSeek-V4-Pro"),
        ("together", "qwen3-6-plus") => Some("Qwen/Qwen3.6-Plus"),
        ("together", "gpt-oss-120b") => Some("openai/gpt-oss-120b"),
        ("together", "gpt-oss-20b") => Some("openai/gpt-oss-20b"),
        _ => None,
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
        let calculator = CostCalculator::new();
        calculator.set_pricing("custom-model", ModelPricing::new(1.00, 2.00));
        let cost = calculator.calculate_cost("custom-model", 1_000_000, 1_000_000, None, None);
        assert!(cost.is_some());
        assert!((cost.unwrap() - 3.00).abs() < 0.001);
    }

    #[test]
    fn test_apply_db_pricing_overrides_seed_for_mapped_slug() {
        let calculator = CostCalculator::new();
        // Seed price for glm-5p2 is 1.40/4.40 — scraped row should override it.
        let rows = vec![
            ScrapedPricing {
                provider: "fireworks".to_string(),
                scraped_model_id: "glm-5-2".to_string(),
                input_per_million: 2.00,
                output_per_million: 6.00,
                cached_input_per_million: Some(0.50),
            },
            // Unmapped slug — must be ignored, not panic.
            ScrapedPricing {
                provider: "fireworks".to_string(),
                scraped_model_id: "some-unknown-model".to_string(),
                input_per_million: 99.0,
                output_per_million: 99.0,
                cached_input_per_million: None,
            },
        ];

        let updated = calculator.apply_db_pricing(&rows);
        assert_eq!(updated, 1, "only the mapped row should apply");

        let pricing = calculator
            .get_pricing("accounts/fireworks/models/glm-5p2")
            .expect("glm-5p2 should be priced");
        assert_eq!(pricing.input_per_million, 2.00);
        assert_eq!(pricing.output_per_million, 6.00);
        assert_eq!(pricing.cached_input_per_million, Some(0.50));
    }

    #[test]
    fn test_api_slug_for_scraped_mapping() {
        assert_eq!(
            api_slug_for_scraped("fireworks", "glm-5-2"),
            Some("accounts/fireworks/models/glm-5p2")
        );
        assert_eq!(
            api_slug_for_scraped("together", "gpt-oss-120b"),
            Some("openai/gpt-oss-120b")
        );
        assert_eq!(api_slug_for_scraped("fireworks", "nonexistent"), None);
        assert_eq!(api_slug_for_scraped("unknown-provider", "glm-5-2"), None);
    }
}
