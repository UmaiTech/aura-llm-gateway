//! Static model capability hints used as hard filters.
//!
//! These are deliberately conservative name-based rules so the router never
//! sends an image to a text-only model or a tool call to a model that can't
//! make one. The `model_pricing.capabilities` column (scraped, LLM-inferred)
//! will replace these in a later PR; until then, unknown models are assumed
//! text-only for vision and tool-capable for tools, which matches the
//! defaults in every tier list.

/// True when the model is known to accept image input.
pub fn model_supports_vision(model: &str) -> bool {
    let m = model.to_ascii_lowercase();
    // Explicit vision variants of otherwise text-only families.
    if m.contains("vision") || m.contains("-vl") {
        return true;
    }
    // Known text-only families first.
    if m.starts_with("o1-mini")
        || m.starts_with("o1-preview")
        || m.starts_with("o3-mini")
        || m.starts_with("gpt-3.5")
        || m.starts_with("gpt-4-")
        || m == "gpt-4"
        || m.starts_with("claude-2")
        || m.starts_with("claude-instant")
        || m.starts_with("mistral-")
        || m.starts_with("mixtral")
        || m.starts_with("codestral")
        || m.starts_with("deepseek")
        || m.starts_with("llama")
        || m.starts_with("qwen")
        || m.starts_with("glm")
        || m.starts_with("kimi")
        || m.starts_with("gpt-oss")
    {
        return false;
    }
    m.starts_with("gpt-4o")
        || m.starts_with("gpt-4.1")
        || m.starts_with("gpt-5")
        || m.starts_with("o1")
        || m.starts_with("o3")
        || m.starts_with("o4")
        || m.starts_with("claude-3")
        || m.starts_with("claude-opus")
        || m.starts_with("claude-sonnet")
        || m.starts_with("claude-haiku")
        || m.starts_with("gemini")
        || m.starts_with("pixtral")
}

/// True when the model is known to support function / tool calling.
pub fn model_supports_tools(model: &str) -> bool {
    let m = model.to_ascii_lowercase();
    !(m.starts_with("o1-mini")
        || m.starts_with("o1-preview")
        || m.starts_with("gpt-3.5-turbo-instruct")
        || m.starts_with("claude-2")
        || m.starts_with("claude-instant")
        || m.contains("-image")
        || m.contains("embedding"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vision_hints() {
        assert!(model_supports_vision("gpt-5.4-nano"));
        assert!(model_supports_vision("gpt-4o-mini"));
        assert!(model_supports_vision("claude-haiku-4-5"));
        assert!(model_supports_vision("claude-3-5-sonnet-20241022"));
        assert!(model_supports_vision("gemini-3.1-flash-lite"));
        assert!(model_supports_vision("Qwen2.5-VL-7B"));
        assert!(!model_supports_vision("o3-mini"));
        assert!(!model_supports_vision("gpt-3.5-turbo"));
        assert!(!model_supports_vision("gpt-4-turbo"));
        assert!(!model_supports_vision("mistral-large-latest"));
        assert!(!model_supports_vision("llama3.3"));
        assert!(!model_supports_vision("deepseek-r1"));
    }

    #[test]
    fn tool_hints() {
        assert!(model_supports_tools("gpt-5.5"));
        assert!(model_supports_tools("claude-sonnet-4-6"));
        assert!(model_supports_tools("llama3.3"));
        assert!(!model_supports_tools("o1-mini"));
        assert!(!model_supports_tools("gemini-3.1-flash-lite-image"));
    }
}
