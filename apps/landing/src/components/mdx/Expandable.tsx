import { useState, ReactNode } from 'react'
import { clsx } from 'clsx'
import { ChevronDown } from 'lucide-react'

interface ExpandableProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}

export function Expandable({ title, children, defaultOpen = false }: ExpandableProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="my-4 rounded-panel border border-aura-border overflow-hidden">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'w-full flex items-center justify-between px-4 py-3 text-left',
          'bg-aura-surface hover:bg-aura-hover transition-colors',
          'text-aura-text font-medium'
        )}
      >
        <span>{title}</span>
        <ChevronDown
          className={clsx(
            'h-5 w-5 text-aura-dim transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      <div
        className={clsx(
          'overflow-hidden transition-all duration-200',
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="p-4 border-t border-aura-border [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          {children}
        </div>
      </div>
    </div>
  )
}
