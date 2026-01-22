import { Menu, ChevronDown, Sparkles } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { cn } from '../lib/utils'
import type { Model } from '../lib/types'

interface HeaderProps {
  model: Model
  models: Model[]
  onModelChange: (model: Model) => void
  onToggleSidebar: () => void
  sidebarOpen: boolean
}

export function Header({
  model,
  models,
  onModelChange,
  onToggleSidebar,
  sidebarOpen,
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-4">
      <div className="flex items-center gap-3">
        {/* Sidebar toggle */}
        <button
          onClick={onToggleSidebar}
          className={cn(
            "p-2 rounded-lg hover:bg-secondary transition-colors",
            !sidebarOpen && "bg-secondary"
          )}
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5 text-muted-foreground" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-aura-400 to-primary-500 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-lg hidden sm:inline">Aura</span>
        </div>
      </div>

      {/* Model selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors"
        >
          <span className="text-sm font-medium">{model.name}</span>
          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            dropdownOpen && "rotate-180"
          )} />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-border bg-popover shadow-lg z-50">
            <div className="p-1">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    onModelChange(m)
                    setDropdownOpen(false)
                  }}
                  className={cn(
                    "w-full flex flex-col items-start px-3 py-2 rounded-md text-left transition-colors",
                    model.id === m.id
                      ? "bg-primary-500/10 text-primary-400"
                      : "hover:bg-secondary"
                  )}
                >
                  <span className="font-medium text-sm">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right side placeholder */}
      <div className="w-10" />
    </header>
  )
}
