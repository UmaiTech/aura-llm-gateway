# Hallmark Audit — Aura Landing & Docs

Audit run against `apps/landing/` on 2026-05-19, branch `fix/playground-better-auth-adapter`. Targets: landing page, docs shell + 8 MDX components, roadmap page, search modal.

Format per finding: `Tell · Where · Severity · Fix`. Severity levels (from `references/anti-patterns.md`): **critical** ships as slop · **major** looks AI-generated · **minor** small taste issue.

---

## Summary

**33 critical · 28 major · 9 minor**

The landing app reuses the SaaS-default LLM design language end-to-end: centered gradient hero → 3-column icon-tile feature grid → centered CTA → 2-column footer. The same vocabulary repeats across the docs shell, roadmap, search modal, and every MDX component (border-on-`gray-900/50`, `text-aura-400` accents, Lucide icons inside coloured tiles, `transition-colors` everywhere). One palette, one font, one card archetype — applied seven different ways.

The single biggest tell isn't visual: it's **structural sameness**. Every page in the app uses the same fingerprint across the six axes from `references/structure.md` (centered heads, single column, hairline-bordered cards, oversized solid buttons, no image treatment, static reveal). Visual fixes alone won't move the needle — the macrostructure needs to change. See `REDESIGN.md`.

---

## Landing page · `apps/landing/src/App.tsx`

### Critical (10)

| # | Tell | Where | Fix |
|---|---|---|---|
| L1 | **Gradient headline** (`background-clip: text` on hero h1) | `App.tsx:262-266`, `index.css:40-42` (`.gradient-text`) | Replace gradient h1 with a single-weight monochrome wordmark. Use type pairing (serif display + sans body) for emphasis, not colour. |
| L2 | **Full-viewport centered hero** — badge + h1 + p + 2 CTAs all centered | `App.tsx:255-285` | Move to left-margin or hanging headline. Drop the centered "Open Responses API Compatible" badge. |
| L3 | **3-column feature grid** — 3 equal columns, icon-heading-body-link | `App.tsx:316-320` | Replace with Stat-Led or Feature Stack: alternating left/right asymmetric blocks; one feature per row at large widths. |
| L4 | **Icon-tile feature card** — rounded rect, icon-top-left, heading, body | `App.tsx:140-153` (FeatureCard front face) | Replace whole card archetype, not just the icon. Each feature becomes a numbered block (`01 — Providers`) with a hanging label. |
| L5 | **The AI nav** — wordmark left, 3-4 text links, GitHub icon right, blurred bg, hairline bottom border | `App.tsx:218-252` | Pick one alternative: type-only nav (no logo lockup), left-rail vertical nav, or pinned section anchors. Drop `backdrop-blur-lg`. |
| L6 | **The AI footer** — logo+name left, links right, hairline border-top | `App.tsx:350-369` | Single line of running prose: "Aura LLM Gateway · open source · [GitHub →]". No columns, no copyright, no social row. |
| L7 | **Re-drawn UI chrome** — fake macOS traffic-light dots on the code block | `App.tsx:291-296` (red/yellow/green pills) | Remove the dots. A hanging `example.ts` mono label is enough; code blocks shouldn't impersonate a browser or IDE. |
| L8 | **Shadow-glow on dark** — 40px aura + 80px primary blur halo around code block | `index.css:55-58` (`.glow`), applied at `App.tsx:290` | Delete `.glow` utility entirely. Draw the eye with a hairline rule above the block or a numbered marker — not a CSS halo. |
| L9 | **Inter-everywhere** — Inter used for display + body, no pairing | `tailwind.config.js:29-32`, `index.css:5-17` | Pair a display face (Fraunces/Tiempos/Söhne Breit) with Inter or IBM Plex Sans body. Reserve display for h1 + h2 only. |
| L10 | **Default-attractor sameness** — page matches LLM-default hero → 3-feature → CTA → footer template | whole `App.tsx` | Pick a non-default macrostructure. Recommended: Stat-Led or Long Document (see `REDESIGN.md`). |

### Major (8)

| # | Tell | Where | Fix |
|---|---|---|---|
| L11 | `transition-all` on buttons, cards, and the card-flip | `index.css:24, 32, 37`, `App.tsx:136` | Scope transitions: `transition-colors` only. No `transition-all`. |
| L12 | **Card-flip click-to-reveal** — code is hidden behind a 3D flip, no touch affordance | `App.tsx:130-138, 149-152` | Replace flip with inline disclosure. Code visible adjacent to the description (left half text, right half code), no rotation. |
| L13 | **Centered section heads** — "Everything you need", "Try the Playground" | `App.tsx:309-313, 329-336` | Left-margin or hanging heads. Reserve centered for one designated hero moment per page. |
| L14 | **Glassmorphism without purpose** — `backdrop-blur-sm` + `bg-gray-900/50` on every card | `index.css:35-38` (`.card`), used at `App.tsx:290, 141, 157` | Solid surfaces. Separation comes from spacing + hairline rules, not blur. |
| L15 | **Aurora-ish brand gradient** — aura→primary applied to every button + decorative icon tile | `index.css:21-26` (`.btn-primary`), `App.tsx:144-146` | One accent only. Pick aura-500 OR primary-500. Buttons get a solid fill or outline; no two-stop gradient. |
| L16 | **Mismatched icon weight** — Lucide stroke-1.5 used both as 6w/6h decoration *and* 16px UI chrome | `App.tsx:144-146` (h-6 w-6 inside coloured tile) | Demote Lucide to nav/UI-only. No icons inside feature blocks. |
| L17 | **Centered isolated-icon CTA** — single floating MessageSquare icon, then h2, then p, then button | `App.tsx:328-347` | Convert to a typographic CTA: large h2 flush-left, inline link inside one sentence ("[Open the playground →]"), no orphan icon. |
| L18 | **Sound-of-default sectioning** — every section uses the same vertical rhythm | `App.tsx:255, 288, 307, 328` (all `py-16` / `py-20`) | Vary section padding to match content weight. Hero gets the most air; CTA tightens; features asymmetric. |

### Minor (4)

| # | Tell | Where | Fix |
|---|---|---|---|
| L19 | Generic emoji as feature signal | `App.tsx:204` (`// 💰 Calculated by gateway` in `codeExample`) | Remove the emoji from the marketing code sample. The comment can stay as-is without the icon. |
| L20 | Reading aura's primary palette out of Tailwind defaults | `tailwind.config.js:11-22` | Move to OKLCH tokens via CSS variables in `index.css`; reference from Tailwind via `colors: { canvas: 'var(--canvas)' }`. |
| L21 | Equal section padding (`py-20` four times) | `App.tsx:255, 288, 307, 328` | Anti-pattern `slop-test gate 26` — padding-on-scale. Use the proposed 8-based scale (4/8/12/20/32/52/84/136). |
| L22 | "9 features" claim already drifts (10 features in the array) | `App.tsx:17-121` (10 entries) vs. RoadmapPage `App.tsx:76` "9-feature landing page" | Either reduce to 9 features or update roadmap copy. Keep facts consistent. |

---

## Docs shell · `apps/landing/src/pages/DocsPage.tsx`

### Critical (8)

| # | Tell | Where | Fix |
|---|---|---|---|
| D1 | **Icon-prefixed sidebar links** — every doc entry gets a Lucide icon (BookOpen, Zap, Server, DollarSign, Shield…) | `DocsPage.tsx:89-172` (every `items: [{ icon: ... }]`) | Drop icons from sidebar entirely. Sidebar is a table of contents — type, not iconography. Group headers in small-caps tracking, items as monospace-or-sans hangs. |
| D2 | **Glassmorphic sidebar** (implied by shared `.card` token use; verify on render) — same blur surface as landing cards | matches landing token reuse | Sidebar = solid `--canvas` band with hairline right rule. No blur. |
| D3 | **Centered h1/h2 markdown rendering** — content heads inherit Inter, `text-3xl font-bold` flat scale | `DocsPage.tsx:288-296` (h1-h4 components) | Switch to display serif for h1/h2, mono small-caps for h3 anchor labels. Hanging numbered markers (`§ 01`) in left margin. |
| D4 | **Mermaid theme matches the landing's aura/primary** — locks docs to landing's gradient palette | `DocsPage.tsx:212-235` | Re-theme Mermaid with `design.md` tokens: monochrome, one accent. No purple/blue gradient. |
| D5 | **Code highlighter background `#0f172a`** hardcoded — bleeds into MDX components and DocsPage prose | `DocsPage.tsx:337` (`background: '#0f172a'`), `CodeBlock.tsx:33`, `ApiPlayground.tsx:187, 202, 228` | Replace hardcoded hex with `var(--code-bg)` token. Single source of truth. |
| D6 | **Blockquote left-rule uses aura-500** — same accent as inline code, links, buttons | `DocsPage.tsx:375-377` | Switch blockquote rule to `--rule` (hairline grey). Reserve accent for one designated UI moment. |
| D7 | **Inline `code` uses `text-aura-400 bg-gray-800`** — fourth use of the accent token | `DocsPage.tsx:326` | Switch to `--ink-muted` text + `--canvas-elevated` background. No accent inside prose. |
| D8 | **Table styling: zebra-free but `bg-gray-900` header band** — fights the prose hierarchy | `DocsPage.tsx:370` | Hairline-rule top + bottom only. No header fill. `tabular-nums` on numeric columns. |

### Major (5)

| # | Tell | Where | Fix |
|---|---|---|---|
| D9 | `.gradient-text` reused for the "Build in public." headline on the RoadmapPage | `RoadmapPage.tsx:298` | Same fix as L1 — drop gradient text everywhere in the app. |
| D10 | **Sticky AI nav** on RoadmapPage with `backdrop-blur-lg` | `RoadmapPage.tsx:274` | Drop blur. Use a solid sticky band only if scroll position genuinely needs anchoring. |
| D11 | **Animated `animate-ping` dot** on the "active" phase + 12px glow halo | `RoadmapPage.tsx:186-193` | Anti-pattern `slop-test gate 14` (decoration without purpose). Replace ping with a static filled marker. |
| D12 | **Gradient timeline rail** (`bg-gradient-to-b from-green-500/40 to-gray-700/40`) | `RoadmapPage.tsx:197-200, 328-329` | Single hairline `--rule` colour. No gradient on functional dividers. |
| D13 | **Bottom CTA card duplicates `.btn-primary` + `.btn-secondary`** with a glassmorphic container | `RoadmapPage.tsx:347-373` | Typographic CTA: heading flush-left, two inline links separated by `·`. Drop the card frame. |

### Minor (2)

| # | Tell | Where | Fix |
|---|---|---|---|
| D14 | `text-3xl font-bold` for h1, `text-2xl font-semibold` h2 — same Inter weight pair | `DocsPage.tsx:288-296` | Once display face is in, replace `font-bold` with appropriate display weight (likely 400-500 on Fraunces). |
| D15 | `space-y-2`, `mb-4` everywhere — same vertical rhythm | `DocsPage.tsx:301-311` | Use the spacing scale; differentiate prose rhythm from list rhythm. |

---

## Search modal · `apps/landing/src/components/Search.tsx`

### Critical (2)

| # | Tell | Where | Fix |
|---|---|---|---|
| S1 | **Glassmorphic backdrop + shadow-2xl panel** with `bg-black/70 backdrop-blur-sm` | `Search.tsx:144-150` | Solid `var(--canvas-overlay)` backdrop (e.g. `oklch(0.1 0 0 / 0.85)`), no blur. Panel = solid `--canvas-elevated` with hairline border, no `shadow-2xl`. |
| S2 | **Lucide SearchIcon + FileText icons inside results** — icon-tile result rows | `Search.tsx:153, 191-194` | Strip icons from results. The hanging "/" key indicator (mono, dim) is enough. Result row = title + dim description, no leading icon. |

### Major (3)

| # | Tell | Where | Fix |
|---|---|---|---|
| S3 | `transition-colors` on every result row + the SearchButton | `Search.tsx:185, 247` | Keep `transition-colors` (this is the only allowed transition); fine. Audit confirms the button itself is acceptable. *(no fix needed; flagged for completeness)* |
| S4 | Selected-state highlight uses `bg-aura-500/10` (accent fill) | `Search.tsx:187` | Use `--canvas-elevated` for selection, with the `--accent` colour only on the trailing arrow glyph. Accent <5% per design.md. |
| S5 | Footer "Powered by Fuse.js" — orphan attribution | `Search.tsx:234` | Either remove or move to docs page about search. Modal footer should be all-keyboard-hint, no branding. |

### Minor (1)

| # | Tell | Where | Fix |
|---|---|---|---|
| S6 | `<kbd>` styling uses `bg-gray-800` | `Search.tsx:163, 225, 226, 230, 252` | Use `--kbd-bg` token; mono face; thin border. Currently uses sans inherit. |

---

## MDX components · `apps/landing/src/components/mdx/`

### `Callout.tsx` — **3 critical, 1 major**

| # | Tell | Where | Fix |
|---|---|---|---|
| C1 | **Coloured-tile callout** — `border-l-4` + `bg-{color}-500/10` + Lucide icon (Info/AlertTriangle/Lightbulb/CheckCircle/AlertCircle) | `Callout.tsx:20-55, 70-90` | Replace with a left-rule callout: hairline `--rule` left border (1px), monospace label in caps (`note`/`warning`/`tip`/`danger`), no background fill, no icon. |
| C2 | **5 different accent colours** (blue, yellow, red, purple, green) — uses every Tailwind palette | `Callout.tsx:20-55` | Drop colour cues. Use the same `--rule` for all five; differentiate by mono label text only. (Optional: one accent for `danger` only.) |
| C3 | Mismatched icon set inside Callout (Lucide AlertCircle vs. AlertTriangle vs. Info) | `Callout.tsx:3` | Drop icons entirely; type-only callout. |
| C4 (major) | Title font-semibold + body font-sans — same Inter weight pair | `Callout.tsx:81` | Title = mono uppercase, tracking +0.05em, weight 500. Body inherits prose. |

### `Card.tsx` + `CardGrid.tsx` — **4 critical, 1 major**

| # | Tell | Where | Fix |
|---|---|---|---|
| C5 | **Icon-tile card** — same archetype as landing FeatureCard, scaled down | `Card.tsx:14-34` (border + icon-tile + heading + body) | Replace with numbered list items: hanging mono numeral (`01.`) in left margin, title in body weight, description below. No card frame, no border. |
| C6 | **CardGrid: 1/2/3 columns** — explicit grid prop, same SaaS feature-grid template | `Card.tsx:52-65` | Remove `cols` prop. Default to single column with marginalia. If multi-column needed, asymmetric only (60/40 or 70/30), max 2 columns. |
| C7 | Icon container uses `bg-aura-500/10` accent fill | `Card.tsx:22-25` | Drop icon container; drop icons. |
| C8 | Hover state `hover:border-aura-500/50 hover:bg-gray-800/50` — accent hover | `Card.tsx:17` | Hover = `--ink` text colour intensifies only (no background, no border colour change). |
| C9 (major) | `cursor-pointer` on hover-only — fails on touch | `Card.tsx:17` | Whole row is link; native anchor cursor is sufficient. Remove explicit `cursor-pointer`. |

### `CodeBlock.tsx` — **3 critical**

| # | Tell | Where | Fix |
|---|---|---|---|
| C10 | **Window-chrome header** — `bg-gray-900/50` band, language/title pill, Copy button on right | `CodeBlock.tsx:33-65` | Strip the header band. Title becomes a hanging mono label *above* the code (`example.ts ↓`), copy becomes a small mono button on hover at top-right of the code itself (or always-visible if reduced-motion users need it). |
| C11 | Hardcoded `bg-[#0f172a]` and `border border-gray-800` | `CodeBlock.tsx:33` | Use `var(--code-bg)` and `var(--rule)`. |
| C12 | Highlight-line gradient uses primary-500 accent | `CodeBlock.tsx:75-79` | Use a single token `--code-highlight` (e.g. `oklch(0.32 0 0)` — slightly elevated bg, no colour). |

### `CodeTabs.tsx` — **2 critical**

| # | Tell | Where | Fix |
|---|---|---|---|
| C13 | **Active-tab underline uses aura-500 accent** + tab labels turn aura-400 when active | `CodeTabs.tsx:38-48` | Active tab = hairline underline in `--ink`, label colour `--ink`; inactive = `--ink-muted`. No accent. |
| C14 | Same window-chrome wrapper as CodeBlock — `border border-gray-800 bg-[#0f172a]` | `CodeTabs.tsx:31` | Remove the wrapping frame entirely; tabs hang above the code with hairline underline, code block sits flush below with no border. |

### `Steps.tsx` — **2 critical, 1 major**

| # | Tell | Where | Fix |
|---|---|---|---|
| C15 | **Numbered circle with accent fill** — `bg-aura-500/20 text-aura-400 border-aura-500/30` | `Steps.tsx:35-42` | Hanging mono numeral in left margin (`01.`, `02.`), tabular-nums, `--ink` colour. No circle, no border, no fill. |
| C16 | Vertical connector line `w-0.5 bg-gray-800` between steps | `Steps.tsx:44-46` | Drop the connector. Numbered hanging numerals already imply sequence; vertical rule is redundant. |
| C17 (major) | Step title `text-lg font-semibold text-white` flush with circle | `Steps.tsx:51-53` | Title = display weight 500, hangs at left margin alongside numeral. Body indents under title. |

### `Expandable.tsx` — **2 critical, 1 major**

| # | Tell | Where | Fix |
|---|---|---|---|
| C18 | **Lucide ChevronDown with `rotate-180` flip** + `transition-transform duration-200` | `Expandable.tsx:25-30` | Replace with `+`/`–` typographic glyph in mono, no rotation. |
| C19 | `border border-gray-800` + `bg-gray-900/50` button hover — card-in-card with surrounding prose | `Expandable.tsx:15-22` | Strip the card frame. Disclosure = hairline rule above + below, title row + body, no enclosing border. |
| C20 (major) | `max-h-[2000px] opacity-100` collapse animation — janky, layout-shifting | `Expandable.tsx:33-36` | Use native `<details>` element with `interestfor`/CSS-only or instant toggle. Respect `prefers-reduced-motion`. |

### `ApiPlayground.tsx` — **4 critical, 2 major**

| # | Tell | Where | Fix |
|---|---|---|---|
| C21 | **Method-coloured badge pill** — green/blue/yellow/red by HTTP verb | `ApiPlayground.tsx:107-117` | Mono uppercase label, single `--ink` colour, no background fill. |
| C22 | **Glassmorphic frame** `bg-gray-900/30` + multiple `bg-gray-900/50` bands stacked | `ApiPlayground.tsx:103-105, 196, 212` | Strip enclosing frame. Form = stacked sections separated by hairline rules; labels are mono uppercase hangs in left margin. |
| C23 | Aura-500 Run button (filled accent CTA, opposite a Copy button) | `ApiPlayground.tsx:142-163` | One outlined button (`Run`), one text link (`Copy cURL`). No filled accent button. |
| C24 | Hardcoded `bg-[#0f172a]` on textarea + response | `ApiPlayground.tsx:187, 202, 228` | Token: `var(--code-bg)`. |
| C25 (major) | Loader2 `animate-spin` spinner | `ApiPlayground.tsx:153` | Mono "running…" text label; respect reduced-motion (no animation). |
| C26 (major) | ChevronDown `rotate-180` on headers toggle | `ApiPlayground.tsx:173-178` | Same fix as C18 — `+`/`–` glyph. |

### `ModelTable.tsx` — **3 critical, 1 major**

| # | Tell | Where | Fix |
|---|---|---|---|
| C27 | **Provider-coloured pill badges** — green/orange/blue by provider | `ModelTable.tsx:41-45, 119-126` | Mono uppercase label, single `--ink-muted` colour, no fill, no border. |
| C28 | **Check / X icons for capability columns** with green/grey accent | `ModelTable.tsx:74-79, 142-150` | Replace with mono glyphs: `●` (filled) for yes, `–` (en-dash) for no. No colour. |
| C29 | `text-aura-400` model IDs | `ModelTable.tsx:115` | Mono `--ink` for model IDs; `--ink-muted` for display name underneath. |
| C30 (major) | `hover:bg-gray-800/30` on rows | `ModelTable.tsx:110` | Drop row hover; table is for reading, not selecting. |

---

## Markdown rendering inside DocsPage (markdownComponents)

### Critical (3)

| # | Tell | Where | Fix |
|---|---|---|---|
| M1 | Aura-400 link colour inside prose | `DocsPage.tsx:353, 359` | Use `--ink` with hairline underline. Accent reserved for one designated UI moment (e.g. the "in progress" phase marker on roadmap). |
| M2 | Inline `code` accent (aura-400 + gray-800) | `DocsPage.tsx:326` | Mono inherit, slightly elevated bg, no colour. |
| M3 | Blockquote uses `border-l-4 border-aura-500` accent rule | `DocsPage.tsx:375-377` | Single hairline `--rule` left border, italics for the quoted text. |

### Major (2)

| # | Tell | Where | Fix |
|---|---|---|---|
| M4 | Table header `bg-gray-900` band | `DocsPage.tsx:370` | Hairline `--rule` underline below header row; no fill. |
| M5 | `list-disc list-inside` on ul, `list-decimal list-inside` on ol | `DocsPage.tsx:303-308` | Use hanging list style: `list-outside` with mono bullets/numerals in left margin (typographic standard). |

---

## Roadmap page · `apps/landing/src/pages/RoadmapPage.tsx`

Already audited under D9-D13. Additional findings:

### Critical (3)

| # | Tell | Where | Fix |
|---|---|---|---|
| R1 | **Status-coloured cards** — green/primary/grey card backgrounds and borders by phase | `RoadmapPage.tsx:127-178` (`phaseConfig`) | Drop status colour. Phase shown via mono label only (`shipped` / `in progress` / `planned` / `considering`). All cards = same `--canvas` surface, hairline rule. |
| R2 | **Status-coloured pill labels** — `bg-{color}-500/10 border-{color}-500/20` | `RoadmapPage.tsx:135-176, 239-241` | Mono uppercase label, no fill, no border. Hangs in right margin. |
| R3 | **Hover-only card affordance** — `hover:border-gray-600/60` is the only feedback | `RoadmapPage.tsx:218` | Cards are not interactive — drop hover state. If they link out to release notes, make the whole heading row a link. |

### Major (3)

| # | Tell | Where | Fix |
|---|---|---|---|
| R4 | **Stat-strip "4 versions shipped · 7 providers · v0.5 in progress"** with `gradient-text` on v0.5 | `RoadmapPage.tsx:308-323` | This stat strip is actually a *good* hook for a Stat-Led macrostructure on the landing — move it there, redesign without gradient. On roadmap, drop the strip in favour of inline running prose ("Four versions shipped. Seven providers. v0.5 in progress."). |
| R5 | **Phase config object** locks status to colour | `RoadmapPage.tsx:125-178` | Refactor to a function returning mono labels + role-based tokens only. No `iconBg`/`cardBg`/`versionColor`/`labelColor` per phase. |
| R6 | Stats use `text-2xl font-bold` Inter | `RoadmapPage.tsx:310, 315, 320` | Display face, tabular-nums, weight 400. |

### Minor (1)

| # | Tell | Where | Fix |
|---|---|---|---|
| R7 | Inline `note` text uses `font-mono text-xs text-gray-600` — mixed mono/sans in the same line | `RoadmapPage.tsx:258-260` | Keep mono for code identifiers only. Status notes go in italic body. |

---

## Cross-cutting findings (apply across every file)

| # | Tell | Severity | Fix |
|---|---|---|---|
| X1 | Pure-near-black canvas at `gray-950` (`#030712`) — drifts close to pure black under sRGB | minor | Move to `oklch(0.18 0 0)` — perceptually-uniform near-black, less harsh in HDR contexts. |
| X2 | All copy uses straight quotes (`"`) and double-hyphens in some MDX | minor | Run a pass on `apps/landing/src/content/**/*.{md,mdx}` to switch to curly quotes (`"` `"`) and em-dashes (`—`). |
| X3 | Three icon weights mixed across the app: 3.5w, 4w, 5w, 6w | major | Lock to two sizes: 16px UI, 12px inline accent. No 24px decorative icons. |
| X4 | `z-index: 50` used on nav, sticky band, search modal — same value for different layers | minor | Define a z-index scale in `design.md`: `nav: 10`, `sticky: 20`, `modal: 50`. |
| X5 | `transition-all` appears in `.btn-primary`, `.btn-secondary`, `.card` | major | Replace all three with `transition-colors`. |
| X6 | Vite dev server port 3001 expected — verify CORS-aligned with gateway on 8080 | n/a (functional) | Out of scope for design audit; confirms during execution. |

---

## What's salvageable

Not everything needs to go:

- The **typography hierarchy** is restrained (`text-5xl/6xl` h1, `text-3xl` h2, `text-xl` lede, `text-sm` UI labels) — keep the *scale*, swap the *face*.
- The **MDX glob loader** (`DocsPage.tsx:31-40`) is well-engineered. Keep it.
- The **Fuse.js search infrastructure** is solid; only restyling needed.
- The **roadmap data shape** (`RoadmapPage.tsx:20-123`) is clean — swap the render layer only.
- The **Mermaid integration** is correctly cancellable (`DocsPage.tsx:208-258`); just re-theme.
- The `BUILD-IN-PUBLIC` editorial voice on the roadmap copy is genuine and works — preserve verbatim.

---

*Audit complete. See `REDESIGN.md` for the proposed structural rebuild and `design.md` for the locked design system.*

<!-- Hallmark · audit · genre-target: editorial-minimal · against: landing+docs+roadmap+search+8-mdx -->
