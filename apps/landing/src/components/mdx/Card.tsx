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
        'p-5 rounded-lg border border-gray-800 bg-gray-900/50',
        href && 'hover:border-aura-500/50 hover:bg-gray-800/50 transition-colors cursor-pointer'
      )}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="p-2 rounded-lg bg-aura-500/10">
            <Icon className="h-5 w-5 text-aura-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
          <div className="text-gray-400 text-sm [&>p]:mb-0">
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
