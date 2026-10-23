import { useEffect, useState, type RefObject } from 'react'

export interface TocEntry {
  id: string
  label: string
  level: 2 | 3
}

/**
 * Collects the article's h2/h3 headings once they render (MDX pages load
 * lazily, so this watches the article for changes) and scrolls to the URL
 * hash when its heading appears.
 */
export function useArticleHeadings(articleRef: RefObject<HTMLElement>, pageKey: string, hash: string): TocEntry[] {
  const [entries, setEntries] = useState<TocEntry[]>([])

  useEffect(() => {
    const article = articleRef.current
    if (!article) return
    let scrolledToHash = false

    const collect = () => {
      const found: TocEntry[] = []
      article.querySelectorAll<HTMLElement>('h2[id]:not([data-toc-skip]), h3[id]:not([data-toc-skip])').forEach((el) => {
        found.push({
          id: el.id,
          label: el.dataset.tocLabel || el.textContent || el.id,
          level: el.tagName === 'H2' ? 2 : 3,
        })
      })
      setEntries((prev) =>
        prev.length === found.length && prev.every((e, i) => e.id === found[i].id && e.label === found[i].label) ? prev : found,
      )
      if (hash && !scrolledToHash) {
        const target = document.getElementById(decodeURIComponent(hash.slice(1)))
        if (target) {
          scrolledToHash = true
          target.scrollIntoView()
        }
      }
    }

    collect()
    const observer = new MutationObserver(collect)
    observer.observe(article, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [articleRef, pageKey, hash])

  return entries
}

/** Right-hand contents for large screens; highlights the section in view. */
export function OnThisPage({ entries }: { entries: TocEntry[] }) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (entries.length === 0) return
    const elements = entries.map((e) => document.getElementById(e.id)).filter((el): el is HTMLElement => el !== null)
    const observer = new IntersectionObserver(
      (records) => {
        const visible = records.filter((r) => r.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -65% 0px' },
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [entries])

  if (entries.length === 0) return null

  return (
    <nav aria-labelledby="on-this-page" className="text-[13px]">
      <h2 id="on-this-page" className="eyebrow mb-3">
        On this page
      </h2>
      <ul className="space-y-1 border-l border-aura-border">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              aria-current={active === entry.id ? 'location' : undefined}
              className={`-ml-px block border-l py-1 leading-snug transition-colors ${
                entry.level === 3 ? 'pl-6' : 'pl-3'
              } ${
                active === entry.id
                  ? 'border-aura-accent text-aura-text'
                  : 'border-transparent text-aura-muted hover:text-aura-text'
              }`}
            >
              {entry.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
