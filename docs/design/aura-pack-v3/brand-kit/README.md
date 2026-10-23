# Aura identity kit

Proposed refresh for Aura LLM Gateway, 23 October 2026. Based on source snapshot d8ca9fc0cfb92f40d8b261f7648fca91fc540b6a. No deployment or repository push has occurred.

## Design

The existing A letterform is retained. One ring replaces multiple faint rings and glow. Favicons remove the ring and enlarge the A on a solid violet tile. The wordmark uses Fraunces 600 converted to vector outlines: it does not require a font download at runtime.

- `logos/aura-wordmark-dark.svg`: light lettering for dark backgrounds.
- `logos/aura-wordmark-light.svg`: dark lettering for light backgrounds.
- `logos/aura-wordmark-white.svg` and `-black.svg`: monochrome applications.
- `logos/aura-mark-*.svg`: standalone marks. Use at 32 px or larger.
- `favicons/favicon.svg`: browser icon, independent of page theme.
- `favicons/favicon.ico`: 16, 32 and 48 px fallback frames.
- PNG exports include browser sizes, Apple touch and Android app icons.
- `maskable-512x512.png` reserves the central safe zone.
- `safari-pinned-tab.svg`: monochrome mask.

Keep clear space equal to at least one quarter of the standalone mark's width. Recommended minimum wordmark width: 120 px. Do not add shadows, blur, gradients or stretch the geometry. Use the standalone A favicon at 16 px rather than shrinking the ring mark.

## Integration

Copy the favicon directory contents into each app's public directory. Add the corresponding links from `integration/head.html` to each app's index.html, replacing its current favicon link. The landing and admin currently reference `/favicon.svg`; chat references `/aura-icon.svg`. Either update chat to `/favicon.svg` or keep an identical compatibility copy at `/aura-icon.svg` during migration. Do not leave divergent artwork behind.

Copy canonical logos to `assets/brand/` and distribute build copies into app public directories. Update existing `logo.svg`, `logo-horizontal.svg`, `logo-with-text.svg` and `logo-glow.svg` references deliberately, preserving intended dimensions and background variants. The admin Sidebar uses `favicon.svg` today: use the full mark there at 32–36 px instead.

Root paths in head.html assume deployment at `/`. For a subpath deployment, prefix all URLs with that app's configured base path. The manifest uses relative icon paths and leaves start_url/scope to each app. Choose those deliberately before enabling installability. Maskable backgrounds are intentionally square to allow platform clipping.

## Typography and provenance

Original A path: UmaiTech/aura-llm-gateway/assets/logo.svg (MIT-licensed repository).
Wordmark: Fraunces 600, sourced from the Google Fonts stylesheet already used by the app. Fraunces is an open-source font. Only outlined artwork is distributed here, not the font binary.

This is a design proposal, not a trademark search or legal clearance. The accompanying PowerPoint contains the system guidance and website/dashboard/chat concepts.
