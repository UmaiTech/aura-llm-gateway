// The landing's provider list must match the gateway's Provider
// implementations, so the published count is never guessed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { SUPPORTED_PROVIDERS } from './providers.ts'

const dir = new URL('../../../../crates/aura-core/src/provider/', import.meta.url)

function gatewayProviders(): string[] {
  const names: string[] = []
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.rs') && f !== 'mod.rs')) {
    const src = readFileSync(new URL(file, dir), 'utf8')
    const m = src.match(/fn name\(&self\) -> &str \{\s*"([a-z0-9_-]+)"/)
    if (m) names.push(m[1])
  }
  return names.sort()
}

test('SUPPORTED_PROVIDERS matches the gateway provider implementations', () => {
  assert.deepEqual(SUPPORTED_PROVIDERS.map((p) => p.id).sort(), gatewayProviders())
})

test('provider docs links point at existing docs pages', () => {
  for (const p of SUPPORTED_PROVIDERS.filter((p) => p.docs)) {
    const slug = p.docs!.replace('/docs/', '')
    const exists = ['.md', '.mdx'].some((ext) => {
      try {
        readFileSync(new URL(`../content/${slug}${ext}`, import.meta.url))
        return true
      } catch {
        return false
      }
    })
    assert.ok(exists, `${p.docs} has no content file`)
  }
})
