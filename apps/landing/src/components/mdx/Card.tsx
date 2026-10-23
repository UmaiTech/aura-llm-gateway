import { ReactNode } from 'react'
import { clsx } from 'clsx'
import { LucideIcon } from 'lucide-react'

interface CardProps {
  title: string
  children: ReactNode
  icon?: LucideIcon
  href?: string
}

export function Card({ title, children, icon: Icon, href }: CardProps) {
  const content = (
    <div
      className={clsx(
        'p-5 rounded-panel border border-aura-border bg-aura-surface',
        href && 'hover:border-aura-accent/50 hover:bg-aura-hover transition-colors cursor-pointer'
      )}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="p-2 rounded-control bg-aura-accent/10">
            <Icon className="h-5 w-5 text-aura-accent" aria-hidden />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-aura-text mb-1">{title}</h3>
          <div className="text-aura-muted text-sm [&>p]:mb-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  )

  if (href) {
    return (
      <a href={href} className="block no-underline">
        {content}
      </a>
    )
  }

  return content
}

interface CardGridProps {
  children: ReactNode
  cols?: 1 | 2 | 3
}

export function CardGrid({ children, cols = 2 }: CardGridProps) {
  return (
    <div
      className={clsx(
        'my-6 grid gap-4',
        cols === 1 && 'grid-cols-1',
        cols === 2 && 'grid-cols-1 md:grid-cols-2',
        cols === 3 && 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
      )}
    >
      {children}
    </div>
  )
}
