"""
Drop-in OpenAI SDK compatibility example for the Aura LLM Gateway.

This example shows how to point the official ``openai`` Python SDK at Aura
by changing only the ``base_url``.  No other code changes are needed.

What you get for free: failover, cost tracking, response caching.

Environment variables
---------------------
``AURA_BASE_URL``
    Gateway URL (default: ``http://localhost:8080``)
``AURA_API_KEY``
    API key for the Aura gateway (optional for unauthenticated local dev)

Install dependencies
--------------------

    pip install openai

Run the example
---------------

    python sdks/python/examples/openai_sdk_compat.py
"""

from __future__ import annotations

import os

from openai import OpenAI

DEFAULT_BASE_URL = "http://localhost:8080"


def _build_client(**kwargs: object) -> OpenAI:
    """Create an OpenAI client pointed at the Aura gateway."""
    base_url = os.getenv("AURA_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    return OpenAI(
        base_url=base_url,
        api_key=os.getenv("AURA_API_KEY", "aura-no-auth"),
        **kwargs,
    )


def basic_chat() -> None:
    """Simple chat completion through Aura via the OpenAI SDK."""
    print("=== Basic Chat ===")
    client = _build_client()
    response = client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "user", "content": "Explain the Aura LLM Gateway in one sentence."},
        ],
    )
    print(response.choices[0].message.content)
    print()


def streaming_chat() -> None:
    """Streaming chat completion through Aura."""
    print("=== Streaming Chat ===")
    client = _build_client()
    stream = client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "user", "content": "Count from 1 to 5, one number per line."},
        ],
        stream=True,
    )
    print("Response: ", end="")
    for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            print(chunk.choices[0].delta.content, end="", flush=True)
    print("\n")


def main() -> None:
    """Run all OpenAI SDK drop-in compatibility examples."""
    basic_chat()
    streaming_chat()


if __name__ == "__main__":
    main()
