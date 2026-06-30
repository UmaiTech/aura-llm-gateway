"""
Known model IDs the Aura gateway routes to.

This is *not* an exhaustive or authoritative list — the gateway decides which
models are actually available based on the providers it's configured with.
These constants exist for ergonomics: editor autocomplete, fewer typos in
model slugs, and discoverability of newer providers (e.g. Fireworks'
open-weight catalog). Any string is still accepted by ``responses.create``;
these are a convenience, not a constraint.

Example:
    from aura import AuraClient, KnownModels

    client = AuraClient(api_key="...")
    client.responses.create(
        model=KnownModels.FIREWORKS_GLM_5P2,
        input="Hello!",
    )
"""

from __future__ import annotations

from enum import Enum


class KnownModels(str, Enum):
    """A curated catalog of well-known model IDs.

    Subclasses ``str`` so members compare/serialize as their slug value and
    can be passed anywhere a model string is expected.
    """

    # OpenAI
    GPT_5_4 = "gpt-5.4"
    GPT_5_4_MINI = "gpt-5.4-mini"
    GPT_5_4_NANO = "gpt-5.4-nano"
    GPT_4O = "gpt-4o"
    GPT_4O_MINI = "gpt-4o-mini"

    # Anthropic
    CLAUDE_OPUS_4_7 = "claude-opus-4-7"
    CLAUDE_SONNET_4_6 = "claude-sonnet-4-6"
    CLAUDE_HAIKU_4_5 = "claude-haiku-4-5-20251001"

    # Google
    GEMINI_3_PRO = "gemini-3-pro-preview"
    GEMINI_3_5_FLASH = "gemini-3.5-flash"

    # Fireworks AI — serverless open-weight catalog (see gateway issue #209).
    # IDs are namespaced as accounts/fireworks/models/<slug>.
    FIREWORKS_GLM_5P2 = "accounts/fireworks/models/glm-5p2"
    FIREWORKS_KIMI_K2P6 = "accounts/fireworks/models/kimi-k2p6"
    FIREWORKS_DEEPSEEK_V4_PRO = "accounts/fireworks/models/deepseek-v4-pro"
    FIREWORKS_QWEN3P6_PLUS = "accounts/fireworks/models/qwen3p6-plus"
    FIREWORKS_GPT_OSS_120B = "accounts/fireworks/models/gpt-oss-120b"
    FIREWORKS_GPT_OSS_20B = "accounts/fireworks/models/gpt-oss-20b"

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.value
