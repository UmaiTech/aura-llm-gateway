import { ArrowRight, Github, Moon, Sun } from 'lucide-react'
import { BrandMark, Wordmark } from '@aura/ui/brand/Brand.tsx'
import { GithubStars } from '../GithubStars'
import { LINKS } from '../../lib/links'
import { useTheme } from '../../lib/theme'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-control text-aura-muted hover:bg-aura-hover hover:text-aura-text transition-colors ${className}`}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  )
}

interface NavItem {
  label: string
  href: string
}

/** On the home page the product items jump to their sections. */
const PRODUCT_ITEMS: NavItem[] = [
  { label: 'Admin app', href: '/#admin' },
  { label: 'Playground', href: '/#playground' },
  { label: 'Auto router', href: '/#auto-router' },
]

const RESOURCE_ITEMS: NavItem[] = [
  { label: 'Docs', href: LINKS.docs },
  { label: 'Pricing', href: LINKS.pricing },
  { label: 'Roadmap', href: LINKS.roadmap },
]

/**
 * Site header for the marketing pages. Product surfaces are first-class
 * items; on phones the same links move to a scrollable second row instead
 * of a hamburger, so Admin app and Playground stay one tap away.
 */
export function SiteHeader({ current }: { current?: string }) {
  const items = [...PRODUCT_ITEMS, ...RESOURCE_ITEMS]
  const link = (item: NavItem, extra = '') => (
    <a
      key={item.label}
      href={item.href}
      aria-current={current === item.label ? 'page' : undefined}
      className={`whitespace-nowrap transition-colors hover:text-aura-text aria-[current=page]:text-aura-text ${extra}`}
    >
      {item.label}
    </a>
  )

  return (
    <header className="sticky top-0 z-40 border-b border-aura-border bg-aura-bg/95 backdrop-blur supports-[backdrop-filter]:bg-aura-bg/85">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-6 px-4 sm:px-8">
        <a href="/" className="flex shrink-0 items-center text-aura-text" aria-label="Aura home">
          <Wordmark size={34} title="" className="hidden sm:block" />
          <BrandMark size={32} className="sm:hidden" />
        </a>
        <nav aria-label="Main" className="hidden items-center gap-7 text-[13px] text-aura-muted lg:flex">
          {items.map((item) => link(item))}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <a
            href={LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-control px-2 text-xs text-aura-muted hover:bg-aura-hover hover:text-aura-text transition-colors"
            aria-label="Aura on GitHub"
          >
            <Github className="h-4 w-4" aria-hidden />
            <GithubStars className="hidden sm:inline-flex" />
          </a>
          <ThemeToggle />
          <a href={LINKS.playground} className="btn-secondary hidden !px-3 !py-2 text-[13px] sm:inline-flex">
            Open playground
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
      <nav
        aria-label="Main"
        className="flex gap-5 overflow-x-auto border-t border-aura-border px-4 py-2.5 text-[13px] text-aura-muted lg:hidden [scrollbar-width:none]"
      >
        {items.map((item) => link(item, 'py-1'))}
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-aura-border">
      <div className="mx-auto flex max-w-content flex-col gap-3 px-4 py-6 text-xs text-aura-dim sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>
          Made with love in Stockholm by{' '}
          <a href="https://umai-tech.com" target="_blank" rel="noopener noreferrer" className="hover:text-aura-text transition-colors">
            Umai Technologies
          </a>
        </span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <a href={LINKS.docs} className="hover:text-aura-text transition-colors">Docs</a>
          <a href={LINKS.pricing} className="hover:text-aura-text transition-colors">LLM pricing</a>
          <a href={LINKS.roadmap} className="hover:text-aura-text transition-colors">Roadmap</a>
          <a href={LINKS.github} target="_blank" rel="noopener noreferrer" className="hover:text-aura-text transition-colors">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  )
}
