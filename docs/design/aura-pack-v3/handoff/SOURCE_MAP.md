# Source map (verified at ca6d517)

| Surface | Existing files | Integration instruction |
|---|---|---|
| Landing | `apps/landing/src/App.tsx`, `apps/landing/src/index.css` | Extend existing numbered editorial sections. Retain GithubStars and real links; avoid orphaning docs/pricing/roadmap navigation. |
| Docs | `apps/landing/src/pages/DocsPage.tsx`, `apps/landing/src/components/Search.tsx`, `apps/landing/src/components/mdx/*` | Keep MD/MDX route map and search; add reusable article metadata/TOC and task entry points. |
| Docs source | `docs/api/auto-routing.md`, `apps/landing/src/content/api/auto-routing.md` | Choose a canonical source and add generation/drift check; avoid maintaining divergent copies by hand. |
| Roadmap | `apps/landing/src/pages/RoadmapPage.tsx`, root `CHANGELOG.md` | Replace stale release array with validated release metadata. Preserve older history behind an archive. |
| LLM pricing | `apps/landing/src/pages/PricingPage.tsx`, `api/pricing/index.ts` | Reuse PricingResponse and existing exchange-rate/dedup logic. Preserve current API adapter behavior. |
| Chat | `apps/chat/src/components/Header.tsx`, `ChatContainer.tsx`, `ChatInput.tsx`, `MessageBubble.tsx`, `WelcomeScreen.tsx` | Reuse auto-model selection and existing Routing inspector; progressive detail, not a new data pipeline. |
| Chat contracts | `apps/chat/src/lib/types.ts`, `apps/chat/src/lib/api.ts`, `apps/chat/src/index.css` | Keep RoutingDecisionMetadata, RoutingOptionsRequest and AutoRoutingSettings aligned with Rust types. |
| Admin | `apps/admin/src/pages/RoutingPage.tsx`, `apps/admin/src/lib/api.ts`, `apps/admin/src/styles/globals.css`, `apps/admin/src/components/layout/*` | Routing is a real statistics page; separate read-only analysis from settings mutation. Use `SettingsPage.tsx` and `OrganizationDetailPage.tsx` for their existing scopes. |
| Router logic | `crates/aura-core/src/router/auto/`, `crates/aura-proxy/src/routes/auto_routing.rs` | Source of truth for decisions. The design fixture must never replace it. |
| Admin runtime config | `crates/aura-proxy/src/routes/admin_settings.rs` | Reuse persisted gateway overrides and effective settings reporting. |

## API mapping

| UI | Contract |
|---|---|
| Auto aliases and model capabilities | `GET /v1/models` |
| Send request | `POST /v1/responses`, `model: auto[:mode]`, optional top-level `routing` |
| Decision next to chat response | `metadata.aura.routing`; actual response `model`; `x-aura-selected-model` for applied auto |
| Auto statistics | `GET /admin/stats/routing/auto?period=24h|7d|all` (do not send prototype's generic 30d range here) |
| Single decision | `GET /admin/routing/decisions/{response_id}` |
| Authenticated dry run | `POST /admin/routing/score` (does not dispatch a provider completion) |
| Runtime settings | `GET /admin/settings`, `PUT /admin/settings` |
| Org policy | Existing organizations update contract, `organizations.settings.routing.auto` |
| Public prices | `GET /api/pricing` — updated_at, providers, last_run, exchange_rates |

## Prototype translation

`dist/styles.css` → shared theme tokens plus scoped React styles.
`dist/app.js` → split per view; its DOM renderers are not intended for production import.
`dist/auto-router.js` → demo fixtures ONLY, preferably a landing-only bundle.
No backend endpoint additions are required for the base design changes. Any proposed status metadata or provenance field not available from existing responses must be recorded as an explicit follow-up, not invented in the UI.
