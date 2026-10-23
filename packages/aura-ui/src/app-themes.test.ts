// apps/chat and apps/admin keep their shadcn-style HSL variables (their
// Tailwind configs wrap them in hsl()), but the values must be the design
// tokens. This catches a token change that is not carried into the apps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pack = JSON.parse(
  readFileSync(new URL('../../../docs/design/aura-pack-v3/handoff/design-tokens.json', import.meta.url), 'utf8'),
) as Record<'dark' | 'light', Record<string, string>>

function hexToRgb(hex: string): number[] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function hslToRgb(triplet: string): number[] {
  const [h, s, l] = triplet.replace(/%/g, '').split(/\s+/).map(Number)
  const sat = s / 100
  const lig = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255))
}

function vars(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  assert.ok(start >= 0, `missing ${selector}`)
  const body = css.slice(start, css.indexOf('}', start))
  return new Map([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

// shadcn variable → design token key
const MAPPING: Array<[string, string]> = [
  ['background', 'bg'],
  ['foreground', 'text'],
  ['card', 'surface'],
  ['secondary', 'surface2'],
  ['muted', 'surface2'],
  ['muted-foreground', 'muted'],
  ['accent', 'hover'],
  ['border', 'border'],
  ['primary', 'action'],
  ['ring', 'accent'],
]

const APPS: Array<[string, string]> = [
  ['chat', '../../../apps/chat/src/index.css'],
  ['admin', '../../../apps/admin/src/styles/globals.css'],
]

for (const [app, file] of APPS) {
  const css = readFileSync(new URL(file, import.meta.url), 'utf8')
  for (const [theme, selector] of [
    ['light', ':root'],
    ['dark', '.dark'],
  ] as const) {
    test(`${app} ${theme} theme variables match the design tokens`, () => {
      const v = vars(css, selector)
      for (const [name, token] of MAPPING) {
        const actual = hslToRgb(v.get(name) ?? 'missing')
        const expected = hexToRgb(pack[theme][token])
        // HSL rounding to whole numbers drifts a channel by a few units.
        actual.forEach((c, i) =>
          assert.ok(Math.abs(c - expected[i]) <= 4, `${app} ${theme} --${name}: ${actual} vs ${token} ${expected}`),
        )
      }
    })
  }
}
