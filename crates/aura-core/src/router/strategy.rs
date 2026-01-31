//! Routing strategies for load balancing
//!
//! Supports multiple strategies for distributing requests across endpoints:
//! - **RoundRobin**: Evenly distribute requests in order
//! - **Weighted**: Distribute based on endpoint weights
//! - **Random**: Random selection
//! - **LeastLatency**: Route to endpoint with best health/success rate
//! - **RegionBased**: Route based on client region/latency
//! - **Priority**: Route to lowest priority healthy endpoint (failover)
//! - **TraitBased**: Route based on model capabilities
//! - **CostOptimized**: Route to cheapest capable model
//!
//! Agentic strategies:
//! - **ToolAware**: Route based on tools requested (code tools → Claude, etc.)
//! - **ContextAdaptive**: Route based on input token count to appropriate context window
//! - **StickySession**: Maintain endpoint affinity within a conversation
//! - **ReasoningDepth**: Route complex reasoning to thinking models (o1, Claude)

use super::endpoint::ProviderEndpoint;
use super::health::HealthTracker;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Routing strategy for load balancing across endpoints
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RoutingStrategy {
    /// Distribute requests evenly in round-robin order
    #[default]
    RoundRobin,
    /// Distribute based on endpoint weights (higher weight = more traffic)
    Weighted,
    /// Random selection from available endpoints
    Random,
    /// Route to endpoint with lowest latency/fewest errors
    LeastLatency,
    /// Route based on region/geographic proximity
    RegionBased,
    /// Route to the lowest priority endpoint that is healthy (for failover)
    Priority,
    /// Route based on model traits/capabilities (code, creative, fast, etc.)
    TraitBased,
    /// Route based on cost optimization (cheapest capable model)
    CostOptimized,

    // === Agentic Strategies ===
    /// Route based on tools in the request (code tools → Claude, web → GPT-4o)
    ToolAware,
    /// Route based on input token count to models with appropriate context windows
    ContextAdaptive,
    /// Maintain endpoint affinity within a conversation (use previous_response_id)
    StickySession,
    /// Route complex multi-step reasoning to thinking models (o1, Claude with thinking)
    ReasoningDepth,
}

impl std::fmt::Display for RoutingStrategy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RoutingStrategy::RoundRobin => write!(f, "round_robin"),
            RoutingStrategy::Weighted => write!(f, "weighted"),
            RoutingStrategy::Random => write!(f, "random"),
            RoutingStrategy::LeastLatency => write!(f, "least_latency"),
            RoutingStrategy::RegionBased => write!(f, "region_based"),
            RoutingStrategy::Priority => write!(f, "priority"),
            RoutingStrategy::TraitBased => write!(f, "trait_based"),
            RoutingStrategy::CostOptimized => write!(f, "cost_optimized"),
            RoutingStrategy::ToolAware => write!(f, "tool_aware"),
            RoutingStrategy::ContextAdaptive => write!(f, "context_adaptive"),
            RoutingStrategy::StickySession => write!(f, "sticky_session"),
            RoutingStrategy::ReasoningDepth => write!(f, "reasoning_depth"),
        }
    }
}

/// Model traits/capabilities for trait-based routing
///
/// These traits describe what a model is good at, allowing intelligent
/// routing based on the nature of the request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelTrait {
    /// Good at code generation and understanding
    Code,
    /// Good at creative writing and storytelling
    Creative,
    /// Good at data analysis and reasoning
    Analysis,
    /// Good at math and calculations
    Math,
    /// Supports vision/image understanding
    Vision,
    /// Fast response times (lower latency)
    Fast,
    /// Cost-effective (cheaper per token)
    Cheap,
    /// Large context window
    LongContext,
    /// Good at following complex instructions
    Instruction,
    /// Good at multi-turn conversations
    Conversational,
    /// Supports function/tool calling
    ToolUse,
    /// Good at summarization
    Summarization,
    /// Good at translation
    Translation,
    /// Supports structured output (JSON mode)
    StructuredOutput,
    /// Good at research and factual queries
    Research,
    /// Extended thinking / chain of thought
    Reasoning,
}

impl std::fmt::Display for ModelTrait {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModelTrait::Code => write!(f, "code"),
            ModelTrait::Creative => write!(f, "creative"),
            ModelTrait::Analysis => write!(f, "analysis"),
            ModelTrait::Math => write!(f, "math"),
            ModelTrait::Vision => write!(f, "vision"),
            ModelTrait::Fast => write!(f, "fast"),
            ModelTrait::Cheap => write!(f, "cheap"),
            ModelTrait::LongContext => write!(f, "long_context"),
            ModelTrait::Instruction => write!(f, "instruction"),
            ModelTrait::Conversational => write!(f, "conversational"),
            ModelTrait::ToolUse => write!(f, "tool_use"),
            ModelTrait::Summarization => write!(f, "summarization"),
            ModelTrait::Translation => write!(f, "translation"),
            ModelTrait::StructuredOutput => write!(f, "structured_output"),
            ModelTrait::Research => write!(f, "research"),
            ModelTrait::Reasoning => write!(f, "reasoning"),
        }
    }
}

impl ModelTrait {
    /// Parse a trait from a string
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "code" | "coding" | "programming" => Some(ModelTrait::Code),
            "creative" | "creative_writing" | "writing" => Some(ModelTrait::Creative),
            "analysis" | "analytical" | "data" => Some(ModelTrait::Analysis),
            "math" | "mathematics" | "calculation" => Some(ModelTrait::Math),
            "vision" | "image" | "multimodal" => Some(ModelTrait::Vision),
            "fast" | "speed" | "low_latency" => Some(ModelTrait::Fast),
            "cheap" | "cost" | "budget" | "economical" => Some(ModelTrait::Cheap),
            "long_context" | "large_context" | "context" => Some(ModelTrait::LongContext),
            "instruction" | "instructions" | "following" => Some(ModelTrait::Instruction),
            "conversational" | "chat" | "dialogue" => Some(ModelTrait::Conversational),
            "tool_use" | "tools" | "function_calling" | "functions" => Some(ModelTrait::ToolUse),
            "summarization" | "summary" | "summarize" => Some(ModelTrait::Summarization),
            "translation" | "translate" => Some(ModelTrait::Translation),
            "structured_output" | "json" | "structured" => Some(ModelTrait::StructuredOutput),
            "research" | "factual" | "knowledge" => Some(ModelTrait::Research),
            "reasoning" | "thinking" | "cot" | "chain_of_thought" => Some(ModelTrait::Reasoning),
            _ => None,
        }
    }

    /// Get all available traits
    pub fn all() -> &'static [ModelTrait] {
        &[
            ModelTrait::Code,
            ModelTrait::Creative,
            ModelTrait::Analysis,
            ModelTrait::Math,
            ModelTrait::Vision,
            ModelTrait::Fast,
            ModelTrait::Cheap,
            ModelTrait::LongContext,
            ModelTrait::Instruction,
            ModelTrait::Conversational,
            ModelTrait::ToolUse,
            ModelTrait::Summarization,
            ModelTrait::Translation,
            ModelTrait::StructuredOutput,
            ModelTrait::Research,
            ModelTrait::Reasoning,
        ]
    }
}

/// Model profile with traits and cost information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelProfile {
    /// Model identifier
    pub model: String,
    /// Provider name
    pub provider: String,
    /// Traits this model excels at
    pub traits: Vec<ModelTrait>,
    /// Cost per 1M input tokens (USD)
    pub input_cost_per_million: f64,
    /// Cost per 1M output tokens (USD)
    pub output_cost_per_million: f64,
    /// Average latency in ms (approximate)
    pub avg_latency_ms: Option<u32>,
    /// Maximum context window size
    pub max_context: Option<u32>,
}

impl ModelProfile {
    /// Create a new model profile
    pub fn new(model: impl Into<String>, provider: impl Into<String>) -> Self {
        Self {
            model: model.into(),
            provider: provider.into(),
            traits: Vec::new(),
            input_cost_per_million: 0.0,
            output_cost_per_million: 0.0,
            avg_latency_ms: None,
            max_context: None,
        }
    }

    /// Add traits to the profile
    pub fn with_traits(mut self, traits: impl IntoIterator<Item = ModelTrait>) -> Self {
        self.traits.extend(traits);
        self
    }

    /// Set cost information
    pub fn with_cost(mut self, input_per_million: f64, output_per_million: f64) -> Self {
        self.input_cost_per_million = input_per_million;
        self.output_cost_per_million = output_per_million;
        self
    }

    /// Set latency
    pub fn with_latency(mut self, latency_ms: u32) -> Self {
        self.avg_latency_ms = Some(latency_ms);
        self
    }

    /// Set context window
    pub fn with_context(mut self, max_context: u32) -> Self {
        self.max_context = Some(max_context);
        self
    }

    /// Check if this model has a specific trait
    pub fn has_trait(&self, t: ModelTrait) -> bool {
        self.traits.contains(&t)
    }

    /// Calculate a match score for required traits (0.0 - 1.0)
    pub fn trait_match_score(&self, required: &[ModelTrait]) -> f64 {
        if required.is_empty() {
            return 1.0;
        }
        let matched = required.iter().filter(|t| self.has_trait(**t)).count();
        matched as f64 / required.len() as f64
    }

    /// Get estimated cost for a request (input + output tokens)
    pub fn estimate_cost(&self, input_tokens: u32, output_tokens: u32) -> f64 {
        (input_tokens as f64 * self.input_cost_per_million / 1_000_000.0)
            + (output_tokens as f64 * self.output_cost_per_million / 1_000_000.0)
    }
}

/// Default model profiles for common models
impl ModelProfile {
    /// Get default profiles for well-known models
    pub fn defaults() -> Vec<ModelProfile> {
        vec![
            // OpenAI models
            ModelProfile::new("gpt-4o", "openai")
                .with_traits([
                    ModelTrait::Code,
                    ModelTrait::Analysis,
                    ModelTrait::Vision,
                    ModelTrait::ToolUse,
                    ModelTrait::Instruction,
                    ModelTrait::StructuredOutput,
                ])
                .with_cost(2.50, 10.00)
                .with_latency(800)
                .with_context(128000),
            ModelProfile::new("gpt-4o-mini", "openai")
                .with_traits([
                    ModelTrait::Fast,
                    ModelTrait::Cheap,
                    ModelTrait::ToolUse,
                    ModelTrait::StructuredOutput,
                ])
                .with_cost(0.15, 0.60)
                .with_latency(400)
                .with_context(128000),
            ModelProfile::new("gpt-4-turbo", "openai")
                .with_traits([
                    ModelTrait::Code,
                    ModelTrait::Analysis,
                    ModelTrait::Vision,
                    ModelTrait::LongContext,
                ])
                .with_cost(10.00, 30.00)
                .with_latency(1200)
                .with_context(128000),
            ModelProfile::new("o1", "openai")
                .with_traits([
                    ModelTrait::Reasoning,
                    ModelTrait::Math,
                    ModelTrait::Code,
                    ModelTrait::Analysis,
                ])
                .with_cost(15.00, 60.00)
                .with_latency(5000)
                .with_context(200000),
            // Anthropic models
            ModelProfile::new("claude-sonnet-4-20250514", "anthropic")
                .with_traits([
                    ModelTrait::Code,
                    ModelTrait::Analysis,
                    ModelTrait::Reasoning,
                    ModelTrait::ToolUse,
                    ModelTrait::LongContext,
                ])
                .with_cost(3.00, 15.00)
                .with_latency(600)
                .with_context(200000),
            ModelProfile::new("claude-opus-4-20250514", "anthropic")
                .with_traits([
                    ModelTrait::Code,
                    ModelTrait::Creative,
                    ModelTrait::Analysis,
                    ModelTrait::Reasoning,
                    ModelTrait::Research,
                    ModelTrait::LongContext,
                ])
                .with_cost(15.00, 75.00)
                .with_latency(1500)
                .with_context(200000),
            ModelProfile::new("claude-3-5-haiku-20241022", "anthropic")
                .with_traits([
                    ModelTrait::Fast,
                    ModelTrait::Cheap,
                    ModelTrait::Code,
                    ModelTrait::ToolUse,
                ])
                .with_cost(0.80, 4.00)
                .with_latency(300)
                .with_context(200000),
            // Google models
            ModelProfile::new("gemini-2.0-flash", "google")
                .with_traits([
                    ModelTrait::Fast,
                    ModelTrait::Cheap,
                    ModelTrait::Vision,
                    ModelTrait::ToolUse,
                ])
                .with_cost(0.075, 0.30)
                .with_latency(250)
                .with_context(1000000),
            ModelProfile::new("gemini-2.0-pro", "google")
                .with_traits([
                    ModelTrait::Code,
                    ModelTrait::Analysis,
                    ModelTrait::Reasoning,
                    ModelTrait::LongContext,
                ])
                .with_cost(1.25, 5.00)
                .with_latency(800)
                .with_context(2000000),
        ]
    }
}

/// Region identifier for region-based routing
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Region {
    /// US East (Virginia)
    UsEast,
    /// US West (Oregon/California)
    UsWest,
    /// EU West (Ireland/London)
    EuWest,
    /// EU Central (Frankfurt)
    EuCentral,
    /// Asia Pacific (Tokyo)
    AsiaPacificNortheast,
    /// Asia Pacific (Singapore)
    AsiaPacificSoutheast,
    /// Asia Pacific (Sydney)
    AsiaPacificSouth,
    /// Custom region with identifier
    Custom(String),
}

impl std::fmt::Display for Region {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Region::UsEast => write!(f, "us-east"),
            Region::UsWest => write!(f, "us-west"),
            Region::EuWest => write!(f, "eu-west"),
            Region::EuCentral => write!(f, "eu-central"),
            Region::AsiaPacificNortheast => write!(f, "ap-northeast"),
            Region::AsiaPacificSoutheast => write!(f, "ap-southeast"),
            Region::AsiaPacificSouth => write!(f, "ap-south"),
            Region::Custom(s) => write!(f, "{}", s),
        }
    }
}

impl Region {
    /// Parse a region from a string
    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "us-east" | "us-east-1" | "virginia" => Region::UsEast,
            "us-west" | "us-west-2" | "oregon" => Region::UsWest,
            "eu-west" | "eu-west-1" | "ireland" => Region::EuWest,
            "eu-central" | "eu-central-1" | "frankfurt" => Region::EuCentral,
            "ap-northeast" | "ap-northeast-1" | "tokyo" => Region::AsiaPacificNortheast,
            "ap-southeast" | "ap-southeast-1" | "singapore" => Region::AsiaPacificSoutheast,
            "ap-south" | "ap-south-1" | "sydney" | "australia" => Region::AsiaPacificSouth,
            other => Region::Custom(other.to_string()),
        }
    }

    /// Get approximate latency penalty between regions (in ms)
    /// Lower is better - used for region-based routing decisions
    pub fn latency_to(&self, other: &Region) -> u32 {
        use Region::*;
        match (self, other) {
            // Same region = 0ms penalty
            (a, b) if a == b => 0,

            // US regions are close
            (UsEast, UsWest) | (UsWest, UsEast) => 60,

            // EU regions are close
            (EuWest, EuCentral) | (EuCentral, EuWest) => 20,

            // US to EU
            (UsEast, EuWest) | (EuWest, UsEast) => 80,
            (UsEast, EuCentral) | (EuCentral, UsEast) => 90,
            (UsWest, EuWest) | (EuWest, UsWest) => 130,
            (UsWest, EuCentral) | (EuCentral, UsWest) => 140,

            // US to Asia
            (UsWest, AsiaPacificNortheast) | (AsiaPacificNortheast, UsWest) => 100,
            (UsWest, AsiaPacificSoutheast) | (AsiaPacificSoutheast, UsWest) => 150,
            (UsEast, AsiaPacificNortheast) | (AsiaPacificNortheast, UsEast) => 180,
            (UsEast, AsiaPacificSoutheast) | (AsiaPacificSoutheast, UsEast) => 200,

            // EU to Asia
            (EuWest, AsiaPacificNortheast) | (AsiaPacificNortheast, EuWest) => 220,
            (EuWest, AsiaPacificSoutheast) | (AsiaPacificSoutheast, EuWest) => 180,
            (EuCentral, AsiaPacificNortheast) | (AsiaPacificNortheast, EuCentral) => 200,
            (EuCentral, AsiaPacificSoutheast) | (AsiaPacificSoutheast, EuCentral) => 170,

            // Asia regions
            (AsiaPacificNortheast, AsiaPacificSoutheast)
            | (AsiaPacificSoutheast, AsiaPacificNortheast) => 70,
            (AsiaPacificNortheast, AsiaPacificSouth) | (AsiaPacificSouth, AsiaPacificNortheast) => {
                120
            }
            (AsiaPacificSoutheast, AsiaPacificSouth) | (AsiaPacificSouth, AsiaPacificSoutheast) => {
                80
            }

            // Default for any unspecified combination
            _ => 150,
        }
    }
}

/// Tool category for tool-aware routing
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCategory {
    /// Code execution tools (run code, file operations)
    CodeExecution,
    /// Web browsing/search tools
    WebSearch,
    /// Data analysis tools (CSV, SQL, etc.)
    DataAnalysis,
    /// Image/vision tools
    ImageProcessing,
    /// File system tools
    FileSystem,
    /// API/HTTP tools
    ApiCalls,
    /// Math/calculation tools
    Calculator,
    /// Memory/retrieval tools
    Memory,
    /// Custom tool category
    Custom(String),
}

impl ToolCategory {
    /// Infer tool category from tool name
    pub fn from_tool_name(name: &str) -> Self {
        let name_lower = name.to_lowercase();
        if name_lower.contains("code")
            || name_lower.contains("execute")
            || name_lower.contains("python")
            || name_lower.contains("bash")
        {
            ToolCategory::CodeExecution
        } else if name_lower.contains("search")
            || name_lower.contains("web")
            || name_lower.contains("browse")
        {
            ToolCategory::WebSearch
        } else if name_lower.contains("csv")
            || name_lower.contains("sql")
            || name_lower.contains("data")
            || name_lower.contains("analyze")
        {
            ToolCategory::DataAnalysis
        } else if name_lower.contains("image")
            || name_lower.contains("vision")
            || name_lower.contains("screenshot")
        {
            ToolCategory::ImageProcessing
        } else if name_lower.contains("file")
            || name_lower.contains("read")
            || name_lower.contains("write")
            || name_lower.contains("directory")
        {
            ToolCategory::FileSystem
        } else if name_lower.contains("api")
            || name_lower.contains("http")
            || name_lower.contains("fetch")
            || name_lower.contains("request")
        {
            ToolCategory::ApiCalls
        } else if name_lower.contains("math")
            || name_lower.contains("calc")
            || name_lower.contains("compute")
        {
            ToolCategory::Calculator
        } else if name_lower.contains("memory")
            || name_lower.contains("retrieve")
            || name_lower.contains("recall")
        {
            ToolCategory::Memory
        } else {
            ToolCategory::Custom(name.to_string())
        }
    }

    /// Get recommended model traits for this tool category
    pub fn recommended_traits(&self) -> Vec<ModelTrait> {
        match self {
            ToolCategory::CodeExecution => vec![ModelTrait::Code, ModelTrait::ToolUse],
            ToolCategory::WebSearch => vec![ModelTrait::Research, ModelTrait::ToolUse],
            ToolCategory::DataAnalysis => {
                vec![ModelTrait::Analysis, ModelTrait::Code, ModelTrait::ToolUse]
            }
            ToolCategory::ImageProcessing => vec![ModelTrait::Vision, ModelTrait::ToolUse],
            ToolCategory::FileSystem => vec![ModelTrait::Code, ModelTrait::ToolUse],
            ToolCategory::ApiCalls => vec![ModelTrait::ToolUse, ModelTrait::StructuredOutput],
            ToolCategory::Calculator => vec![ModelTrait::Math, ModelTrait::ToolUse],
            ToolCategory::Memory => vec![ModelTrait::LongContext, ModelTrait::ToolUse],
            ToolCategory::Custom(_) => vec![ModelTrait::ToolUse],
        }
    }
}

/// Context for agentic routing decisions
#[derive(Debug, Clone, Default)]
pub struct AgentContext {
    /// Tools requested in this request
    pub tools: Vec<String>,
    /// Estimated input token count
    pub estimated_tokens: Option<u32>,
    /// Previous response ID for session affinity
    pub previous_response_id: Option<String>,
    /// Whether this appears to be a complex reasoning task
    pub requires_reasoning: bool,
    /// Session ID for sticky routing
    pub session_id: Option<String>,
}

impl AgentContext {
    /// Create a new agent context
    pub fn new() -> Self {
        Self::default()
    }

    /// Add tools to the context
    pub fn with_tools(mut self, tools: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.tools = tools.into_iter().map(|t| t.into()).collect();
        self
    }

    /// Set estimated token count
    pub fn with_tokens(mut self, tokens: u32) -> Self {
        self.estimated_tokens = Some(tokens);
        self
    }

    /// Set previous response ID for session affinity
    pub fn with_previous_response(mut self, response_id: impl Into<String>) -> Self {
        self.previous_response_id = Some(response_id.into());
        self
    }

    /// Mark as requiring reasoning
    pub fn with_reasoning(mut self) -> Self {
        self.requires_reasoning = true;
        self
    }

    /// Get tool categories from the tools list
    pub fn tool_categories(&self) -> Vec<ToolCategory> {
        self.tools
            .iter()
            .map(|t| ToolCategory::from_tool_name(t))
            .collect()
    }

    /// Get recommended traits based on tools
    pub fn recommended_traits(&self) -> HashSet<ModelTrait> {
        let mut traits = HashSet::new();
        for category in self.tool_categories() {
            traits.extend(category.recommended_traits());
        }
        if self.requires_reasoning {
            traits.insert(ModelTrait::Reasoning);
        }
        traits
    }
}

/// Selector for choosing endpoints based on strategy
pub struct StrategySelector {
    /// Current strategy
    strategy: RoutingStrategy,
    /// Counter for round-robin
    counter: AtomicUsize,
    /// Preferred region for region-based routing
    preferred_region: Option<Region>,
    /// Required traits for trait-based routing
    required_traits: Vec<ModelTrait>,
    /// Model profiles for trait/cost routing
    model_profiles: Vec<ModelProfile>,
    /// Agent context for agentic strategies
    agent_context: Option<AgentContext>,
    /// Session affinity cache (session_id -> endpoint_id)
    #[allow(dead_code)]
    session_cache: std::collections::HashMap<String, String>,
}

impl StrategySelector {
    /// Create a new selector with the given strategy
    pub fn new(strategy: RoutingStrategy) -> Self {
        Self {
            strategy,
            counter: AtomicUsize::new(0),
            preferred_region: None,
            required_traits: Vec::new(),
            model_profiles: ModelProfile::defaults(),
            agent_context: None,
            session_cache: std::collections::HashMap::new(),
        }
    }

    /// Set agent context for agentic strategies
    pub fn with_agent_context(mut self, context: AgentContext) -> Self {
        self.agent_context = Some(context);
        self
    }

    /// Set the preferred region for region-based routing
    pub fn with_region(mut self, region: Region) -> Self {
        self.preferred_region = Some(region);
        self
    }

    /// Set required traits for trait-based routing
    pub fn with_traits(mut self, traits: impl IntoIterator<Item = ModelTrait>) -> Self {
        self.required_traits = traits.into_iter().collect();
        self
    }

    /// Add a model profile for trait/cost routing
    pub fn with_profile(mut self, profile: ModelProfile) -> Self {
        self.model_profiles.push(profile);
        self
    }

    /// Set all model profiles
    pub fn with_profiles(mut self, profiles: Vec<ModelProfile>) -> Self {
        self.model_profiles = profiles;
        self
    }

    /// Get the current strategy
    pub fn strategy(&self) -> RoutingStrategy {
        self.strategy
    }

    /// Get the required traits
    pub fn required_traits(&self) -> &[ModelTrait] {
        &self.required_traits
    }

    /// Select an endpoint from the available endpoints
    pub fn select<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
        health_tracker: &HealthTracker,
    ) -> Option<&'a ProviderEndpoint> {
        if endpoints.is_empty() {
            return None;
        }

        // Filter to enabled endpoints only
        let enabled: Vec<_> = endpoints.iter().filter(|e| e.enabled).copied().collect();
        if enabled.is_empty() {
            return None;
        }

        match self.strategy {
            RoutingStrategy::RoundRobin => self.select_round_robin(&enabled),
            RoutingStrategy::Weighted => self.select_weighted(&enabled),
            RoutingStrategy::Random => self.select_random(&enabled),
            RoutingStrategy::LeastLatency => self.select_least_latency(&enabled, health_tracker),
            RoutingStrategy::RegionBased => self.select_region_based(&enabled),
            RoutingStrategy::Priority => self.select_priority(&enabled),
            RoutingStrategy::TraitBased => self.select_trait_based(&enabled),
            RoutingStrategy::CostOptimized => self.select_cost_optimized(&enabled),
            // Agentic strategies
            RoutingStrategy::ToolAware => self.select_tool_aware(&enabled),
            RoutingStrategy::ContextAdaptive => self.select_context_adaptive(&enabled),
            RoutingStrategy::StickySession => self.select_sticky_session(&enabled),
            RoutingStrategy::ReasoningDepth => self.select_reasoning_depth(&enabled),
        }
    }

    /// Round-robin selection
    fn select_round_robin<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
    ) -> Option<&'a ProviderEndpoint> {
        let idx = self.counter.fetch_add(1, Ordering::Relaxed) % endpoints.len();
        Some(endpoints[idx])
    }

    /// Weighted selection based on endpoint weights
    fn select_weighted<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
    ) -> Option<&'a ProviderEndpoint> {
        let total_weight: u32 = endpoints.iter().map(|e| e.weight).sum();
        if total_weight == 0 {
            return self.select_round_robin(endpoints);
        }

        let mut rng = rand::thread_rng();
        let target = rng.gen_range(0..total_weight);
        let mut cumulative = 0;

        for endpoint in endpoints {
            cumulative += endpoint.weight;
            if target < cumulative {
                return Some(endpoint);
            }
        }

        // Fallback (shouldn't reach here)
        endpoints.last().copied()
    }

    /// Random selection
    fn select_random<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
    ) -> Option<&'a ProviderEndpoint> {
        let mut rng = rand::thread_rng();
        let idx = rng.gen_range(0..endpoints.len());
        Some(endpoints[idx])
    }

    /// Select endpoint with best health/latency
    fn select_least_latency<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
        health_tracker: &HealthTracker,
    ) -> Option<&'a ProviderEndpoint> {
        // Score each endpoint based on health
        let mut best: Option<(&ProviderEndpoint, f64)> = None;

        for endpoint in endpoints {
            if let Some(health) = health_tracker.get_health(&endpoint.id) {
                let success_rate = health.success_rate();
                // Higher success rate = better score
                if best.is_none() || success_rate > best.unwrap().1 {
                    best = Some((endpoint, success_rate));
                }
            } else {
                // No health data, assume good
                if best.is_none() {
                    best = Some((endpoint, 1.0));
                }
            }
        }

        best.map(|(e, _)| e)
    }

    /// Select endpoint based on region proximity
    fn select_region_based<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
    ) -> Option<&'a ProviderEndpoint> {
        let preferred = match &self.preferred_region {
            Some(region) => region,
            None => return self.select_round_robin(endpoints),
        };

        // Find endpoints with region tags and score by latency
        let mut scored: Vec<(&'a ProviderEndpoint, u32)> = endpoints
            .iter()
            .map(|e| {
                let latency = e
                    .tags
                    .iter()
                    .find(|t| {
                        t.starts_with("region:")
                            || t.contains("us-")
                            || t.contains("eu-")
                            || t.contains("ap-")
                    })
                    .map(|tag| {
                        let region_str = tag.strip_prefix("region:").unwrap_or(tag);
                        let region = Region::parse(region_str);
                        preferred.latency_to(&region)
                    })
                    .unwrap_or(100); // Default latency if no region tag
                (*e, latency)
            })
            .collect();

        // Sort by latency (lowest first)
        scored.sort_by_key(|(_, latency)| *latency);

        scored.first().map(|(e, _)| *e)
    }

    /// Select endpoint with lowest priority number (highest priority)
    fn select_priority<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
    ) -> Option<&'a ProviderEndpoint> {
        endpoints.iter().min_by_key(|e| e.priority).copied()
    }

    /// Select endpoint based on model traits
    fn select_trait_based<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
    ) -> Option<&'a ProviderEndpoint> {
        if self.required_traits.is_empty() {
            return self.select_round_robin(endpoints);
        }

        // Score each endpoint based on trait match
        let mut scored: Vec<_> = endpoints
            .iter()
            .map(|e| {
                // Find matching model profile
                let score = self
                    .model_profiles
                    .iter()
                    .filter(|p| e.supports_model(&p.model) || e.provider_name() == p.provider)
                    .map(|p| p.trait_match_score(&self.required_traits))
                    .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                    .unwrap_or(0.0);
                (*e, score)
            })
            .collect();

        // Sort by score (highest first)
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        // Return best matching or fall back to round-robin if no good match
        if scored.first().map(|(_, s)| *s > 0.0).unwrap_or(false) {
            scored.first().map(|(e, _)| *e)
        } else {
            self.select_round_robin(endpoints)
        }
    }

    /// Select cheapest endpoint that meets requirements
    fn select_cost_optimized<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
    ) -> Option<&'a ProviderEndpoint> {
        // Score each endpoint based on cost (lower is better)
        let mut scored: Vec<_> = endpoints
            .iter()
            .map(|e| {
                // Find matching model profile and get cost
                let cost = self
                    .model_profiles
                    .iter()
                    .filter(|p| e.supports_model(&p.model) || e.provider_name() == p.provider)
                    .map(|p| {
                        // If we have required traits, check if model meets them
                        let trait_score = if self.required_traits.is_empty() {
                            1.0
                        } else {
                            p.trait_match_score(&self.required_traits)
                        };

                        // Only consider models that meet at least 50% of required traits
                        if trait_score >= 0.5 {
                            // Use average of input and output cost as simple cost metric
                            (p.input_cost_per_million + p.output_cost_per_million) / 2.0
                        } else {
                            f64::MAX // Don't select if doesn't meet trait requirements
                        }
                    })
                    .min_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                    .unwrap_or(f64::MAX);
                (*e, cost)
            })
            .collect();

        // Sort by cost (lowest first)
        scored.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

        // Return cheapest or fall back to round-robin
        if scored.first().map(|(_, c)| *c < f64::MAX).unwrap_or(false) {
            scored.first().map(|(e, _)| *e)
        } else {
            self.select_round_robin(endpoints)
        }
    }

    // === Agentic Strategy Implementations ===

    /// Select endpoint based on tools in the request
    ///
    /// Analyzes the tools requested and routes to models that excel at those tool types:
    /// - Code execution tools → Claude, GPT-4
    /// - Web search tools → GPT-4o
    /// - Data analysis → GPT-4, Claude
    /// - Vision tools → GPT-4o, Claude, Gemini
    fn select_tool_aware<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
    ) -> Option<&'a ProviderEndpoint> {
        let context = match &self.agent_context {
            Some(ctx) => ctx,
            None => return self.select_round_robin(endpoints),
        };

        if context.tools.is_empty() {
            return self.select_round_robin(endpoints);
        }

        // Get recommended traits from tools
        let recommended_traits: Vec<_> = context.recommended_traits().into_iter().collect();

        // Score each endpoint based on tool compatibility
        let mut scored: Vec<_> = endpoints
            .iter()
            .map(|e| {
                let score = self
                    .model_profiles
                    .iter()
                    .filter(|p| e.supports_model(&p.model) || e.provider_name() == p.provider)
                    .map(|p| p.trait_match_score(&recommended_traits))
                    .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                    .unwrap_or(0.0);
                (*e, score)
            })
            .collect();

        // Sort by score (highest first)
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        if scored.first().map(|(_, s)| *s > 0.0).unwrap_or(false) {
            scored.first().map(|(e, _)| *e)
        } else {
            self.select_round_robin(endpoints)
        }
    }

    /// Select endpoint based on input context length
    ///
    /// Routes to models with appropriate context windows:
    /// - Small context (<8K) → Any model
    /// - Medium context (8K-32K) → Most models
    /// - Large context (32K-128K) → GPT-4, Claude
    /// - Very large context (>128K) → Gemini, Claude
    fn select_context_adaptive<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
    ) -> Option<&'a ProviderEndpoint> {
        let context = match &self.agent_context {
            Some(ctx) => ctx,
            None => return self.select_round_robin(endpoints),
        };

        let estimated_tokens = context.estimated_tokens.unwrap_or(0);

        // Filter to endpoints with sufficient context window
        let suitable: Vec<_> = endpoints
            .iter()
            .filter(|e| {
                // Find model profile and check context window
                self.model_profiles
                    .iter()
                    .filter(|p| e.supports_model(&p.model) || e.provider_name() == p.provider)
                    .any(|p| {
                        p.max_context
                            .map(|ctx| ctx >= estimated_tokens)
                            .unwrap_or(true) // Assume sufficient if not specified
                    })
            })
            .copied()
            .collect();

        if suitable.is_empty() {
            // No endpoint with sufficient context, return largest
            let mut scored: Vec<_> = endpoints
                .iter()
                .map(|e| {
                    let max_ctx = self
                        .model_profiles
                        .iter()
                        .filter(|p| e.supports_model(&p.model) || e.provider_name() == p.provider)
                        .filter_map(|p| p.max_context)
                        .max()
                        .unwrap_or(0);
                    (*e, max_ctx)
                })
                .collect();
            scored.sort_by_key(|(_, ctx)| std::cmp::Reverse(*ctx));
            return scored.first().map(|(e, _)| *e);
        }

        // Among suitable, prefer cheaper models
        let mut scored: Vec<_> = suitable
            .iter()
            .map(|e| {
                let cost = self
                    .model_profiles
                    .iter()
                    .filter(|p| e.supports_model(&p.model) || e.provider_name() == p.provider)
                    .map(|p| (p.input_cost_per_million + p.output_cost_per_million) / 2.0)
                    .min_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                    .unwrap_or(f64::MAX);
                (*e, cost)
            })
            .collect();

        scored.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
        scored.first().map(|(e, _)| *e)
    }

    /// Select endpoint with session affinity
    ///
    /// Maintains endpoint affinity within a conversation using previous_response_id.
    /// This ensures consistent behavior across multi-turn agent interactions.
    fn select_sticky_session<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
    ) -> Option<&'a ProviderEndpoint> {
        let context = match &self.agent_context {
            Some(ctx) => ctx,
            None => return self.select_round_robin(endpoints),
        };

        // If we have a previous response ID, try to route to the same endpoint
        if let Some(ref _prev_id) = context.previous_response_id {
            // In a real implementation, we'd look up which endpoint handled the previous request
            // For now, we use a hash of the response ID to consistently select an endpoint
            if let Some(ref session_id) = context.session_id {
                let hash = session_id
                    .bytes()
                    .fold(0usize, |acc, b| acc.wrapping_add(b as usize));
                let idx = hash % endpoints.len();
                return Some(endpoints[idx]);
            }

            // Hash the previous response ID to get consistent endpoint selection
            let hash = _prev_id
                .bytes()
                .fold(0usize, |acc, b| acc.wrapping_add(b as usize));
            let idx = hash % endpoints.len();
            return Some(endpoints[idx]);
        }

        // No session context, use round-robin
        self.select_round_robin(endpoints)
    }

    /// Select endpoint for complex reasoning tasks
    ///
    /// Routes to models with extended thinking capabilities:
    /// - o1, o1-pro → Complex reasoning
    /// - Claude with thinking → Multi-step reasoning
    /// - Falls back to capable models for simpler tasks
    fn select_reasoning_depth<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
    ) -> Option<&'a ProviderEndpoint> {
        let context = match &self.agent_context {
            Some(ctx) => ctx,
            None => return self.select_round_robin(endpoints),
        };

        if !context.requires_reasoning {
            // Not a reasoning task, use default
            return self.select_round_robin(endpoints);
        }

        // Score endpoints by reasoning capability
        let mut scored: Vec<_> = endpoints
            .iter()
            .map(|e| {
                let score = self
                    .model_profiles
                    .iter()
                    .filter(|p| e.supports_model(&p.model) || e.provider_name() == p.provider)
                    .map(|p| {
                        let mut s = 0.0;
                        if p.has_trait(ModelTrait::Reasoning) {
                            s += 1.0;
                        }
                        if p.has_trait(ModelTrait::Analysis) {
                            s += 0.5;
                        }
                        if p.has_trait(ModelTrait::Math) {
                            s += 0.3;
                        }
                        if p.has_trait(ModelTrait::Code) {
                            s += 0.2;
                        }
                        s
                    })
                    .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                    .unwrap_or(0.0);
                (*e, score)
            })
            .collect();

        // Sort by reasoning score (highest first)
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        if scored.first().map(|(_, s)| *s > 0.0).unwrap_or(false) {
            scored.first().map(|(e, _)| *e)
        } else {
            self.select_round_robin(endpoints)
        }
    }

    /// Get the model profile for an endpoint's model
    pub fn get_profile(&self, model: &str) -> Option<&ModelProfile> {
        self.model_profiles.iter().find(|p| p.model == model)
    }

    /// Estimate cost for a request using the given model
    pub fn estimate_cost(&self, model: &str, input_tokens: u32, output_tokens: u32) -> Option<f64> {
        self.get_profile(model)
            .map(|p| p.estimate_cost(input_tokens, output_tokens))
    }
}

impl Default for StrategySelector {
    fn default() -> Self {
        Self::new(RoutingStrategy::RoundRobin)
    }
}

/// Routing optimization goal for min-max routing
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OptimizationGoal {
    /// Minimize cost (choose cheapest)
    MinCost,
    /// Minimize latency (choose fastest)
    MinLatency,
    /// Maximize quality/capability (choose most capable)
    MaxQuality,
    /// Balance cost and quality
    #[default]
    Balanced,
}

/// Multi-objective routing selector that balances multiple goals
pub struct MultiObjectiveSelector {
    /// Base selector
    pub selector: StrategySelector,
    /// Optimization goal
    pub goal: OptimizationGoal,
    /// Cost weight (0.0 - 1.0)
    pub cost_weight: f64,
    /// Latency weight (0.0 - 1.0)
    pub latency_weight: f64,
    /// Quality weight (0.0 - 1.0)
    pub quality_weight: f64,
}

impl MultiObjectiveSelector {
    /// Create a new multi-objective selector
    pub fn new(goal: OptimizationGoal) -> Self {
        let (cost_weight, latency_weight, quality_weight) = match goal {
            OptimizationGoal::MinCost => (1.0, 0.0, 0.0),
            OptimizationGoal::MinLatency => (0.0, 1.0, 0.0),
            OptimizationGoal::MaxQuality => (0.0, 0.0, 1.0),
            OptimizationGoal::Balanced => (0.33, 0.33, 0.34),
        };

        Self {
            selector: StrategySelector::new(RoutingStrategy::RoundRobin),
            goal,
            cost_weight,
            latency_weight,
            quality_weight,
        }
    }

    /// Set custom weights (will be normalized)
    pub fn with_weights(mut self, cost: f64, latency: f64, quality: f64) -> Self {
        let total = cost + latency + quality;
        if total > 0.0 {
            self.cost_weight = cost / total;
            self.latency_weight = latency / total;
            self.quality_weight = quality / total;
        }
        self
    }

    /// Set required traits
    pub fn with_traits(mut self, traits: impl IntoIterator<Item = ModelTrait>) -> Self {
        self.selector = self.selector.with_traits(traits);
        self
    }

    /// Set model profiles
    pub fn with_profiles(mut self, profiles: Vec<ModelProfile>) -> Self {
        self.selector = self.selector.with_profiles(profiles);
        self
    }

    /// Select an endpoint using multi-objective optimization
    pub fn select<'a>(
        &self,
        endpoints: &[&'a ProviderEndpoint],
        _health_tracker: &HealthTracker,
    ) -> Option<&'a ProviderEndpoint> {
        if endpoints.is_empty() {
            return None;
        }

        let enabled: Vec<&'a ProviderEndpoint> =
            endpoints.iter().filter(|e| e.enabled).copied().collect();
        if enabled.is_empty() {
            return None;
        }

        // Score each endpoint on multiple dimensions
        let mut scored: Vec<(&'a ProviderEndpoint, f64)> = enabled
            .iter()
            .map(|e| {
                let profile = self
                    .selector
                    .model_profiles
                    .iter()
                    .find(|p| e.supports_model(&p.model) || e.provider_name() == p.provider);

                // Calculate normalized scores (0-1, where 1 is best)
                let (cost_score, latency_score, quality_score) = if let Some(p) = profile {
                    // Cost score: invert so lower cost = higher score
                    // Normalize against max cost in profiles
                    let max_cost = self
                        .selector
                        .model_profiles
                        .iter()
                        .map(|p| p.input_cost_per_million + p.output_cost_per_million)
                        .fold(0.0f64, f64::max);
                    let cost = p.input_cost_per_million + p.output_cost_per_million;
                    let cost_score = if max_cost > 0.0 {
                        1.0 - (cost / max_cost)
                    } else {
                        0.5
                    };

                    // Latency score: invert so lower latency = higher score
                    let max_latency = self
                        .selector
                        .model_profiles
                        .iter()
                        .filter_map(|p| p.avg_latency_ms)
                        .max()
                        .unwrap_or(5000) as f64;
                    let latency = p.avg_latency_ms.unwrap_or(1000) as f64;
                    let latency_score = 1.0 - (latency / max_latency);

                    // Quality score: based on trait match
                    let quality_score = if self.selector.required_traits.is_empty() {
                        // No specific requirements, use trait count as proxy for capability
                        (p.traits.len() as f64 / 10.0).min(1.0)
                    } else {
                        p.trait_match_score(&self.selector.required_traits)
                    };

                    (cost_score, latency_score, quality_score)
                } else {
                    (0.5, 0.5, 0.5) // Default middle scores
                };

                // Calculate weighted score
                let total_score = (cost_score * self.cost_weight)
                    + (latency_score * self.latency_weight)
                    + (quality_score * self.quality_weight);

                (*e, total_score)
            })
            .collect();

        // Sort by total score (highest first)
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        scored.first().map(|(e, _)| *e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::ProviderError;
    use async_trait::async_trait;
    use aura_types::{CreateResponseRequest, Response};
    use std::sync::Arc;

    struct MockProvider {
        name: String,
    }

    #[async_trait]
    impl crate::provider::Provider for MockProvider {
        fn name(&self) -> &str {
            &self.name
        }

        fn models(&self) -> &[&str] {
            &["gpt-4"]
        }

        async fn complete(
            &self,
            _request: CreateResponseRequest,
        ) -> Result<Response, ProviderError> {
            Ok(Response::builder("resp_123", "gpt-4").completed().build())
        }

        async fn complete_stream(
            &self,
            _request: CreateResponseRequest,
        ) -> Result<crate::provider::EventStream, ProviderError> {
            Err(ProviderError::internal("Not implemented"))
        }
    }

    fn create_endpoint(id: &str, weight: u32, priority: u32, tags: Vec<&str>) -> ProviderEndpoint {
        ProviderEndpoint::new(
            id,
            id,
            Arc::new(MockProvider {
                name: "test".to_string(),
            }),
        )
        .with_weight(weight)
        .with_priority(priority)
        .with_tags(tags.into_iter().map(String::from).collect())
    }

    #[test]
    fn test_round_robin() {
        let selector = StrategySelector::new(RoutingStrategy::RoundRobin);
        let health_tracker = HealthTracker::with_defaults();

        let e1 = create_endpoint("ep-1", 1, 0, vec![]);
        let e2 = create_endpoint("ep-2", 1, 0, vec![]);
        let e3 = create_endpoint("ep-3", 1, 0, vec![]);
        let endpoints: Vec<&ProviderEndpoint> = vec![&e1, &e2, &e3];

        // Should cycle through endpoints
        let selected1 = selector.select(&endpoints, &health_tracker).unwrap();
        let selected2 = selector.select(&endpoints, &health_tracker).unwrap();
        let selected3 = selector.select(&endpoints, &health_tracker).unwrap();
        let selected4 = selector.select(&endpoints, &health_tracker).unwrap();

        assert_eq!(selected1.id, "ep-1");
        assert_eq!(selected2.id, "ep-2");
        assert_eq!(selected3.id, "ep-3");
        assert_eq!(selected4.id, "ep-1"); // Wraps around
    }

    #[test]
    fn test_weighted_distribution() {
        let selector = StrategySelector::new(RoutingStrategy::Weighted);
        let health_tracker = HealthTracker::with_defaults();

        // Heavy weight on ep-1
        let e1 = create_endpoint("ep-1", 90, 0, vec![]);
        let e2 = create_endpoint("ep-2", 5, 0, vec![]);
        let e3 = create_endpoint("ep-3", 5, 0, vec![]);
        let endpoints: Vec<&ProviderEndpoint> = vec![&e1, &e2, &e3];

        // Run many selections and count
        let mut counts = std::collections::HashMap::new();
        for _ in 0..1000 {
            let selected = selector.select(&endpoints, &health_tracker).unwrap();
            *counts.entry(selected.id.clone()).or_insert(0) += 1;
        }

        // ep-1 should get most selections (roughly 90%)
        assert!(counts.get("ep-1").unwrap_or(&0) > &800);
    }

    #[test]
    fn test_priority_selection() {
        let selector = StrategySelector::new(RoutingStrategy::Priority);
        let health_tracker = HealthTracker::with_defaults();

        let e1 = create_endpoint("ep-1", 1, 2, vec![]); // Lower priority
        let e2 = create_endpoint("ep-2", 1, 0, vec![]); // Highest priority
        let e3 = create_endpoint("ep-3", 1, 1, vec![]); // Medium priority
        let endpoints: Vec<&ProviderEndpoint> = vec![&e1, &e2, &e3];

        let selected = selector.select(&endpoints, &health_tracker).unwrap();
        assert_eq!(selected.id, "ep-2"); // Priority 0 = highest
    }

    #[test]
    fn test_region_based_selection() {
        let selector =
            StrategySelector::new(RoutingStrategy::RegionBased).with_region(Region::UsEast);
        let health_tracker = HealthTracker::with_defaults();

        let e1 = create_endpoint("ep-1", 1, 0, vec!["region:eu-west"]);
        let e2 = create_endpoint("ep-2", 1, 0, vec!["region:us-east"]);
        let e3 = create_endpoint("ep-3", 1, 0, vec!["region:ap-northeast"]);
        let endpoints: Vec<&ProviderEndpoint> = vec![&e1, &e2, &e3];

        let selected = selector.select(&endpoints, &health_tracker).unwrap();
        assert_eq!(selected.id, "ep-2"); // us-east has lowest latency to us-east
    }

    #[test]
    fn test_region_latency() {
        // Same region
        assert_eq!(Region::UsEast.latency_to(&Region::UsEast), 0);

        // US regions are close
        assert!(Region::UsEast.latency_to(&Region::UsWest) < 100);

        // Cross-continental is farther
        assert!(Region::UsEast.latency_to(&Region::AsiaPacificNortheast) > 100);
    }

    #[test]
    fn test_disabled_endpoints_filtered() {
        let selector = StrategySelector::new(RoutingStrategy::RoundRobin);
        let health_tracker = HealthTracker::with_defaults();

        let e1 = create_endpoint("ep-1", 1, 0, vec![]).with_enabled(false);
        let e2 = create_endpoint("ep-2", 1, 0, vec![]);
        let endpoints: Vec<&ProviderEndpoint> = vec![&e1, &e2];

        let selected = selector.select(&endpoints, &health_tracker).unwrap();
        assert_eq!(selected.id, "ep-2"); // ep-1 is disabled
    }
}
