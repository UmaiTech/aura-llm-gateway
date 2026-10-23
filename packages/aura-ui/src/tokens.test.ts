// Keeps tokens.css in step with the design pack's design-tokens.json.
// Run with `npm test` in packages/aura-ui (node --test, no dependencies).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const pack = JSON.parse(
  readFileSync(new URL('../../../docs/design/aura-pack-v3/handoff/design-tokens.json', import.meta.url), 'utf8'),
) as Record<string, Record<string, string>> & { spacing: number[]; radii: Record<string, number>; contentMaxWidth: number }

/** Custom properties declared in the first block opened by `selector`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  assert.ok(start >= 0, `missing ${selector} block`)
  const body = css.slice(start, css.indexOf('}', start))
  return new Map([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

function hexToRgb(hex: string): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ')
}

const COLOR_KEYS: Array<[string, string]> = [
  ['bg', 'bg'],
  ['surface', 'surface'],
  ['surface2', 'surface-2'],
  ['hover', 'hover'],
  ['text', 'text'],
  ['muted', 'muted'],
  ['dim', 'dim'],
  ['border', 'border'],
  ['accent', 'accent'],
  ['action', 'action'],
  ['green', 'green'],
  ['amber', 'amber'],
  ['red', 'red'],
]

for (const [theme, selector] of [
  ['light', ':root'],
  ['dark', '.dark'],
] as const) {
  test(`${theme} palette matches design-tokens.json`, () => {
    const vars = block(selector)
    for (const [packKey, cssKey] of COLOR_KEYS) {
      assert.equal(vars.get(`aura-rgb-${cssKey}`), hexToRgb(pack[theme][packKey]), `${theme}.${packKey}`)
    }
    assert.equal(vars.get('aura-accent-soft')?.toLowerCase(), pack[theme]['accent-soft'].toLowerCase())
    assert.equal(vars.get('aura-shadow'), pack[theme].shadow)
  })
}

test('spacing, radii and content width match design-tokens.json', () => {
  const css2 = css.slice(css.lastIndexOf(':root {'))
  const vars = new Map([...css2.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
  pack.spacing.forEach((px, i) => assert.equal(vars.get(`aura-space-${i + 1}`), `${px}px`))
  assert.equal(vars.get('aura-radius-control'), `${pack.radii.control}px`)
  assert.equal(vars.get('aura-radius-panel'), `${pack.radii.panel}px`)
  assert.equal(vars.get('aura-content-max'), `${pack.contentMaxWidth}px`)
})
