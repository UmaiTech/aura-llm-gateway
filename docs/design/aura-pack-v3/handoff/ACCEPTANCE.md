# Acceptance and verification

## Prototype verified during preparation
- JavaScript syntax for app and router module.
- 13 deterministic router checks: mode changes, tier floor/clamps, provider filtering, empty eligibility, invalid bounds and pinned-shadow behavior.
- Browser: landing mode change, shadow toggle, transfer into chat and streamed completion, routing inspector.
- Browser: pricing calculator, comparison, filtering, docs navigation/search, roadmap filtering; see final QA note for any limits.
- Responsive layouts and light/dark tokens use shared CSS. Prototype is not an accessibility certification or integration test of the Rust gateway.

## Production acceptance
### Routing
- Auto aliases are taken from runtime catalog; disabled auto produces an actionable error.
- Actual response model and shadow-selected model cannot be confused.
- Returned score/boundaries/classified_tier/tier remain distinguishable.
- Candidate exclusion/selection and nullable predicted costs display correctly.
- Applied and shadow metrics are labeled; estimated savings never shown as actual spend saved.
- Streaming before/after-first-event failure behavior remains unchanged.
- Org constraints cannot be loosened by request UI. Invalid bounds have inline validation.
- LLM classification, gold sampling and learned model activation retain privacy/cost disclosures where controls appear.

### Pricing
- Changing I/O/N/H updates estimates with full precision; rates below $0.01 remain readable.
- Null cached price with H>0 yields unavailable; H=0 does not require a cached rate.
- Null standard price never becomes $0.00. Sorting keeps unknowns distinct.
- Validate nonnegative finite input and cache fraction; filter/search + clear works.
- Compare max three with an accessible explanation when full; selection survives filter changes.
- Existing USD/SEK/EUR/etc conversion retains rate date; unavailable FX visibly falls back to USD.
- Freshness, stale rows, provider scrape failure and all-data failure have distinct states.
- Context/output-limit constraints and fee exclusions are shown.

### Content
- Roadmap latest released version matches authoritative release data; merged features not mislabeled released.
- Proposed items have no fabricated deadlines/commitments.
- Docs existing links, MDX components, search keyboard shortcut, anchors and copy actions work.
- Canonical/source docs do not diverge.

### Design & accessibility
- Desktop 1440px, tablet 768px, mobile 390px/320px: no page-level overflow; only intended tables scroll.
- Text contrast, visible focus, semantic headings/labels, keyboard tab order, dialogs with focus trapping/return.
- Loading, empty, permission denied, validation, network failure, retry and stale-data states are intentional.
- Preserve drafts during theme/settings updates and respect reduced motion.
- Logo clear space and favicon readability at 16/32px; all icons have appropriate accessible names or aria-hidden.

Run the repository's existing build/type checks and relevant frontend tests. Add focused estimator/API-adapter/decision-display tests, not screenshots of hardcoded implementation details. Do not claim production integration based on this fixture prototype's checks.

## Preparation QA notes
Pricing was checked with 50% cached input: known cached rates update estimates; a missing cached rate returns unavailable. Two-model comparison and no-results search were verified. Docs search navigated to Policies; roadmap filtering isolated proposed items. Dark/light theme toggling was exercised. Mobile pricing and docs were inspected at approximately 390px; a docs sidebar min-content overflow was corrected. No backend integration, full keyboard audit or comprehensive device matrix was run.

## v3 landing product-showcase validation
Hero switches between Admin and Playground previews. Admin Request detail opens the existing inspection drawer. Playground Routing decision changes the inline content. “Try a sample request” opens the preloaded conversation and its request appears as `req_product_demo` in Console overview. These were verified in the browser; metrics and responses remain illustrative. Production implementation still needs the full accessibility and auth/integration checks above.
