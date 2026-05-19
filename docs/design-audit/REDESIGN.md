# Hallmark Redesign Brief — Aura Landing & Docs

```
Hallmark · redesign-brief · genre: editorial-minimal · against: apps/landing/
Scope: multi-page (landing + docs shell + 8 MDX components + roadmap + search + 1 sample content page)
Locked: 2026-05-19
```

This brief turns `AUDIT.md` (what's wrong) and `design.md` (what replaces it) into an executable changeset. It's intentionally **system-first**: a single `design.md` controls the look, and each page gets a deliberately different macrostructure so the landing, docs, and roadmap feel like three pages of one publication — not three copies of one template.

**What stays**: every word of copy, the information architecture (sidebar groupings, page ordering, route structure), the MDX glob loader, the Fuse.js search infrastructure, the Mermaid integration, the roadmap data shape, the Python SDK examples.

**What changes**: the structural fingerprint of every page, the entire visual vocabulary (colour, type, spacing, motion), and the render layer of every component. The audit lists each touched line.

---

## 1 · Genre decision

**editorial-minimal** (hybrid).

The two parent genres each fix one weakness of the other:

| | modern-minimal alone | editorial alone | Hybrid (editorial-minimal) |
|---|---|---|---|
| Risk | Too sterile / "Stripe clone" | Too magazine for an infra product | Restrained but with editorial voice |
| Type | Geometric grotesque | Serif specimen | Serif display + grotesque body |
| Colour | Monochrome | Often colour-rich | Monochrome with one accent |
| Macrostructure | Tight feature grids | Specimen, Long Document | Stat-Led, Workbench, Long Document |
| Slop-test override | None (strictest) | Allows Specimen, numbered sections | Inherits modern-minimal's strictness; gains editorial structural permissions |

Net effect: a Rust gateway documented like a small foundry publishes its type specimens — type-led, numbered, hanging marginalia, no chrome.

The slop-test runs at modern-minimal strictness (every gradient banned, accent <5%, no gradient text, no centered-everything hero) but editorial macrostructures are unlocked.

---

## 2 · Macrostructure choices

### Landing (`/`) — **Stat-Led**

**Reference**: `~/.claude/skills/hallmark/references/macrostructures/04-stat-led.md`

The most defensible Aura claims are quantitative:
- **7 providers** behind one API
- **40–60% token reduction** via compression
- **<10ms gateway overhead** (`App.tsx:114`)
- **4 versions shipped**, **v0.5 in progress**

These are real numbers (no inventions). Stat-Led makes them the page's structural spine instead of decorative bullets inside feature cards. The hero is *the stat row*, set in display Fraunces. Each stat then expands into a numbered section below — "01 — Providers", "02 — Compression", "03 — Latency" — replacing the 3×3 feature grid entirely.

This is also a deliberate move *away* from the "9-feature landing page" framing in the roadmap. The audit (R4, L22) flagged the 9/10 feature drift; Stat-Led collapses 10 feature cards into ~5 numbered sections, each more substantive.

### Docs (`/docs/*`) — **Workbench**

**Reference**: `~/.claude/skills/hallmark/references/macrostructures/05-workbench.md`

Sidebar + content + marginalia. The existing `DocsPage.tsx` is already 80% Workbench (sidebar + content panel) — the redesign drops the icon-prefixed sidebar links, removes the card surfaces around prose, and adds a marginalia column for code samples and footnotes. Numbered section anchors hang in the left margin of prose.

The sidebar becomes a *typographic* TOC: group headers in mono-uppercase small-caps, items as hanging text rules, no icons. The current 9 sidebar groups (Getting Started, API Reference, Guides, SDKs, Multi-Tenancy, Architecture, Providers, Concepts, Project) are preserved verbatim.

### Roadmap (`/roadmap`) — **Long Document**

**Reference**: `~/.claude/skills/hallmark/references/macrostructures/02-long-document.md`

The roadmap is already narrative — "v0.1.x · Foundation", "v0.2.x · Production Readiness", etc. Long Document recognises this and treats the whole page as one piece of writing with version markers in the left margin and shipped/active/planned/considering as italicised inline status. The current timeline-node + cards + stats-strip + bottom-CTA-card construction (`RoadmapPage.tsx`) gets replaced with one continuous column of versioned entries.

### Quickstart (`/docs/quickstart`) — Workbench + Specimen Steps

**Reference**: `~/.claude/skills/hallmark/references/macrostructures/10-specimen.md` (only for the embedded Steps block)

Quickstart inherits the docs Workbench shell but its body uses the new `<Steps>` Specimen pattern: numbered mono leading numerals in the left margin, code samples hung in the marginalia column. This becomes the *reference exemplar* — every other content file picks up the same MDX components automatically, but quickstart is where the voice is shown most cleanly.

---

## 3 · Six-axis fingerprint table

Each row is one of the six axes from `references/structure.md`. The columns show how the current build, the redesigned landing (Stat-Led), the redesigned docs (Workbench), and the redesigned roadmap (Long Document) each resolve that axis.

| Axis | Current (all pages) | Landing (Stat-Led) | Docs (Workbench) | Roadmap (Long Document) |
|---|---|---|---|---|
| 1. Section-heading placement | Centered | Left-margin hanging, with numbered mono markers (`§ 01 — Providers`) | Bottom-aligned within content panel; numbered anchors in left rail | Versioned hangs in left margin (`v0.5.x`); titles inline with body |
| 2. Body composition | Single centered column + 3-col grid | Two-column asymmetric (60% prose, 40% stat/code marginalia) | Sidebar + single 68ch column with right-gutter marginalia | Single 68ch column, no marginalia; version markers hang outside the column |
| 3. Divider language | Hairline borders on every card | Full-width hairline rules between numbered sections; no card borders | Numbered section anchors, sparse hairline rules at h2 boundaries | Em-dash glyph (`—`) between version entries; no rules |
| 4. Button voice | Oversized solid gradient | One outlined button per page; otherwise typographic links | Inline typographic links inside prose; no buttons | Two typographic links separated by `·`; no buttons |
| 5. Image treatment | None | None on landing; full-bleed code blocks as the only "image" | Full-bleed Mermaid diagrams inside content panel | None |
| 6. Reveal pattern | Static | Static. No fade-in. | Static. | Static. |

**Deltas**:
- Landing vs. current: 6/6 axes differ (every axis changes).
- Docs vs. current: 5/6 axes differ (axis 6 was already static).
- Roadmap vs. current: 6/6 axes differ.
- Landing vs. Docs: 4/6 axes differ (both type-led, both numbered; differ on body composition, divider language, image treatment, button voice).
- Docs vs. Roadmap: 4/6 axes differ.
- Landing vs. Roadmap: 4/6 axes differ.

The anti-repetition rule (no two pages share more than 3 of 6 axes) is satisfied at the floor for cross-page comparisons (4 differ → only 2 shared) and exceeded for current-vs-redesigned.

---

## 4 · Per-file changeset

Files are listed in execution order. Each row notes the audit findings it resolves and the design.md sections it draws from.

### Tier 1 — design system foundation

**1.1 — `apps/landing/tailwind.config.js`** *(resolves L9, L20, X3)*
- Strip `aura` and `primary` palette extensions.
- Replace with `colors: { canvas: 'var(--canvas)', 'canvas-elevated': 'var(--canvas-elevated)', ink: 'var(--ink)', 'ink-muted': 'var(--ink-muted)', 'ink-dim': 'var(--ink-dim)', rule: 'var(--rule)', accent: 'var(--accent)', 'accent-ink': 'var(--accent-ink)', 'code-bg': 'var(--code-bg)' }`.
- Replace `fontFamily` with `display: 'var(--font-display)'`, `sans: 'var(--font-body)'`, `mono: 'var(--font-mono)'`.
- Add `theme.extend.spacing` mapping for the 8-based scale (`design.md §3`).

**1.2 — `apps/landing/src/index.css`** *(resolves L1, L8, L11, L14, L15, X5)*
- Delete `.glow`, `.gradient-text`.
- Rewrite `.btn-primary` as `.btn-outline` per `design.md §6 Buttons`.
- Rewrite `.btn-secondary` as `.link` per `design.md §6 Buttons`.
- Delete `.card` entirely (replaced by spacing + hairlines).
- Add `@import '@fontsource-variable/fraunces'`, `@import '@fontsource-variable/inter'` at top.
- Define all OKLCH tokens on `:root` per `design.md §1`.
- Define motion tokens + `prefers-reduced-motion` guard per `design.md §4`.
- Define z-index scale per `design.md §5`.
- Add base layer: tabular-nums on body, prose measure helper class, scroll-behavior smooth.

**1.3 — `apps/landing/package.json`** *(supports 1.2)*
- Add `@fontsource-variable/fraunces` and `@fontsource-variable/inter` as dependencies.
- Already has `jetbrains-mono` indirectly via the `JetBrains Mono` stack reference; add `@fontsource-variable/jetbrains-mono` explicitly to ensure self-hosting (currently relies on system stack fallback).

### Tier 2 — primary surfaces

**2.1 — `apps/landing/src/App.tsx`** *(resolves L1–L22)*

Full rewrite. New structure:

```
1. Nav (type-only, in normal flow, no fixed, no blur)
2. Hero — Stat-Led
   - Display h1 left-margin hanging
   - Stat row below: 4 stats in mono Fraunces, tabular-nums
   - One outlined CTA button + one typographic link
   - No badge, no centered everything
3. Numbered sections (replaces 3×3 grid)
   - § 01 — Seven providers
   - § 02 — Compression that's worth it
   - § 03 — Smart routing & cost tracking
   - § 04 — Production: encryption, multi-tenancy, observability
   - § 05 — Self-hosted in Rust
   Each section: hanging numeral in left margin, h2 in display Fraunces, body text two-column-asymmetric with code sample in marginalia
4. Quiet CTA — one sentence, one inline link
5. Footer (one line of prose)
```

Delete:
- `FeatureCard` component (flip-card)
- The `Feature` interface (replaced by inline JSX per section, since each section is uniquely composed — not a list of cards)
- The fake-browser-chrome code block

Reuse:
- `features` array's text content (descriptions become section prose; code samples become marginalia)
- The lucide-react imports for `ArrowRight` (used inline only — not as feature icon)

End with stamp: `/* Hallmark · genre: editorial-minimal · macrostructure: stat-led · design-system: design.md · designed-as-app */`

**2.2 — `apps/landing/src/pages/DocsPage.tsx`** *(resolves D1–D15, M1–M5)*

Structural rewrite of the shell only — the MDX rendering pipeline (glob loader, mermaid integration, markdown components) stays in place but each renderer is rewritten to design.md tokens.

New layout:

```
+--- left rail ----+----------- content panel ------------+
|                  |  § 01                                |
|  Aura            |                                       |
|  LLM Gateway     |  Section title in display Fraunces    |
|                  |                                       |
|  · introduction  |  Body prose, 68ch, --ink on --canvas. |
|  · quickstart    |  Marginalia hangs in right gutter for |
|  · configuration |  code samples, footnotes, side notes. |
|                  |                                       |
|  API REFERENCE   |  § 02                                |
|  · overview      |  ...                                  |
|  · authentication|                                       |
|  · ...           |                                       |
+------------------+---------------------------------------+
```

- Strip icons from `docSections` items (D1).
- Render sidebar as `<nav>` with `<h3>` group headers in mono uppercase + `<ul>` with hanging entries.
- Drop `.card` wrappers around prose content.
- Rewrite `markdownComponents`:
  - `h1` → `font-display text-display-l hangs-numbered`
  - `h2` → `font-display text-display-m`, numbered marker `§ 02` in left margin via `:before` counter
  - `h3` → mono uppercase, hairline underline
  - `p` → `font-body text-base leading-relaxed text-ink`
  - `a` → `class="link"` (design.md §6)
  - `code` → mono, `var(--code-bg)`, no accent text colour
  - `blockquote` → italic, hairline left rule (`--rule`, not accent)
  - `table` → design.md §6 Tables (hairline only)
  - `ul`/`ol` → hanging marker style (`list-outside`, mono numerals via counter)
- Re-theme Mermaid: replace `primaryColor: '#818cf8'` etc. with OKLCH values from design.md.
- Replace hardcoded `background: '#0f172a'` with `var(--code-bg)`.

End with stamp: `/* Hallmark · genre: editorial-minimal · macrostructure: workbench · design-system: design.md · designed-as-app */`

**2.3 — `apps/landing/src/pages/RoadmapPage.tsx`** *(resolves D9, D10, D11, D12, D13, R1–R7)*

Full rewrite as Long Document. New structure:

```
Aura · LLM Gateway                        v0.5.x

  Building in public.
  Here's where we are.

  Four versions shipped. Seven providers unified behind a single
  API. Open-sourced, on PyPI, on GHCR, ready to deploy.

— — —

v0.1.x · Foundation                                    shipped
  Core gateway, three providers, Python SDK.

  · OpenAI, Anthropic, Google providers
  · Open Responses API spec compliance
  · Streaming via Server-Sent Events
  · Cost tracking per request
  · PostgreSQL request logging
  · API key authentication
  · Python SDK (aura-llm on PyPI)

v0.2.x · Production Readiness                          shipped
  ...

v0.5.x · Observability & SDK Parity              in progress
  ...

— — —

  Help shape the roadmap. Open an issue · join discussions.
```

Delete:
- `phaseConfig` colour mappings (R1, R2, R5) — replace with a mono label function.
- `TimelineNode` (decorative timeline rail with gradient and ping animation).
- `ReleaseCard` card frame (R3).
- Sticky nav band with blur (D10).
- Stats strip with gradient-text v0.5 (D9, R4) — moved to landing's Stat-Led hero where it fits.

Keep:
- `releases` data array (R6 says display is fine, just restyle).
- Phase semantics (shipped / active / planned / considering) — rendered as inline italic mono labels in the right margin per entry.

End with stamp: `/* Hallmark · genre: editorial-minimal · macrostructure: long-document · design-system: design.md · designed-as-app */`

**2.4 — `apps/landing/src/components/Search.tsx`** *(resolves S1–S6)*
- Replace backdrop with solid `--canvas-overlay`, no blur.
- Replace panel `bg-gray-900 border-gray-800 shadow-2xl` with `bg-canvas-elevated border-rule`, no shadow.
- Remove `<SearchIcon>` from input row.
- Remove `<FileText>` from results.
- Restyle `<kbd>` per design.md §6 (mono, hairline border, no fill colour).
- Selected state: `bg-canvas` (subtle elevation only); accent on the trailing arrow glyph only (S4).
- Remove "Powered by Fuse.js" footer text (S5).
- `SearchButton` styled as the typographic `.link` voice — text "Search · ⌘K" hanging in nav.

### Tier 3 — MDX components

Each component rewritten to design.md tokens. Bullet items are the audit findings resolved.

**3.1 — `apps/landing/src/components/mdx/Callout.tsx`** *(C1–C4)*
- Remove the `calloutConfig` colour map. Single mono label, single `--rule` left border.
- Title becomes mono uppercase label (`design.md §6 Callout`).
- Remove all Lucide icon imports.
- Only `danger` variant uses accent on the label.

**3.2 — `apps/landing/src/components/mdx/Card.tsx` + `CardGrid.tsx`** *(C5–C9)*
- Card becomes a numbered list item: hanging mono numeral in left margin, title + body in body face. No border, no fill, no icon.
- `CardGrid` keeps the multi-column option but defaults to single column and removes the `cols=3` variant. Two-column max, asymmetric ratios only (not equal columns) — but the recommendation in `design.md §7` is to avoid grids on the docs entirely. Adjust API: `<CardGrid columns="asymmetric">` for the rare case, default to stacking.
- Remove icon prop, accent hover, `cursor-pointer`.

**3.3 — `apps/landing/src/components/mdx/CodeBlock.tsx`** *(C10–C12)*
- Strip the window-chrome header band.
- Filename label becomes a hanging mono label *above* the code, sized 0.8125rem.
- Copy button: mono "copy ↗" / "copied ✓" toggle at top-right inside the code area, transparent background, hover changes underline only.
- Hardcoded `#0f172a` → `var(--code-bg)`.
- Highlight-line styling: `var(--code-highlight)` background, no accent left border.

**3.4 — `apps/landing/src/components/mdx/CodeTabs.tsx`** *(C13, C14)*
- Remove enclosing frame. Tabs sit above code with hairline underline below the active tab.
- Active tab: `--ink` colour, hairline underline; inactive: `--ink-muted`, no underline.
- No accent.

**3.5 — `apps/landing/src/components/mdx/Steps.tsx`** *(C15–C17)*
- Replace numbered circle with hanging mono numeral (`01.` `02.` `03.`) per design.md §6 Steps.
- Drop vertical connector line.
- Step title: display weight 500, hangs at left margin alongside numeral.
- Already uses `Children` filtering — keep that pattern, just restyle.

**3.6 — `apps/landing/src/components/mdx/Expandable.tsx`** *(C18–C20)*
- Replace with native `<details>`/`<summary>` element (design.md §6 Expandable).
- `+`/`–` typographic glyph instead of ChevronDown.
- Drop `max-h-[2000px]` animation; rely on native or instant toggle.
- Honour `prefers-reduced-motion` via the global rule in design.md §4.

**3.7 — `apps/landing/src/components/mdx/ApiPlayground.tsx`** *(C21–C26)*
- Strip the enclosing frame.
- Method label becomes mono uppercase text (no badge fill).
- Endpoint label: mono `--ink`.
- "Run" button: outlined per design.md §6.
- "Copy cURL": typographic link.
- Loader: mono "running…" text instead of `Loader2` spinner.
- Headers disclosure: native `<details>`, `+`/`–` glyph.
- Form sections separated by hairline rules; labels mono uppercase in left margin.
- All hardcoded `#0f172a` → `var(--code-bg)`.

**3.8 — `apps/landing/src/components/mdx/ModelTable.tsx`** *(C27–C30)*
- Provider badge: mono uppercase text, single `--ink-muted` colour.
- Capability columns: `●` (filled) / `–` (en-dash) glyphs, both `--ink-muted` colour. No green/grey accent.
- Model ID: mono `--ink`.
- Display name: body face `--ink-muted` below ID.
- Remove `hover:bg-gray-800/30` row hover.
- Table styling inherits from design.md §6 Tables.

### Tier 4 — reference exemplar

**4.1 — `apps/landing/src/content/quickstart.mdx`** *(no audit findings; demonstrates the new voice)*

The page becomes the canonical example of how content authors compose pages under design.md. All copy stays verbatim. Recomposition:
- Open with display h1 + lede (already exists).
- Replace inline numbered list with `<Steps>` block (existing component, now restyled).
- Replace any inline code blocks with the new `<CodeBlock>`.
- Add one `<Callout type="tip">` to demonstrate the mono-label callout voice.
- Other content files stay as-is — they pick up the redesigned shell + components automatically and look right without recomposition.

End with frontmatter-preserved stamp at the top:
```mdx
{/* Hallmark · genre: editorial-minimal · macrostructure: workbench · design-system: design.md · reference-exemplar */}
```

---

## 5 · Implementation order

Run in tiers, not flat. After each tier, manually verify in the browser before starting the next.

1. **Tier 1** (design system foundation): `tailwind.config.js`, `index.css`, `package.json`. Browser check: site should look broken but no console errors. All tokens resolvable.
2. **Tier 2.1** (landing only): `App.tsx`. Browser check: golden path on `/`.
3. **Tier 3** (MDX components, all 8 in any order): Browser check: visit one doc that uses each component.
4. **Tier 2.2** (docs shell): `DocsPage.tsx`. Browser check: `/docs`, `/docs/quickstart`, `/docs/api/compression`.
5. **Tier 2.3** (roadmap): `RoadmapPage.tsx`. Browser check: `/roadmap`.
6. **Tier 2.4** (search): `Search.tsx`. Browser check: ⌘K from any page.
7. **Tier 4** (reference exemplar): `quickstart.mdx`. Browser check: `/docs/quickstart` end-to-end.

Each tier ends with a self-audit pass against the slop gates in `design.md §8`.

---

## 6 · Acceptance criteria

The redesign is complete when:

1. **Stamp check**: every file modified in Tiers 1–4 ends with the correct stamp comment, and the stamp matches what shipped (genre + macrostructure + design-system reference).
2. **Slop gates**: every one of the 60 gates in `references/slop-test.md` answers `no`. The pre-emit checklist in `design.md §8` is run before the final commit.
3. **Visual delta**: no `.gradient-text`, no `.glow`, no `backdrop-blur`, no `transition-all`, no fake browser chrome, no card-flip, no centered hero anywhere in the diff. Verified by:
   ```bash
   git diff main -- apps/landing/ | grep -E '(gradient-text|\.glow|backdrop-blur|transition-all)' && exit 1 || exit 0
   ```
4. **Six-axis delta**: landing vs. docs share ≤2 axes; docs vs. roadmap share ≤2 axes; landing vs. roadmap share ≤2 axes. Verified by manually walking the six axes in `§3`.
5. **Local dev**: `cd apps/landing && npm run dev` (port 3001). Walk: `/` → `/docs` → `/docs/quickstart` → `/docs/api/compression` (Mermaid renders) → `/docs/api/routing` → `/docs/sdks/python` (MDX uses CodeTabs, ModelTable, Steps, Callout) → `/roadmap` → ⌘K search modal → click result → back to docs.
6. **Build**: `npm run build` succeeds with no warnings. Bundle includes the three Fontsource packages.
7. **Reduced motion**: in devtools, toggle `prefers-reduced-motion: reduce` — no transitions, no animations, no scroll-fade, no `animate-ping`.
8. **Contrast**: `--ink` on `--canvas` measures ≥4.5:1 (it should land around 13:1). Accent fills paired with `--accent-ink` measure ≥4.5:1 for text on accent surfaces.
9. **Honest content**: no invented numbers. All claims trace back to CLAUDE.md or the existing copy in `App.tsx`/`RoadmapPage.tsx`.
10. **No regression**: the existing functional features (search, mermaid, MDX routing, syntax highlighting, copy-button, expandable disclosure) still work after restyle.

---

## 7 · Explicit non-goals

- **Do not** change the copy of any doc file. All `.md`/`.mdx` content stays verbatim — only `quickstart.mdx` is recomposed structurally (using new components, with the same words).
- **Do not** redesign the `apps/chat` playground. Out of scope.
- **Do not** restructure the routes, the sidebar groupings, or the API URL shapes.
- **Do not** introduce framer-motion, Radix, shadcn, or any new UI library. The redesign uses only what's already in `package.json` plus the three Fontsource font packages.
- **Do not** add a light-mode toggle. Light variant is defined in design.md for future use; not exposed in the UI in this pass.
- **Do not** add new MDX components. The 8 existing components cover everything used in the content files.

---

## 8 · Risk notes

- **Fonts**: Fraunces is ~120KB woff2 for the variable cut; Inter is ~80KB. Together ~200KB beyond JetBrains Mono. Acceptable for a docs/marketing site; verify in build output. If it pushes the bundle past target, fall back to `Söhne` system stack + Inter system stack (`design.md §2` already lists fallbacks).
- **Mermaid theming**: re-theming Mermaid in OKLCH requires sRGB equivalents passed via `themeVariables` (Mermaid doesn't parse OKLCH). Compute once at build, store as constants. Sample: `oklch(0.74 0.16 230)` → `#5BB0E8`.
- **Tailwind v4 vs. v3**: project is on v3.4.17. The CSS-var-driven approach works in v3 via `theme.extend.colors: { canvas: 'var(--canvas)' }`. If migrating to v4, the syntax simplifies but the design system stays the same.
- **MDX content using old components**: if any content file uses `<Callout type="info">` expecting a blue icon, after redesign all callouts look the same except for the mono label. This is intentional — flag in the changelog.
- **DocsPage `cols={3}` usage**: search content files for `<CardGrid cols={3}>` and reduce to `cols={2}` asymmetric before merging. Audit `apps/landing/src/content/**/*.mdx` for this pattern.

---

## 9 · Stamp registry

Files in this audit deliverable carry their own audit/brief stamps. Files in the redesign execution carry implementation stamps. The two should not be confused.

**This deliverable** (`docs/design-audit/`):
- `AUDIT.md` ends with: `<!-- Hallmark · audit · genre-target: editorial-minimal · against: landing+docs+roadmap+search+8-mdx -->`
- `REDESIGN.md` ends with: `<!-- Hallmark · redesign-brief · v1 · 2026-05-19 -->`
- `design.md` ends with: `<!-- Hallmark · design-system · v1 · 2026-05-19 -->`

**Redesign output** (executed in a follow-up session):
- Each TSX file ends with `/* Hallmark · genre: editorial-minimal · macrostructure: <name> · design-system: design.md · designed-as-app */`
- The MDX reference exemplar carries `{/* Hallmark · ... · reference-exemplar */}` at the top.

---

<!-- Hallmark · redesign-brief · v1 · 2026-05-19 -->
