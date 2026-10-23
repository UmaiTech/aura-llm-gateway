// The public roadmap must agree with CHANGELOG.md: released items carry a
// version, date and evidence that match a CHANGELOG release, the newest
// release shown is the newest in the CHANGELOG, and proposals carry no dates.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LATEST_RELEASE,
  LEGACY_MILESTONES,
  RECONCILED,
  RELEASES,
  ROADMAP,
  changelogAnchor,
  matchesFilter,
} from './roadmap.ts'
import { SUPPORTED_PROVIDERS } from './providers.ts'

const changelog = readFileSync(new URL('../../../../CHANGELOG.md', import.meta.url), 'utf8')

/** version -> date for every `## [x.y.z] - yyyy-mm-dd` heading, in file order. */
const releases = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})\s*$/gm)].map((m) => ({
  version: m[1],
  date: m[2],
}))
const releaseDate = new Map(releases.map((r) => [r.version, r.date]))

const semver = (v: string) => v.split('.').map(Number)
const newer = (a: string, b: string) => {
  const [x, y] = [semver(a), semver(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

/** GitHub heading anchor, for checking changelogAnchor(). */
const githubSlug = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s/g, '-')

test('CHANGELOG has release headings to check against', () => {
  assert.ok(releases.length > 10)
})

test('changelogAnchor matches GitHub heading anchors', () => {
  assert.equal(changelogAnchor('0.20.0', '2026-10-22'), githubSlug('[0.20.0] - 2026-10-22'))
})

test('the newest release shown is the newest CHANGELOG release', () => {
  const newest = releases.reduce((a, b) => (newer(b.version, a.version) ? b : a))
  assert.equal(LATEST_RELEASE.version, newest.version)
  assert.equal(LATEST_RELEASE.date, newest.date)
})

test('listed releases exist in the CHANGELOG with the same date, newest first', () => {
  for (const r of RELEASES) assert.equal(releaseDate.get(r.version), r.date, `release ${r.version}`)
  for (let i = 1; i < RELEASES.length; i++) {
    assert.ok(newer(RELEASES[i - 1].version, RELEASES[i].version), `${RELEASES[i - 1].version} before ${RELEASES[i].version}`)
  }
})

test('released items have version, CHANGELOG date and evidence', () => {
  for (const item of ROADMAP.filter((i) => i.status === 'released')) {
    assert.ok(item.releasedVersion, `${item.id}: releasedVersion`)
    assert.ok(item.releasedAt, `${item.id}: releasedAt`)
    assert.ok(item.evidenceLinks.length > 0, `${item.id}: evidence`)
    assert.equal(releaseDate.get(item.releasedVersion!), item.releasedAt, `${item.id}: ${item.releasedVersion} date`)
    assert.ok(RELEASES.some((r) => r.version === item.releasedVersion), `${item.id}: version not in RELEASES`)
  }
})

test('merged-but-unreleased items have evidence and no release fields', () => {
  for (const item of ROADMAP.filter((i) => i.status === 'merged-unreleased')) {
    assert.ok(item.evidenceLinks.length > 0, `${item.id}: evidence`)
    assert.equal(item.releasedVersion, undefined, item.id)
    assert.equal(item.releasedAt, undefined, item.id)
  }
  if (ROADMAP.some((i) => i.evidenceLinks.some((l) => l.href.endsWith('CHANGELOG.md#unreleased')))) {
    assert.match(changelog, /^## \[unreleased\]/im, 'CHANGELOG has no Unreleased section')
  }
})

test('planned and considering items carry no dates or versions', () => {
  const datePattern = /\b(20\d\d|Q[1-4]|January|February|March|April|June|July|August|September|October|November|December)\b/
  for (const item of ROADMAP.filter((i) => i.status === 'planned' || i.status === 'considering')) {
    assert.equal(item.releasedVersion, undefined, item.id)
    assert.equal(item.releasedAt, undefined, item.id)
    assert.doesNotMatch(`${item.title} ${item.description}`, datePattern, `${item.id} mentions a date`)
  }
})

test('every evidence link points at the project repository', () => {
  for (const item of ROADMAP) {
    for (const link of item.evidenceLinks) {
      assert.match(link.href, /^https:\/\/github\.com\/UmaiTech\/aura-llm-gateway\//, `${item.id}: ${link.href}`)
      const anchor = link.href.match(/CHANGELOG\.md#(\d+---\d{4}-\d{2}-\d{2})$/)
      if (anchor) {
        const ok = releases.some((r) => changelogAnchor(r.version, r.date) === anchor[1])
        assert.ok(ok, `${item.id}: ${link.href} matches no CHANGELOG heading`)
      }
    }
  }
})

test('ids are unique', () => {
  const ids = ROADMAP.map((i) => i.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('archived milestones match the first CHANGELOG release of their minor line', () => {
  for (const m of LEGACY_MILESTONES) {
    assert.equal(releaseDate.get(m.changelogVersion), m.releasedAt, `${m.version}: ${m.changelogVersion}`)
    const minor = m.version.replace(/^v/, '')
    assert.ok(m.changelogVersion.startsWith(`${minor}.`), `${m.version} vs ${m.changelogVersion}`)
    const firstOfLine = releases.filter((r) => r.version.startsWith(`${minor}.`)).sort((a, b) => (newer(a.version, b.version) ? 1 : -1))[0]
    assert.equal(firstOfLine.version, m.changelogVersion, `${m.version} should cite ${firstOfLine.version}`)
  }
  const oldestShown = RELEASES[RELEASES.length - 1].version
  for (const m of LEGACY_MILESTONES) assert.ok(newer(oldestShown, m.changelogVersion), `${m.version} overlaps the release list`)
})

test('nothing still proposed is an already supported provider', () => {
  const pending = ROADMAP.filter((i) => i.area === 'providers' && i.status !== 'released' && i.status !== 'merged-unreleased')
  assert.ok(pending.length > 0)
  for (const p of SUPPORTED_PROVIDERS) {
    // "Azure OpenAI" is a different provider from OpenAI.
    const name = new RegExp(`(?<!azure )\\b${p.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    for (const item of pending) {
      assert.doesNotMatch(`${item.title} ${item.description}`, name, `${item.id} lists ${p.label}, which already ships`)
    }
  }
})

test('status filter groups', () => {
  const count = (f: Parameters<typeof matchesFilter>[1]) => ROADMAP.filter((i) => matchesFilter(i, f)).length
  assert.equal(count('all'), ROADMAP.length)
  assert.equal(count('released') + count('merged') + count('proposed'), ROADMAP.length)
})

test('reconciliation metadata is recorded', () => {
  assert.match(RECONCILED.date, /^\d{4}-\d{2}-\d{2}$/)
  assert.match(RECONCILED.revision, /^[0-9a-f]{7,40}$/)
})
