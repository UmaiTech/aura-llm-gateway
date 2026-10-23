// Drift check between docs pages and their canonical source.
//
// docs/api/auto-routing.md is the canonical, complete reference. The docs
// site page (src/content/api/auto-routing.md) is a shorter public guide to
// the same feature, so the two are not byte-identical by design. What must
// not drift:
//   1. Sections present in both (same heading) say the same thing.
//   2. Every identifier the guide puts in `code` (options, fields, env
//      vars, endpoints, metrics, aliases) exists in the canonical reference,
//      so a rename made on one side fails here.
// When this fails, change the canonical file first, then carry the change
// into the guide.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CANONICAL_SOURCES, contentSlug } from './docsNav.ts'

const repoRoot = new URL('../../../../', import.meta.url)
const read = (rel: string) => readFileSync(new URL(rel, repoRoot), 'utf8')

function stripFrontmatter(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n/, '')
}

/** Heading -> body blocks (paragraphs, list/table runs, whole fences). */
function sections(md: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  let current: string[] | null = null
  let buf: string[] = []
  let fenced = false
  const flush = () => {
    const text = buf.join('\n').replace(/\s+/g, ' ').trim()
    if (current && text) current.push(text)
    buf = []
  }
  for (const line of stripFrontmatter(md).split('\n')) {
    if (/^\s*```/.test(line)) {
      if (!fenced) flush()
      buf.push(line)
      fenced = !fenced
      if (!fenced) flush()
      continue
    }
    if (!fenced) {
      const h = line.match(/^#{2,3} (.+)$/)
      if (h) {
        flush()
        current = []
        out.set(h[1].trim(), current)
        continue
      }
      if (line.trim() === '') {
        flush()
        continue
      }
    }
    buf.push(line)
  }
  flush()
  return out
}

/** Inline-code identifiers outside fenced blocks. */
function inlineCode(md: string): string[] {
  const prose = stripFrontmatter(md).replace(/```[\s\S]*?```/g, '')
  return [...new Set([...prose.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]))]
}

/** `metric{labels}` -> `metric`, `key: value` -> `key`. */
function identifier(code: string): string {
  return code.replace(/\{[^}]*\}$/, '').replace(/^([\w.]+): .+$/, '$1')
}

for (const [route, canonicalPath] of Object.entries(CANONICAL_SOURCES)) {
  const guidePath = `apps/landing/src/content/${contentSlug(route)}.md`
  const canonical = read(canonicalPath)
  const guide = read(guidePath)

  test(`${guidePath}: sections shared with ${canonicalPath} match`, () => {
    const a = sections(canonical)
    const b = sections(guide)
    const shared = [...b.keys()].filter((h) => a.has(h))
    assert.ok(shared.length > 0, 'expected at least one shared section')
    for (const heading of shared) {
      // The guide may point readers at the canonical file; nothing else differs.
      const guideBlocks = b.get(heading)!.filter((block) => !block.includes(canonicalPath))
      assert.deepEqual(guideBlocks, a.get(heading), `section "${heading}" differs between the two files`)
    }
  })

  test(`${guidePath}: every code identifier exists in ${canonicalPath}`, () => {
    const missing = inlineCode(guide)
      .filter((code) => code !== canonicalPath)
      .filter((code) => !canonical.includes(identifier(code)))
    assert.deepEqual(missing, [], `identifiers missing from ${canonicalPath}`)
  })
}
