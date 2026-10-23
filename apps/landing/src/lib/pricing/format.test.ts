import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtAge, fmtCount, fmtDate, fmtTokens } from './format.ts'

test('token counts', () => {
  assert.equal(fmtTokens(null), '—')
  assert.equal(fmtTokens(128_000), '128K')
  assert.equal(fmtTokens(1_000_000), '1M')
  assert.equal(fmtTokens(1_048_576), '1.0M')
  assert.equal(fmtTokens(512), '512')
  assert.equal(fmtCount(1_000_000), '1,000,000')
})

test('dates are shown in UTC and tolerate missing values', () => {
  assert.equal(fmtDate('2026-10-20T03:00:00Z'), 'Oct 20, 2026')
  assert.equal(fmtDate(null), 'never')
  assert.equal(fmtDate('not a date'), 'unknown')
  assert.equal(fmtAge(0), 'today')
  assert.equal(fmtAge(9), '9 days ago')
  assert.equal(fmtAge(null), 'age unknown')
})
