// A stale tab reloads once to pick up the new deploy's chunks, never in a loop.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claimStaleChunkReload } from './staleChunk.ts'

function memoryStore() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

test('first failure is allowed to reload', () => {
  assert.equal(claimStaleChunkReload(memoryStore(), 1_000_000), true)
})

test('a second failure right after the reload shows the error instead', () => {
  const store = memoryStore()
  assert.equal(claimStaleChunkReload(store, 1_000_000), true)
  assert.equal(claimStaleChunkReload(store, 1_005_000), false)
})

test('a later deploy can trigger another reload', () => {
  const store = memoryStore()
  assert.equal(claimStaleChunkReload(store, 1_000_000), true)
  assert.equal(claimStaleChunkReload(store, 1_000_000 + 60_000), true)
})

test('blocked storage never reloads', () => {
  const store = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {},
  }
  assert.equal(claimStaleChunkReload(store, 1_000_000), false)
})
