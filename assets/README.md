# Aura brand assets

Canonical logo and favicon artwork for Aura LLM Gateway, from the v3 design
pack (`docs/design/aura-pack-v3/brand-kit/`). The apps and the React marks in
`packages/aura-ui/src/brand/` are drawn from these files; tests in that
package fail if an app's copy or the component geometry drifts.

## Logos — `brand/`

| File | Use |
|---|---|
| `aura-wordmark-dark.svg` / `.png` | Mark + "Aura" lettering for dark backgrounds |
| `aura-wordmark-light.svg` / `.png` | Mark + lettering for light backgrounds |
| `aura-wordmark-white.svg`, `aura-wordmark-black.svg` | Monochrome applications |
| `aura-mark-violet.svg` / `aura-mark-ink.svg` | Ring + A mark on dark / light backgrounds |
| `aura-mark-white.svg`, `aura-mark-black.svg` | Monochrome mark |

Use the ring mark at 32 px or larger; below that use the favicon tile. Keep
clear space of at least a quarter of the mark's width around it. Minimum
wordmark width is 120 px. No shadows, glows, gradients or stretching.

In React apps prefer `BrandMark` / `Wordmark` from `@aura/ui`, which follow the
light/dark theme without picking a file.

## Favicons — `brand/favicons/`

`favicon.ico` (16/32/48), `favicon.svg`, PNG sizes, `apple-touch-icon.png`,
Android and maskable icons, `safari-pinned-tab.svg`. Each app ships identical
copies in its `public/` directory, linked from its `index.html`, with its own
`site.webmanifest` (name, `start_url` and `scope` per app). The chat keeps
`/aura-icon.svg` as an identical copy for old bookmarks.

## Typography and licences

The A letterform is the original Aura mark from this MIT-licensed repository.
The wordmark lettering is Fraunces SemiBold converted to outlines, so it needs
no font at runtime. Fraunces is licensed under the SIL Open Font License 1.1;
the licence is kept next to the artwork in `brand/Fraunces-OFL.txt` and next
to the self-hosted font in `apps/landing/public/fonts/`.

The identity is a design proposal, not a trademark search or legal clearance.
