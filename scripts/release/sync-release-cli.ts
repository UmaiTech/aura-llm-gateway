/**
 * Sync the CHANGELOG and the public roadmap with the release that the
 * current branch (a release-plz PR) prepares. Run from the repo root:
 *
 *   node scripts/release/sync-release-cli.ts
 *
 * The release workflow runs it on every release PR; run it by hand when a
 * release PR needs fixing locally. See sync-release.ts for what it changes.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fillChangelogSection, newestRelease, syncRoadmap, syncRoadmapPageDoc } from './sync-release.ts'

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const tryGit = (...args: string[]) => {
  try {
    return git(...args)
  } catch {
    return ''
  }
}

const CHANGELOG = 'CHANGELOG.md'
const ROADMAP = 'apps/landing/src/lib/roadmap.ts'
const ROADMAP_PAGE = 'apps/landing/src/pages/RoadmapPage.tsx'

const changelog = readFileSync(CHANGELOG, 'utf8')
const release = newestRelease(changelog)
if (!release) throw new Error(`${CHANGELOG}: no release heading found`)
const { version, date } = release

const prevTag = tryGit('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', '--exclude', `v${version}`, 'HEAD')
if (!prevTag) throw new Error('no previous v* tag reachable from HEAD (fetch tags first)')
const subjects = git('log', '--no-merges', '--format=%s', `${prevTag}..HEAD`).split('\n').filter(Boolean)
const tags = new Set(git('tag', '--list', 'v*').split('\n').filter(Boolean))
const base = tryGit('merge-base', 'HEAD', 'origin/main') || git('rev-parse', 'HEAD')
const revision = git('rev-parse', '--short=7', base)

const write = (path: string, before: string, after: string) => {
  if (after === before) return console.log(`${path}: already in sync`)
  writeFileSync(path, after)
  console.log(`${path}: updated`)
}

console.log(`Release v${version} (${date}), commits since ${prevTag}: ${subjects.length}`)
write(CHANGELOG, changelog, fillChangelogSection(changelog, version, subjects))
const roadmap = readFileSync(ROADMAP, 'utf8')
write(ROADMAP, roadmap, syncRoadmap(roadmap, { version, date, tags, revision }))
const page = readFileSync(ROADMAP_PAGE, 'utf8')
write(ROADMAP_PAGE, page, syncRoadmapPageDoc(page, release))
