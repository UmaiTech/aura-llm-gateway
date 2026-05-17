# Client SDKs

Official client SDKs for the Aura LLM Gateway. All SDKs implement the Open Responses API and provide idiomatic interfaces for their respective languages.

## Available SDKs

| Language | Package | Status | Install |
|----------|---------|--------|---------|
| Python | [`aura-llm`](https://pypi.org/project/aura-llm/) | Stable | `uv add aura-llm` |
| TypeScript | `@aura/sdk` | Planned | - |
| Go | `aura-go` | Planned | - |

## Python SDK

### Installation

```bash
# Using uv (recommended)
uv add aura-llm

# Using pip
pip install aura-llm
```

### Quick Start

```python
from aura import AuraClient

client = AuraClient(
    base_url="http://localhost:8080",  # or AURA_BASE_URL env var
    api_key="your-key",                 # or AURA_API_KEY env var
)

response = client.responses.create(
    model="gpt-5.4-mini",
    input="What is the capital of France?"
)
print(response.output_text)
# Output: The capital of France is Paris.
```

### Streaming

```python
for event in client.responses.create(
    model="gpt-5.4-mini",
    input="Tell me a story",
    stream=True
):
    if event.type == "response.output_text.delta":
        print(event.delta, end="", flush=True)
```

### Async Client

```python
import asyncio
from aura import AsyncAuraClient

async def main():
    async with AsyncAuraClient() as client:
        response = await client.responses.create(
            model="gpt-5.4-mini",
            input="Hello!"
        )
        print(response.output_text)

asyncio.run(main())
```

### Conversation Threading

```python
# Start a conversation
response1 = client.responses.create(
    model="gpt-5.4-mini",
    input="My name is Alice."
)

# Continue with context
response2 = client.responses.create(
    model="gpt-5.4-mini",
    input="What's my name?",
    previous_response_id=response1.id
)
print(response2.output_text)  # "Your name is Alice."
```

### Tool Calling

```python
from aura import Tool

# Define tools
weather_tool = Tool.function_tool(
    name="get_weather",
    description="Get weather for a location",
    parameters={
        "type": "object",
        "properties": {
            "location": {"type": "string", "description": "City name"}
        },
        "required": ["location"]
    }
)

# Request with tools
response = client.responses.create(
    model="gpt-5.4-mini",
    input="What's the weather in Tokyo?",
    tools=[weather_tool]
)

# Handle tool calls
if response.has_tool_calls:
    for call in response.tool_calls:
        print(f"Call {call.name} with {call.arguments}")
```

### System Instructions

```python
response = client.responses.create(
    model="gpt-5.4-mini",
    input="Hello!",
    instructions="You are a pirate. Always respond in pirate speak."
)
```

### Error Handling

```python
from aura import (
    AuraError,
    AuthenticationError,
    RateLimitError,
    BadRequestError,
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
    print(f"Rate limited. Retry after: {e.retry_after}s")
except BadRequestError as e:
    print(f"Bad request: {e.message} (param: {e.param})")
except NotFoundError:
    print("Model not found")
except APIConnectionError:
    print("Connection failed")
except APITimeoutError:
    print("Request timed out")
except AuraError as e:
    print(f"API error: {e}")
```

### Response Object

```python
response.id              # Unique response ID
response.status          # ResponseStatus enum
response.model           # Model used
response.output          # List of output items
response.output_text     # Text content (convenience)
response.usage           # Token usage
response.usage.cost_usd  # Cost in USD
response.tool_calls      # Function call items
response.has_tool_calls  # Boolean check
response.is_complete     # Status check
response.metadata        # Gateway metadata
```

### Configuration

```python
client = AuraClient(
    api_key="your-key",
    base_url="http://localhost:8080",
    timeout=120.0,  # seconds
    headers={"X-Custom": "value"},
)
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AURA_API_KEY` | API key for authentication | None |
| `AURA_BASE_URL` | Gateway base URL | `http://localhost:8080` |

### Stream Events

| Event Type | Description | Key Fields |
|------------|-------------|------------|
| `response.created` | Response started | `response` |
| `response.in_progress` | Generation active | `response` |
| `response.output_text.delta` | Text chunk | `delta` |
| `response.output_text.done` | Text complete | `text` |
| `response.function_call.delta` | Args chunk | `delta`, `call_id` |
| `response.function_call.done` | Call complete | `item` |
| `response.output_item.added` | Item added | `item`, `output_index` |
| `response.output_item.done` | Item complete | `item`, `output_index` |
| `response.completed` | Response done | `response` |
| `response.failed` | Response failed | `response` |
| `error` | Error occurred | `error` |

## TypeScript SDK (Coming Soon)

The TypeScript SDK will provide:

- Full type safety with TypeScript definitions
- Browser and Node.js support
- Streaming with async iterators
- React hooks (optional package)

```typescript
// Planned API
import { AuraClient } from '@aura/sdk';

const client = new AuraClient({
  baseUrl: 'http://localhost:8080',
});

const response = await client.responses.create({
  model: 'gpt-5.4-mini',
  input: 'Hello!',
});

console.log(response.outputText);
```

## SDK Development

### Contributing

SDKs are located in the `sdks/` directory:

```
sdks/
├── python/     # Python SDK (aura-llm)
└── typescript/ # TypeScript SDK (planned)
```

### Building from Source

#### Python

```bash
cd sdks/python

# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
uv sync

# Run tests
uv run pytest

# Type check
uv run mypy src/aura

# Lint
uv run ruff check src/aura tests
```

### Type Generation

SDK types are manually maintained but kept in sync with the Rust types in `aura-types`. Future plans include:

- **typeshare**: Direct Rust → Python/TypeScript generation
- **JSON Schema**: Generate from Rust, then use language-specific generators

For now, SDK types are tested against the actual API to ensure compatibility.
