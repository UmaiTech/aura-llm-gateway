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
    <div className="my-4 rounded-lg border border-gray-800 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'w-full flex items-center justify-between px-4 py-3 text-left',
          'bg-gray-900/50 hover:bg-gray-800/50 transition-colors',
          'text-white font-medium'
        )}
      >
        <span>{title}</span>
        <ChevronDown
          className={clsx(
            'h-5 w-5 text-gray-400 transition-transform duration-200',
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
        <div className="p-4 border-t border-gray-800 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          {children}
        </div>
      </div>
    </div>
  )
}
