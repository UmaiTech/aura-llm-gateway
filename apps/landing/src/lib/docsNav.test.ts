// Docs navigation: every entry-path card and sidebar link must land on an
// existing content file, and every #anchor on a heading in that file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DOC_SECTIONS,
  ENTRY_PATHS,
  contentSlug,
  markdownHeadings,
  routeForContentFile,
  slugify,
} from './docsNav.ts'

const contentDir = new URL('../content/', import.meta.url)

function readContent(route: string): string | null {
  const slug = contentSlug(route)
  if (slug === null) return null
  for (const candidate of [`${slug}.mdx`, `${slug}.md`, `${slug}/index.mdx`, `${slug}/index.md`]) {
    try {
      return readFileSync(new URL(candidate, contentDir), 'utf8')
    } catch {
      // try the next candidate
    }
  }
  return null
}

test('slugify matches GitHub-style heading anchors', () => {
  assert.equal(slugify('Modes and options'), 'modes-and-options')
  assert.equal(slugify('Runtime settings from the admin app'), 'runtime-settings-from-the-admin-app')
  assert.equal(slugify('`routing` options'), 'routing-options')
  assert.equal(slugify('Docker Compose (Recommended for Small Deployments)'), 'docker-compose-recommended-for-small-deployments')
})

test('content files map to the routes the docs page serves', () => {
  assert.equal(routeForContentFile('../content/index.md'), '/docs')
  assert.equal(routeForContentFile('../content/api/index.md'), '/docs/api')
  assert.equal(routeForContentFile('../content/api/auto-routing.md'), '/docs/api/auto-routing')
  assert.equal(contentSlug('/docs/api'), 'api')
})

test('there are Start, Route, Operate and Reference entry paths', () => {
  const titles = ENTRY_PATHS.map((p) => p.title)
  for (const t of ['Start', 'Route', 'Operate', 'Reference']) assert.ok(titles.includes(t), `missing ${t}`)
})

test('every entry-path link resolves to a content file and heading', () => {
  for (const path of ENTRY_PATHS) {
    assert.ok(path.links.length > 0, `${path.title} has no links`)
    for (const link of path.links) {
      const content = readContent(link.href)
      assert.ok(content !== null, `${path.title}: ${link.href} has no content file`)
      const anchor = link.href.split('#')[1]
      if (anchor) {
        const slugs = markdownHeadings(content!, [2, 3, 4]).map(slugify)
        assert.ok(slugs.includes(anchor), `${link.href}: no heading with anchor #${anchor}`)
      }
    }
  }
})

test('every sidebar docs link resolves to a content file', () => {
  for (const section of DOC_SECTIONS) {
    for (const item of section.items) {
      if (item.external || item.standalone) continue
      assert.ok(readContent(item.path) !== null, `${section.title}: ${item.path} has no content file`)
    }
  }
})
