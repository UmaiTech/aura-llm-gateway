# Releasing `aura-llm` (TypeScript SDK)

The SDK is versioned **independently** from the gateway and published to npm as
a public package. Releases are triggered by a GitHub Release tagged
`sdk-ts-v<version>` (e.g. `sdk-ts-v0.1.0`), which runs the `publish` job in
`.github/workflows/sdk-typescript.yml`.

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

This lets CI publish with no `NPM_TOKEN` secret.

### 3. GitHub `npm` environment

In repo **Settings → Environments → npm**:

- No secrets / variables needed (OIDC).
- **Deployment branches and tags:** restrict to the tag pattern `sdk-ts-v*`.
- (Optional) add **Required reviewers** for a manual gate before each publish.

## Cutting a release (after bootstrap)

1. Bump `version` in `package.json` and add a `CHANGELOG.md` entry.
2. Commit + merge to `main`.
3. Tag and publish a GitHub Release:
   ```bash
   gh release create sdk-ts-v0.1.1 --title "TS SDK v0.1.1" --notes "…"
   ```
4. The `publish` job builds, tests, and runs `npm publish --provenance`
   (signed SLSA attestation) automatically.

## Fallback: token-based publishing

If you can't use OIDC, add an automation `NPM_TOKEN` as an **environment
secret** on the `npm` environment and change the publish step to:

```yaml
- run: npm publish --provenance --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```
