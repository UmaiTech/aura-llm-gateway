import { useState } from 'react'
import { ArrowRight, Check, LayoutGrid, MessageSquare, Route } from 'lucide-react'
import { TabPanel, Tabs, useTabsId } from '@aura/ui/ui/Tabs.tsx'
import { LINKS } from '../../lib/links'
import { SUPPORTED_PROVIDERS } from '../../lib/providers'
import { AdminGlance } from './AdminPreview'
import { PlaygroundGlance } from './PlaygroundPreview'

type Surface = 'admin' | 'playground'

/**
 * Hero preview switcher. Changing surface swaps only the preview: focus
 * stays on the tab and the page does not move. No autoplay.
 */
export function ProductPreviewSwitcher() {
  const [surface, setSurface] = useState<Surface>('admin')
  const ids = useTabsId()
  return (
    <div className="overflow-hidden rounded-panel border border-aura-border bg-aura-surface shadow-[var(--aura-shadow)]">
      <div className="border-b border-aura-border p-2">
        <Tabs
          ids={ids}
          label="Product preview"
          variant="segmented"
          value={surface}
          onChange={setSurface}
          tabs={[
            {
              id: 'admin',
              label: (
                <>
                  <LayoutGrid className="h-4 w-4" aria-hidden /> Admin app
                </>
              ),
            },
            {
              id: 'playground',
              label: (
                <>
                  <MessageSquare className="h-4 w-4" aria-hidden /> Playground
                </>
              ),
            },
          ]}
        />
      </div>
      <TabPanel ids={ids} id={surface} className="min-h-[392px]">
        {surface === 'admin' ? <AdminGlance /> : <PlaygroundGlance />}
      </TabPanel>
      <div className="border-t border-aura-border px-5 py-2.5 text-[11px] text-aura-dim sm:px-6">
        Interactive product previews · sample data, not a live workspace
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section className="grid items-center gap-12 pb-16 pt-12 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-20">
      <div className="min-w-0">
        <p className="eyebrow">The gateway. The playground. The admin app.</p>
        <h1 className="mt-6 font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.04em] text-aura-text sm:text-6xl lg:text-[68px]">
          One gateway.
          <br />
          Every request,
          <br />
          <span className="text-aura-accent">understood.</span>
        </h1>
        <p className="mt-6 max-w-[480px] text-base leading-relaxed text-aura-muted sm:text-[17px]">
          One API to route your models. A playground to explore every response and the decision behind it. An admin
          app to follow traffic, cost and provider health — all on your infrastructure.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href={LINKS.playground} className="btn-primary">
            Try the playground
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <a href={LINKS.adminLocal} className="btn-secondary">
            Run the admin app locally
            <LayoutGrid className="h-4 w-4" aria-hidden />
          </a>
        </div>
        <p className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-aura-dim">
          <Check className="h-3.5 w-3.5" aria-hidden />
          <span>Open source</span>
          <span aria-hidden>·</span>
          <span>Self-hostable</span>
          <span aria-hidden>·</span>
          <span>MIT licensed</span>
        </p>
      </div>
      <ProductPreviewSwitcher />
    </section>
  )
}

/** Providers come from the gateway registry, so the list is never guessed. */
export function ProviderRow() {
  return (
    <section aria-labelledby="providers-heading" className="flex flex-col gap-5 border-y border-aura-border py-8 lg:flex-row lg:items-center lg:gap-10">
      <h2 id="providers-heading" className="eyebrow shrink-0 lg:max-w-[150px]">
        One interface. {SUPPORTED_PROVIDERS.length} providers.
      </h2>
      <ul className="flex flex-wrap gap-x-7 gap-y-3 text-[15px] font-semibold tracking-tight text-aura-dim">
        {SUPPORTED_PROVIDERS.map((p) => (
          <li key={p.id}>
            {p.docs ? (
              <a href={p.docs} className="hover:text-aura-text transition-colors">
                {p.label}
              </a>
            ) : (
              p.label
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

const JUMPS = [
  { who: 'For operators', name: 'Admin app', href: '#admin', Icon: LayoutGrid },
  { who: 'For builders', name: 'Playground', href: '#playground', Icon: MessageSquare },
  { who: 'For every request', name: 'Auto router', href: '#auto-router', Icon: Route },
]

export function ProductJumpLinks() {
  return (
    <nav aria-label="Product tour" className="my-10 grid overflow-hidden rounded-panel border border-aura-border sm:grid-cols-3">
      {JUMPS.map(({ who, name, href, Icon }, i) => (
        <a
          key={href}
          href={href}
          className={`group flex items-center justify-between gap-4 bg-aura-surface px-6 py-5 transition-colors hover:bg-aura-hover ${
            i > 0 ? 'border-t border-aura-border sm:border-l sm:border-t-0' : ''
          }`}
        >
          <span>
            <span className="eyebrow block text-[10px]">{who}</span>
            <span className="mt-2 flex items-center gap-2.5 text-base font-medium text-aura-text">
              <Icon className="h-4 w-4 text-aura-accent" aria-hidden />
              {name}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 text-aura-accent transition-transform group-hover:translate-x-0.5" aria-hidden />
        </a>
      ))}
    </nav>
  )
}
