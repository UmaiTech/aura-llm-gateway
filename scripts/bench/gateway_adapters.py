"""Gateway-specific request/response translators.

Every gateway gets the same logical input — model + prompt + tool count — and is
responsible for translating it into its own wire shape and parsing the response
back into a normalized result. The harness only ever sees the normalized shape.

The point of this module is to keep `harness.py` ignorant of the gateway zoo.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

# ---------------------------------------------------------------------------
# Normalized request and result
# ---------------------------------------------------------------------------

MODEL = "claude-haiku-4-5-20251001"
# Some gateways require provider-prefixed model strings (e.g. "anthropic/...").
MODEL_PREFIXED = f"anthropic/{MODEL}"
PROMPT_TEMPLATE = (
    "Call the echo tool {n} times in a row, each with a different value. "
    "Then say 'done'. Request id: {rid}"
)
ECHO_TOOL = {
    "type": "function",
    "function": {
        "name": "echo",
        "description": "Echoes a value back.",
        "parameters": {
            "type": "object",
            "properties": {"v": {"type": "string"}},
            "required": ["v"],
        },
    },
}


@dataclass
class GatewayResponse:
    """What the harness gets back from any adapter."""

    status: int
    latency_ms: float           # gateway-reported, when exposed
    total_ms: float             # wall-clock from harness send to body-close
    tokens_in: int | None
    tokens_out: int | None
    tool_calls: int             # how many tool calls the model actually made
    error: str | None = None


class GatewayAdapter(Protocol):
    name: str

    async def call(self, client: httpx.AsyncClient, tool_calls: int) -> GatewayResponse: ...


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _prompt(tool_calls: int) -> str:
    return PROMPT_TEMPLATE.format(n=tool_calls, rid=uuid.uuid4().hex[:8])


def _env(name: str, default: str | None = None) -> str:
    v = os.environ.get(name, default)
    if v is None:
        raise RuntimeError(f"Missing env var: {name}")
    return v


# ---------------------------------------------------------------------------
# Aura (self-hosted + hosted) — Open Responses API native
# ---------------------------------------------------------------------------


class AuraAdapter:
    def __init__(self, name: str, base_url: str, key: str):
        self.name = name
        self.base_url = base_url.rstrip("/")
        self.key = key

    async def call(self, client: httpx.AsyncClient, tool_calls: int) -> GatewayResponse:
        payload = {
            "model": MODEL,
            "input": [{"role": "user", "content": _prompt(tool_calls)}],
            "tools": [ECHO_TOOL],
            "max_output_tokens": 256,
        }
        import time
        t0 = time.perf_counter()
        try:
            r = await client.post(
                f"{self.base_url}/v1/responses",
                json=payload,
                headers={"Authorization": f"Bearer {self.key}"},
                timeout=60.0,
            )
            total_ms = (time.perf_counter() - t0) * 1000
            data = r.json() if r.status_code == 200 else {}
            agentic = data.get("agentic", {}) if isinstance(data, dict) else {}
            usage = data.get("usage", {}) if isinstance(data, dict) else {}
            return GatewayResponse(
                status=r.status_code,
                latency_ms=float(agentic.get("latency_ms", total_ms)),
                total_ms=total_ms,
                tokens_in=usage.get("input_tokens"),
                tokens_out=usage.get("output_tokens"),
                tool_calls=len(agentic.get("tools_used", []) or []),
                error=None if r.status_code == 200 else r.text[:200],
            )
        except Exception as e:
            return GatewayResponse(
                status=0, latency_ms=0, total_ms=(time.perf_counter() - t0) * 1000,
                tokens_in=None, tokens_out=None, tool_calls=0, error=str(e)[:200],
            )


# ---------------------------------------------------------------------------
# Bifrost — OpenAI-compatible Chat Completions shape
# ---------------------------------------------------------------------------


class BifrostAdapter:
    name = "Bifrost"

    def __init__(self, base_url: str, key: str):
        self.base_url = base_url.rstrip("/")
        self.key = key

    async def call(self, client: httpx.AsyncClient, tool_calls: int) -> GatewayResponse:
        # Bifrost OAI-shape — model name in OpenAI form, Anthropic underneath
        payload = {
            "model": MODEL_PREFIXED,
            "messages": [{"role": "user", "content": _prompt(tool_calls)}],
            "tools": [ECHO_TOOL],
            "max_tokens": 256,
        }
        import time
        t0 = time.perf_counter()
        try:
            r = await client.post(
                f"{self.base_url}/v1/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {self.key}"},
                timeout=60.0,
            )
            total_ms = (time.perf_counter() - t0) * 1000
            data = r.json() if r.status_code == 200 else {}
            usage = data.get("usage", {}) if isinstance(data, dict) else {}
            choices = data.get("choices", []) if isinstance(data, dict) else []
            tc = 0
            if choices and isinstance(choices[0].get("message"), dict):
                tc = len(choices[0]["message"].get("tool_calls", []) or [])
            return GatewayResponse(
                status=r.status_code,
                latency_ms=total_ms,  # Bifrost doesn't expose gateway-vs-provider split
                total_ms=total_ms,
                tokens_in=usage.get("prompt_tokens"),
                tokens_out=usage.get("completion_tokens"),
                tool_calls=tc,
                error=None if r.status_code == 200 else r.text[:200],
            )
        except Exception as e:
            return GatewayResponse(
                status=0, latency_ms=0, total_ms=(time.perf_counter() - t0) * 1000,
                tokens_in=None, tokens_out=None, tool_calls=0, error=str(e)[:200],
            )


# ---------------------------------------------------------------------------
# LiteLLM — OpenAI-compatible proxy
# ---------------------------------------------------------------------------


class LiteLLMAdapter:
    name = "LiteLLM"

    def __init__(self, base_url: str, key: str):
        self.base_url = base_url.rstrip("/")
        self.key = key

    async def call(self, client: httpx.AsyncClient, tool_calls: int) -> GatewayResponse:
        payload = {
            "model": MODEL,
            "messages": [{"role": "user", "content": _prompt(tool_calls)}],
            "tools": [ECHO_TOOL],
            "max_tokens": 256,
        }
        import time
        t0 = time.perf_counter()
        try:
            r = await client.post(
                f"{self.base_url}/v1/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {self.key}"},
                timeout=60.0,
            )
            total_ms = (time.perf_counter() - t0) * 1000
            data = r.json() if r.status_code == 200 else {}
            usage = data.get("usage", {}) if isinstance(data, dict) else {}
            choices = data.get("choices", []) if isinstance(data, dict) else []
            tc = 0
            if choices and isinstance(choices[0].get("message"), dict):
                tc = len(choices[0]["message"].get("tool_calls", []) or [])
            # LiteLLM exposes _response_ms in the response when enabled
            litellm_ms = data.get("_response_ms")
            return GatewayResponse(
                status=r.status_code,
                latency_ms=float(litellm_ms) if litellm_ms else total_ms,
                total_ms=total_ms,
                tokens_in=usage.get("prompt_tokens"),
                tokens_out=usage.get("completion_tokens"),
                tool_calls=tc,
                error=None if r.status_code == 200 else r.text[:200],
            )
        except Exception as e:
            return GatewayResponse(
                status=0, latency_ms=0, total_ms=(time.perf_counter() - t0) * 1000,
                tokens_in=None, tokens_out=None, tool_calls=0, error=str(e)[:200],
            )


# ---------------------------------------------------------------------------
# Helicone — proxy in front of Anthropic, uses Helicone-Auth header
# ---------------------------------------------------------------------------


class HeliconeAdapter:
    name = "Helicone"

    def __init__(self, base_url: str, key: str, anthropic_key: str):
        # Helicone Anthropic proxy: https://anthropic.helicone.ai
        self.base_url = base_url.rstrip("/")
        self.key = key
        self.anthropic_key = anthropic_key

    async def call(self, client: httpx.AsyncClient, tool_calls: int) -> GatewayResponse:
        # Helicone proxies Anthropic native messages API
        payload = {
            "model": MODEL,
            "max_tokens": 256,
            "messages": [{"role": "user", "content": _prompt(tool_calls)}],
            "tools": [{
                "name": "echo",
                "description": "Echoes a value back.",
                "input_schema": {
                    "type": "object",
                    "properties": {"v": {"type": "string"}},
                    "required": ["v"],
                },
            }],
        }
        import time
        t0 = time.perf_counter()
        try:
            r = await client.post(
                f"{self.base_url}/v1/messages",
                json=payload,
                headers={
                    "x-api-key": self.anthropic_key,
                    "Helicone-Auth": f"Bearer {self.key}",
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                timeout=60.0,
            )
            total_ms = (time.perf_counter() - t0) * 1000
            data = r.json() if r.status_code == 200 else {}
            usage = data.get("usage", {}) if isinstance(data, dict) else {}
            content = data.get("content", []) if isinstance(data, dict) else []
            tc = sum(1 for c in content if isinstance(c, dict) and c.get("type") == "tool_use")
            return GatewayResponse(
                status=r.status_code,
                latency_ms=total_ms,
                total_ms=total_ms,
                tokens_in=usage.get("input_tokens"),
                tokens_out=usage.get("output_tokens"),
                tool_calls=tc,
                error=None if r.status_code == 200 else r.text[:200],
            )
        except Exception as e:
            return GatewayResponse(
                status=0, latency_ms=0, total_ms=(time.perf_counter() - t0) * 1000,
                tokens_in=None, tokens_out=None, tool_calls=0, error=str(e)[:200],
            )


# ---------------------------------------------------------------------------
# OpenRouter — OpenAI-compatible
# ---------------------------------------------------------------------------


class OpenRouterAdapter:
    name = "OpenRouter"

    def __init__(self, base_url: str, key: str):
        self.base_url = base_url.rstrip("/")
        self.key = key

    async def call(self, client: httpx.AsyncClient, tool_calls: int) -> GatewayResponse:
        payload = {
            "model": MODEL_PREFIXED,
            "messages": [{"role": "user", "content": _prompt(tool_calls)}],
            "tools": [ECHO_TOOL],
            "max_tokens": 256,
        }
        import time
        t0 = time.perf_counter()
        try:
            r = await client.post(
                f"{self.base_url}/v1/chat/completions",
                json=payload,
                headers={
                    "Authorization": f"Bearer {self.key}",
                    "HTTP-Referer": "https://aura-llm.dev",
                    "X-Title": "Aura bench",
                },
                timeout=60.0,
            )
            total_ms = (time.perf_counter() - t0) * 1000
            data = r.json() if r.status_code == 200 else {}
            usage = data.get("usage", {}) if isinstance(data, dict) else {}
            choices = data.get("choices", []) if isinstance(data, dict) else []
            tc = 0
            if choices and isinstance(choices[0].get("message"), dict):
                tc = len(choices[0]["message"].get("tool_calls", []) or [])
            return GatewayResponse(
                status=r.status_code,
                latency_ms=total_ms,
                total_ms=total_ms,
                tokens_in=usage.get("prompt_tokens"),
                tokens_out=usage.get("completion_tokens"),
                tool_calls=tc,
                error=None if r.status_code == 200 else r.text[:200],
            )
        except Exception as e:
            return GatewayResponse(
                status=0, latency_ms=0, total_ms=(time.perf_counter() - t0) * 1000,
                tokens_in=None, tokens_out=None, tool_calls=0, error=str(e)[:200],
            )


# ---------------------------------------------------------------------------
# Portkey — proxy with x-portkey-api-key header
# ---------------------------------------------------------------------------


class PortkeyAdapter:
    name = "Portkey"

    def __init__(self, base_url: str, key: str, anthropic_key: str):
        self.base_url = base_url.rstrip("/")
        self.key = key
        self.anthropic_key = anthropic_key

    async def call(self, client: httpx.AsyncClient, tool_calls: int) -> GatewayResponse:
        payload = {
            "model": MODEL,
            "messages": [{"role": "user", "content": _prompt(tool_calls)}],
            "tools": [ECHO_TOOL],
            "max_tokens": 256,
        }
        import time
        t0 = time.perf_counter()
        try:
            r = await client.post(
                f"{self.base_url}/v1/chat/completions",
                json=payload,
                headers={
                    "x-portkey-api-key": self.key,
                    "x-portkey-provider": "anthropic",
                    "Authorization": f"Bearer {self.anthropic_key}",
                },
                timeout=60.0,
            )
            total_ms = (time.perf_counter() - t0) * 1000
            data = r.json() if r.status_code == 200 else {}
            usage = data.get("usage", {}) if isinstance(data, dict) else {}
            choices = data.get("choices", []) if isinstance(data, dict) else []
            tc = 0
            if choices and isinstance(choices[0].get("message"), dict):
                tc = len(choices[0]["message"].get("tool_calls", []) or [])
            return GatewayResponse(
                status=r.status_code,
                latency_ms=total_ms,
                total_ms=total_ms,
                tokens_in=usage.get("prompt_tokens"),
                tokens_out=usage.get("completion_tokens"),
                tool_calls=tc,
                error=None if r.status_code == 200 else r.text[:200],
            )
        except Exception as e:
            return GatewayResponse(
                status=0, latency_ms=0, total_ms=(time.perf_counter() - t0) * 1000,
                tokens_in=None, tokens_out=None, tool_calls=0, error=str(e)[:200],
            )


# ---------------------------------------------------------------------------
# Registry — built from env
# ---------------------------------------------------------------------------


def build_adapters() -> list[GatewayAdapter]:
    anthropic = os.environ.get("ANTHROPIC_API_KEY", "")
    adapters: list[GatewayAdapter] = []

    if os.environ.get("AURA_KEY"):
        adapters.append(AuraAdapter(
            name="Aura",
            base_url=os.environ.get("AURA_URL", "http://localhost:8080"),
            key=os.environ["AURA_KEY"],
        ))
    if os.environ.get("AURA_HOSTED_KEY"):
        adapters.append(AuraAdapter(
            name="Aura (hosted)",
            base_url=os.environ.get("AURA_HOSTED_URL", "https://api.aura-llm.dev"),
            key=os.environ["AURA_HOSTED_KEY"],
        ))
    if os.environ.get("BIFROST_KEY"):
        adapters.append(BifrostAdapter(
            base_url=os.environ.get("BIFROST_URL", "http://localhost:8081"),
            key=os.environ["BIFROST_KEY"],
        ))
    if os.environ.get("HELICONE_KEY") and anthropic:
        adapters.append(HeliconeAdapter(
            base_url=os.environ.get("HELICONE_URL", "https://anthropic.helicone.ai"),
            key=os.environ["HELICONE_KEY"],
            anthropic_key=anthropic,
        ))
    if os.environ.get("LITELLM_KEY"):
        adapters.append(LiteLLMAdapter(
            base_url=os.environ.get("LITELLM_URL", "http://localhost:4000"),
            key=os.environ["LITELLM_KEY"],
        ))
    if os.environ.get("OPENROUTER_KEY"):
        adapters.append(OpenRouterAdapter(
            base_url=os.environ.get("OPENROUTER_URL", "https://openrouter.ai/api"),
            key=os.environ["OPENROUTER_KEY"],
        ))
    if os.environ.get("PORTKEY_KEY") and anthropic:
        adapters.append(PortkeyAdapter(
            base_url=os.environ.get("PORTKEY_URL", "https://api.portkey.ai"),
            key=os.environ["PORTKEY_KEY"],
            anthropic_key=anthropic,
        ))

    return adapters
