# Six-surface design specification

## Shared identity
Use the ring+A mark in navigation and the simplified A tile at favicon sizes. Wordmark uses outlined Fraunces; marketing display uses licensed Fraunces with Georgia fallback. Operational text uses the system sans stack; identifiers, prices and token counts use tabular monospace. One violet accent, neutral surfaces, semantic green/amber/red. Avoid using accent color as the only selected/error indicator.

Spacing: 4/8/12/16/24/32/48/64px. Content max width 1200px. Card radius 8–12px, controls 6–8px. Keep clear border hierarchy; large decorative gradients are unnecessary.

## Landing
Preserve the overarching “One gateway. Every request, understood.” message. Lead supporting copy with the gateway, playground and admin app as one connected experience. Show dedicated admin and playground product sections before auto routing; follow LANDING_PRODUCT_SHOWCASE.md for v3. Add “The right tier. A reason you can read.” section before generic API material. Four request scenarios, three modes and shadow comparison show the value concretely. CTA transfers selected mode/scenario into the playground. Keep demo label adjacent to result, not only in a footer.

## Console
Retain overview/request/provider/usage controls. Auto router has a dry-run explorer and candidate explanations. Production stats need separate applied and shadow counts and a clear distinction between cost, predicted cost and counterfactual savings. Keep real runtime configuration in Settings and tenant policy in Organization detail. Prototype tier-bound controls are request/dry-run controls, not a new gateway API.

## Chat
Keep composer and response primary. Auto aliases appear before concrete models. Inspector progressively reveals overview → routing → raw JSON. Always show the actual model beside the answer. Shadow shows both actual and hypothetical model. On small screens use an inspection drawer. Preserve stop/partial-stream behavior. For production, do not change model mid-stream or silently lose unsent drafts when theme/settings change.

## Docs
Left navigation/search, readable article column (roughly 65–80 characters), right contents on large screens. Task entry points: Start, Route, Operate, Reference. Preserve all existing documentation; four prototype articles illustrate the shell. Keep in-article defaults, prerequisites, errors, policy scope, copyable examples and source/update metadata. Mobile collapses navigation; no squeezed three-column article.

## Roadmap
Newest verified releases first. “Merged” is different from “released”; proposed priorities do not get committed dates. Filter by status; each released/merged row links to evidence. Collapse legacy milestones into an archive. Display last reconciliation date/source revision and use automated consistency checks.

## LLM pricing
Cross-provider table with model/provider, input/output/cached USD per 1M, context and workload estimate. Search/provider/capability filters, meaningful sort, and three-model comparison. Keep existing currencies and batch/alias details in production. Workload estimate has explicit input/output/cache/request assumptions. Unknown prices render “—”. Surface stale and failed provider scrapes separately from a global successful update. No quality score or “best model” badge derived from price alone.
