/**
 * Shared "Made in Stockholm" signature line used on every landing
 * surface (App.tsx, RoadmapPage, DocsPage). The heart uses
 * --accent-warm so the brand colour closes each page the same way
 * it opens it.
 *
 * Renders as a standalone <p> — the calling layout decides padding
 * and alignment.
 */
export function StockholmFooter() {
  return (
    <p
      style={{
        color: 'var(--ink-muted)',
        margin: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      Made in Stockholm with{' '}
      <span aria-label="love" style={{ color: 'var(--accent-warm)' }}>
        ❤
      </span>{' '}
      by{' '}
      <a
        href="https://www.umai-tech.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="link"
      >
        UmaiTech
      </a>
    </p>
  )
}
