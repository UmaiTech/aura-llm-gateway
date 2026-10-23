# Landing page v3 — sell the admin app and playground

## Problem and desired behavior
The earlier landing emphasized gateway internals and auto routing. Admin and playground appeared mainly as links, so a visitor could miss that Aura includes usable interfaces for operating and exploring the gateway.

The new landing presents three connected product surfaces: API/gateway, playground and admin app. A visitor can inspect an inline preview, open a sample, and see how the same request moves from chat into operations.

## Page order and implementation
1. **Hero:** retain “One gateway. Every request, understood.” Add the eyebrow “The gateway. The playground. The admin app.” Supporting copy names the concrete job of each surface. Two direct CTAs: Try the playground and Explore the admin app. A switchable product preview shows admin metrics/health or a conversation with usage.
2. **Product navigation:** Admin app and Playground are first-class landing navigation items. Below provider coverage, three jump links offer Operators → Admin, Builders → Playground, Every request → Auto router.
3. **Admin product section:** “Run your gateway with a clear view.” Explain traffic/spend/success, degraded provider investigation and request inspection. Inline tabs: Traffic & cost, Provider health, Request detail. Clickable sample request rows open the shared detail drawer. CTA opens Console; secondary CTA opens request logs.
4. **Playground product section:** “Build with the response. Learn from the details.” Show conversation, actual model, usage and decision metadata. Inline tabs: Response, Routing decision, Raw JSON. CTA opens a preloaded sample with the routing inspector selected; that same sample appears in Console requests.
5. **Auto router:** retain the interactive modes/tiers/shadow workbench, following the product demonstrations.
6. **API:** keep the integration example and quickstart path for builders who are ready to connect.
7. **Closing action:** sample request, admin app and self-host setup all have clear paths. No generic feature grid repeats the same pitch.

## Production guardrails
- Use actual product component primitives where practical, but keep public marketing fixtures separate from authenticated application data.
- Every inline metric, price, health status and conversation is visibly sample data. Do not show a visitor's production workspace publicly.
- Do not invent users, customer logos, performance benchmarks or conversion claims.
- “No API key required” in the prototype refers to the local design demo. Confirm hosted playground auth/quota requirements before using it in production marketing.
- Product navigation CTAs in the real landing must use its deployed app routes and authentication flow, not the prototype's hash routes.
- The sample prompt represents a tool-assisted request but the prototype performs no tool or provider calls. Production demo behavior must be designed explicitly.
- Keep the full admin application and existing access model; this change promotes it, rather than replacing it with marketing-only panels.

## Prototype code and states
- `suiteHero`, `suiteView`: hero preview switcher.
- `productShowcases`: two full product sections.
- `adminPreviewBody`, `adminPreview`: traffic/health/request variants.
- `playPreviewBody`, `playPreview`: answer/routing/raw variants.
- `openShowcaseChat`: opens one fixed sample (`req_product_demo`) and inserts it once into request history.
- `bindShowcase`: interaction handlers.
- CSS additions at the v3 comment in `dist/styles.css`.

These functions are a specification reference. Port into React components such as ProductPreviewSwitcher, AdminShowcase, PlaygroundShowcase and ProductTourCTA, following the repository's conventions. Do not paste the complete vanilla app into production.

## Acceptance
- Both product names and their direct CTAs are visible in the hero on desktop; both remain reachable without a hamburger on mobile.
- Hero preview toggle updates only the preview, keeps focus and preserves page position.
- Admin preview tabs change the content and accessible selected state. Sample request inspection uses the shared drawer.
- Playground preview tabs expose all three views; opening the sample selects the routing inspector.
- The same sample appears in Console → Requests, without duplicates on repeated launch.
- Mobile sections stack story before preview; sample tables stay legible and page width does not overflow.
- No autoplay, timed carousels or fake live metrics. Reduced motion is respected.

## Optional measurement after implementation
Use existing consent/analytics conventions. Suggested events: product_preview_selected (surface/tab), product_cta_clicked (surface/location), sample_opened and quickstart_opened. Measure completed product entry from the landing, not just total button clicks. Do not capture prompt content in marketing analytics.
