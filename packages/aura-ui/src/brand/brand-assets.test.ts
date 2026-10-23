// One artwork everywhere: every app ships byte-identical copies of the
// canonical favicon family in assets/brand/favicons, and the React marks
// use the same geometry as the canonical SVGs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { A_PATH, A_TRANSFORM, LETTERING, LETTERING_TRANSFORM } from './geometry.ts'

const root = new URL('../../../../', import.meta.url)
const canonical = new URL('assets/brand/favicons/', root)
const files = readdirSync(canonical).filter((f) => f !== 'site.webmanifest')

for (const app of ['landing', 'chat', 'admin']) {
  test(`${app} ships the canonical favicon family`, () => {
    for (const file of files) {
      const copy = readFileSync(new URL(`apps/${app}/public/${file}`, root))
      assert.ok(copy.equals(readFileSync(new URL(file, canonical))), `apps/${app}/public/${file} differs from assets/brand/favicons/${file}`)
    }
  })
}

test('chat keeps /aura-icon.svg only as an identical compatibility copy', () => {
  const compat = readFileSync(new URL('apps/chat/public/aura-icon.svg', root))
  assert.ok(compat.equals(readFileSync(new URL('favicon.svg', canonical))))
})

test('BrandMark and Wordmark geometry matches the canonical SVGs', () => {
  for (const variant of ['dark', 'light', 'white', 'black']) {
    const svg = readFileSync(new URL(`assets/brand/aura-wordmark-${variant}.svg`, root), 'utf8')
    assert.ok(svg.includes(`transform="${A_TRANSFORM}" d="${A_PATH}"`), `${variant}: A mark`)
    assert.ok(svg.includes(`transform="${LETTERING_TRANSFORM}"`), `${variant}: lettering transform`)
    for (const glyph of LETTERING) {
      assert.ok(svg.includes(`<path d="${glyph.d}" transform="${glyph.transform}"/>`), `${variant}: glyph ${glyph.transform}`)
    }
  }
})
