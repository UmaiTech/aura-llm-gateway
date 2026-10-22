# Coding-agent brief

Implement the Aura design update in the existing `UmaiTech/aura-llm-gateway` repository. Read its current AGENTS.md and any nested instructions first. Inspect current HEAD and reconcile it with the source snapshot in this handoff; do not downgrade newer work.

Use the bundled prototype as a visual and interaction reference. Preserve the Vite/React architecture, existing authentication, routes, APIs, SDK contracts, organization scoping, streaming and error handling. Work in an isolated branch and deliver reviewable commits/PRs.

## Ordered work
1. Extract shared tokens and BrandMark/Wordmark primitives. Install the favicon family and preserve license files. Keep serif typography for marketing titles; use sans and tabular mono for operations.
2. Landing: follow LANDING_PRODUCT_SHOWCASE.md first: promote the admin app and playground with hero previews, dedicated sections and connected sample entry. Retain the auto-router section with four request shapes, Cost/Balanced/Quality modes, tier selection explanation, shadow label and a CTA to the playground. Use deterministic labeled fixtures on the public landing; no privileged endpoint or provider call.
3. Chat: restyle existing auto aliases and routing inspector. Use the actual `RoutingDecisionMetadata`; show requested alias and actual model separately. Support a shadow badge, classification vs final tier, constraints, candidates, predicted cost when supplied and provider escalation history. Preserve JSON/SSE behavior and tool-loop continuity.
4. Admin: keep Routing primarily observational. Separate applied and shadow stats. Add an authenticated dry-run control using the existing score endpoint. Keep gateway defaults in Settings and organization bounds in Organization detail. Do not recreate the removed fake routing-rule CRUD UI.
5. Docs: preserve content routes, MD/MDX rendering, SearchModal, keyboard shortcuts and API playgrounds. Add task-oriented entry paths, consistent right-hand contents, code examples and prominent semantics/error guidance.
6. Roadmap: reconcile stale hardcoded statuses with CHANGELOG and release evidence. Put released work first, merged-unreleased separately, proposed priorities separately. Do not invent versions, dates, SLAs, issue statuses or commitments.
7. Pricing: preserve `/api/pricing`, currency conversion and existing model detail/alias handling. Add a cross-provider table, workload estimator, up-to-three comparison, capability filters and exact unit labels. Retain provenance, freshness, missing values and partial provider errors.

## Non-negotiable
- Never copy fixture scoring, model prices, metrics, responses or provider toggles into production behavior.
- Do not put an admin key in the landing/chat client. Reuse the existing auth/API boundary.
- Use GET /v1/models for runtime alias/capability availability; model catalogs and prices are not fixed design constants.
- No guaranteed savings claim, quality guarantee, automatic training claim or hard budget-cap promise.
- Preserve existing SEK/EUR/etc pricing support even though the design prototype only implements USD fixtures.
- Production settings save must show effective/persisted values and warnings from the API, not localStorage success.
- Implement keyboard navigation, focus return/trapping for dialogs, mobile overflow handling and reduced motion.

## Suggested review slices
A. Brand/tokens + landing auto section.
B. Shared routing inspector in chat/admin, API adapter tests.
C. Docs + roadmap reconciliation/content model.
D. Pricing estimator/comparison + currency and missing-data tests.

For each slice provide changed files, screenshots or your repository's normal visual review artifacts, meaningful validation, and any API/backend gap that prevents completion. Do not merge or deploy production without the repository owner's normal release process.
