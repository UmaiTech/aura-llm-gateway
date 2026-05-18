import { LogOut, Menu, Wrench } from 'lucide-react'
import { cn } from '../lib/utils'
import { useSession, signOut } from '../lib/auth-client'
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

        <UserMenu />
      </div>
    </header>
  )
}

/**
 * Compact user identity + sign-out control. Renders only when there's an
 * active session (which is always when AuthGate has admitted us into the
 * chat, but we guard anyway for the brief window during sign-out).
 */
function UserMenu() {
  const { data: session } = useSession()
  if (!session?.user) return null

  const handleSignOut = async () => {
    await signOut()
    // Reload so AuthGate re-renders the sign-in screen cleanly.
    window.location.href = '/'
  }

  const initial = (session.user.name || session.user.email || '?').charAt(0).toUpperCase()

  return (
    <button
      onClick={handleSignOut}
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors"
      title={`Signed in as ${session.user.email}. Click to sign out.`}
    >
      {session.user.image ? (
        <img
          src={session.user.image}
          alt={session.user.name || 'User avatar'}
          className="h-6 w-6 rounded-full"
        />
      ) : (
        <div className="h-6 w-6 rounded-full bg-aura-500/30 text-aura-300 flex items-center justify-center text-xs font-semibold">
          {initial}
        </div>
      )}
      <LogOut className="h-4 w-4 text-muted-foreground hidden sm:inline" />
    </button>
  )
}
