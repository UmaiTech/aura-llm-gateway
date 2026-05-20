import { ReactNode, Children, isValidElement } from 'react'

interface CardProps {
  title: string
  children: ReactNode
  href?: string
}

export function Card({ title, children, href }: CardProps) {
  const content = (
    <div style={{ display: 'block' }}>
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: '1.125rem',
          color: 'var(--ink)',
          margin: '0 0 var(--space-2) 0',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>
      <div style={{ color: 'var(--ink-muted)', fontSize: '0.9375rem', lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  )

  if (href) {
    return (
      <a href={href} className="link" style={{ textDecoration: 'none' }}>
        {content}
      </a>
    )
  }

  return content
}

interface CardGridProps {
  children: ReactNode
  /**
   * Layout. Default is `stack` (single column). `asymmetric` lays out two
   * columns at a 60/40 ratio. Equal-column grids (3-up tiles) are not part
   * of the design system.
   *
   * The legacy `cols` prop is accepted for backwards compatibility but is
   * coerced: `cols={1}` → stack; `cols={2}` or `cols={3}` → asymmetric.
   */
  columns?: 'stack' | 'asymmetric'
  cols?: 1 | 2 | 3
}

export function CardGrid({ children, columns, cols }: CardGridProps) {
  const layout: 'stack' | 'asymmetric' =
    columns ?? (cols && cols > 1 ? 'asymmetric' : 'stack')

  const items = Children.toArray(children).filter(isValidElement)

  return (
    <div
      style={{
        margin: 'var(--space-5) 0',
        display: 'grid',
        gap: 'var(--space-5)',
        gridTemplateColumns: 'minmax(0, 1fr)',
      }}
      className={layout === 'asymmetric' ? 'card-grid-asymmetric' : 'card-grid-stack'}
    >
      {items.map((child, idx) => (
        <div
          key={idx}
          style={{
            display: 'grid',
            gridTemplateColumns: 'var(--space-6) 1fr',
            gap: 'var(--space-3)',
            paddingTop: 'var(--space-3)',
            borderTop: idx === 0 ? '1px solid var(--rule)' : 'none',
            paddingBottom: 'var(--space-3)',
          }}
        >
          <span
            aria-hidden
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8125rem',
              color: 'var(--ink-muted)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.04em',
            }}
          >
            {String(idx + 1).padStart(2, '0')}.
          </span>
          <div style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 'var(--space-3)' }}>
            {child}
          </div>
        </div>
      ))}
    </div>
  )
}

/* Hallmark · genre: editorial-minimal · macrostructure: workbench · design-system: design.md · designed-as-app */
