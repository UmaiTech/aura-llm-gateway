# Aura design implementation handoff — v3

## Goal
Implement the approved visual direction across the existing Aura React apps: landing, admin, chat, docs, roadmap and public LLM pricing. Add a prominent, explainable auto-router product story. Preserve real backend behavior and existing capabilities.

This pack is a design reference plus implementation specification, **not a production patch**. The runnable prototype deliberately uses local fixtures. Its vanilla JavaScript should be translated into the existing typed React components, not shipped as a replacement for the apps.

## Read in this order
0. `LANDING_PRODUCT_SHOWCASE.md` — v3 product positioning and interaction changes.
1. `AGENT_BRIEF.md` — pasteable implementation task and boundaries.
2. `SOURCE_MAP.md` — actual files and API contracts to reuse.
3. `SCREEN_SPEC.md` — six views, interaction rules and priorities.
4. `AUTO_ROUTER_CONTRACT.md` — semantics that must survive the redesign.
5. `DOCS_ROADMAP_PRICING.md` — content audit, information architecture and pricing math.
6. `ACCEPTANCE.md` — implementation and QA checklist.
7. `design-tokens.json` — extracted dark/light tokens.

## Included
- `prototype/dist/`: complete runnable HTML/CSS/JS prototype, with logo/font assets.
- `prototype/tests/auto-router.test.cjs`: deterministic fixture checks, not backend tests.
- `brand-kit/`: SVG/PNG logo variants, favicon sizes and integration example from the proposed identity.
- `reference/auto-routing.md`: source API guide at the reviewed commit.
- `handoff/`: this specification and task brief.

## Run
From `prototype/`, run `python3 -m http.server 8080 --directory dist`, then open `http://localhost:8080/`. No npm install, backend, API keys or external model calls are required. From the same directory run `node --check dist/app.js`, `node --check dist/auto-router.js`, and `node tests/auto-router.test.cjs`.

The preview has a six-view switcher. Theme and router preferences persist in localStorage; chat and request history remain in memory. Clear storage or use Console → Settings → Reset demo for a fresh state. The prototype's navigation bar is a design-review aid, not proposed production navigation.

## Provenance and scope
Reviewed repository: https://github.com/UmaiTech/aura-llm-gateway
Source commit: `ca6d517d7a2204b7cae289ef578b7dc80a42f551` (origin/main fetched 2026-10-22).
Public prototype: https://aura-design-prototype.niceraven33.chatgpt.site
This handoff supersedes earlier generic routing recommendations. The original Aura repository and production domains were not modified.

The existing brand deck remains the visual baseline; this package adds product-led landing showcases plus implementation detail for the auto-router, documentation, roadmap and pricing surfaces. No revised slide deck is included.
