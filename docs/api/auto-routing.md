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

Only models the gateway can actually serve (a provider key is configured) are ever considered. Tier lists are configurable per gateway; when none are configured the gateway derives them from its model catalog (price thirds, `reasoning` tag) at startup.

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
  "model": "gpt-5.4-nano",
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
          {"model": "gpt-5.4-nano", "provider": "openai", "tier": "simple", "cost_per_million": 0.16, "eligible": true}
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
- estimated input plus `max_output_tokens` must fit the model's context window, when known
- models this gateway has no provider for
- anything excluded by `allow` / `deny` on the request or the organization

Capabilities and context windows come from the gateway's model catalog: the `model_pricing` table (scraped `capabilities` tags, `context_window`) where a row matches, and conservative name-based hints otherwise. `GET /v1/models` shows what the catalog knows about each model.

If no candidate in the chosen tier is eligible, the router escalates to the next tier up, then falls back to lower tiers, within `min_tier` / `max_tier`. If nothing is eligible at all the request fails with `503 no_eligible_model`.

### Tool loops

Switching models mid tool loop breaks agent runs, so continuation turns (a request carrying `function_call_output` items and `previous_response_id`) keep the previous turn's model as long as it is eligible and at least as strong as the tier the new turn scored. Set `routing.sticky: false` to opt out.

### Shadow decisions

When `routing.auto.shadow_for_pinned_models` is on (the default), requests that pin a concrete model still get scored. The decision `auto` would have made is returned in `metadata.aura.routing` with `"shadow": true`, the request is dispatched to the model you asked for, and no `x-aura-selected-model` header is set. This is what powers the "what would auto have saved" reporting without changing any traffic.

## Listing models

`GET /v1/models` returns every model this gateway can serve, OpenAI-list style, with an `aura` object per entry (tier, capabilities, `good_at`, prices, context window, vision / tool support) and, when the router is configured, a top-level `auto` object with the accepted aliases and the tier lists. The `auto*` aliases are listed first with `owned_by: "aura"` when auto routing is enabled.

```json
{
  "object": "list",
  "data": [
    {"id": "auto", "object": "model", "owned_by": "aura", "aura": {"capabilities": ["auto-routing", "mode:balanced"], "supports_vision": true, "supports_tools": true}},
    {"id": "gpt-5.4-nano", "object": "model", "owned_by": "openai", "aura": {"tier": "simple", "capabilities": ["fast", "cost-efficient"], "input_per_million": 0.1, "output_per_million": 0.4, "context_window": 400000, "supports_vision": true, "supports_tools": true}}
  ],
  "auto": {"enabled": true, "shadow_for_pinned_models": true, "default_mode": "balanced", "aliases": ["auto", "auto:cost", "auto:balanced", "auto:quality"], "tiers": {"simple": ["gpt-5.4-nano"], "medium": ["..."], "complex": ["..."], "reasoning": ["..."]}}
}
```

## Per-organization overrides

An organization can override the gateway defaults through `organizations.settings.routing.auto` (edited on the admin app's organization page):

```json
{
  "routing": {
    "auto": {
      "enabled": true,
      "shadow_for_pinned_models": false,
      "default_mode": "cost",
      "min_tier": "medium",
      "max_tier": "complex",
      "allow": ["anthropic/*"],
      "deny": ["*-preview"]
    }
  }
}
```

Preferences follow request `routing` options, then the `auto:<mode>` alias, then the organization override, then the gateway config; the organization's `default_mode` only applies when the request chose none. Bounds are policy and cannot be loosened by a request: `min_tier` is the stronger of the two, `max_tier` the weaker, deny lists from both are applied, and a candidate must be permitted by the organization's `allow` list *and* the request's. `enabled` can switch `auto` on for one organization while the gateway default stays off, or off for one organization while it is on. Settings are cached for 60 seconds on the gateway and refreshed when the organization is updated.

## Errors

| Status | Code | When |
|--------|------|------|
| 404 | `model_not_found` | `model: "auto"` on a gateway where `routing.auto.enabled` is `false`, or for an organization whose override sets `enabled: false`. |
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
    within_tier: cheapest           # cheapest | config_order | round_robin | thompson
    sticky_tool_loops: true
    tools_min_tier: medium
    outcome_rollup_interval_secs: 900
    outcome_grace_secs: 1800
    arm_stats_window_days: 30
```

Feature `weights`, `token_thresholds` and every `keywords` list are configurable too; see `config.example.yaml` for the full block. Tier models the gateway cannot serve are dropped at startup with a warning.

## Decision log

Every decision, applied or shadow, is stored in the `routing_decisions` table (numeric features only, never prompt text) and joined with what actually happened in the `v_routing_outcomes` view: request status, tokens, cost, latency, explicit feedback, and for shadow rows an `estimated_savings_usd` computed from the pinned model's and the auto-selected model's blended prices at this request's token counts.

Admin endpoints (bearer `AURA_ADMIN_KEY`):

| Endpoint | Description |
|----------|-------------|
| `GET /admin/stats/routing/auto?period=24h\|7d\|all` | Summary (applied / shadow decisions, applied cost, estimated savings, decision latency, success rate), per-tier and per-model breakdowns, and the 25 most recent decisions with outcomes. |
| `GET /admin/routing/decisions/{response_id}` | One decision by gateway request id (`aura_…`) or provider response id (`resp_…`). |
| `POST /admin/routing/rollup` | Score pending decisions now and refresh arm statistics; returns counts per signal. |
| `GET /admin/routing/arms` | Learned Beta(α, β) per (tier, model) used by `within_tier: thompson`. |

The admin app's Routing page renders the same data as an "Auto router" section.

### Outcome signals and rewards

A background job (every `routing.auto.outcome_rollup_interval_secs`, default 15 minutes, or on demand with `POST /admin/routing/rollup`) scores decisions once they are older than `outcome_grace_secs` (default 30 minutes) using what the traces already hold:

| Signal | Source | Reward |
|--------|--------|--------|
| explicit feedback | `feedback_samples` approved / rejected | +1 / −1 (overrides everything else) |
| request failed / incomplete | `request_logs.status` | −1 / −0.5 |
| **escalation**: the conversation continued on a stronger-tier model | next `responses` row via `previous_response_id` | −1 |
| **correction**: the next user message opens with "no", "that's wrong", "try again", … | next `responses.input_items` | −1 |
| **retry**: the next user message is near-identical (word Jaccard ≥ 0.8) | same | −0.5 |
| **move on**: the next turn is a different task | same | +1 |
| no follow-up, response completed | | +0.5 |

Tool-loop continuation turns (function outputs without a new user message) are not counted as a verdict. Results land in `routing_outcomes` and are visible per tier on the admin page (mean reward and the move-on / retry / correction / escalation counts) and in `v_routing_outcomes`.

### Adaptive within-tier selection

With `within_tier: thompson`, the gateway keeps Beta(α, β) statistics per (tier, model) from applied decisions in the trailing `arm_stats_window_days` (default 30): α = 1 + Σ positive rewards, β = 1 + Σ |negative rewards|. Each request samples every eligible candidate's Beta and dispatches to the highest sample, so models that keep users moving on win more traffic while new or rarely used models still get explored. `GET /admin/routing/arms` shows the current statistics; the decision `reason` reports the sample, the mean and the observation count. Shadow decisions never feed the arms.

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
