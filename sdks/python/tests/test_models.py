"""Tests for the KnownModels catalog."""

from aura import KnownModels


def test_fireworks_catalog_exposed() -> None:
    assert KnownModels.FIREWORKS_GLM_5P2 == "accounts/fireworks/models/glm-5p2"
    # September 2026 catalog refresh
    assert KnownModels.GPT_6_ASTRA == "gpt-6-astra"
    assert KnownModels.GPT_5_6_SOL == "gpt-5.6-sol"
    assert KnownModels.CLAUDE_FABLE_5_1 == "claude-fable-5-1"
    assert KnownModels.CLAUDE_OPUS_5 == "claude-opus-5"
    assert KnownModels.CLAUDE_SONNET_5 == "claude-sonnet-5"
    assert KnownModels.GEMINI_3_7_FLASH == "gemini-3.7-flash"
    assert KnownModels.FIREWORKS_GPT_OSS_20B == "accounts/fireworks/models/gpt-oss-20b"


def test_fireworks_slugs_are_namespaced() -> None:
    fireworks = [m for m in KnownModels if m.name.startswith("FIREWORKS_")]
    assert fireworks
    for model in fireworks:
        assert model.value.startswith("accounts/fireworks/models/")


def test_member_behaves_as_str() -> None:
    # str(Enum) returns the slug, and the member is itself a str instance, so
    # it can be passed anywhere a model string is expected.
    assert str(KnownModels.GPT_4O_MINI) == "gpt-4o-mini"
    assert isinstance(KnownModels.GPT_4O_MINI, str)
    assert f"{KnownModels.GPT_4O_MINI}" == "gpt-4o-mini"
