import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aliasMode, parseCatalog, resolveModels } from './catalog.ts'
import type { Model } from './types.ts'

const builtIn: Model[] = [
  { id: 'auto', name: 'Auto', provider: 'aura', tier: 'free' },
  { id: 'auto:cost', name: 'Auto cost', provider: 'aura', tier: 'free' },
  { id: 'auto:quality', name: 'Auto quality', provider: 'aura', tier: 'free' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'openai', tier: 'free' },
]

// Shape of GET /v1/models (crates/aura-proxy/src/routes/models.rs).
const body = {
  object: 'list',
  data: [
    { id: 'auto', object: 'model', owned_by: 'aura', aura: {} },
    { id: 'auto:cost', object: 'model', owned_by: 'aura', aura: {} },
    { id: 'gpt-5.4-mini', object: 'model', owned_by: 'openai', aura: { tier: 'medium' } },
  ],
  auto: {
    enabled: true,
    shadow_for_pinned_models: true,
    default_mode: 'balanced',
    aliases: ['auto', 'auto:cost', 'auto:balanced', 'auto:quality'],
    tiers: { simple: [], medium: ['gpt-5.4-mini'], complex: [], reasoning: [] },
  },
}

test('parses the catalog and its auto description', () => {
  const c = parseCatalog(body)!
  assert.equal(c.autoEnabled, true)
  assert.deepEqual(c.autoAliases, ['auto', 'auto:cost', 'auto:balanced', 'auto:quality'])
  assert.equal(c.defaultMode, 'balanced')
  assert.equal(c.shadowForPinned, true)
  assert.ok(c.modelIds.has('gpt-5.4-mini'))
})

test('rejects bodies that are not a model list', () => {
  assert.equal(parseCatalog(null), null)
  assert.equal(parseCatalog({ error: { code: 'unauthorized' } }), null)
  assert.equal(parseCatalog('nope'), null)
})

test('auto off (no auto object or enabled=false): no auto aliases offered', () => {
  const none = parseCatalog({ object: 'list', data: [] })!
  assert.equal(none.autoEnabled, false)
  assert.deepEqual(resolveModels(builtIn, none).map((m) => m.id), ['gpt-5.4-mini'])
  const off = parseCatalog({ ...body, auto: { ...body.auto, enabled: false } })!
  assert.deepEqual(off.autoAliases, [])
  assert.deepEqual(resolveModels(builtIn, off).map((m) => m.id), ['gpt-5.4-mini'])
})

test('auto on: aliases come from the gateway, first, without a duplicate balanced entry', () => {
  const models = resolveModels(builtIn, parseCatalog(body))
  assert.deepEqual(
    models.map((m) => m.id),
    ['auto', 'auto:cost', 'auto:quality', 'gpt-5.4-mini'],
  )
  assert.equal(models[0].name, 'Auto · balanced')
  assert.match(models[1].description ?? '', /cheaper tiers/)
})

test('a non-balanced gateway default keeps auto:balanced and labels plain auto', () => {
  const models = resolveModels(builtIn, parseCatalog({ ...body, auto: { ...body.auto, default_mode: 'cost' } }))
  assert.ok(models.some((m) => m.id === 'auto:balanced'))
  assert.equal(models[0].name, 'Auto · cost (gateway default)')
})

test('no catalog (fetch failed): the built-in list is used unchanged', () => {
  assert.deepEqual(resolveModels(builtIn, null), builtIn)
})

test('aliasMode', () => {
  assert.equal(aliasMode('auto'), 'balanced')
  assert.equal(aliasMode('auto', 'quality'), 'quality')
  assert.equal(aliasMode('auto:cost'), 'cost')
})
