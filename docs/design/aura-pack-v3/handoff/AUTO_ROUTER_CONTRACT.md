# Auto-router semantics to preserve

The reviewed API guide and Rust implementation are authoritative; recheck current HEAD.

## Meaning
- `auto` and `auto:balanced` are neutral. `auto:cost` shifts score toward cheaper tiers; `auto:quality` shifts toward stronger tiers. They do not mean global cheapest model or fastest model.
- Tiers: simple, medium, complex, reasoning. Defaults: boundaries .15/.35/.60; offsets cost -.10, balanced 0, quality +.15. These are configurable, so read returned boundaries where available.
- Features → classifier → tier → constraints → within-tier selection. Cheapest is default; config_order, round_robin, thompson and predicted_cost are alternatives.
- Model availability, tools, vision, context capacity, allow/deny and breaker state matter. Tools have at least a medium-tier floor.
- No eligible model produces 503 `no_eligible_model`. Disabled/unknown auto aliases produce 404 `model_not_found`.
- Failure escalation retries candidates before output starts, bounded by max_attempts and max_tier. Streaming retry is not supported after the first event.
- Sticky tool loops preserve the previous model only while eligible and sufficiently strong for the new request.

## UI field hierarchy
1. Actual response model (what answered).
2. Applied vs Shadow label.
3. Requested model alias and mode.
4. Classified tier → final tier, score and returned boundaries.
5. Reason and hard_filters.
6. Candidates: model/provider/tier/eligibility, `cost_per_million`, optional `predicted_cost_usd`.
7. Escalation history and raw metadata.

Shadow means the pinned model answers and `selected` is hypothetical. Do not relabel it as the provider actually used. The selected-model response header is not emitted for shadow decisions. Counterfactual estimated savings must be visually distinct from realized spend.

## Policy scope
Preferences follow request routing options → auto suffix → organization default → gateway config. Org bounds are constraints: min is the stricter lower bound; max is the stricter upper bound; deny applies from both scopes and both allow lists must permit a model. Requests cannot relax org restrictions.

Gateway runtime settings have boot / overrides / effective / environment / persisted results. Show warnings for dropped tier models; handle save failures. Org cache behavior is a backend detail, not a reason to show a false immediate success.

## Budget and learning cautions
`max_cost_usd` is a predicted-cost selection constraint, not a guaranteed hard spend cap. It requires the learned cost model; without one it degrades to list-price selection/no budget. If nothing fits, the budget may be ignored and the reason records it. Do not market this as budget enforcement.

Heuristic/learned classification uses local numeric features. LLM classification additionally sends an excerpt of user text to the configured classifier model. Learned training is offline with activation; outcome rollups alone do not mean weights automatically retrain. Gold labels can incur extra completions/judging cost.

## Prototype coverage
Implemented: four deterministic shapes, mode offsets, tier bounds, tools floor, enabled-provider filter, tier fallback, shadow explanation, shared landing→chat→console metadata.
Not implemented: actual feature extraction, vision/context checking, allow/deny, breaker timing, live failure escalation, sticky history, learned/LLM classifiers, cost prediction, budget selection, outcome learning or training. The example prices and scores are fictional design fixtures, not current quotes or measurements.
