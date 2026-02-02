import { Menu, Wrench } from 'lucide-react'
import { cn } from '../lib/utils'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  onToggleSidebar: () => void
  sidebarOpen: boolean
  agentMode: boolean
  onAgentModeChange: (enabled: boolean) => void
}

export function Header({
  onToggleSidebar,
  sidebarOpen,
  agentMode,
  onAgentModeChange,
}: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border/50 glass px-4 shadow-premium">
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
          <img src="/logo.svg" alt="Aura" className="h-8 w-8 logo-pulse" />
          <span className="font-semibold text-lg hidden sm:inline">Aura</span>
        </div>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <ThemeToggle />

        {/* Agent mode toggle */}
        <button
          onClick={() => onAgentModeChange(!agentMode)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors",
            agentMode
              ? "border-primary-500 bg-primary-500/10 text-primary-400"
              : "border-border hover:bg-secondary text-muted-foreground"
          )}
          title={agentMode ? "Agent mode enabled (with tools)" : "Click to enable agent mode with tools"}
        >
          <Wrench className="h-4 w-4" />
          <span className="text-sm font-medium hidden sm:inline">
            {agentMode ? "Agent" : "Chat"}
          </span>
        </button>
      </div>
    </header>
  )
}
