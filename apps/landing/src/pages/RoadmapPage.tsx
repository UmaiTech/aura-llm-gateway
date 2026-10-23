import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUpRight, ChevronRight, Github, MessageSquare } from 'lucide-react'
import { Tabs, TabPanel, useTabsId } from '@aura/ui/ui/Tabs.tsx'
import { SiteFooter, SiteHeader } from '../components/site/SiteChrome'
import { SUPPORTED_PROVIDERS } from '../lib/providers'
import {
  LATEST_RELEASE,
  LEGACY_MILESTONES,
  RECONCILED,
  RELEASES,
  REPO,
  ROADMAP,
  STATUS_LABEL,
  changelogLink,
  formatDate,
  formatMonth,
  matchesFilter,
  releaseLink,
  type EvidenceLink,
  type RoadmapItem,
  type StatusFilter,
} from '../lib/roadmap'

/**
 * Roadmap — release record plus proposed priorities.
 *
 * All rows live in src/lib/roadmap.ts as typed items with a status
 * (released / merged-unreleased / in-progress / planned / considering);
 * roadmap.test.ts checks them against CHANGELOG.md. This page only renders.
 *
 * Latest shipped: v0.21.2 (2026-10-23)
 * In progress: nothing tagged in-progress and nothing merged-unreleased;
 *   v0.21.1 shipped the streaming fixes and the local-only admin notice.
 */

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'released', label: 'Released' },
  { id: 'merged', label: 'Merged' },
  { id: 'proposed', label: 'Proposed' },
]

const isFilter = (v: string | null): v is StatusFilter => FILTERS.some((f) => f.id === v)

const STATUS_DOT: Record<RoadmapItem['status'], string> = {
  released: 'bg-aura-green',
  'merged-unreleased': 'bg-aura-amber',
  'in-progress': 'bg-aura-accent',
  planned: 'border border-aura-muted',
  considering: 'border border-aura-dim',
}

function StatusBadge({ status }: { status: RoadmapItem['status'] }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-aura-muted">
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  )
}

function Evidence({ links }: { links: EvidenceLink[] }) {
  if (links.length === 0) return null
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="text-aura-dim">Evidence</span>
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-mono text-aura-accent hover:underline underline-offset-2"
        >
          {link.label}
          <ArrowUpRight className="h-3 w-3" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ))}
    </p>
  )
}

function ItemRow({ item }: { item: RoadmapItem }) {
  return (
    <li className="border-t border-aura-border py-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="text-base font-semibold text-aura-text">{item.title}</h4>
        <span className="font-mono text-[11px] uppercase tracking-wider text-aura-dim">{item.area}</span>
      </div>
      <p className="mt-1.5 max-w-[68ch] text-sm leading-relaxed text-aura-muted">{item.description}</p>
      {item.proposal && <p className="mt-2 text-xs text-aura-accent">Design-review proposal · not an announced commitment</p>}
      <Evidence links={item.evidenceLinks} />
      {item.issueRefs && item.issueRefs.length > 0 && (
        <p className="mt-1 text-xs text-aura-dim">
          Issues{' '}
          {item.issueRefs.map((ref, i) => (
            <span key={ref}>
              {i > 0 && ', '}
              <a
                href={`${REPO}/issues/${ref.replace('#', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono hover:text-aura-text"
              >
                {ref}
              </a>
            </span>
          ))}
        </p>
      )}
    </li>
  )
}

/** One block of the timeline: a margin label and a list of items. */
function Block({ label, meta, children }: { label: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-aura-border py-8 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10">
      <div>
        <h3 className="text-sm font-semibold text-aura-text">{label}</h3>
        {meta && <div className="mt-1.5 space-y-1 text-xs text-aura-dim">{meta}</div>}
      </div>
      <ul className="min-w-0">{children}</ul>
    </section>
  )
}

function GroupHeading({ id, title, note }: { id: string; title: string; note: string }) {
  return (
    <div className="mt-14 first:mt-0">
      <h2 id={id} className="text-2xl font-semibold tracking-tight text-aura-text">
        {title}
      </h2>
      <p className="mt-1.5 max-w-[68ch] text-sm text-aura-muted">{note}</p>
    </div>
  )
}

function Archive() {
  return (
    <details className="group mt-10 rounded-panel border border-aura-border bg-aura-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-panel px-5 py-4 text-sm font-medium text-aura-text hover:bg-aura-hover [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 text-aura-dim transition-transform group-open:rotate-90" aria-hidden />
        Earlier milestones, {LEGACY_MILESTONES[LEGACY_MILESTONES.length - 1].version} to {LEGACY_MILESTONES[0].version}
        <span className="ml-auto hidden font-mono text-xs text-aura-dim sm:inline">
          {formatMonth(LEGACY_MILESTONES[LEGACY_MILESTONES.length - 1].releasedAt)} – {formatMonth(LEGACY_MILESTONES[0].releasedAt)}
        </span>
      </summary>
      <div className="px-5 pb-2">
        {LEGACY_MILESTONES.map((m) => {
          const link = changelogLink(m.changelogVersion, m.releasedAt)
          return (
            <section key={m.version} className="grid gap-3 border-t border-aura-border py-6 md:grid-cols-[180px_minmax(0,1fr)] md:gap-8">
              <div>
                <h3 className="font-mono text-sm font-semibold text-aura-text">{m.version}</h3>
                <p className="mt-1 text-xs text-aura-dim">{formatMonth(m.releasedAt)}</p>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-0.5 text-xs text-aura-accent hover:underline underline-offset-2"
                >
                  Changelog
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                  <span className="sr-only">for {m.version} (opens in a new tab)</span>
                </a>
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-aura-text">{m.title}</h4>
                <p className="mt-0.5 text-sm text-aura-muted">{m.subtitle}</p>
                <ul className="mt-3 grid list-disc gap-x-8 gap-y-1 pl-4 text-[13px] text-aura-muted marker:text-aura-dim sm:grid-cols-2">
                  {m.items.map((item) => (
                    <li key={item.label}>
                      {item.label}
                      {item.note && <span className="ml-1 text-aura-dim">({item.note})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )
        })}
      </div>
    </details>
  )
}

export function RoadmapPage() {
  const tabsId = useTabsId()
  const [params, setParams] = useSearchParams()
  const raw = params.get('status')
  const filter: StatusFilter = isFilter(raw) ? raw : 'all'

  const setFilter = (next: StatusFilter) => {
    const p = new URLSearchParams(params)
    if (next === 'all') p.delete('status')
    else p.set('status', next)
    setParams(p, { replace: true, preventScrollReset: true })
  }

  useEffect(() => {
    document.title = 'Roadmap · Aura'
  }, [])

  const visible = ROADMAP.filter((i) => matchesFilter(i, filter))
  const merged = visible.filter((i) => i.status === 'merged-unreleased')
  const releasedByVersion = RELEASES.map((r) => ({
    release: r,
    items: visible.filter((i) => i.status === 'released' && i.releasedVersion === r.version),
  })).filter((g) => g.items.length > 0)
  const inProgress = visible.filter((i) => i.status === 'in-progress')
  const planned = visible.filter((i) => i.status === 'planned')
  const considering = visible.filter((i) => i.status === 'considering')
  const proposals = considering.filter((i) => i.proposal)
  const ideas = considering.filter((i) => !i.proposal)

  const count = (f: StatusFilter) => ROADMAP.filter((i) => matchesFilter(i, f)).length
  const mergedCount = count('merged')

  return (
    <div className="min-h-screen bg-aura-bg text-aura-text">
      <SiteHeader current="Roadmap" />

      <main className="mx-auto max-w-content px-4 pb-20 pt-14 sm:px-8 sm:pt-20">
        <header className="max-w-3xl">
          <p className="eyebrow mb-5">Building in the open</p>
          <h1 className="font-display text-[2.6rem] font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            What shipped.
            <br />
            <span className="text-aura-accent">What could come next.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-aura-muted">
            A release record you can check against the changelog, the work merged since, and the priorities under
            discussion. Proposed items have no dates and are not commitments.
          </p>
        </header>

        <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-6 border-y border-aura-border py-6 text-sm md:grid-cols-4">
          <div>
            <dt className="eyebrow">Latest release</dt>
            <dd className="mt-2">
              <a
                href={releaseLink(LATEST_RELEASE).href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-lg font-semibold text-aura-green hover:underline underline-offset-2"
              >
                v{LATEST_RELEASE.version}
              </a>
              <span className="block text-xs text-aura-dim">{formatDate(LATEST_RELEASE.date)}</span>
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Merged, unreleased</dt>
            <dd className="mt-2">
              <span className="font-mono text-lg font-semibold text-aura-amber">{mergedCount}</span>
              <span className="block text-xs text-aura-dim">on main, next release</span>
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Providers</dt>
            <dd className="mt-2">
              <span className="font-mono text-lg font-semibold text-aura-text">{SUPPORTED_PROVIDERS.length}</span>
              <span className="block text-xs text-aura-dim">behind one API</span>
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Last reconciled</dt>
            <dd className="mt-2">
              <span className="font-mono text-sm font-semibold text-aura-text">{formatDate(RECONCILED.date)}</span>
              <span className="block text-xs text-aura-dim">
                against{' '}
                <a
                  href={`${REPO}/commit/${RECONCILED.revision}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-aura-accent hover:underline underline-offset-2"
                >
                  {RECONCILED.revision}
                </a>
              </span>
            </dd>
          </div>
        </dl>

        <div className="mt-10 max-w-md [&_.aui-tab]:gap-1.5 [&_.aui-tab]:px-1.5 sm:[&_.aui-tab]:px-3">
          <Tabs
            ids={tabsId}
            label="Filter by status"
            tabs={FILTERS.map((f) => ({
              id: f.id,
              label: (
                <>
                  {f.label}
                  <span className="hidden font-mono text-[11px] text-aura-dim min-[360px]:inline">{count(f.id)}</span>
                </>
              ),
            }))}
            value={filter}
            onChange={setFilter}
            variant="segmented"
          />
        </div>

        <TabPanel ids={tabsId} id={filter} className="mt-10 focus-visible:outline-offset-8">
          {merged.length > 0 && (
            <>
              <GroupHeading
                id="merged"
                title="Merged, not yet released"
                note="Merged to main but not part of a tagged release yet. No release is assigned until one is cut."
              />
              <div className="mt-6">
                <Block label={<StatusBadge status="merged-unreleased" />} meta={<p>Ships with the next release</p>}>
                  {merged.map((item) => (
                    <ItemRow key={item.id} item={item} />
                  ))}
                </Block>
              </div>
            </>
          )}

          {releasedByVersion.length > 0 && (
            <>
              <GroupHeading
                id="released"
                title="Released"
                note="Newest first. Each version links to its changelog entry or GitHub release; each item links to the pull requests that shipped it."
              />
              <div className="mt-6 border-b border-aura-border">
                {releasedByVersion.map(({ release, items }) => {
                  const link = releaseLink(release)
                  return (
                    <Block
                      key={release.version}
                      label={<span className="font-mono">v{release.version}</span>}
                      meta={
                        <>
                          <p>{formatDate(release.date)}</p>
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-aura-accent hover:underline underline-offset-2"
                          >
                            {release.tagged ? 'GitHub release' : 'Changelog'}
                            <ArrowUpRight className="h-3 w-3" aria-hidden />
                            <span className="sr-only">for v{release.version} (opens in a new tab)</span>
                          </a>
                        </>
                      }
                    >
                      {items.map((item) => (
                        <ItemRow key={item.id} item={item} />
                      ))}
                    </Block>
                  )
                })}
              </div>
              <Archive />
            </>
          )}

          {(inProgress.length > 0 || planned.length > 0 || considering.length > 0) && (
            <>
              <GroupHeading
                id="proposed"
                title="Proposed priorities"
                note="Not scheduled and not promised. Planned items are ones the maintainers intend to build; the rest are under consideration. Tell us what matters to you."
              />
              <div className="mt-6 border-b border-aura-border">
                {inProgress.length > 0 && (
                  <Block label={<StatusBadge status="in-progress" />}>
                    {inProgress.map((item) => (
                      <ItemRow key={item.id} item={item} />
                    ))}
                  </Block>
                )}
                {proposals.length > 0 && (
                  <Block
                    label={<StatusBadge status="considering" />}
                    meta={<p>Suggested next priorities from the design review</p>}
                  >
                    {proposals.map((item) => (
                      <ItemRow key={item.id} item={item} />
                    ))}
                  </Block>
                )}
                {planned.length > 0 && (
                  <Block label={<StatusBadge status="planned" />} meta={<p>Intended, no dates</p>}>
                    {planned.map((item) => (
                      <ItemRow key={item.id} item={item} />
                    ))}
                  </Block>
                )}
                {ideas.length > 0 && (
                  <Block label={<StatusBadge status="considering" />} meta={<p>Ideas from the community</p>}>
                    {ideas.map((item) => (
                      <ItemRow key={item.id} item={item} />
                    ))}
                  </Block>
                )}
              </div>
            </>
          )}
        </TabPanel>

        <section className="mt-20 border-t border-aura-border pt-14" aria-labelledby="shape-next">
          <h2 id="shape-next" className="max-w-3xl font-display text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            Help shape what&apos;s next.
          </h2>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <Github className="h-4 w-4" aria-hidden />
              Open an issue
            </a>
            <a href={`${REPO}/discussions`} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <MessageSquare className="h-4 w-4" aria-hidden />
              Start a discussion
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
