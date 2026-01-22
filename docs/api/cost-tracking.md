# Cost Tracking & Aura Metadata

Aura automatically enriches every response with cost information, provider details, and agentic workflow metadata. This enables comprehensive tracking without maintaining your own pricing data.

## How It Works

1. The gateway maintains pricing data for all supported models
2. When a response completes, cost is calculated from token usage
3. The `cost_usd` field is added to the `usage` object
4. Agentic metadata is extracted from the response output

## Response Metadata

Every response includes Aura-specific metadata:

```json
{
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50,
    "total_tokens": 150,
    "cached_tokens": 0,
    "reasoning_tokens": 0,
    "cost_usd": 0.00075
  },
  "metadata": {
    "aura": {
      "request_id": "aura_550e8400-e29b-41d4-a716-446655440000",
      "model": "gpt-4o",
      "provider": "openai",
      "gateway_version": "0.1.7",
      "latency_ms": 523,
      "agentic": {
        "output_items_count": 2,
        "has_tool_calls": true,
        "tool_calls_count": 1,
        "tools_used": ["web_search"],
        "requires_action": false,
        "has_reasoning": false
      }
    }
  }
}
```

## Metadata Fields

| Field | Description |
|-------|-------------|
| `request_id` | Unique UUID for tracing requests across the gateway |
| `model` | Model name/ID used for the request |
| `provider` | Which provider handled the request (openai, anthropic, google) |
| `gateway_version` | Aura gateway version |
| `latency_ms` | Total request latency in milliseconds |

## Agentic Metadata

The `agentic` object provides insights for agent workflows:

| Field | Type | Description |
|-------|------|-------------|
| `output_items_count` | number | Total items in output (messages, tool calls, etc.) |
| `has_tool_calls` | boolean | Whether response contains function/tool calls |
| `tool_calls_count` | number | Number of tool calls (if any) |
| `tools_used` | string[] | Names of tools that were called |
| `requires_action` | boolean | Whether tool calls need execution |
| `has_reasoning` | boolean | Whether response includes reasoning items |
| `reasoning_tokens` | number | Tokens used for model reasoning (if applicable) |
| `incomplete_reason` | string | Why response was incomplete (if applicable) |

## Use Cases for Agentic Metadata

### Agent Loop Detection
```typescript
if (response.metadata.aura.agentic.requires_action) {
  // Execute pending tool calls and continue the loop
  const toolResults = await executeTools(response.output);
  response = await continueConversation(toolResults);
}
```

### Reasoning Model Tracking
```typescript
// Track reasoning token usage for o1/o3 models
if (response.metadata.aura.agentic.reasoning_tokens) {
  console.log(`Reasoning tokens: ${response.metadata.aura.agentic.reasoning_tokens}`);
}
```

### Tool Usage Analytics
```typescript
// Track which tools are used most
const toolsUsed = response.metadata.aura.agentic.tools_used;
analytics.track('tool_usage', { tools: toolsUsed });
```

## Pricing Data

Aura includes up-to-date pricing for all supported models. Prices are per 1 million tokens in USD.

*Last updated: January 2026*

### OpenAI Models

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| gpt-5 | $5.00 | $20.00 | $1.25 |
| gpt-5.2 | $5.00 | $20.00 | $1.25 |
| gpt-5-mini | $0.50 | $2.00 | $0.125 |
| gpt-4.1 | $2.00 | $8.00 | $0.50 |
| gpt-4.1-mini | $0.40 | $1.60 | $0.10 |
| gpt-4.1-nano | $0.10 | $0.40 | $0.025 |
| gpt-4o | $2.50 | $10.00 | $1.25 |
| gpt-4o-mini | $0.15 | $0.60 | $0.075 |
| o1 | $15.00 | $60.00 | $7.50 |
| o1-pro | $150.00 | $600.00 | $75.00 |
| o3 | $2.00 | $8.00 | $1.00 |
| o3-mini | $1.10 | $4.40 | $0.55 |
| o4-mini | $1.10 | $4.40 | $0.55 |

### Anthropic Models

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| claude-opus-4-5 | $15.00 | $75.00 | $1.50 |
| claude-sonnet-4-5 | $3.00 | $15.00 | $0.30 |
| claude-haiku-4-5 | $1.00 | $5.00 | $0.10 |
| claude-3-5-sonnet | $3.00 | $15.00 | $0.30 |
| claude-3-5-haiku | $0.80 | $4.00 | $0.08 |
| claude-3-opus | $15.00 | $75.00 | $1.50 |

### Google Models

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| gemini-3-pro | $2.50 | $10.00 | $0.625 |
| gemini-3-flash | $0.15 | $0.60 | $0.0375 |
| gemini-2.5-pro | $1.25 | $10.00 | $0.3125 |
| gemini-2.5-flash | $0.30 | $2.50 | $0.075 |
| gemini-2.0-flash | $0.10 | $0.40 | $0.025 |
| gemini-1.5-pro | $1.25 | $5.00 | $0.3125 |
| gemini-1.5-flash | $0.075 | $0.30 | $0.01875 |

## Cost Calculation

The cost is calculated as:

```
cost = (input_tokens / 1M) * input_price
     + (output_tokens / 1M) * output_price
     + (cached_tokens / 1M) * cached_price  (if applicable)
     + (reasoning_tokens / 1M) * reasoning_price  (if applicable)
```

## Example

For a request using `gpt-4o-mini` with:
- 1,000 input tokens
- 500 output tokens

```
cost = (1000 / 1,000,000) * $0.15 + (500 / 1,000,000) * $0.60
     = $0.00015 + $0.0003
     = $0.00045
```

## Client-Side Fallback

If you're using the Aura chat client, it includes a fallback pricing module. When the gateway provides `cost_usd`, it's used directly. Otherwise, cost is calculated client-side:

```typescript
// Prefers server-provided cost, falls back to client calculation
const cost = response.usage.cost_usd ?? calculateCost(
  model,
  response.usage.input_tokens,
  response.usage.output_tokens
);
```

## Aggregating Costs

To track costs over time, you can:

1. **Log responses**: Store the `usage` object from each response
2. **Sum costs**: Add up `cost_usd` values
3. **Group by model/provider**: Use the `metadata.aura.provider` field

Example aggregation query (pseudo-SQL):

```sql
SELECT
  DATE(created_at) as date,
  metadata->'aura'->>'provider' as provider,
  model,
  SUM(usage->>'cost_usd')::float as total_cost,
  SUM(usage->>'input_tokens')::int as total_input_tokens,
  SUM(usage->>'output_tokens')::int as total_output_tokens
FROM responses
GROUP BY date, provider, model
ORDER BY date DESC;
```

## Custom Pricing

If you have negotiated pricing or need to override defaults, you can configure custom pricing in the gateway:

```rust
use aura_core::{CostCalculator, ModelPricing};

let mut calculator = CostCalculator::new();
calculator.set_pricing(
    "gpt-4o",
    ModelPricing::new(2.00, 8.00)  // Custom rates
);
```

## Unknown Models

For models not in the pricing database, `cost_usd` will be `null`. The response still includes token counts for your own calculations.

```json
{
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50,
    "total_tokens": 150,
    "cost_usd": null
  }
}
```
