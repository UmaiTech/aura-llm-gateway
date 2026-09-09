# Auto Model Routing

Let the gateway pick the cheapest model that is expected to answer a request well.

## Overview

Send `model: "auto"` and Aura scores the request's complexity, maps it to a tier, and dispatches to the cheapest healthy model in that tier. The response tells you exactly which model answered and why.

| Tier | Typical request | Default candidates |
|------|-----------------|--------------------|
| `simple` | Short factual questions, rewrites, translations, greetings | `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gpt-5.6-luna` |
| `medium` | Everyday assistant work, light code, tool calls | `gemini-3.8-flash`, `gpt-5.4-mini`, `claude-haiku-4-5` |
| `complex` | Multi-step engineering work, debugging, long context | `claude-sonnet-5`, `gemini-3-pro-preview`, `gpt-5.6-terra` |
| `reasoning` | Proofs, derivations, deep analysis, explicit "think hard" | `claude-opus-5`, `gpt-5.6-sol`, `claude-fable-5-1` |

Only models the gateway can actually serve (a provider key is configured) are ever considered. Tier lists are configurable per gateway.

## Request

```json
{
  "model": "auto",
  "input": [{"type": "message", "role": "user", "content": "What is the capital of France?"}]
}
```

### Modes

Append a mode to the alias to shift the cost/quality balance:

| Model string | Effect |
|--------------|--------|
| `auto` / `auto:balanced` | Neutral. Default. |
| `auto:cost` | Prefer cheaper models; only clearly hard requests move up a tier. |
| `auto:quality` | Prefer stronger models; borderline requests move up a tier. |

Modes are implemented as an offset on the complexity score, so all three use the same classifier and tier boundaries.

### `routing` options

Fine-tune a single request with a top-level `routing` object (an Aura extension, like `validation` and `compression`). Every field is optional.

```json
{
  "model": "auto",
  "input": [...],
  "routing": {
    "mode": "balanced",
    "min_tier": "medium",
    "max_tier": "complex",
    "allow": ["anthropic/*", "gpt-5.4-mini"],
    "deny": ["*-preview"],
    "sticky": true,
    "classifier": "heuristic"
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `cost` \| `balanced` \| `quality` | gateway default | Overrides the `auto:<mode>` suffix. |
| `min_tier` | tier | `simple` | Never route below this tier. |
| `max_tier` | tier | `reasoning` | Never route above this tier (budget guard). |
| `allow` | string[] | all | Only consider models matching one of these patterns. Patterns match the model id or `provider/model`; a trailing `*` is a prefix wildcard. |
| `deny` | string[] | none | Never consider models matching one of these patterns. |
| `sticky` | boolean | `true` | Keep the previous turn's model when this request continues a tool loop (has `function_call_output` items and `previous_response_id`). |
| `classifier` | `heuristic` | `heuristic` | Which classifier scores the request. `llm` and `learned` are reserved for upcoming releases. |

## Response

The response's `model` field is the concrete model that answered, and the decision is exposed in two places:

- the `x-aura-selected-model` response header (JSON and SSE responses alike)
- `metadata.aura.routing`

```json
{
  "id": "resp_...",
  "model": "gemini-3.1-flash-lite",
  "metadata": {
    "aura": {
      "routing_strategy": "auto:simple",
      "routing": {
        "requested_model": "auto",
        "mode": "balanced",
        "classifier": "heuristic@v1",
        "score": 0.0,
        "raw_score": 0.0,
        "classified_tier": "simple",
        "tier": "simple",
        "signals": {"simple": -0.05, "tokens": -0.1},
        "features": {"est_input_tokens": 8, "code": 0.0, "reasoning": 0.0, "tool_count": 0, "...": "..."},
        "hard_filters": [],
        "candidates": [
          {"model": "gemini-3.1-flash-lite", "provider": "google", "tier": "simple", "cost_per_million": 0.11, "eligible": true},
          {"model": "gemini-3.5-flash", "provider": "google", "tier": "simple", "cost_per_million": 0.29, "eligible": true},
          {"model": "gpt-5.6-luna", "provider": "openai", "tier": "simple", "cost_per_million": 0.35, "eligible": true}
        ],
        "selected": "gemini-3.1-flash-lite",
        "selected_provider": "google",
        "reason": "cheapest eligible in simple ($0.11/1M blended)",
        "shadow": false,
        "latency_us": 140
      }
    }
  }
}
```

| Field | Meaning |
|-------|---------|
| `score` | Complexity in `[0, 1]` after the mode offset. Tier boundaries are 0.15 / 0.35 / 0.60. |
| `classified_tier` | Tier the classifier assigned before any clamps. |
| `tier` | Tier after `min_tier`, `max_tier` and the tools floor. |
| `signals` | Weighted feature contributions that fired (code, reasoning markers, tools, explicit intent, …). |
| `features` | The full numeric feature vector. No prompt text is ever included. |
| `hard_filters` | Constraints that shaped the decision, in order (`needs tools`, `min_tier medium`, `sticky tool loop`, …). |
| `candidates` | Every model considered, with eligibility and blended price. |
| `reason` | Why the selected model won, including any escalation. |
| `shadow` | `true` when the decision was recorded but not applied (see below). |

### Hard constraints

Before any scoring, the router excludes models that can't serve the request:

- requests with image input only go to vision-capable models
- requests with `tools` only go to tool-capable models, and never below the `medium` tier
- models this gateway has no provider for
- anything excluded by `allow` / `deny`

If no candidate in the chosen tier is eligible, the router escalates to the next tier up, then falls back to lower tiers, within `min_tier` / `max_tier`. If nothing is eligible at all the request fails with `503 no_eligible_model`.

### Tool loops

Switching models mid tool loop breaks agent runs, so continuation turns (a request carrying `function_call_output` items and `previous_response_id`) keep the previous turn's model as long as it is eligible and at least as strong as the tier the new turn scored. Set `routing.sticky: false` to opt out.

### Shadow decisions

When `routing.auto.shadow_for_pinned_models` is on (the default), requests that pin a concrete model still get scored. The decision `auto` would have made is returned in `metadata.aura.routing` with `"shadow": true`, the request is dispatched to the model you asked for, and no `x-aura-selected-model` header is set. This is what powers the "what would auto have saved" reporting without changing any traffic.

## Errors

| Status | Code | When |
|--------|------|------|
| 404 | `model_not_found` | `model: "auto"` on a gateway where `routing.auto.enabled` is `false`. |
| 503 | `no_eligible_model` | Every candidate was excluded by capability, provider availability or `allow` / `deny`. |

`auto:<unknown-mode>` is treated as an ordinary unknown model name and returns `404 model_not_found`.

## Gateway configuration

Auto routing is configured under `routing.auto` in the YAML config file. Point the gateway at the file with `AURA_CONFIG_FILE=/path/to/config.yaml`; `AURA_AUTO_ROUTING=on|off` flips `enabled` without a file.

```yaml
routing:
  auto:
    enabled: true
    default_mode: balanced          # cost | balanced | quality
    shadow_for_pinned_models: true  # score pinned-model requests too
    tiers:
      simple:    [gemini-3.1-flash-lite, gemini-3.5-flash, gpt-5.6-luna]
      medium:    [gemini-3.8-flash, gpt-5.4-mini, claude-haiku-4-5]
      complex:   [claude-sonnet-5, gemini-3-pro-preview, gpt-5.6-terra]
      reasoning: [claude-opus-5, gpt-5.6-sol, claude-fable-5-1]
    boundaries: { simple_medium: 0.15, medium_complex: 0.35, complex_reasoning: 0.60 }
    mode_offsets: { cost: -0.10, balanced: 0.0, quality: 0.15 }
    within_tier: cheapest           # cheapest | config_order | round_robin
    sticky_tool_loops: true
    tools_min_tier: medium
```

Feature `weights`, `token_thresholds` and every `keywords` list are configurable too; see `config.example.yaml` for the full block. Tier models the gateway cannot serve are dropped at startup with a warning.

## Metrics

| Metric | Labels | Description |
|--------|--------|-------------|
| `aura_routing_decisions_total` | `mode`, `tier`, `classifier`, `model`, `shadow` | Decisions made, applied and shadow. |
| `aura_routing_classifier_seconds` | `classifier` | Time spent classifying. |
| `aura_routing_failures_total` | `reason` | Requests that could not be routed. |

`routing_strategy` is stamped as `auto:<tier>` for applied decisions, so the existing `/admin/stats/routing` view and the admin Routing page group auto traffic per tier.

## SDKs

Both SDKs pass the model string through unchanged; use `KnownModels.AUTO`, `KnownModels.AUTO_COST` or `KnownModels.AUTO_QUALITY`.

```python
from aura import AuraClient, KnownModels

client = AuraClient(api_key="...")
response = client.responses.create(model=KnownModels.AUTO, input="What is the capital of France?")
print(response.model, response.metadata["aura"]["routing"]["tier"])
```
