"""
Aura LLM Gateway Python SDK

A Python client for the Aura LLM Gateway, implementing the Open Responses API.

Example usage:
    from aura import AuraClient

    client = AuraClient(api_key="your-api-key")

    # Simple completion
    response = client.responses.create(
        model="gpt-5.4-mini",
        input="What is the capital of France?"
    )
    print(response.output_text)

    # Streaming
    for event in client.responses.create(
        model="gpt-5.4-mini",
        input="Tell me a story",
        stream=True
    ):
        if event.type == "response.output_text.delta":
            print(event.delta, end="", flush=True)
"""

from aura._async_client import AsyncAuraClient
from aura.client import AuraClient
from aura.exceptions import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuraError,
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    RateLimitError,
)
from aura.types import (
    FunctionCallItem,
    FunctionCallOutputItem,
    FunctionDefinition,
    Item,
    MessageItem,
    ReasoningItem,
    Response,
    ResponseStatus,
    StreamEvent,
    Tool,
    Usage,
)

__version__ = "0.1.0"
__all__ = [
    "APIConnectionError",
    "APIError",
    "APITimeoutError",
    "AsyncAuraClient",
    # Clients
    "AuraClient",
    # Exceptions
    "AuraError",
    "AuthenticationError",
    "BadRequestError",
    "FunctionCallItem",
    "FunctionCallOutputItem",
    "FunctionDefinition",
    "Item",
    "MessageItem",
    "NotFoundError",
    "RateLimitError",
    "ReasoningItem",
    # Types
    "Response",
    "ResponseStatus",
    "StreamEvent",
    "Tool",
    "Usage",
]
