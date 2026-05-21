import { useSettingsStore, useAuthStore } from '@/stores'
import { Button } from '@/components/ui'
import { SunLine, MoonLine, User2Line, ExitLine } from '@mingcute/react'
import { signOutSession } from '@/lib/api'

interface HeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

export function Header({ title, description, actions }: HeaderProps) {
  const { theme, setTheme } = useSettingsStore()
  const { logout, sessionUser } = useAuthStore()

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  // If the user signed in via GitHub, also clear the server-side
  // better-auth session cookie. Bearer-key logins just need the
  // local store cleared.
  const handleLogout = async () => {
    if (sessionUser) {
      try {
        await signOutSession()
      } catch {
        // Even if the server call fails, clear local state so the
        // user isn't stuck looking at the dashboard with a stale
        // session.
      }
    }
    logout()
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {actions}

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="text-muted-foreground"
        >
          {theme === 'dark' ? (
            <SunLine className="h-5 w-5" />
          ) : (
            <MoonLine className="h-5 w-5" />
          )}
        </Button>

        <div className="mx-2 h-6 w-px bg-border" />

        {sessionUser ? (
          <div className="flex items-center gap-2 text-sm">
            <User2Line className="h-4 w-4 text-muted-foreground" />
            <span
              className="text-muted-foreground max-w-[180px] truncate"
              title={sessionUser.email}
            >
              {sessionUser.name ?? sessionUser.email}
            </span>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            title="Signed in via admin key"
          >
            <User2Line className="h-5 w-5" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="text-muted-foreground hover:text-destructive"
          title="Sign out"
        >
          <ExitLine className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}
