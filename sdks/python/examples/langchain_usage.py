"""
LangChain integration example for the Aura Python SDK.

This example shows how to use Aura's OpenAI-compatible `/v1` endpoint with
LangChain for three common patterns:
1. Basic chat with `ChatOpenAI`
2. Tool calling with a Python function tool
3. An LCEL (`prompt | model | parser`) pipeline

Environment variables:
- `AURA_API_KEY`: API key for the Aura gateway
- `AURA_BASE_URL`: Base gateway URL (defaults to `http://localhost:8080`)
- `AURA_MODEL`: Optional model override (defaults to `gpt-5.4-mini`)

Install dependencies:
    uv add 'aura-llm[langchain]'

Run the example:
    uv run python sdks/python/examples/langchain_usage.py
"""

from __future__ import annotations

import json
import os
from typing import Any

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

DEFAULT_BASE_URL = "http://localhost:8080"
DEFAULT_MODEL = "gpt-5.4-mini"


@tool
def get_exchange_rate(base_currency: str, quote_currency: str) -> str:
    """Return a small canned exchange-rate payload for a currency pair."""
    rates: dict[tuple[str, str], float] = {
        ("USD", "EUR"): 0.92,
        ("EUR", "USD"): 1.09,
        ("USD", "JPY"): 156.4,
        ("JPY", "USD"): 0.0064,
    }
    key = (base_currency.upper(), quote_currency.upper())
    rate = rates.get(key, 1.0)
    return json.dumps(
        {
            "base_currency": key[0],
            "quote_currency": key[1],
            "rate": rate,
            "source": "example-static-data",
        }
    )


def aura_v1_base_url() -> str:
    """Return the OpenAI-compatible Aura `/v1` base URL for LangChain."""
    base_url = os.getenv("AURA_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    if base_url.endswith("/v1"):
        return base_url
    return f"{base_url}/v1"


def build_model(**overrides: Any) -> ChatOpenAI:
    """Create a ChatOpenAI instance pointed at Aura's OpenAI-compatible API."""
    api_key = os.getenv("AURA_API_KEY")
    if not api_key:
        raise ValueError("AURA_API_KEY environment variable is not set")
    return ChatOpenAI(
        model=os.getenv("AURA_MODEL", DEFAULT_MODEL),
        api_key=api_key,
        base_url=aura_v1_base_url(),
        temperature=0,
        **overrides,
    )


def basic_chat_example() -> None:
    """Run a simple chat completion through Aura via LangChain."""
    print("=== Basic Chat ===")
    model = build_model()
    response = model.invoke("Give me a one-sentence summary of Aura LLM Gateway.")
    print(response.content)
    print()


def tool_calling_example() -> None:
    """Ask the model to call a bound Python tool."""
    print("=== Tool Calling ===")
    model_with_tools = build_model().bind_tools([get_exchange_rate])
    response = model_with_tools.invoke(
        "Use the exchange-rate tool to look up USD to EUR and tell me the rate."
    )

    print("Response content:", response.content)
    print("Tool calls:")
    for tool_call in response.tool_calls:
        print(json.dumps(tool_call, indent=2))
    print()


def lcel_chain_example() -> None:
    """Compose a prompt, model, and parser with LCEL."""
    print("=== LCEL Chain ===")
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You explain technical concepts clearly in one short paragraph.",
            ),
            ("human", "Explain why an OpenAI-compatible gateway is useful for {audience}."),
        ]
    )
    chain = prompt | build_model() | StrOutputParser()
    result = chain.invoke({"audience": "teams using multiple LLM providers"})
    print(result)
    print()


def main() -> None:
    """Run all LangChain integration examples."""
    basic_chat_example()
    tool_calling_example()
    lcel_chain_example()


if __name__ == "__main__":
    main()
