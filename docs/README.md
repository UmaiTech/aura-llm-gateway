# Aura LLM Gateway — Documentation

> **Looking for user-facing docs (quickstart, API reference, SDKs, providers)?**
> See **[docs.aura-llm.dev](https://docs.aura-llm.dev)** — that's the authoritative
> documentation site, rendered from [`apps/landing/src/content/`](../apps/landing/src/content/).

This directory holds **contributor and operator** documentation that lives alongside
the source code: architecture, deployment manifests, and internal planning docs.

## Layout

```
docs/
├── api/             API reference (mirrored on docs.aura-llm.dev)
├── architecture/    System design and provider routing internals
├── deployment/      Docker, Helm, Kubernetes deployment guides
└── internal/        Planning docs, roadmap notes, and historical decisions
```

## Quick links

### For operators

- [Deploying with Fly.io](./deployment/fly.md) — cheapest path for a hosted demo (~$10/mo)
- [Deploying with Helm](./deployment/helm.md) — install on any Kubernetes cluster
- [Deploying with Docker](./deployment/docker.md) — single-container deploy
- [Configuration reference](../config.example.yaml) — every supported config key

### For contributors

- [Architecture overview](./architecture/overview.md) — crate layout, request flow
- [Provider mapping](./architecture/provider-mapping.md) — how model → provider routing works
- [CLAUDE.md](../CLAUDE.md) — conventions for AI-assisted contributions
- [CONTRIBUTING.md](../.github/CONTRIBUTING.md) — PR process and commit conventions

### For API users

- [API reference index](./api/README.md) — but prefer [docs.aura-llm.dev](https://docs.aura-llm.dev) for the rendered version

### Internal / planning

- [Implementation plan](./internal/implementation-plan.md) — multi-milestone roadmap, historical
- [Admin app plan](./internal/admin-app-plan.md) — admin dashboard design notes
- [Pricing scraper design](./internal/pricing-scraper.md) — planned automation
- [Team members](./internal/team-members.md) — contact list

## Why two sets of docs?

The `apps/landing/src/content/` files are MDX rendered as an interactive docs site
with search, syntax highlighting, and live components. The `docs/` files at the
repo root are plain markdown for GitHub browsing, code reviews, and AI assistants
that read the repo directly. We aim to keep them aligned — when in doubt, the
rendered site at docs.aura-llm.dev is the source of truth for user-facing material.
