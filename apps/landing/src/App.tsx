import { SiteFooter, SiteHeader } from './components/site/SiteChrome'
import { Hero, ProductJumpLinks, ProviderRow } from './components/showcase/Hero'
import { AdminShowcase, PlaygroundShowcase } from './components/showcase/ProductShowcases'
import { AutoRouterSection } from './components/showcase/AutoRouterSection'
import { ApiSection, ClosingCta } from './components/showcase/ApiSection'

/**
 * Landing page — product-led (design pack v3,
 * docs/design/aura-pack-v3/handoff/LANDING_PRODUCT_SHOWCASE.md).
 *
 * Three connected surfaces: the gateway API, the playground and the admin
 * app. Order: hero with a product preview switcher → providers and product
 * jump links → admin app → playground → auto router → API → closing
 * action. Every preview is labelled sample data and runs in the browser;
 * the page never calls the gateway, the admin API or a provider. CTAs go
 * to the deployed apps, where their own sign-in applies.
 */
export default function App() {
  return (
    <div className="min-h-screen bg-aura-bg text-aura-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-control focus:bg-aura-action focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-content px-4 sm:px-8">
        <Hero />
        <ProviderRow />
        <ProductJumpLinks />
        <AdminShowcase />
        <PlaygroundShowcase />
        <AutoRouterSection />
        <ApiSection />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  )
}
