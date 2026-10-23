import { useState, type ReactNode } from 'react'
import { ArrowRight, Activity, Code2, FileSearch, ListChecks, Route, ShieldAlert } from 'lucide-react'
import { TabPanel, Tabs, useTabsId } from '@aura/ui/ui/Tabs.tsx'
import { LINKS, playgroundSampleUrl } from '../../lib/links'
import { HealthList, HourlyBars, MetricGrid, RequestDetail, RequestDrawer, RequestTable } from './AdminPreview'
import { SampleConversation, SampleRaw, SampleRouting } from './PlaygroundPreview'
import { FEATURED_REQUEST, SAMPLE_LABEL, type SampleRequest } from './sampleData'

function SectionCopy({
  eyebrow,
  title,
  body,
  points,
  children,
}: {
  eyebrow: string
  title: ReactNode
  body: string
  points: Array<{ icon: ReactNode; text: string }>
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-4 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.03em] text-aura-text sm:text-[42px]">{title}</h2>
      <p className="mt-5 max-w-[470px] leading-relaxed text-aura-muted">{body}</p>
      <ul className="mt-6 space-y-3 text-sm text-aura-muted">
        {points.map((p) => (
          <li key={p.text} className="flex items-start gap-3">
            <span className="mt-0.5 text-aura-accent">{p.icon}</span>
            {p.text}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-col items-start gap-4">{children}</div>
    </div>
  )
}

function PreviewFrame({ title, tabs, footer }: { title: string; tabs: ReactNode; footer: ReactNode }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-panel border border-aura-border bg-aura-surface shadow-[var(--aura-shadow)]">
      <div className="flex items-center justify-between gap-3 border-b border-aura-border px-5 py-3">
        <span className="eyebrow text-[10px]">{title}</span>
        <span className="sample-tag">{SAMPLE_LABEL}</span>
      </div>
      {tabs}
      <div className="border-t border-aura-border px-5 py-2.5 text-[11px] text-aura-dim">{footer}</div>
    </div>
  )
}

type AdminTab = 'traffic' | 'health' | 'request'

export function AdminShowcase() {
  const [tab, setTab] = useState<AdminTab>('traffic')
  const [open, setOpen] = useState<SampleRequest | null>(null)
  const ids = useTabsId()

  return (
    <section id="admin" aria-labelledby="admin-heading" className="grid items-center gap-12 border-b border-aura-border py-20 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
      <SectionCopy
        eyebrow="01 / The admin app"
        title={<span id="admin-heading">Run your gateway with a clear view.</span>}
        body="See where traffic goes, what it costs and which providers need attention. Follow the overview down to the request that explains it."
        points={[
          { icon: <Activity className="h-4 w-4" aria-hidden />, text: 'Read traffic, spend and success rate together.' },
          { icon: <ShieldAlert className="h-4 w-4" aria-hidden />, text: 'Spot a degraded provider, then inspect its requests.' },
          { icon: <ListChecks className="h-4 w-4" aria-hidden />, text: 'Keep gateway settings and organization policy in reach.' },
        ]}
      >
        <a href={LINKS.adminLocal} className="btn-primary">
          Run the admin app locally
          <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
        <p className="text-xs text-aura-dim">
          The admin app runs locally against your own gateway for now, and signs in with its admin key. A hosted
          version is coming soon.
        </p>
      </SectionCopy>

      <PreviewFrame
        title="Aura admin"
        footer="Sample workspace · select a request to inspect it"
        tabs={
          <>
            <Tabs
              ids={ids}
              label="Admin preview"
              value={tab}
              onChange={setTab}
              className="px-5"
              tabs={[
                { id: 'traffic', label: 'Traffic & cost' },
                { id: 'health', label: 'Provider health' },
                { id: 'request', label: 'Request detail' },
              ]}
            />
            <TabPanel ids={ids} id={tab} className="min-h-[420px] p-5">
              {tab === 'traffic' && (
                <div className="space-y-5">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold text-aura-text">Gateway overview</h3>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-aura-dim">last 24 h</span>
                  </div>
                  <MetricGrid />
                  <HourlyBars />
                  <RequestTable onOpen={setOpen} />
                </div>
              )}
              {tab === 'health' && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-aura-text">Provider health</h3>
                  <p className="text-xs text-aura-muted">Success rate and median latency per provider, with circuit-breaker state.</p>
                  <HealthList />
                </div>
              )}
              {tab === 'request' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-aura-text">Request detail</h3>
                    <button
                      type="button"
                      onClick={() => setOpen(FEATURED_REQUEST)}
                      className="inline-flex items-center gap-1.5 text-xs text-aura-accent hover:underline"
                    >
                      <FileSearch className="h-3.5 w-3.5" aria-hidden />
                      Open in the drawer
                    </button>
                  </div>
                  <p className="font-mono text-[11px] text-aura-dim">{FEATURED_REQUEST.id}</p>
                  <RequestDetail req={FEATURED_REQUEST} />
                </div>
              )}
            </TabPanel>
          </>
        }
      />
      <RequestDrawer req={open} onClose={() => setOpen(null)} />
    </section>
  )
}

type PlayTab = 'response' | 'routing' | 'raw'

export function PlaygroundShowcase() {
  const [tab, setTab] = useState<PlayTab>('response')
  const ids = useTabsId()
  const sampleHref = playgroundSampleUrl({
    model: FEATURED_REQUEST.requestedModel,
    prompt: FEATURED_REQUEST.prompt,
    inspect: 'routing',
  })

  return (
    <section
      id="playground"
      aria-labelledby="playground-heading"
      className="grid items-center gap-12 border-b border-aura-border py-20 lg:grid-cols-[1.15fr_1fr] lg:gap-16"
    >
      {/* Story first on phones, preview first on wide screens. */}
      <div className="order-2 min-w-0 lg:order-1">
        <PreviewFrame
          title="Aura playground"
          footer="Sample conversation · the same request appears in the admin preview above"
          tabs={
            <>
              <Tabs
                ids={ids}
                label="Playground preview"
                value={tab}
                onChange={setTab}
                className="px-5"
                tabs={[
                  { id: 'response', label: 'Response' },
                  { id: 'routing', label: 'Routing decision' },
                  { id: 'raw', label: 'Raw JSON' },
                ]}
              />
              <TabPanel ids={ids} id={tab} className="min-h-[380px] p-5">
                {tab === 'response' && <SampleConversation />}
                {tab === 'routing' && <SampleRouting />}
                {tab === 'raw' && <SampleRaw />}
              </TabPanel>
            </>
          }
        />
      </div>
      <div className="order-1 lg:order-2">
        <SectionCopy
          eyebrow="02 / The playground"
          title={
            <span id="playground-heading">
              Build with the response.
              <br />
              Learn from the details.
            </span>
          }
          body="Try a model, explore auto routing and read the usage without leaving the conversation. The answer and its explanation sit side by side."
          points={[
            { icon: <FileSearch className="h-4 w-4" aria-hidden />, text: 'See which model actually answered, next to the answer.' },
            { icon: <Route className="h-4 w-4" aria-hidden />, text: 'Inspect tiers, constraints and the candidates considered.' },
            { icon: <Code2 className="h-4 w-4" aria-hidden />, text: 'Check tokens, cost and the raw response.' },
          ]}
        >
          <a href={sampleHref} className="btn-primary">
            Try a sample request
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <a href={LINKS.playground} className="inline-flex items-center gap-1.5 text-sm text-aura-accent hover:underline">
            Open a blank playground session
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
          <p className="max-w-[420px] text-xs leading-relaxed text-aura-dim">
            Opens the hosted playground with this prompt drafted and the routing inspector ready. Sign in with GitHub
            to send it; the free quota applies.
          </p>
        </SectionCopy>
      </div>
    </section>
  )
}
