# @aura/ui

Shared design system source for `apps/landing`, `apps/chat` and `apps/admin`,
implementing the v3 design pack (`docs/design/aura-pack-v3/`).

| Path | What |
|---|---|
| `src/tokens.css` | Colour, type, radius and spacing tokens (`--aura-*`), light on `:root`, dark on `.dark`. Matches `handoff/design-tokens.json` (`tokens.test.ts`). |
| `src/ui.css` | Styles for the shared components, written on the tokens so they look the same in every app. |
| `src/brand/` | `BrandMark` (ring + A, or the favicon tile) and `Wordmark`, drawn from the canonical SVGs in `assets/brand/`. |
| `src/ui/` | `Tabs` (WAI-ARIA, roving tabindex) and `Drawer` (modal dialog with focus trap and focus return). |

## Using it from an app

There is no build step or npm install: each app imports the source through
an `@aura/ui` alias.

- `vite.config.ts`: `resolve.alias['@aura/ui']` points at `packages/aura-ui/src`,
  `resolve.dedupe: ['react', 'react-dom']` makes the shared files use the app's
  React, and `server.fs.allow` lets the dev server read outside the app.
- `tsconfig.json`: `paths` maps `@aura/ui/*`, and maps `react` / `react/*` to
  the app's `@types/react` (shared files have no `node_modules` of their own);
  `include` lists `../../packages/aura-ui/src`; `**/*.test.ts` is excluded.
- CSS: `@import '@aura/ui/tokens.css';` (and `ui.css` where the shared
  components are used) at the top of the app stylesheet.

apps/chat and apps/admin keep their shadcn-style HSL variables for Tailwind,
set to the token values; `app-themes.test.ts` fails if they drift.

## Tests

`npm test` here, or from the repo root
`node --test 'packages/aura-ui/src/**/*.test.ts' 'apps/*/src/**/*.test.ts'`
(CI job "Frontend tests"). They use `node:test` with Node's built-in
TypeScript stripping, so write erasable TypeScript only (no enums or
namespaces) in files the tests import.
