# Docs, roadmap and pricing recommendations

## Findings from source

### Roadmap: correctness before styling (P0)
`RoadmapPage.tsx` declares v0.13 latest shipped and v0.14 active, with many now-shipped features mixed into the active bucket. `CHANGELOG.md` records auto-routing in v0.18.0 and v0.20.0 on 2026-10-22. Main includes prompt-caching commit ca6d517 / PR #243 after the v0.20 release commit; do not assign it a release until evidence exists.

Reconcile every row against release notes and merged PRs. Together is mentioned among supported providers elsewhere but still appears in the roadmap's future provider list: audit that conflict too. The landing's numbered provider count also needs reconciliation with its adjacent named list and the current catalog. Do not guess a corrected number; generate it from a defined supported-provider registry.

Use typed metadata `{id, title, status, releasedVersion?, releasedAt?, evidenceLinks, area, description}`. Allowed statuses should distinguish released / merged-unreleased / in-progress / planned / considering; design recommendations stay explicitly proposed until accepted. Validate required evidence for released items. Do not label an item in-progress merely because it is desired.

Suggested next priorities (recommendations, not commitments):
1. Decision trust: consistent inspector, rollout evidence and separate actual vs shadow metrics.
2. Information freshness: release sync, canonical docs and pricing provenance.
3. v1 readiness: measurable compatibility, recovery and deployment criteria. A 99.9% uptime promise needs a defined service/operator/SLO; it is not established by an OSS release number.
4. Evaluate hard per-key/user budgets separately from current predicted-cost routing, with reservation/accounting/concurrency semantics before promising caps.

### Docs: keep the existing engine, improve entry paths (P1)
The app already has MD/MDX imports, SearchModal, code tabs, interactive API components and auto-routing docs. Preserve these. Add task-oriented landing cards linking into the existing routes, rather than replacing the whole documentation tree with the four prototype guides.

Recommended navigation:
- Start: installation, provider/auth setup, first request, streaming.
- Route: auto overview, modes/tiers, constraints, decision fields, shadow rollout, troubleshooting.
- Operate: runtime settings, org policy, observability, caching, deployment.
- Learn & evaluate: outcome signals, learned classifier/cost model, gold labels, replay/synthetic data.
- Reference: full Responses API, errors, admin API, SDKs, configuration schema.

Each article should state prerequisites, exact setting scope, example request/response, relevant error codes, current source/review metadata and next task. Make clear which features need Postgres, provider keys, trained artifacts or extra model calls. Keep LLM-classifier prompt excerpt behavior visible. Use a canonical docs source and CI generation/drift detection for `docs/api/auto-routing.md` vs the landing content copy.

### Pricing: preserve what already works (P1)
`PricingPage.tsx` already provides live `/api/pricing`, search/provider filtering, currencies via Riksbank exchange rates, price freshness and model detail/alias consolidation. Those are existing capabilities, not new roadmap items.

Add cross-provider comparison and workload estimates while preserving:
- Input, output, cached input, batch input/output, context and maximum output.
- effective_from per model; updated_at and last_run provider statuses.
- models_url provenance and model_ids / price_samples alias grouping.
- Currency rate date and clear USD fallback when conversion is unavailable.

The prototype uses USD fixtures only. Production must retain all existing currencies; do not replace real data with the demo array. Missing capability data means unknown, not unsupported. “Supported” in the public pricing catalog does not establish that a particular user's gateway has that provider configured.

## Estimator
Let N=request count, I=input tokens/request, O=output tokens/request, H=cached share [0,1], and Pi/Po/Pc=prices per million tokens:

`estimate = N * (I*(1-H)*Pi + I*H*Pc + O*Po) / 1_000_000`

Show unavailable if a required price is missing; only require Pc when H>0. Never interpret null as free. Do not round rates before multiplication. At zero volume the estimate can be zero if required pricing is known; decide and test empty/unknown-input handling explicitly.

Context validation: I+O must not exceed known context and O must not exceed known maximum output. If model-specific tokenization or context-dependent tiers are unavailable, mark the calculation approximate and explain exclusions. Cache-write charges, reasoning/tool fees, batch availability, regional/long-context tiers and negotiated rates need separate rules; do not silently include them.

Do not use a global “lowest price” badge when input/output tradeoffs differ. Sort by the entered workload estimate. A pricing shortlist can pass exact model IDs into a request allow-list only after runtime eligibility is confirmed; it must not silently edit organization policy.

## Proposed implementation sequence
P0: stale roadmap reconciliation and semantic copy fixes.
P1: new information hierarchy, auto-router narrative/inspector, pricing compare + estimator.
P2: generated release/docs validation, persistent shareable filter URLs and stronger freshness/provenance UX.
P3: evidence-backed rollout reports and formally specified hard-budget feature, if chosen.
