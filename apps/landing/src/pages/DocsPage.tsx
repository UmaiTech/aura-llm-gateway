import { useState, useEffect, useMemo, useRef, Suspense, type ComponentType } from 'react'
import { useLocation, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowRight, ExternalLink, Github, Menu, PencilLine } from 'lucide-react'
import { BrandMark, Wordmark } from '@aura/ui/brand/Brand.tsx'
import { Drawer } from '@aura/ui/ui/Drawer.tsx'
import { SearchModal, SearchButton, useSearchShortcut } from '../components/Search'
import { ThemeToggle } from '../components/site/SiteChrome'
import { proseComponents } from '../components/docs/Prose'
import { OnThisPage, useArticleHeadings } from '../components/docs/OnThisPage'
import { LINKS } from '../lib/links'
import {
  CANONICAL_SOURCES,
  CONTENT_DIR,
  DOC_SECTIONS,
  ENTRY_PATHS,
  REPO_URL,
  routeForContentFile,
} from '../lib/docsNav'

// MDX components available inside .mdx docs
import {
  Callout,
  CodeBlock,
  CodeTabs,
  CodeTab,
  Steps,
  Step,
  Expandable,
  Card,
  CardGrid,
  ApiPlayground,
  ModelTable,
} from '../components/mdx'
import { reloadForStaleChunk } from '../lib/staleChunk'

// All MD files from src/content, as raw strings at build time.
const mdModules = import.meta.glob('../content/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, unknown>

// All MDX files as lazy components.
const mdxModules = import.meta.glob('../content/**/*.mdx') as Record<
  string,
  () => Promise<{ default: ComponentType }>
>

function removeFrontmatter(content: unknown): string {
  if (typeof content !== 'string') {
    if (content && typeof content === 'object' && 'default' in content) {
      return removeFrontmatter((content as { default: unknown }).default)
    }
    return ''
  }
  return content.replace(/^---\n[\s\S]*?\n---\n/, '')
}

/** Route -> repository path of the file it is rendered from. */
const sourceFiles: Record<string, string> = {}
const repoPath = (globKey: string) => `${CONTENT_DIR}/${globKey.replace('../content/', '')}`

const docContentFromFiles: Record<string, string> = {}
for (const [filePath, content] of Object.entries(mdModules)) {
  const route = routeForContentFile(filePath)
  if (route) {
    docContentFromFiles[route] = removeFrontmatter(content)
    sourceFiles[route] = repoPath(filePath)
  }
}

// MDX wins over MD when both exist for a route.
const mdxComponents: Record<string, () => Promise<{ default: ComponentType }>> = {}
for (const [filePath, loader] of Object.entries(mdxModules)) {
  const route = routeForContentFile(filePath)
  if (route) {
    mdxComponents[route] = loader
    sourceFiles[route] = repoPath(filePath)
  }
}

const mdxWrapperComponents = {
  ...proseComponents,
  Callout,
  CodeBlock,
  CodeTabs,
  CodeTab,
  Steps,
  Step,
  Expandable,
  Card,
  CardGrid,
  ApiPlayground,
  ModelTable,
}

function MDXLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-sm text-aura-dim motion-safe:animate-pulse">Loading documentation…</div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MDXComponentType = ComponentType<{ components?: Record<string, ComponentType<any>> }>

function MDXContent({ path }: { path: string }) {
  const [Component, setComponent] = useState<MDXComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loader = mdxComponents[path]
    if (!loader) return
    let cancelled = false
    setComponent(null)
    loader()
      .then((mod) => {
        if (cancelled) return
        setComponent(() => mod.default)
        setError(null)
      })
      .catch(() => {
        if (cancelled) return
        // Usually a tab from before the last deploy asking for a chunk that is gone.
        if (reloadForStaleChunk()) return
        setError('This page failed to load. Reload to try again.')
      })
    return () => {
      cancelled = true
    }
  }, [path])

  if (error) {
    return <div className="rounded-control border border-aura-red/40 bg-aura-red/10 p-4 text-sm text-aura-red">{error}</div>
  }
  if (!Component) return <MDXLoading />
  return <Component components={mdxWrapperComponents} />
}

/** Markdown before the first `## ` heading, and the rest. */
function splitIntro(markdown: string): [string, string] {
  const at = markdown.search(/^## /m)
  return at < 0 ? [markdown, ''] : [markdown.slice(0, at), markdown.slice(at)]
}

const hasContent = (path: string) => Boolean(docContentFromFiles[path] || mdxComponents[path])

function sectionFor(path: string) {
  return DOC_SECTIONS.find((s) => s.items.some((i) => i.path === path))
}

/** Sidebar contents; used in the desktop column and the mobile drawer. */
function DocsNav({ currentPath, onNavigate }: { currentPath: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Documentation" className="space-y-6 text-[13px]">
      {DOC_SECTIONS.map((section) => (
        <div key={section.title}>
          <h2 className="eyebrow mb-2 px-3">{section.title}</h2>
          <ul className="space-y-px">
            {section.items.map((item) => {
              if (item.external) {
                return (
                  <li key={item.path}>
                    <a
                      href={item.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 rounded-control px-3 py-1.5 text-aura-muted transition-colors hover:bg-aura-hover hover:text-aura-text"
                    >
                      <span>{item.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                )
              }
              const isActive = currentPath === item.path
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={onNavigate}
                    aria-current={isActive ? 'page' : undefined}
                    className={`block rounded-control px-3 py-1.5 transition-colors ${
                      isActive
                        ? 'bg-aura-accent/10 font-medium text-aura-accent'
                        : 'text-aura-muted hover:bg-aura-hover hover:text-aura-text'
                    }`}
                  >
                    {item.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Task-oriented ways into the docs, shown on the docs index. */
function EntryPaths() {
  return (
    <section aria-labelledby="entry-paths" className="mb-4 mt-8">
      <h2 id="entry-paths" data-toc-skip className="mb-4 text-2xl font-semibold tracking-tight text-aura-text">
        Find your way in
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {ENTRY_PATHS.map((path) => (
          <section
            key={path.id}
            aria-labelledby={`entry-${path.id}`}
            className="rounded-panel border border-aura-border bg-aura-surface p-5"
          >
            <h3 id={`entry-${path.id}`} data-toc-skip className="text-base font-semibold text-aura-text">
              {path.title}
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-aura-muted">{path.summary}</p>
            <ul className="mt-3 space-y-1 text-[13px]">
              {path.links.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="group inline-flex items-center gap-1.5 text-aura-accent hover:underline underline-offset-2"
                  >
                    {link.label}
                    <ArrowRight className="h-3 w-3 transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  )
}

function ArticleMeta({ path }: { path: string }) {
  const source = sourceFiles[path]
  const canonical = CANONICAL_SOURCES[path]
  if (!source) return null
  return (
    <footer className="mt-14 border-t border-aura-border pt-5 text-xs text-aura-dim">
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt>Page source</dt>
        <dd className="min-w-0 font-mono [overflow-wrap:anywhere]">
          <a href={`${REPO_URL}/blob/main/${source}`} target="_blank" rel="noopener noreferrer" className="hover:text-aura-text">
            {source}
          </a>
        </dd>
        {canonical && (
          <>
            <dt>Canonical reference</dt>
            <dd className="min-w-0 font-mono [overflow-wrap:anywhere]">
              <a href={`${REPO_URL}/blob/main/${canonical}`} target="_blank" rel="noopener noreferrer" className="hover:text-aura-text">
                {canonical}
              </a>
            </dd>
          </>
        )}
      </dl>
      <a
        href={`${REPO_URL}/edit/main/${source}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 text-aura-accent hover:underline underline-offset-2"
      >
        <PencilLine className="h-3.5 w-3.5" aria-hidden />
        Edit this page on GitHub
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </footer>
  )
}

export function DocsPage() {
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const articleRef = useRef<HTMLElement>(null)

  useSearchShortcut(() => setSearchOpen(true))

  const currentPath = location.pathname.replace(/\/$/, '') || '/docs'
  const hasMdxContent = mdxComponents[currentPath] !== undefined
  const found = hasContent(currentPath)
  const markdown = useMemo(() => (hasMdxContent ? null : docContentFromFiles[currentPath] ?? null), [currentPath, hasMdxContent])
  const section = sectionFor(currentPath)
  const pageTitle = section?.items.find((i) => i.path === currentPath)?.title

  // New page: start at the top unless the URL targets a heading.
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0)
    setNavOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath])

  useEffect(() => {
    document.title = pageTitle && currentPath !== '/docs' ? `${pageTitle} · Aura Docs` : 'Aura Docs'
  }, [pageTitle, currentPath])

  const headings = useArticleHeadings(articleRef, currentPath, location.hash)

  return (
    <div className="min-h-screen bg-aura-bg text-aura-text">
      <a
        href="#docs-article"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-control focus:bg-aura-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-aura-border bg-aura-bg/95 backdrop-blur supports-[backdrop-filter]:bg-aura-bg/85">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-control text-aura-muted hover:bg-aura-hover hover:text-aura-text lg:hidden"
              aria-label="Open documentation menu"
              aria-expanded={navOpen}
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <a href="/" className="flex shrink-0 items-center text-aura-text" aria-label="Aura home">
              <Wordmark size={30} title="" className="hidden sm:block" />
              <BrandMark size={28} className="sm:hidden" />
            </a>
            <Link
              to="/docs"
              className="ml-1 border-l border-aura-border pl-3 text-sm font-medium text-aura-muted hover:text-aura-text"
            >
              Docs
            </Link>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <SearchButton onClick={() => setSearchOpen(true)} />
            <nav aria-label="Site" className="hidden items-center gap-5 text-[13px] text-aura-muted md:flex">
              <a href={LINKS.pricing} className="hover:text-aura-text">
                Pricing
              </a>
              <a href={LINKS.roadmap} className="hover:text-aura-text">
                Roadmap
              </a>
            </nav>
            <a
              href={LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 w-9 items-center justify-center rounded-control text-aura-muted hover:bg-aura-hover hover:text-aura-text sm:inline-flex"
              aria-label="Aura on GitHub"
            >
              <Github className="h-4 w-4" aria-hidden />
            </a>
            <ThemeToggle />
            <a href={LINKS.playground} className="btn-secondary hidden !px-3 !py-2 text-[13px] lg:inline-flex">
              Open playground
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] px-4 sm:px-6">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 overflow-y-auto border-r border-aura-border py-8 pr-4 lg:block">
          <DocsNav currentPath={currentPath} />
        </aside>

        <main id="docs-article" tabIndex={-1} className="min-w-0 flex-1 py-8 focus:outline-none lg:px-10 xl:px-14">
          <div className="mx-auto flex max-w-[1060px] gap-12">
            <article ref={articleRef} className="min-w-0 max-w-[74ch] flex-1">
              <p className="eyebrow mb-4">
                <Link to="/docs" className="hover:text-aura-text">
                  Docs
                </Link>
                {section && currentPath !== '/docs' && (
                  <>
                    <span aria-hidden className="mx-2">/</span>
                    <span>{section.title}</span>
                  </>
                )}
              </p>

              {!found ? (
                <div>
                  <h1 className="mb-4 font-display text-[2.15rem] font-semibold text-aura-text">Page not found</h1>
                  <p className="mb-6 text-aura-muted">
                    There is no documentation at <code className="font-mono text-aura-accent">{currentPath}</code>. Search the docs
                    or start from one of the paths below.
                  </p>
                  <EntryPaths />
                </div>
              ) : (
                <>
                  {hasMdxContent ? (
                    <Suspense fallback={<MDXLoading />}>
                      <MDXContent path={currentPath} />
                    </Suspense>
                  ) : currentPath === '/docs' ? (
                    // Index: title and intro, then the entry paths, then the rest.
                    <>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={proseComponents}>
                        {splitIntro(markdown || '')[0]}
                      </ReactMarkdown>
                      <EntryPaths />
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={proseComponents}>
                        {splitIntro(markdown || '')[1]}
                      </ReactMarkdown>
                    </>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={proseComponents}>
                      {markdown || ''}
                    </ReactMarkdown>
                  )}
                  <ArticleMeta path={currentPath} />
                </>
              )}
            </article>

            <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] w-52 shrink-0 self-start overflow-y-auto xl:block">
              <OnThisPage entries={headings} />
            </aside>
          </div>
        </main>
      </div>

      <Drawer open={navOpen} onClose={() => setNavOpen(false)} title="Documentation" closeLabel="Close documentation menu">
        <DocsNav currentPath={currentPath} onNavigate={() => setNavOpen(false)} />
      </Drawer>

      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
