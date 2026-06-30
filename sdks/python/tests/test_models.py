"""Tests for the KnownModels catalog."""

from aura import KnownModels


def test_fireworks_catalog_exposed() -> None:
    assert KnownModels.FIREWORKS_GLM_5P2 == "accounts/fireworks/models/glm-5p2"
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
