# Auto Model Router — Research & Implementation Plan

**Status:** implemented as a stacked PR series, September 2026 (see [Status](#status) at the end)
**Scope:** a `model: "auto"` alias that scores each request's complexity, picks the cheapest model expected to answer it well, records the decision, and learns from Aura's existing tracing data.

---

## 1. What others are doing

| Product | Classifier | Cost/quality dial | Feedback loop | Notes |
|---|---|---|---|---|
| **Cursor Router** (Jul 2026) | "Compass", a classifier trained on 600k+ live coding requests; emits a continuous 0–1 complexity score per turn. Also reads query, surrounding context, task type, domain. | A threshold on the score. `Auto Cost` / `Auto Balance` / `Auto Intelligence` are the same router with different thresholds and task-router budgets. Balance/Intelligence cost ~2× Cost. | Learns from what the user does next: moving on to the next task = positive, correcting the agent = negative. | Compass is framed as "predict whether the user will be satisfied with the cheap model's answer", not "how hard is the prompt". |
| **LiteLLM Auto Router v2** (beta) | Heuristic scorer over 7 weighted dimensions: tokenCount 0.10, codePresence 0.30, reasoningMarkers 0.25, technicalTerms 0.25, simpleIndicators 0.05, multiStepPatterns 0.03, questionComplexity 0.02. Optional LLM classifier (e.g. Haiku) with heuristic fallback on error/timeout; lexical/semantic keyword rules; plugin classifiers. | Tier boundaries: SIMPLE <0.15, MEDIUM 0.15–0.35, COMPLEX 0.35–0.60, REASONING ≥0.60 (or ≥2 reasoning markers). Token thresholds 15 / 400. | Per-tier output is a pinned model, a random pool, or a Thompson-sampled adaptive pool. | Sub-ms, deterministic, no training data. Open pain points from users: explainability, per-model metrics inside the router, budget-aware tiers. **Does not support `/v1/responses`** (BerriAI/litellm#25134) — Aura is Responses-native, which is a differentiator. |
| **OpenRouter Auto** (`openrouter/auto`) | Not Diamond meta-model over ~19 curated models; optimises for quality. | Not Diamond's API exposes `tradeoff: cost \| latency \| quality`. | Custom routers are trained from (prompt, candidate responses, evaluation score) triples you supply. | Learned router as a service; the default one needs no training data. |
| **RouteLLM** (LMSYS, ICLR 2025) | Binary strong/weak router. Four types: matrix factorisation (recommended), similarity-weighted Elo, BERT classifier, causal-LLM classifier. Trained on Chatbot Arena preferences + GPT-4-judge augmentation. | `calibrate_threshold --strong-model-pct N` picks the threshold that sends N% of traffic to the strong model. | Offline. | 85% cost reduction at 95% of GPT-4 quality on MT-Bench; routers generalise to new model pairs without retraining. |
| **Bedrock Intelligent Prompt Routing** | Predicts per-model response quality for each request. | One parameter: acceptable "response quality difference" between the pair. | Offline. | Pairs must be same family (Haiku/Sonnet). Up to 30% savings claimed. |
| **vLLM Semantic Router** | Signal-driven: sub-ms heuristic signals (keywords, language, context length) plus 10–120 ms neural signals (embedding similarity, domain, complexity, feedback), composed by boolean decision rules. | Rules per deployment. | "user feedback" is a first-class signal type. | Closest architectural analogue to what we want: cheap signals first, expensive ones optional, decisions explainable. |
| **GPT-5 unified router** | Real-time router chooses fast vs. thinking track by conversation type, complexity, tool needs, explicit intent ("think hard"). | Internal. | Continuously trained on model-switch events, preference rates, measured correctness. | Confirms the pattern: explicit intent phrases and tool needs are strong features. |
| **Lovable** | No public dynamic router. Uses Claude (Opus 5) as the primary build agent and Gemini Flash as the default for in-app AI features. | Static per-surface model assignment. | — | Task-type routing, not prompt-complexity routing. |

**The shared pattern.** Every serious implementation has the same five parts, and the differences are only in how much they invest in each:

1. A **fast first-pass classifier** (heuristics) that costs <1 ms.
2. An **optional expensive classifier** (small LLM or trained model) behind it, with fallback to the heuristic.
3. A **single threshold/tier boundary** that is the user-facing cost-vs-quality dial (Cursor modes, RouteLLM strong-pct, Bedrock quality-difference).
4. A **closed feedback loop from production signals** — not just thumbs up/down but implicit ones: did the user move on, retry, correct, switch models.
5. **Explainable decisions** recorded per request (LiteLLM users' #1 ask; Martian markets "full tracing of routing decisions").

Aura already has 4 and 5 half-built (request_logs, feedback_samples, `metadata.aura`, `v_routing_stats`). That is the angle: **the router that learns from the gateway's own trace data**, rather than one more static heuristic.

---

## 2. What we already have (and what is missing)

### Reusable today

| Asset | Where | Use in the router |
|---|---|---|
| Single request funnel | `crates/aura-proxy/src/routes/responses.rs` `create_response` — `preprocess_request` at ~L622, provider lookup at ~L652 | Insertion point: resolve `auto` → concrete model between those two lines. Everything downstream (cost, logs, metrics) already keys off `request.model`. |
| Aura request extensions | `CreateResponseRequest` in `crates/aura-types/src/response.rs` (`validation`, `consistency`, `compression`) | Add a fourth optional `routing` object the same way; utoipa picks it up automatically. |
| `x-routing-strategy` → `metadata.aura.routing_strategy` → `v_routing_stats` → admin Routing page | `responses.rs`, `main.rs` `enrich_response_with_latency`, migration 011, `apps/admin/src/pages/RoutingPage.tsx` | Stamp `auto:<tier>` here and the existing dashboard lights up with no new plumbing. |
| Router crate | `crates/aura-core/src/router/` — `RoutingStrategy::{CostOptimized, ToolAware, ContextAdaptive, ReasoningDepth}`, `ModelProfile`, `MultiObjectiveSelector`, `AgentContext`, `ReasoningConfig.triggers`, `ContextRoutingConfig` thresholds | The scaffolding exists but is dead: nothing in the proxy calls `SmartRouter::route`, `AgentContext` is never populated from a real request, `ReasoningConfig.triggers` is never matched against a prompt. The auto router is what finally uses it. |
| Health / circuit breaker | `router/health.rs` | Hard constraint: never pick an unhealthy endpoint. |
| Pricing | `cost.rs` `CostCalculator` (seeded + DB override at boot), `model_pricing` table with `context_window`, `max_output_tokens`, `capabilities TEXT[]`, `good_at` (migration 028), batch prices (026) | Candidate catalog with cost and capability tags. `capabilities`/`good_at` are read by nothing in Rust yet. |
| Request tracing | `request_logs` (tokens, cost, latency, status, error, `metadata` JSONB with `aura.agentic.*`, optional `request_body`/`response_body`), indexed by `(model_id, created_at)` | Outcome signals and offline replay corpus. |
| Explicit feedback | `feedback_samples` (approved/rejected, `response_id`, `conversation_id`, FTS on `input_text`) | Quality labels. |
| Conversation graph | `responses` table + `previous_response_id` | Implicit signals: retry / correction / abandonment in the next turn. |
| Fan-out | `crates/aura-core/src/validation/fanout.rs` `run_fanout` | Label collection: run cheap + strong model on a sample, judge, store the pair. |
| Metrics | `metrics.rs` Prometheus | `aura_routing_*` counters. |

### Gaps to close (each is a concrete task below)

- `Config::from_env()` never reads YAML, so `config.routing` is always default in prod. Need `AURA_CONFIG_FILE` (or env/DB) for router config.
- Cache key (`cache.rs` `generate_cache_key`) hashes the *requested* model string. `auto` must be resolved before the cache lookup or tiers collide.
- Cache hits return before logging, so they'd produce no routing decision row. Acceptable for v1, but the decision must still be emitted in metadata.
- `request_logs.response_id` (`aura_<uuid>`) and `api_key_usage.request_id` (provider id) don't match; a decisions table must key on the gateway id.
- `feedback_samples.organization_id` and `feedback_by` are hard-coded `None` in `feedback.rs`.
- No `GET /v1/models`, no admin model catalog; the router needs a catalog endpoint for the playground's model picker to show what `auto` can choose from.
- No integration test harness (`wiremock` is prescribed in CLAUDE.md but not a dependency). Router work is a good excuse to add it.

---

## 3. Design

### 3.1 Request surface

```jsonc
// simplest
{ "model": "auto", "input": [...] }

// mode sugar
{ "model": "auto:cost" }        // also auto:balanced (default), auto:quality

// full control (Aura extension, same shape as validation/compression)
{
  "model": "auto",
  "input": [...],
  "routing": {
    "mode": "balanced",                 // cost | balanced | quality
    "min_tier": "medium",               // never go below
    "max_tier": "complex",              // never go above (budget guard)
    "allow": ["anthropic/*", "gpt-5.4-mini"],
    "deny": ["*-preview"],
    "sticky": true,                     // keep previous turn's model inside a tool loop (default true)
    "classifier": "heuristic"           // heuristic | llm | learned (org default if omitted)
  }
}
```

Response: `model` is the **selected concrete model** (as today for every other request), and the decision is exposed in two places:

```jsonc
"metadata": { "aura": {
  "routing_strategy": "auto:medium",
  "routing": {
    "requested_model": "auto",
    "mode": "balanced",
    "classifier": "heuristic@v1",
    "score": 0.27,
    "tier": "medium",
    "signals": { "est_input_tokens": 1830, "code": 0.6, "reasoning": 0.0, "tools": 2, "multi_step": 0.5, "conversation_depth": 4 },
    "hard_filters": ["needs_tools", "context>=4k"],
    "candidates": [ { "model": "gpt-5.4-mini", "cost_per_1k": 0.0009, "healthy": true }, ... ],
    "selected": "gpt-5.4-mini",
    "reason": "cheapest healthy candidate in tier",
    "shadow": false,
    "latency_us": 140
  }
}}
```

plus a response header `x-aura-selected-model` for clients that don't read metadata. The `routing_strategy` string `auto:<tier>` is what `v_routing_stats` already groups on.

### 3.2 Decision pipeline (per request, before cache lookup and provider lookup)

```
request ──► hard filters ──► feature extraction ──► score ──► tier ──► within-tier select ──► dispatch
              │                                                            │
              │  capability (vision, tools, context ≥ tokens+max_output)   │  cheapest | thompson | round_robin
              │  health (circuit breaker)                                  │  sticky to previous turn's model
              │  org allow/deny, budget, min/max tier                      │
              ▼                                                            ▼
        decision record ──────────────────────────────────────────► request_logs.metadata + routing_decisions
```

**Hard filters** run before any scoring and are the part that keeps this safe: a request with `tools` never lands on a model without tool support; an image never lands on a text-only model; estimated input + `max_output_tokens` must fit `context_window`; unhealthy endpoints are excluded; org allow/deny and `min_tier` apply.

**Sticky tool loops.** Agentic turns carry `function_call_output` items and a `previous_response_id`. Switching model mid-loop is the one thing that visibly breaks agent runs (different tool-calling styles, lost reasoning context), so by default the router pins the previous turn's model for continuation turns unless the new turn's tier is *higher*. This uses the `responses` table lookup the handler already does for `previous_response_id`.

**Features (v1 heuristic).** Responses-API-aware — this is exactly what LiteLLM lacks:

| Signal | Source | Note |
|---|---|---|
| est_input_tokens | all `input` items + `instructions` + replayed context | chars/4 as LiteLLM; swap for the tokenizer later |
| code_presence | fenced blocks, language keywords, file paths, stack traces | reuse detection in `HeuristicAnalyzer` (`validation.rs`) |
| reasoning_markers | "step by step", "prove", "why", "derive", "think carefully" | reuse `ReasoningConfig.triggers` (currently unused) |
| multi_step | "first … then", numbered lists, "and then", multiple imperatives | regex |
| tool_pressure | `tools.len()`, `tool_choice: required`, function_call_output present | tools ⇒ medium minimum |
| output_pressure | `max_output_tokens`, JSON-schema / structured output request | |
| conversation_depth | length of `previous_response_id` chain | deep threads skew harder |
| explicit_intent | "quick", "briefly", "one word" vs "think hard", "thorough" | direct override, as GPT-5 does |
| simple_indicators | "what is", "define", "translate", "rewrite this sentence" | negative weight |
| language | non-English detection | avoid weakest models |
| structure | `SmartCompressor::detect_structure` (tabular/nested/text) | |

Weighted sum → 0–1 score → tier by boundaries. Starting weights and boundaries copy LiteLLM's published defaults (they're the only public, tuned numbers) and become config.

**Modes** are score offsets, which mirrors Cursor's "same router, different threshold": `cost` −0.10, `balanced` 0, `quality` +0.15. This keeps one classifier and one set of boundaries.

**Tiers** (default catalog, overridable per org; built from `model_pricing` and provider `SUPPORTED_MODELS`):

| Tier | Default candidates | Approx. blended $/1M (in/out) |
|---|---|---|
| simple | gemini-3.1-flash-lite, gpt-5.4-nano, claude-haiku-4-5 | ≤ 1 |
| medium | gemini-3.5-flash, gpt-5.4-mini, claude-sonnet-4-6 | 1–5 |
| complex | claude-sonnet-4-6, gpt-5.5, gemini-3.1-pro-preview | 5–20 |
| reasoning | claude-opus-4-7, gpt-5.5-pro, o3-mini | > 20 |

**Within-tier selection**: v1 = cheapest healthy candidate. v2 = Thompson sampling with a reward derived from outcomes (section 3.4), so the router learns *which* medium model is actually good for this org's traffic.

### 3.3 Classifier ladder

| Level | Latency | Data needed | When |
|---|---|---|---|
| `heuristic@v1` | <1 ms | none | Phase 1. Always the fallback. |
| `llm` (e.g. `claude-haiku-4-5`, `gemini-3.1-flash-lite`) | 300–800 ms, ~$0.0001/req | none | Optional per org from Phase 3; strict timeout, falls back to heuristic. Output: `{tier, confidence}`. |
| `learned@vN` | <5 ms | labelled traffic (3.4) | Phase 5. Logistic regression / small GBDT over the same feature vector plus text n-gram hashes; trained offline in Python, weights exported as JSON and evaluated in Rust. Threshold calibrated RouteLLM-style to a target strong-model percentage. |

The feature vector is the same for all three, so decisions are comparable and the learned model can be A/B'd against the heuristic on the same logged features.

### 3.4 Reusing tracing data — the feedback loop

This is the part nobody else in the table can do for us and the reason to build rather than buy.

**Step 1 — record every decision.** New table `routing_decisions` (keyed on the gateway `response_id`, i.e. `request_logs.response_id`):

```
routing_decisions(
  response_id, organization_id, api_key_id, conversation_id,
  requested_model, mode, classifier_version,
  score, tier, features JSONB, hard_filters TEXT[], candidates JSONB,
  selected_model, selected_provider, reason,
  shadow BOOL, shadow_of_model,           -- what the user actually asked for when shadowing
  decision_latency_us, created_at
)
```

Shadow mode means: user pinned `gpt-5.5`, we still run the classifier, log what `auto` *would* have picked, and dispatch to `gpt-5.5`. That gives a labelled corpus and a "you would have saved $X" report before anyone opts in.

**Step 2 — derive outcomes.** A view/rollup `v_routing_outcomes` joins each decision with:

| Signal | Source | Polarity |
|---|---|---|
| completed / failed / incomplete (+`incomplete_reason`) | `request_logs.status`, `metadata.aura.agentic.incomplete_reason` | failed/incomplete ⇒ negative |
| latency_ms, output_tokens, cost_usd | `request_logs` | cost is the thing we're optimising |
| tool loop health: `tool_calls_count`, `requires_action`, later `function_call_output` errors | `metadata.aura.agentic` | tool errors ⇒ negative |
| explicit feedback | `feedback_samples.feedback` by `response_id` | approved / rejected |
| **retry**: next turn in the same conversation with near-identical input | `responses` + `previous_response_id`, FTS similarity (the GIN index exists on `feedback_samples`; add one on `responses.input_items` text) | negative (Cursor's "correcting the agent") |
| **correction**: next user turn starts with "no", "that's wrong", "try again", "you missed" | same | strong negative |
| **move on**: next turn is a different task, or conversation ends after a completed response | same | positive (Cursor's strongest positive) |
| **escalation**: same conversation re-sent with a stronger pinned model within N minutes | `routing_decisions.shadow_of_model`, `request_logs.model_id` | strong negative for the cheap model |
| logprob confidence when `validation.include_logprobs` | `metadata.aura.validation` | weak quality proxy |

Reward for a (tier, model) arm: `+1` move-on/approved, `0` neutral, `−1` retry/rejected/failed/escalated, weighted by recency. That feeds Thompson sampling within a tier and the label set for the learned classifier ("would the cheap tier have satisfied this request?").

**Step 3 — collect gold labels cheaply.** For a small sample of shadow traffic (e.g. 1%), reuse `run_fanout` to get both the cheap-tier and strong-tier answer, judge with an LLM (pairwise, RouteLLM-style), store the pair and verdict. This is the augmentation that made RouteLLM's routers work and it costs us nothing new to build.

**Step 4 — retrain and calibrate.** Nightly job (Python, `scripts/router/`) pulls `v_routing_outcomes` + gold pairs, trains, reports precision/recall per tier, calibrates the threshold for the org's target strong-model share, exports `router-weights-vN.json`. The gateway loads weights from the DB (`router_models` table) at boot and on an admin `POST /admin/routing/reload`.

### 3.5 Configuration

```yaml
routing:
  auto:
    enabled: true
    default_mode: balanced
    default_classifier: heuristic       # heuristic | llm | learned
    llm_classifier: { model: claude-haiku-4-5, timeout_ms: 800 }
    shadow_for_pinned_models: true      # log what auto would have done
    tiers:
      simple:    [gemini-3.1-flash-lite, gpt-5.4-nano, claude-haiku-4-5]
      medium:    [gemini-3.5-flash, gpt-5.4-mini, claude-sonnet-4-6]
      complex:   [claude-sonnet-4-6, gpt-5.5, gemini-3.1-pro-preview]
      reasoning: [claude-opus-4-7, gpt-5.5-pro, o3-mini]
    boundaries: { simple_medium: 0.15, medium_complex: 0.35, complex_reasoning: 0.60 }
    mode_offsets: { cost: -0.10, balanced: 0.0, quality: 0.15 }
    weights: { tokens: 0.10, code: 0.30, reasoning: 0.25, technical: 0.25, simple: 0.05, multi_step: 0.03, questions: 0.02, tools: 0.15, explicit_intent: 0.30 }
    within_tier: cheapest               # cheapest | thompson | round_robin
    sticky_tool_loops: true
```

Loaded via a new `AURA_CONFIG_FILE` env (YAML + env overrides, using the existing `from_file_with_env`), with per-organization overrides in `organizations.settings.routing` (same JSONB precedent as `capture_payloads`). Admin UI edits the org override, not the YAML.

### 3.6 Observability

- Prometheus: `aura_routing_decisions_total{mode,tier,classifier,selected_model,shadow}`, `aura_routing_classifier_seconds{classifier}`, `aura_routing_fallbacks_total{reason}`, `aura_routing_estimated_savings_usd_total`.
- Admin Routing page (already read-only stats): add tier distribution, selected-model share per tier, savings vs. "always strongest" baseline, escalation/retry rate per tier, shadow report, and a per-request decision drawer in the harness trace (the harness already shows `metadata.aura`).
- Every decision explains itself in `metadata.aura.routing.reason` and `hard_filters`.

### 3.7 Risks and guards

| Risk | Guard |
|---|---|
| Quality regression on hard prompts | `min_tier`, `quality` mode, tools ⇒ medium floor, explicit-intent override, per-org kill switch (`enabled: false` in org settings). |
| Model switch mid tool loop | Sticky continuation turns by default. |
| Classifier latency | Heuristic is <1 ms; LLM classifier has a hard timeout and always falls back. |
| Cache collisions across tiers | Resolve `auto` before `generate_cache_key`. |
| Catalog drift (new models, deprecations) | Tiers reference model IDs validated at boot against provider `SUPPORTED_MODELS`; unknown IDs are dropped with a warning; pricing scraper keeps costs fresh. |
| Label noise in implicit signals | Combine several signals; use gold pairs from fan-out to validate; report per-tier precision before promoting a learned model. |
| Streaming | Decision is made before the first byte, so streaming is unaffected. Escalation on failure only before first token (same as existing fallback semantics). |
| Budget | `max_tier`, and later the daily-limit check already on API keys. |

---

## 4. Delivery plan

Each PR is independently shippable and leaves `auto` usable at the end of PR 2.

| # | PR | Contents | Size |
|---|---|---|---|
| 1 | `feat(router): complexity scorer and tier config` | `crates/aura-core/src/router/auto/{mod,features,scorer,tiers,config}.rs`; `AutoRoutingConfig` on `RoutingConfig`; `RoutingConfig::auto` defaults; feature extraction from `CreateResponseRequest` (Responses `input` items, `instructions`, `tools`, `previous_response_id`); unit tests with a fixture prompt set (simple / code / multi-step / reasoning / tool loop). Reuse `ReasoningConfig.triggers` and `ContextRoutingConfig` thresholds. | ~2 days |
| 2 | `feat(proxy): model "auto" resolution` | `routing: Option<AutoRoutingRequest>` on `CreateResponseRequest`; `auto` / `auto:<mode>` parsing; resolve in `create_response` between `preprocess_request` and provider lookup; hard filters (capabilities from provider + `model_pricing`, health, allow/deny); sticky tool loops; cache-key fix; `metadata.aura.routing` + `routing_strategy = auto:<tier>` + `x-aura-selected-model`; Prometheus counters; `AURA_CONFIG_FILE`; `docs/api/auto-routing.md`; roadmap entry; SDK model-name passthrough check. | ~2 days |
| 3 | `feat(db): routing decisions and shadow mode` | Migration `routing_decisions` (unique date prefix!); `RoutingDecisionRepo`; write from the handler (spawned, like `log_request`); shadow mode for pinned models; `v_routing_outcomes` v1 (status, cost, latency, feedback join); `GET /admin/stats/routing/auto`, `GET /admin/routing/decisions?response_id=`; admin Routing page cards; harness decision drawer. | ~3 days |
| 4 | `feat(router): catalog from DB and per-org overrides` | Extend `ModelPricingSimple`/`get_all_current` with `capabilities`, `good_at`, batch prices; build tiers from the catalog when config leaves them empty; `organizations.settings.routing` override + admin editor; `GET /v1/models` (listing includes `auto`); playground picker shows `auto`. | ~2 days |
| 5 | `feat(router): outcome signals and adaptive within-tier selection` | Conversation-graph signals (retry / correction / move-on / escalation) as a nightly rollup into `routing_outcomes`; reward computation; Thompson sampling `within_tier: thompson` with arm state in Postgres (Redis cache optional); savings report. | ~3 days |
| 6 | `feat(router): LLM classifier and gold-label collection` | `classifier: llm` with timeout + fallback; fan-out sampling of shadow traffic into `routing_gold_pairs` with LLM-judge verdicts; offline replay script `scripts/router/replay.py` that re-scores captured `request_body` payloads and reports tier distribution + projected cost. | ~3 days |
| 7 | `feat(router): learned classifier` | `scripts/router/train.py` (features + hashed n-grams → logistic regression / LightGBM), threshold calibration to target strong-model %, weight export; `router_models` table; Rust evaluator for exported weights; `classifier: learned`; A/B against heuristic by org. | ~4 days |
| 8 | `feat(router): escalation cascade` | On provider failure or low-confidence pre-stream, retry one tier up within budget; expose `escalated_from` in the decision. Optional, only if outcome data shows it pays. | ~2 days |

Also in PR 1 or 2: add `wiremock` + `insta` as dev-dependencies and a first integration test for `auto` end-to-end, since none exist yet.

**Rollout:** PR 3 shadow mode on for everyone (zero user impact) → opt-in `auto` per org → `auto:balanced` as the playground default → learned classifier per org once its shadow precision beats the heuristic.

---

## 5. Decisions taken

All five recommendations were accepted before PR 1:

1. **Request surface:** both `model: "auto[:mode]"` and the `routing` object.
2. **Default mode:** `balanced`.
3. **LLM classifier:** available per request / per org (`classifier: llm`), heuristic fallback on any failure.
4. **Config home:** `AURA_CONFIG_FILE` YAML (+ `AURA_AUTO_ROUTING=on|off`) with per-organization overrides in `organizations.settings.routing.auto`.
5. **Shadow mode default on** for pinned-model traffic; decisions store numeric feature vectors only.

## Status

Delivered as eight stacked PRs, each on the previous one's branch:

| # | PR | Branch | What changed from the plan |
|---|---|---|---|
| 1 | [#217](https://github.com/UmaiTech/aura-llm-gateway/pull/217) scorer, tiers, config | `claude/llm-model-router-complexity-ys0nnt` | Raw score clamps to `[-1, 1]` so trivial prompts resist the quality offset. |
| 2 | [#218](https://github.com/UmaiTech/aura-llm-gateway/pull/218) `model: "auto"` in the proxy | `claude/auto-router-2-proxy-resolution` | Provider health as a hard filter moved to PR 8 (breaker). `wiremock` + `http-body-util` added; `insta` was not needed. |
| 3 | [#219](https://github.com/UmaiTech/aura-llm-gateway/pull/219) decisions table, shadow mode, admin stats | `claude/auto-router-3-decisions-shadow` | Decisions are upserted from the completion paths (one write per request) instead of insert-then-update. No separate harness drawer: the harness already renders `metadata.aura`. |
| 4 | [#220](https://github.com/UmaiTech/aura-llm-gateway/pull/220) catalog, org overrides, `/v1/models` | `claude/auto-router-4-catalog-org-overrides` | Org settings cached 60 s in `AppState` and shared with payload capture. Tiers auto-derived from the catalog when config leaves them empty. |
| 5 | [#221](https://github.com/UmaiTech/aura-llm-gateway/pull/221) outcome signals, Thompson | `claude/auto-router-5-outcomes-thompson` | Rollup runs inside the gateway (15 min default, plus `POST /admin/routing/rollup`) rather than as an external nightly job; Beta sampling implemented without new crates. |
| 6 | [#222](https://github.com/UmaiTech/aura-llm-gateway/pull/222) LLM classifier, gold labels, replay | `claude/auto-router-6-llm-classifier-gold` | Gold pairs compare the lowest and highest populated tiers; `POST /admin/routing/score` is the dry-run surface `replay.py` uses. |
| 7 | [#223](https://github.com/UmaiTech/aura-llm-gateway/pull/223) learned classifier, model registry | `claude/auto-router-7-learned-classifier` | Numeric features only (no text n-grams) so training needs no retained prompt text; pure-stdlib logistic regression instead of LightGBM. |
| 8 | [#224](https://github.com/UmaiTech/aura-llm-gateway/pull/224) escalation, circuit breaker | `claude/auto-router-8-escalation` | Escalates within the same tier before moving up; breaker feeds eligibility. |

Merge in order (1 → 8); each PR's base is the previous branch, so GitHub retargets automatically as they land.

---

## Sources

- Cursor: [How Cursor Router chooses the right model](https://cursor.com/blog/how-cursor-router-works), [Cursor Router docs](https://cursor.com/docs/cursor-router)
- LiteLLM: [Auto Routing (beta)](https://docs.litellm.ai/docs/proxy/auto_routing), [Auto Router v2 blog](https://docs.litellm.ai/blog/autorouter-v2), [complexity_router source](https://github.com/Zipstack/litellm/tree/main/litellm/router_strategy/complexity_router), [maintainer discussion #32168](https://github.com/BerriAI/litellm/discussions/32168), [issue #25134 — no /v1/responses support](https://github.com/BerriAI/litellm/issues/25134)
- OpenRouter / Not Diamond: [Auto Router docs](https://openrouter.ai/docs/guides/routing/routers/auto-router), [Not Diamond key concepts](https://docs.notdiamond.ai/docs/key-concepts), [custom router training](https://docs.notdiamond.ai/docs/router-training-quickstart)
- RouteLLM: [LMSYS blog](https://www.lmsys.org/blog/2024-07-01-routellm/), [GitHub](https://github.com/lm-sys/RouteLLM), [paper](https://arxiv.org/abs/2406.18665)
- Bedrock: [Intelligent Prompt Routing](https://aws.amazon.com/bedrock/intelligent-prompt-routing/)
- vLLM Semantic Router: [docs](https://vllm-sr.ai/docs/intro/), [GitHub](https://github.com/vllm-project/semantic-router)
- OpenAI: [Introducing GPT-5](https://openai.com/index/introducing-gpt-5/)
- Lovable: [changelog](https://docs.lovable.dev/changelog)
- Survey: [awesome-ai-model-routing](https://github.com/Not-Diamond/awesome-ai-model-routing)
