# Aura LLM Gateway Python SDK

[![PyPI](https://img.shields.io/pypi/v/aura-llm)](https://pypi.org/project/aura-llm/)
[![Python](https://img.shields.io/pypi/pyversions/aura-llm)](https://pypi.org/project/aura-llm/)
[![Downloads](https://img.shields.io/pypi/dm/aura-llm)](https://pypi.org/project/aura-llm/)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Fumaitech%2Faura--llm--gateway-2496ED?logo=docker&logoColor=white)](https://github.com/UmaiTech/aura-llm-gateway/pkgs/container/aura-llm-gateway)
[![Helm](https://img.shields.io/badge/helm-ghcr.io%2Fumaitech%2Fcharts%2Faura--llm--gateway-0F1689?logo=helm&logoColor=white)](https://github.com/UmaiTech/aura-llm-gateway/pkgs/container/charts%2Faura-llm-gateway)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Python SDK for the [Aura LLM Gateway](https://github.com/UmaiTech/aura-llm-gateway), implementing the [Open Responses API](https://www.openresponses.org/specification).

## Installation

Using [uv](https://docs.astral.sh/uv/) (recommended):

```bash
uv add aura-llm
```

Using pip:

```bash
pip install aura-llm
```

### Using with LangChain

Install the SDK with the LangChain extra when you want to use Aura's
OpenAI-compatible `/v1` endpoint through `ChatOpenAI`:

```bash
uv add 'aura-llm[langchain]'
```

See [`examples/langchain_usage.py`](./examples/langchain_usage.py) for a complete
example covering basic chat, tool calling, and an LCEL chain.

### Drop-in with the Official OpenAI SDK

You can also bypass the Aura SDK entirely and point the official
[`openai`](https://pypi.org/project/openai/) Python package at Aura — just
change the `base_url`:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="your-aura-api-key",
)
# use client.chat.completions.create(...) as usual
```

See [`examples/openai_sdk_compat.py`](./examples/openai_sdk_compat.py) for a
complete runnable example with basic chat and streaming.

### From Source

```bash
cd sdks/python

# With uv
uv sync

# With pip
pip install -e .
```

## Quick Start

```python
from aura import AuraClient

# Initialize the client
client = AuraClient(
    api_key="your-api-key",  # or set AURA_API_KEY env var
    base_url="http://localhost:8080",  # or set AURA_BASE_URL env var
)

# Simple completion
response = client.responses.create(
    model="gpt-5.4-mini",
    input="What is the capital of France?"
)
print(response.output_text)
# Output: The capital of France is Paris.
```

## Streaming

```python
for event in client.responses.create(
    model="gpt-5.4-mini",
    input="Tell me a short story about a robot",
    stream=True
):
    if event.type == "response.output_text.delta":
        print(event.delta, end="", flush=True)
```

## Async Client

```python
import asyncio
from aura import AsyncAuraClient

async def main():
    async with AsyncAuraClient() as client:
        response = await client.responses.create(
            model="gpt-5.4-mini",
            input="Hello, world!"
        )
        print(response.output_text)

asyncio.run(main())
```

### Async Streaming

```python
async def stream_example():
    async with AsyncAuraClient() as client:
        stream = await client.responses.create(
            model="gpt-5.4-mini",
            input="Tell me a joke",
            stream=True
        )
        async for event in stream:
            if event.type == "response.output_text.delta":
                print(event.delta, end="", flush=True)
```

## Conversation Threading

Continue a conversation using `previous_response_id`:

```python
# First message
response1 = client.responses.create(
    model="gpt-5.4-mini",
    input="My name is Alice."
)

# Continue the conversation
response2 = client.responses.create(
    model="gpt-5.4-mini",
    input="What is my name?",
    previous_response_id=response1.id
)
print(response2.output_text)
# Output: Your name is Alice.
```

## Using Tools

```python
from aura import Tool

# Define a tool
weather_tool = Tool.function_tool(
    name="get_weather",
    description="Get the current weather for a location",
    parameters={
        "type": "object",
        "properties": {
            "location": {
                "type": "string",
                "description": "The city and state, e.g. San Francisco, CA"
            }
        },
        "required": ["location"]
    }
)

# Use the tool
response = client.responses.create(
    model="gpt-5.4-mini",
    input="What's the weather in Tokyo?",
    tools=[weather_tool]
)

# Check for tool calls
if response.has_tool_calls:
    for tool_call in response.tool_calls:
        print(f"Tool: {tool_call.name}")
        print(f"Arguments: {tool_call.arguments}")
```

## System Instructions

```python
response = client.responses.create(
    model="gpt-5.4-mini",
    input="Who are you?",
    instructions="You are a helpful pirate assistant. Always respond in pirate speak."
)
```

## Configuration Options

```python
client = AuraClient(
    api_key="your-api-key",
    base_url="http://localhost:8080",
    timeout=120.0,  # Request timeout in seconds
    headers={"X-Custom-Header": "value"},  # Additional headers
)
```

## Response Object

The `Response` object contains:

```python
response.id              # Unique response ID
response.status          # ResponseStatus enum (completed, failed, etc.)
response.model           # Model used
response.output          # List of output items
response.output_text     # Convenience property for text content
response.usage           # Token usage information
response.usage.cost_usd  # Cost in USD (if available)
response.tool_calls      # List of function call items
response.has_tool_calls  # Boolean check for tool calls
response.is_complete     # Check if response completed successfully
response.metadata        # Gateway metadata (provider, latency, etc.)
```

## Stream Events

When streaming, you receive these event types:

| Event Type | Description |
|------------|-------------|
| `response.created` | Response started |
| `response.in_progress` | Response is being generated |
| `response.output_text.delta` | Text chunk (use `event.delta`) |
| `response.output_text.done` | Text complete (use `event.text`) |
| `response.function_call.delta` | Function arguments chunk |
| `response.function_call.done` | Function call complete |
| `response.output_item.added` | New item added to output |
| `response.output_item.done` | Item complete |
| `response.completed` | Response finished |
| `response.failed` | Response failed |
| `error` | Error occurred |

## Error Handling

```python
from aura import (
    AuraError,
    AuthenticationError,
    BadRequestError,
    RateLimitError,
    NotFoundError,
    APIConnectionError,
    APITimeoutError,
)

try:
    response = client.responses.create(
        model="gpt-5.4-mini",
        input="Hello"
    )
except AuthenticationError:
    print("Invalid API key")
except RateLimitError as e:
    print(f"Rate limited. Retry after: {e.retry_after}")
except BadRequestError as e:
    print(f"Bad request: {e.message}, param: {e.param}")
except NotFoundError:
    print("Model not found")
except APIConnectionError:
    print("Failed to connect to Aura gateway")
except APITimeoutError:
    print("Request timed out")
except AuraError as e:
    print(f"API error: {e}")
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AURA_API_KEY` | API key for authentication | None |
| `AURA_BASE_URL` | Base URL for the gateway | `http://localhost:8080` |

## Development

We use [uv](https://docs.astral.sh/uv/) for fast, reliable Python package management.

### Setup

```bash
# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
cd sdks/python
uv sync
```

### Running Tests

```bash
# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov=aura --cov-report=term-missing

# Run specific test file
uv run pytest tests/test_types.py -v
```

### Code Quality

```bash
# Linting
uv run ruff check src/aura tests

# Auto-fix lint issues
uv run ruff check --fix src/aura tests

# Format code
uv run ruff format src/aura tests

# Type checking
uv run mypy src/aura
```

### All Checks (CI equivalent)

```bash
uv run ruff check src/aura tests
uv run ruff format --check src/aura tests
uv run mypy src/aura
uv run pytest --cov=aura
```

## License

MIT
