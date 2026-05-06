# Deployment Guide

This document covers deploying the Aura **frontend apps** (landing page +
docs) to Vercel. The Rust gateway itself is deployed separately — see
[architecture.md](architecture.md) and the root `Dockerfile`.

> **Scope of this guide.** Currently this covers `apps/landing` only,
> which embeds the documentation as MDX content. The chat playground
> (`apps/chat`) and the admin dashboard ship in follow-up PRs once
> authentication is wired up — see "Coming next" at the bottom.

## Topology

```
                 ┌────────────────────────────┐
                 │  aura.dev (or chosen dom.) │ ◄── Vercel project: aura-landing
                 │  Marketing site + /docs    │     Source: apps/landing
                 └────────────┬───────────────┘
                              │
                              │  links to
                              ▼
              ┌──────────────────────────────────┐
              │  api.aura.dev (or self-hosted)   │ ◄── Rust gateway (Docker / K8s)
              │  Open Responses API              │
              └──────────────────────────────────┘

                 (chat.aura.dev — coming in a follow-up PR, gated by auth)
```

## Prerequisites

- A Vercel account with permission to create projects in your org
- This repo connected to Vercel via the
  [GitHub integration](https://vercel.com/docs/git/vercel-for-github)
- A custom domain (optional but recommended) configured at your registrar
  with DNS managed by Vercel or pointing `CNAME` records at Vercel

## Deploying `apps/landing`

The landing app is a Vite + React SPA with React Router and MDX-rendered
docs. It has **no runtime environment variables** and **no backend** —
everything is rendered client-side.

### 1. Create the Vercel project

1. Go to **Vercel → Add New → Project**.
2. Import the `UmaiTech/aura-llm-gateway` repository.
3. On the configuration screen, set **Root Directory** to:

   ```
   apps/landing
   ```

4. Leave the framework preset as **Vite** (Vercel will auto-detect).
   The build command, install command, and output directory are read from
   [`apps/landing/vercel.json`](../apps/landing/vercel.json).
5. Click **Deploy**.

The first deploy uses Vercel's `*.vercel.app` URL. Once it works, point a
custom domain at it.

### 2. Custom domain

1. In the Vercel project, go to **Settings → Domains**.
2. Add your domain (e.g. `aura.dev` and `www.aura.dev`).
3. Follow the prompts to either:
   - Switch DNS to Vercel nameservers, **or**
   - Add `CNAME`/`A` records at your existing DNS provider.
4. HTTPS certificates are issued automatically.

The HSTS header in `vercel.json` includes `preload` — if you add the
domain to the [HSTS preload list](https://hstspreload.org/), browsers
will hard-pin HTTPS for it. Only do this once you're confident every
subdomain serves HTTPS, since reverting takes weeks.

### 3. Branch deploys

Vercel creates a preview deployment for every PR by default. The previews
inherit the production `vercel.json`, which means CSP and other security
headers are exercised on previews too — useful for catching policy issues
before they hit production.

To restrict who can view previews, enable **Vercel Authentication** under
**Settings → Deployment Protection → Vercel Authentication**.

### 4. Analytics (optional)

Vercel offers two products that drop in with zero code:

- **Web Analytics** — page views, referrers, top countries
- **Speed Insights** — Core Web Vitals from real users

Both can be enabled from the project's **Analytics** tab. The current
Content-Security-Policy in `vercel.json` does not allow third-party
analytics scripts; if you enable Vercel Analytics you'll need to add
`https://va.vercel-scripts.com` to `script-src` and `connect-src`.

## Environment variables

`apps/landing` currently needs **no environment variables** at runtime —
all content is bundled at build time. The placeholder file
[`apps/landing/.env.example`](../apps/landing/.env.example) documents
the optional analytics keys you might add later (it doesn't exist yet
because there's nothing to put in it).

## Security headers

`apps/landing/vercel.json` ships the following hardening headers on all
responses:

| Header | Value | Why |
| --- | --- | --- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Force HTTPS for 2 years |
| `X-Content-Type-Options` | `nosniff` | Block MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Strip referer on cross-origin |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Disable unused powerful APIs + opt out of FLoC |
| `Content-Security-Policy` | (see file) | Restrict script/style/image origins |

The CSP currently allows:

- `script-src 'self' 'unsafe-inline' 'unsafe-eval'` — Mermaid still uses
  `eval` to compile diagram definitions; tighten this once Mermaid moves
  to a stricter loader, or drop Mermaid for static SVG renders.
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` —
  Google Fonts' stylesheet plus inline styles emitted by React libraries.
- `font-src 'self' https://fonts.gstatic.com data:` — Google Fonts files.
- `connect-src 'self' https://api.github.com` — GitHub API for the
  "stars" widget if/when one is added; trim if not used.

If you add **analytics, monitoring, or third-party widgets**, you must
extend the CSP to allow their origins, or the browser will silently
block them.

## Caching

The `vercel.json` caching rules:

- **`/assets/*`** (Vite-emitted hashed JS/CSS): immutable, 1 year
- **Other static assets** (svg, png, fonts, etc.): 1 week, must revalidate
- **HTML / manifest / robots / sitemap**: 0 max-age, must revalidate

This is the standard Vite + SPA pattern: aggressive caching on
content-hashed assets, no caching on the entry HTML so deploys take
effect immediately.

## Troubleshooting

**Routes 404 on refresh.**
The `rewrites` block in `vercel.json` falls all non-asset paths through
to `index.html` so React Router can take over. If you see 404s on a
fresh page load, confirm the rewrite rule wasn't dropped during a config
edit.

**CSP errors in the console.**
Open DevTools → Console and look for `Refused to load …`. Add the
blocked origin to the appropriate CSP directive (`script-src`,
`connect-src`, etc.) in `vercel.json` and redeploy.

**Build fails with "Could not resolve …".**
The MDX setup pulls in `@mdx-js/rollup`. Make sure the **Root Directory**
is set to `apps/landing` so Vercel runs `npm install` against the right
`package.json`.

**`vercel.json` settings ignored.**
Vercel reads `vercel.json` from the **Root Directory**, not the repo
root. If you set Root Directory to the repo root by mistake, the config
won't be applied.

## Coming next

The follow-up PR will deploy:

- **`apps/chat`** — chat playground gated by BetterAuth (GitHub +
  Google). Requires consolidating the current build-time
  `VITE_AURA_API_KEY` into a session-scoped key, plus a new Vercel
  project with Postgres for BetterAuth tables.
- **Admin dashboard** — gated by the same auth, scoped to organization
  admins.

See the tracking issue for the chat-auth work in
[`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) once it's open.
