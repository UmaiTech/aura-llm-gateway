# Aura Design System

```
Hallmark · genre: editorial-minimal · design-system: design.md · designed-as-app
Locked: 2026-05-19
Scope: apps/landing (landing + docs + roadmap + search + 8 MDX components)
```

This file is the **single source of truth** for visual decisions across the Aura landing app. Every redesigned file references these tokens; no inline colours, no inline fonts, no decorative magic numbers. When the design needs to change, change it here first.

The genre is **editorial-minimal** — a deliberate hybrid:
- From **modern-minimal**: strict accent budget (<5%), no gradients, monochrome canvas, geometric type, sharp contrast.
- From **editorial**: numbered section markers, serif display face, hanging marginalia, type-led hierarchy, Specimen-family macrostructures allowed.

The result is documentation-grade restraint with editorial discipline — the right register for an open-source Rust infrastructure project.

---

## 1 · Colour

All colours are defined in OKLCH. The OKLCH colour space is perceptually uniform — equal L values look equally bright, equal C values look equally saturated. This matters for accessibility: `oklch(0.7 0 0)` reads at the same intensity as `oklch(0.7 0.1 230)`, which makes contrast pairs reliable.

### Tokens (dark canvas — default)

```css
:root {
  /* Surfaces */
  --canvas:           oklch(0.18 0 0);          /* near-black; replaces #030712 / gray-950 */
  --canvas-elevated:  oklch(0.22 0 0);          /* one notch up — sidebars, modals */
  --canvas-overlay:   oklch(0.10 0 0 / 0.85);   /* modal backdrop, NO blur */
  --code-bg:          oklch(0.16 0 0);          /* code blocks; one notch below canvas */
  --code-highlight:   oklch(0.26 0 0);          /* highlighted lines inside code */

  /* Text */
  --ink:              oklch(0.95 0 0);          /* primary text, headings, links */
  --ink-muted:        oklch(0.68 0 0);          /* secondary text, captions, metadata */
  --ink-dim:          oklch(0.50 0 0);          /* tertiary; placeholders, disabled */

  /* Rules & borders */
  --rule:             oklch(0.30 0 0);          /* hairline dividers, all borders */
  --rule-strong:      oklch(0.40 0 0);          /* emphasis rule (rare) */

  /* Accent — used <5% of total surface area */
  --accent:           oklch(0.74 0.16 230);     /* azure; close to original aura-400 but flatter */
  --accent-ink:       oklch(0.18 0 0);          /* text colour on top of --accent fills */
}
```

### Light paper variant (for printable docs, future)

```css
[data-theme="paper"] {
  --canvas:           oklch(0.97 0 0);
  --canvas-elevated:  oklch(0.93 0 0);
  --canvas-overlay:   oklch(0.95 0 0 / 0.85);
  --code-bg:          oklch(0.95 0 0);
  --code-highlight:   oklch(0.88 0 0);
  --ink:              oklch(0.18 0 0);
  --ink-muted:        oklch(0.35 0 0);
  --ink-dim:          oklch(0.55 0 0);
  --rule:             oklch(0.78 0 0);
  --rule-strong:      oklch(0.65 0 0);
  --accent:           oklch(0.50 0.20 230);     /* darker accent for contrast on paper */
  --accent-ink:       oklch(0.98 0 0);
}
```

### Banned colour tokens (do not reintroduce)

- `aura-{50..900}` — old gradient palette
- `primary-{400..600}` — old secondary palette
- `purple-`, `blue-`, `red-`, `yellow-`, `green-`, `orange-` callout/status colours
- Two-stop linear gradients on any surface
- `background-clip: text` (banned absolutely)
- `#000000` and `#ffffff` (use the OKLCH near-black/near-white above)

### Accent budget

The accent (`--accent`) must occupy **<5% of any rendered viewport**. Use it for at most one of:
- The current/active phase marker on the roadmap timeline.
- One CTA per page (and *not* a filled button — usually an underline or arrow glyph).
- A focus ring (always paired with `--accent-ink` on filled accent surfaces).

Never use accent for: body text, headings, link colour, code highlight, blockquote rule, table headers, callout fills, badge fills.

---

## 2 · Typography

### Stacks

```css
:root {
  --font-display: 'Fraunces', 'Tiempos Headline', 'GT Sectra', Georgia, serif;
  --font-body:    'Inter', 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
  --font-mono:    'JetBrains Mono', 'IBM Plex Mono', ui-monospace, 'SF Mono', monospace;
}
```

### Loading

- **Fraunces** via Fontsource (`@fontsource-variable/fraunces`) — variable font with `opsz` (optical size) and `wght` axes. Self-hosted.
- **Inter** via Fontsource (`@fontsource-variable/inter`) — variable font with `wght` axis. Self-hosted.
- **JetBrains Mono** via Fontsource — already loaded in the project.

`font-display: swap` on all three. No FOIT.

### Roles & scale

| Role | Face | Weight | Size (rem) | Where |
|---|---|---|---|---|
| Display XL | Fraunces (opsz 144) | 400 | 4.5 — 6.0 | Landing h1 only |
| Display L | Fraunces (opsz 96) | 400 | 3.0 — 3.75 | Docs h1, Roadmap h1 |
| Display M | Fraunces (opsz 48) | 500 | 2.0 — 2.5 | h2 across the app |
| Display S | Fraunces (opsz 24) | 500 | 1.5 — 1.75 | h3 (sparingly — usually replaced by mono section labels) |
| Body | Inter | 400 | 1.0 (16px) | All prose, measure 60–72ch |
| Body emphasis | Inter | 500 | 1.0 | `<strong>`, hover-emphasised state |
| Mono label | JetBrains Mono | 500 | 0.75 — 0.875 | Section markers (`§ 01 — Providers`), kbd, code IDs, callout labels |
| Mono body | JetBrains Mono | 400 | 0.875 | Code blocks, inline code |
| Caption | Inter | 400 | 0.8125 | Metadata, captions, footer prose |

### Rules

- **Numerals**: `font-variant-numeric: tabular-nums` everywhere a number appears in a list/table/UI. Set globally on `body`.
- **Display weight**: never `font-bold` (700+) on Fraunces — use the variable axis to land between 400 and 600.
- **Inter weight pair**: 400 + 500 only. No 600/700/800.
- **Letter-spacing**:
  - Display: `-0.02em` (Fraunces tightens nicely at large optical sizes)
  - Mono labels: `+0.06em` and `text-transform: uppercase`
  - Body: default (0)
- **Line-height**:
  - Display: 1.05
  - Body: 1.6 (prose) / 1.4 (UI)
  - Mono: 1.5

### What's banned

- Inter as display face (anti-pattern L9)
- `font-bold` (700) on display — use weight 500 max
- Mixing two sans faces (e.g. Inter + IBM Plex Sans) — pick one
- Type gradients (`background-clip: text`)
- All-caps body or headings; reserve caps for mono labels only

---

## 3 · Spacing

8-based scale, Fibonacci-adjacent. Avoids the "every section padded the same" anti-pattern by giving you ratios that don't sit on a uniform grid.

```css
:root {
  --space-1:   4px;
  --space-2:   8px;
  --space-3:   12px;
  --space-4:   20px;
  --space-5:   32px;
  --space-6:   52px;
  --space-7:   84px;
  --space-8:   136px;
}
```

Map to Tailwind via `theme.extend.spacing` so utilities like `p-5`, `mt-7` resolve to these values.

### Section padding rules

- **Hero**: vertical `--space-8` top, `--space-7` bottom (asymmetric).
- **Body sections**: `--space-7` top, `--space-6` bottom on landing; `--space-6` top + bottom on docs.
- **CTA / closing band**: `--space-6` top, `--space-7` bottom.
- **Horizontal padding**: `--space-4` mobile, `--space-5` tablet, `--space-6` desktop.

Never `py-20` everywhere — that's an audited tell (L21).

### Prose measure

```css
.prose, [data-prose] {
  max-width: 68ch;   /* 60-72ch range; 68 lands well at 16px Inter */
}
```

For Workbench docs: prose + marginalia. The prose column is 68ch; marginalia hangs at `calc(100% + var(--space-5))` in the right gutter for code samples, footnotes, and side notes.

---

## 4 · Motion

```css
:root {
  --motion-duration-fast:   120ms;
  --motion-duration-base:   200ms;
  --motion-ease:            cubic-bezier(0.25, 0.1, 0.25, 1);  /* iOS standard */
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Allowed transitions

- `color` (`var(--motion-duration-base) var(--motion-ease)`)
- `opacity` (`var(--motion-duration-fast) linear`)
- `background-color` (only for kbd / inline code on hover, optional)

### Banned

- `transition-all` (anti-pattern L11, M5, X5)
- `transform` transitions on hover (no `hover:scale-105`, no card flips)
- Scroll-triggered fade-in
- Bouncy / elastic / overshoot easings
- `animate-ping`, `animate-pulse` on functional UI
- Loading spinners as decoration (use mono "running…" label)
- `max-height` transitions on disclosure (use native `<details>` or instant toggle)

---

## 5 · Layout primitives

### Z-index scale

```css
:root {
  --z-nav:      10;
  --z-sticky:   20;
  --z-overlay:  40;
  --z-modal:    50;
  --z-toast:    60;
}
```

No `z-index: 9999`. No `z-index: 50` for unrelated layers.

### Border radius

| Token | Value | Use |
|---|---|---|
| `--radius-none` | 0 | Default for surfaces; tables; code blocks |
| `--radius-sm` | 2px | kbd; inline code; small badges |
| `--radius-md` | 6px | Buttons; form controls |
| `--radius-full` | 9999px | Status dots only |

No `rounded-xl` / `rounded-2xl` on cards — there are no cards.

### Shadows

There are **no shadows in this design system**. Separation comes from spacing and hairline rules.

Exceptions: focus rings (see §6).

---

## 6 · Components

### Buttons

Two voices only:

**Outlined** (default for all primary CTAs):

```html
<button class="btn-outline">Get started <span aria-hidden>→</span></button>
```

```css
.btn-outline {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--ink);
  color: var(--ink);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: color var(--motion-duration-base) var(--motion-ease);
}
.btn-outline:hover { color: var(--accent); border-color: var(--accent); }
.btn-outline:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

**Typographic link** (default for secondary CTAs):

```html
<a class="link">Read the docs <span aria-hidden>→</span></a>
```

```css
.link {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 0.2em;
  text-decoration-thickness: 1px;
  text-decoration-color: var(--rule);
  transition: text-decoration-color var(--motion-duration-base) var(--motion-ease);
}
.link:hover { text-decoration-color: var(--ink); }
```

**Banned**: filled accent buttons (`bg-accent text-white`), gradient buttons, oversized solid buttons (`px-6 py-3` with shadow).

### Nav

**Type-only nav. No logo lockup, no icon, no bottom border.**

```
                                                       Docs · Roadmap · Playground · GitHub
Aura · LLM Gateway                                                                  v0.5.x
```

- Wordmark left, in display face, weight 500.
- Version tag right, mono.
- Text links inline (separated by `·` middle dot), no icons even for GitHub.
- Background = `--canvas`. No `backdrop-blur`. No `border-bottom`.
- Padding asymmetric: more on left (`--space-6`) than right (`--space-4`).
- Stays in normal flow — not `fixed`. (The page isn't long enough to need persistent nav; rely on browser back.)
- For docs: nav becomes a left rail (vertical wordmark column → see §7 Workbench macrostructure).

### Footer

**One line of running prose. No columns. No copyright. No social row.**

```
Aura LLM Gateway · open source · MIT · github.com/UmaiTech/aura-llm-gateway →
```

```html
<footer class="site-footer">
  <p>
    Aura LLM Gateway · open source · MIT ·
    <a href="https://github.com/UmaiTech/aura-llm-gateway" class="link">
      github.com/UmaiTech/aura-llm-gateway <span aria-hidden>→</span>
    </a>
  </p>
</footer>
```

Padding: `--space-6` vertical, full-width with horizontal padding matching nav. Border-top: 1px `--rule`.

### Callout

Type-only. No icon. No background fill. No coloured border.

```html
<aside data-callout="note">
  <span class="callout-label">Note</span>
  <p>Connection caching is required for tool calls that span more than one turn.</p>
</aside>
```

```css
[data-callout] {
  border-left: 1px solid var(--rule);
  padding-left: var(--space-3);
  margin: var(--space-5) 0;
}
.callout-label {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: var(--space-1);
}
[data-callout="danger"] .callout-label { color: var(--accent); }  /* one exception */
```

Five labels: `note`, `tip`, `warning`, `danger`, `success`. Only `danger` uses accent.

### Code block

No window chrome. Hanging mono filename label above. Code flush below.

```
example.ts ↓

  const response = await fetch('http://localhost:8080/v1/responses', {
    ...
  })
```

```css
.code-block {
  margin: var(--space-5) 0;
}
.code-block-label {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--ink-muted);
  margin-bottom: var(--space-2);
}
.code-block pre {
  background: var(--code-bg);
  padding: var(--space-4);
  border-radius: 0;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  line-height: 1.6;
}
```

Copy button: top-right, mono `copy ↗` label that becomes `copied ✓` for 2s. No icon. No background fill on the button.

### Tables

Hairline-only borders. No header fill. `tabular-nums` on numeric columns. No row hover.

```css
table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
th {
  text-align: left;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-muted);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--rule);
}
td {
  padding: var(--space-3);
  border-bottom: 1px solid var(--rule);
  color: var(--ink);
}
tr:last-child td { border-bottom: none; }
```

### Form controls

Native browser controls with minimal restyle. No floating labels. No icon-prefixed inputs.

```css
input, textarea, select {
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--rule);
  color: var(--ink);
  font-family: inherit;
  padding: var(--space-2) 0;
  width: 100%;
}
input:focus, textarea:focus, select:focus {
  outline: none;
  border-bottom-color: var(--accent);
}
label {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: var(--space-1);
}
```

### Search modal

Solid backdrop (`--canvas-overlay`), no blur. Solid panel (`--canvas-elevated`), hairline border, no shadow.

```css
.search-backdrop {
  position: fixed;
  inset: 0;
  background: var(--canvas-overlay);
  z-index: var(--z-overlay);
}
.search-panel {
  position: fixed;
  top: 15vh;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 36rem;
  background: var(--canvas-elevated);
  border: 1px solid var(--rule);
  z-index: var(--z-modal);
}
.search-input {
  font-family: var(--font-mono);
  font-size: 1rem;
  padding: var(--space-4);
  border-bottom: 1px solid var(--rule);
  background: transparent;
  width: 100%;
}
.search-result {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--rule);
}
.search-result[data-selected] {
  background: var(--canvas);
}
.search-result[data-selected] .search-result-arrow {
  color: var(--accent);
}
```

No icons on results. Mono kbd hints in footer.

### Steps

Hanging mono numerals in left margin. No circle, no fill, no connector line.

```
01.  Install the SDK
     pip install aura-llm

02.  Authenticate
     export AURA_API_KEY=...

03.  Make a request
     ...
```

```css
.steps { counter-reset: step; }
.step {
  display: grid;
  grid-template-columns: var(--space-6) 1fr;
  gap: var(--space-3);
  margin: var(--space-5) 0;
}
.step::before {
  counter-increment: step;
  content: counter(step, decimal-leading-zero) ".";
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--ink-muted);
  font-variant-numeric: tabular-nums;
}
```

### Expandable (disclosure)

Native `<details>` element. `+`/`–` typographic glyph. Hairline rule above and below. No card frame.

```html
<details class="disclosure">
  <summary>Advanced configuration</summary>
  <p>The gateway supports per-tenant overrides via …</p>
</details>
```

```css
.disclosure {
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  padding: var(--space-3) 0;
}
.disclosure summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--font-body);
  color: var(--ink);
}
.disclosure summary::after {
  content: "+";
  font-family: var(--font-mono);
  color: var(--ink-muted);
}
.disclosure[open] summary::after { content: "−"; }
.disclosure summary::-webkit-details-marker { display: none; }
```

---

## 7 · Permitted macrostructures

Locked list. No page in this app uses anything outside this list:

| Page | Macrostructure | Reference |
|---|---|---|
| `/` (landing) | **Stat-Led** | `references/macrostructures/04-stat-led.md` |
| `/docs/*` (shell) | **Workbench** | `references/macrostructures/05-workbench.md` |
| `/roadmap` | **Long Document** | `references/macrostructures/02-long-document.md` |
| `/docs/quickstart` (reference exemplar) | Workbench with embedded `Steps` Specimen | `references/macrostructures/10-specimen.md` |

### Banned macrostructures for this app

- Bento Grid (too SaaS-default for a Rust infra product)
- Marquee Hero (image-led; we have no hero imagery)
- Conversational FAQ (not a feature)
- Manifesto (wrong register for docs)
- Catalogue, Portfolio Grid (no products to list)
- Photographic (no photography)

---

## 8 · Slop gates — pre-emit checklist

Run before shipping any redesigned file. From `references/slop-test.md`. Every answer must be **no**.

**Visual (1-8)**:
- [ ] Is Inter used as a display face? (must be no)
- [ ] Does any element use a two-stop gradient? (no)
- [ ] Is there a 3-column equal feature grid? (no)
- [ ] Is any container nested inside another container of the same archetype? (no)
- [ ] Is `background-clip: text` used anywhere? (no)
- [ ] Is there a thick coloured asymmetric left-border on a card? (no)
- [ ] Is the hero centered-everything full-viewport? (no)
- [ ] Is `#000000` or `#ffffff` literally used? (no)

**Structural (9-10)**:
- [ ] Does the page share the same fingerprint across all 6 axes as another page in this app? (no — landing/docs/roadmap each differ from each other on ≥3 axes)
- [ ] Does every section share identical padding? (no — see §3)

**Microinteractions (11-20)**:
- [ ] `transition-all` anywhere? (no)
- [ ] `hover:scale-105`? (no)
- [ ] Bouncy/elastic easing? (no)
- [ ] Cursor-follower dots? (no)
- [ ] Auto-rotating carousel? (no)
- [ ] Celebratory success toast? (no)
- [ ] Universal scroll-fade-in? (no)
- [ ] Spinner that flashes? (no)
- [ ] Layout-shifting animation? (no)
- [ ] Tooltip with same hover+focus delay? (no)

**Variety / discipline (21-23)**:
- [ ] Missing `/* Hallmark · ... */` stamp? (no)
- [ ] Macrostructure repeats one from a previous Hallmark output? (no — Stat-Led and Workbench fit this brief)
- [ ] Specimen used on a SaaS/commerce/dev-tool page? (no — Specimen is allowed only inside the quickstart Steps; not as page-level macrostructure)

**Implementation (24-28)**:
- [ ] Neutral grey that's tinted with the brand colour? (no — pure OKLCH chromas 0)
- [ ] Accent occupies >5% of viewport? (no)
- [ ] Padding off the scale? (no — only --space-1..8)
- [ ] Prose measure outside 45-75ch? (no)
- [ ] Reduced-motion fallback missing? (no — global rule in §4)

**Hero enrichment (30-32)**:
- [ ] LCP autoplay-with-sound? (no — no video on these pages)
- [ ] Mesh gradient covering >20% of hero? (no — no gradients at all)
- [ ] Multiple icon sets mixed on same page? (no — Lucide is the only icon family; restricted to nav and small UI only)

**Contrast / readability (46-50)**:
- [ ] Body text contrast <4.5:1? (no — `--ink` on `--canvas` measures ~13:1)
- [ ] Large text or icon contrast <3:1? (no)
- [ ] Button fill doesn't match `--accent-ink` contrast pair? (no — see §6)
- [ ] Dark-section text-colour swap missing? (n/a — no light-on-dark inversions in this build)

**Nav / footer / hero structure (51-55)**:
- [ ] Nav uses the AI-default fingerprint (wordmark+links+CTA+border)? (no — see §6 Nav)
- [ ] Footer uses the AI-default fingerprint (4 columns + social + copyright)? (no — see §6 Footer)
- [ ] Hero is centered-everything? (no — Stat-Led has stats as the focal point, h1 left-margin)
- [ ] Decorative element without semantic purpose? (no)

**Honesty & token discipline (56-58)**:
- [ ] Invented metric? (no — all numbers in this design system are real: 7 providers, 40-60% compression range from CLAUDE.md, <10ms overhead claim from `App.tsx:114`)
- [ ] Re-drawn UI chrome (browser bar, IDE chrome, phone frame)? (no — anti-pattern L7 removed)
- [ ] Inline colour/font values? (no — every value comes from a `--token`)

**Responsive (59-60)**:
- [ ] Two-line clickable text? (no)
- [ ] Emoji used as functional icon? (no — only allowed inside code-block strings for human-readable comments)

---

## 9 · Stamps

Every file rewritten under this design system ends with a stamp comment:

```ts
/* Hallmark · genre: editorial-minimal · macrostructure: <name> · design-system: design.md · designed-as-app */
```

For CSS:

```css
/* Hallmark · genre: editorial-minimal · macrostructure: <name> · design-system: design.md · designed-as-app */
```

For MDX:

```mdx
{/* Hallmark · genre: editorial-minimal · macrostructure: workbench · design-system: design.md · designed-as-app */}
```

The audit pass after implementation verifies that the stamp matches what was shipped — a stamp that lies is a critical finding.

---

## 10 · References

- Hallmark skill: `~/.claude/skills/hallmark/`
  - `references/anti-patterns.md` — the named tells used in the audit
  - `references/macrostructures/{02,04,05,10}.md` — the four macrostructures permitted here
  - `references/slop-test.md` — the 60 pre-emit gates
  - `references/structure.md` — the six-axis fingerprint model
- Project: `apps/landing/CLAUDE.md` (root project guidance), `apps/landing/package.json` (dependencies)
- This audit: `docs/design-audit/AUDIT.md`
- The redesign brief: `docs/design-audit/REDESIGN.md`

<!-- Hallmark · design-system · v1 · 2026-05-19 -->
