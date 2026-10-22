//! Prompt-cache helpers shared by the provider adapters.
//!
//! Every adapter reports usage in one convention: `Usage::input_tokens` is
//! the whole prompt, and `Usage::cached_tokens` is the subset of it read from
//! the provider's prompt cache (see `ModelPricing::calculate_cost`).

use aura_types::{CreateResponseRequest, InputContent, InputItem, Role, Usage};
use serde::Deserialize;
use sha2::{Digest, Sha256};

/// `usage.prompt_tokens_details` on OpenAI-compatible Chat Completions APIs.
#[derive(Debug, Default, Deserialize)]
pub(crate) struct PromptTokensDetails {
    /// Prompt tokens served from the provider's cache (included in
    /// `prompt_tokens`)
    #[serde(default)]
    pub cached_tokens: Option<u32>,
}

/// Build `Usage` from an OpenAI-compatible usage object, where
/// `prompt_tokens` already includes the cached tokens.
pub(crate) fn openai_compatible_usage(
    prompt_tokens: u32,
    completion_tokens: u32,
    details: Option<&PromptTokensDetails>,
) -> Usage {
    let cached = details.and_then(|d| d.cached_tokens).unwrap_or(0);
    Usage::new(prompt_tokens, completion_tokens).with_cache_hits(cached)
}

/// A stable cache-routing key for providers that accept one (OpenAI's
/// `prompt_cache_key`).
///
/// Requests that share a model, system prompt and tool list get the same
/// key, so they route to the same cache. When the request carries a `user`,
/// it is folded in too: OpenAI recommends keeping each key under ~15
/// requests per minute, and a per-user key keeps one user's growing
/// conversation sticky while spreading a popular shared prefix across
/// machines instead of overflowing one.
pub(crate) fn prompt_cache_key(request: &CreateResponseRequest) -> String {
    let mut hasher = Sha256::new();
    let mut field = |bytes: &[u8]| {
        // Length-prefix each field so ("ab", "c") != ("a", "bc").
        hasher.update((bytes.len() as u64).to_le_bytes());
        hasher.update(bytes);
    };

    field(request.model.as_bytes());
    field(request.instructions.as_deref().unwrap_or("").as_bytes());
    for item in &request.input {
        if let InputItem::Message {
            role: Role::System,
            content,
        } = item
        {
            match content {
                InputContent::Text(text) => field(text.as_bytes()),
                InputContent::Parts(parts) => {
                    field(&serde_json::to_vec(parts).unwrap_or_default());
                }
            }
        }
    }
    // serde_json serializes struct fields in declaration order and `Value`
    // maps with sorted keys, so this is byte-stable for identical tools.
    field(&serde_json::to_vec(&request.tools).unwrap_or_default());
    field(request.user.as_deref().unwrap_or("").as_bytes());

    let digest = hasher.finalize();
    format!("aura-{}", hex::encode(&digest[..12]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::{FunctionDefinition, Tool};

    fn base() -> CreateResponseRequest {
        CreateResponseRequest::text("gpt-6-sol", "Hello")
            .with_instructions("You are helpful")
            .with_tools(vec![Tool::function(FunctionDefinition::new("search"))])
    }

    #[test]
    fn key_is_stable_across_turns() {
        // The user message (the varying tail) doesn't affect the key.
        let a = prompt_cache_key(&base());
        let mut next_turn = base();
        next_turn.input.push(InputItem::Message {
            role: Role::User,
            content: InputContent::Text("And another question".into()),
        });
        assert_eq!(a, prompt_cache_key(&next_turn));
        assert!(a.starts_with("aura-"));
        assert_eq!(a.len(), "aura-".len() + 24);
    }

    #[test]
    fn key_changes_with_prefix() {
        let a = prompt_cache_key(&base());
        assert_ne!(
            a,
            prompt_cache_key(&base().with_instructions("Something else"))
        );
        let mut other_model = base();
        other_model.model = "gpt-6-luna".into();
        assert_ne!(a, prompt_cache_key(&other_model));
        let mut with_user = base();
        with_user.user = Some("user-1".into());
        assert_ne!(a, prompt_cache_key(&with_user));
    }

    #[test]
    fn openai_usage_keeps_prompt_total() {
        let details = PromptTokensDetails {
            cached_tokens: Some(1024),
        };
        let usage = openai_compatible_usage(1500, 10, Some(&details));
        assert_eq!(usage.input_tokens, 1500);
        assert_eq!(usage.cached_tokens, Some(1024));

        let miss = openai_compatible_usage(1500, 10, Some(&PromptTokensDetails::default()));
        assert_eq!(miss.cached_tokens, None);
        assert_eq!(openai_compatible_usage(5, 1, None).cached_tokens, None);
    }
}
