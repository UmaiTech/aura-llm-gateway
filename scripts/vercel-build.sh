#!/usr/bin/env bash
# Vercel build orchestrator for the gateway project.
#
# Builds three Vite apps (landing, chat, admin), then assembles them
# into one output directory (apps/landing/dist) under separate path
# prefixes so the gateway project can serve:
#   - aura-llm.dev           -> /          (landing)
#   - playground.aura-llm.dev -> /playground (chat SPA, base: '/playground/')
#   - app.aura-llm.dev        -> /app       (admin SPA, base: '/app/')
#
# Lives outside vercel.json because the Vercel schema caps buildCommand
# at 256 chars and the full chain is ~330.
#
# vercel.json points at this script via:
#   "buildCommand": "bash scripts/vercel-build.sh"

set -euo pipefail

echo "==> Installing root deps (for /api functions)"
npm install

for app in landing chat admin; do
  echo "==> Building apps/${app}"
  (cd "apps/${app}" && npm install && npm run build)
done

echo "==> Assembling combined output under apps/landing/dist"
mkdir -p apps/landing/dist/playground apps/landing/dist/app
cp -R apps/chat/dist/. apps/landing/dist/playground/
cp -R apps/admin/dist/. apps/landing/dist/app/

echo "==> Build complete"
