import { useSettingsStore, useAuthStore } from '@/stores'
import { Button } from '@/components/ui'
import { SunLine, MoonLine, User2Line, ExitLine } from '@mingcute/react'

interface HeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

export function Header({ title, description, actions }: HeaderProps) {
  const { theme, setTheme } = useSettingsStore()
  const { logout } = useAuthStore()

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
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

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
        >
          <User2Line className="h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={logout}
          className="text-muted-foreground hover:text-destructive"
          title="Sign out"
        >
          <ExitLine className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}
