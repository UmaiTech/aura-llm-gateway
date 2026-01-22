# Cost Tracking

Aura automatically calculates and includes cost information in every response, enabling you to track LLM spending without maintaining your own pricing data.

## How It Works

1. The gateway maintains pricing data for all supported models
2. When a response completes, cost is calculated from token usage
3. The `cost_usd` field is added to the `usage` object

## Response Format

```json
{
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50,
    "total_tokens": 150,
    "cached_tokens": 0,
    "reasoning_tokens": 0,
    "cost_usd": 0.00075
  }
}
```

## Pricing Data

Aura includes up-to-date pricing for all supported models. Prices are per 1 million tokens in USD.

### OpenAI Models

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| gpt-4o | $2.50 | $10.00 | $1.25 |
| gpt-4o-mini | $0.15 | $0.60 | $0.075 |
| gpt-4-turbo | $10.00 | $30.00 | - |
| gpt-3.5-turbo | $0.50 | $1.50 | - |
| o1 | $15.00 | $60.00 | $7.50 |
| o1-mini | $3.00 | $12.00 | $1.50 |
| o3-mini | $1.10 | $4.40 | $0.55 |

### Anthropic Models

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| claude-3-5-sonnet | $3.00 | $15.00 | $0.30 |
| claude-3-5-haiku | $0.80 | $4.00 | $0.08 |
| claude-3-opus | $15.00 | $75.00 | $1.50 |

### Google Models

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| gemini-2.0-flash | $0.075 | $0.30 | - |
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
