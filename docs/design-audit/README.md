# Aura Design Audit

A Hallmark audit + redesign brief for `apps/landing/` — the marketing landing, docs renderer, roadmap, search modal, and 8 MDX components.

Run against `apps/landing/` on **2026-05-19** at commit `3be33a0` (`fix/playground-better-auth-adapter`).

---

## What's in here

| File | Read when |
|---|---|
| [`AUDIT.md`](./AUDIT.md) | You want the punch list. 33 critical · 28 major · 9 minor findings, each with file path, line numbers, and a concrete fix. |
| [`design.md`](./design.md) | You want the design system. OKLCH tokens, typography stacks, spacing scale, motion rules, component contracts, banned-pattern list. Treat this as the source of truth. |
| [`REDESIGN.md`](./REDESIGN.md) | You're about to execute. Genre + macrostructure decisions, six-axis fingerprint table, per-file changeset in execution order, acceptance criteria. |
| [`README.md`](./README.md) | You're here. |

---

## How to read these documents

If you've got 5 minutes — read `AUDIT.md §Summary`. The first paragraph says what's wrong with the landing in one breath: every page reuses the same SaaS-default fingerprint across all six axes from `structure.md`, and visual fixes alone won't move the needle.

If you've got 20 minutes — read all of `AUDIT.md` start to finish. Each finding is a tuple of `Tell · Where · Severity · Fix`. The "Where" column has file paths and line numbers you can jump to.

If you're executing — read in this order: `design.md` → `REDESIGN.md` → back to `AUDIT.md` to cross-check each finding gets resolved by your changeset.

---

## Genre & macrostructure decisions

**Genre**: `editorial-minimal` — a hybrid of modern-minimal (strict accent budget, monochrome, geometric type) and editorial (numbered sections, serif display, hanging marginalia).

**Macrostructures**, one per page:

| Page | Macrostructure |
|---|---|
| `/` (landing) | Stat-Led |
| `/docs/*` (shell) | Workbench |
| `/roadmap` | Long Document |
| `/docs/quickstart` (reference exemplar) | Workbench with Specimen Steps |

The three pages share theme tokens (typography, colour, spacing, motion) but differ structurally — landing's Stat-Led vs. docs' Workbench vs. roadmap's Long Document each resolve ≥4 of 6 axes differently. See `REDESIGN.md §3` for the full table.

---

## Where this came from

The audit uses the [Hallmark](https://github.com/nutlope/hallmark) anti-AI-slop design skill, installed at `~/.claude/skills/hallmark/`. Specifically:

- `references/anti-patterns.md` — the named tells used in the audit punch list
- `references/structure.md` — the six-axis fingerprint model used to characterise structural sameness
- `references/macrostructures/` — the 21 macrostructure archetypes; this brief uses 4 of them
- `references/slop-test.md` — the 60 pre-emit gates that gate the eventual implementation
- `references/verbs/audit.md` and `verbs/redesign.md` — the contract format for both deliverables

The whole audit is run from outside the codebase — none of this requires Hallmark installed to *implement*, only to *reason* about. The output files in this directory are self-contained.

---

## What this is NOT

- **Not a working redesign.** No code in `apps/landing/` has been changed yet. The redesign is a separate execution session — `REDESIGN.md §5` lists the tiers in order.
- **Not a copy edit.** All marketing copy stays verbatim. The audit only touches the *structure* and *visual vocabulary*.
- **Not a route restructure.** The information architecture — sidebar groupings, URL shapes, page order — is preserved.
- **Not for `apps/chat`.** The playground app is out of scope.

---

## Next steps

1. **Read** `AUDIT.md` and decide which findings you accept.
2. **Adjust** `design.md` if any locked token needs to change (font choice, accent hue, spacing scale).
3. **Execute** in the tier order from `REDESIGN.md §5`. Each tier should end with a browser walkthrough before the next begins.
4. **Verify** against `REDESIGN.md §6` acceptance criteria before merging.

The redesign should land as one PR per tier (4 PRs) or as a single PR if you prefer atomic review — `REDESIGN.md §5` is independent of git strategy.

---

<!-- Hallmark · audit-deliverable-index · v1 · 2026-05-19 -->
