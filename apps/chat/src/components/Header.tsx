import { useState } from 'react'
import { ChevronDown, Columns, LogOut, Menu, Wrench } from 'lucide-react'
import { cn } from '../lib/utils'
import { useSession, signOut } from '../lib/auth-client'
import { useChatStore } from '../stores/chatStore'
import { AgentToolsDialog } from './AgentToolsDialog'
import { DailyQuotaChip } from './DailyQuotaChip'
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
  const [agentDialogOpen, setAgentDialogOpen] = useState(false)
  // Tool selection state lives in chatStore (persisted). Header reads
  // and writes it here so the dialog can stay a thin presentational
  // component that doesn't need to know about Zustand.
  const enabledTools = useChatStore((s) => s.enabledTools)
  const toggleTool = useChatStore((s) => s.toggleTool)
  const compareMode = useChatStore((s) => s.compareMode)
  const setCompareMode = useChatStore((s) => s.setCompareMode)

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
        {/* Daily quota chip — hidden until first API call lands header data */}
        <DailyQuotaChip />

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Compare mode toggle — fan-out one prompt across up to 3
            panes, each with its own model/system-prompt/strategies.
            See CompareView for the full flow. Mutually exclusive
            with the single-pane chat (which keeps running its
            current conversation, just hidden). */}
        <button
          onClick={() => setCompareMode(!compareMode)}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors',
            compareMode
              ? 'border-aura-400 bg-aura-400/10 text-aura-400'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
          title={
            compareMode
              ? 'Exit compare mode.'
              : 'Compare outputs across up to 3 models side-by-side.'
          }
          aria-pressed={compareMode}
        >
          <Columns className="h-4 w-4" />
          <span className="text-sm font-medium hidden sm:inline">Compare</span>
        </button>

        {/* Agent tools — split control. The label/wrench toggles agent
            mode in one click (which is what the label "Agent"/"Chat"
            implies). The chevron opens the dialog for picking which
            tools are active. Earlier iteration used one button that
            opened the dialog instead of toggling, which broke the
            mental model — the label still suggested a toggle. */}
        <div
          className={cn(
            "inline-flex items-stretch rounded-lg border overflow-hidden",
            agentMode
              ? "border-primary-500"
              : "border-border"
          )}
        >
          <button
            onClick={() => onAgentModeChange(!agentMode)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 transition-colors",
              agentMode
                ? "bg-primary-500/10 text-primary-400"
                : "hover:bg-secondary text-muted-foreground"
            )}
            title={agentMode ? "Agent mode on. Click to switch to chat." : "Click to enable agent mode."}
            aria-pressed={agentMode}
          >
            <Wrench className="h-4 w-4" />
            <span className="text-sm font-medium hidden sm:inline">
              {agentMode ? "Agent" : "Chat"}
            </span>
          </button>
          <button
            onClick={() => setAgentDialogOpen(true)}
            className={cn(
              "flex items-center px-1.5 border-l transition-colors",
              agentMode
                ? "border-primary-500/50 bg-primary-500/10 text-primary-400 hover:bg-primary-500/20"
                : "border-border hover:bg-secondary text-muted-foreground"
            )}
            title="Configure agent tools"
            aria-label="Configure agent tools"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <UserMenu />
      </div>

      <AgentToolsDialog
        open={agentDialogOpen}
        onClose={() => setAgentDialogOpen(false)}
        agentMode={agentMode}
        onAgentModeChange={onAgentModeChange}
        enabledTools={enabledTools}
        onToggleTool={toggleTool}
      />
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
