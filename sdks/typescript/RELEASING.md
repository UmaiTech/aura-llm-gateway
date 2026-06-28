# Releasing `aura-llm` (TypeScript SDK)

The SDK is versioned **in lockstep with the gateway** and published to npm as a
public package, the same way the Python SDK publishes to PyPI.

**You do not tag the SDK manually.** When `release-plz` opens its
`chore: release vX.Y.Z` PR, a step in `.github/workflows/release-plz.yml`
("Sync SDK versions") bumps `sdks/typescript/package.json` (and the Python
`pyproject.toml`) to the new workspace version inside that PR. When the release
PR merges, release-plz creates the `vX.Y.Z` GitHub Release, which fires the
`publish` job in `.github/workflows/sdk-typescript.yml` → `npm publish`.

The publish step is a **no-op if the version already exists** on npm (mirrors
PyPI `skip-existing`), so an SDK-unchanged release won't fail.

## One-time setup (bootstrap)

npm trusted publishing (OIDC) can only be configured for a package that
**already exists**, so the very first publish is manual:

### 1. First manual publish (reserves the name)

```bash
cd sdks/typescript
npm login                    # account with rights to publish public packages
npm install && npm run build
npm publish --access public  # publishes aura-llm@<version>, claims the name
```

### 2. Configure trusted publishing on npmjs.com

On the `aura-llm` package → **Settings → Trusted Publisher**, add a GitHub
Actions publisher:

- **Repository:** `UmaiTech/aura-llm-gateway`
- **Workflow:** `sdk-typescript.yml`
- **Environment:** `npm`

This lets CI publish with no `NPM_TOKEN` secret. (Done.)

### 3. GitHub `npm` environment

In repo **Settings → Environments → npm**:

- No secrets / variables needed (OIDC).
- **Deployment branches and tags:** restrict to the tag pattern `v*` (the
  workspace release tags that release-plz creates).
- (Optional) add **Required reviewers** for a manual gate before each publish.

## Cutting a release

There is **no manual SDK release step** — it rides the gateway release:

1. `release-plz` opens a `chore: release vX.Y.Z` PR; the
   "Sync SDK versions" step in `release-plz.yml` bumps
   `package.json` to `X.Y.Z` inside that PR.
2. Review/merge the release PR (also review `CHANGELOG.md` per the project's
   release rules — frontend/SDK commits are often dropped by the
   auto-generator).
3. release-plz creates the `vX.Y.Z` GitHub Release, which triggers the
   `publish` job → `npm publish --provenance` (skipped if the version already
   exists on npm).

To add SDK-specific changelog notes, edit `sdks/typescript/CHANGELOG.md` in the
release PR before merging.

## Fallback: token-based publishing

If you can't use OIDC, add an automation `NPM_TOKEN` as an **environment
secret** on the `npm` environment and change the publish step to:

```yaml
- run: npm publish --provenance --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```
