"""
Aura LLM Gateway Python SDK

A Python client for the Aura LLM Gateway, implementing the Open Responses API.

Example usage:
    from aura import AuraClient

    client = AuraClient(api_key="your-api-key")

    # Simple completion
    response = client.responses.create(
        model="gpt-4o",
        input="What is the capital of France?"
    )
    print(response.output_text)

    # Streaming
    for event in client.responses.create(
        model="gpt-4o",
        input="Tell me a story",
        stream=True
    ):
        if event.type == "response.output_text.delta":
            print(event.delta, end="", flush=True)
"""

from aura.client import AuraClient
from aura._async_client import AsyncAuraClient
from aura.exceptions import (
    AuraError,
    AuthenticationError,
    BadRequestError,
    RateLimitError,
    NotFoundError,
    APIError,
    APIConnectionError,
    APITimeoutError,
)
from aura.types import (
    Response,
    ResponseStatus,
    Item,
    MessageItem,
    FunctionCallItem,
    FunctionCallOutputItem,
    ReasoningItem,
    Usage,
    StreamEvent,
    Tool,
    FunctionDefinition,
)

__version__ = "0.1.0"
__all__ = [
    # Clients
    "AuraClient",
    "AsyncAuraClient",
    # Exceptions
    "AuraError",
    "AuthenticationError",
    "BadRequestError",
    "RateLimitError",
    "NotFoundError",
    "APIError",
    "APIConnectionError",
    "APITimeoutError",
    # Types
    "Response",
    "ResponseStatus",
    "Item",
    "MessageItem",
    "FunctionCallItem",
    "FunctionCallOutputItem",
    "ReasoningItem",
    "Usage",
    "StreamEvent",
    "Tool",
    "FunctionDefinition",
]
