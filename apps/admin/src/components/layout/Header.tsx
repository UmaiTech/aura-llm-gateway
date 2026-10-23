import { useSettingsStore, useAuthStore } from '@/stores'
import { Button } from '@/components/ui'
import { SunLine, MoonLine, ExitLine, MenuLine } from '@mingcute/react'

interface HeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

/**
 * Sticky page header: serif page title, one-line description, page
 * actions on the right. Solid surface (no backdrop blur, audit S1).
 * Below `lg` a menu button opens the nav drawer, and the page actions
 * scroll horizontally instead of squeezing the title.
 */
export function Header({ title, description, actions }: HeaderProps) {
  const { theme, setTheme, setMobileNavOpen } = useSettingsStore()
  const { logout } = useAuthStore()

  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <header className="sticky top-0 z-30 border-b bg-background">
      <div className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-1.5 text-muted-foreground lg:hidden"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
          aria-controls="app-sidebar"
        >
          <MenuLine className="h-[18px] w-[18px]" />
        </Button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-medium leading-tight tracking-tight sm:text-[22px]">
            {title}
          </h1>
          {description && (
            <p className="hidden truncate text-[13px] text-muted-foreground sm:block">{description}</p>
          )}
        </div>

        {actions && (
          <div className="no-scrollbar hidden max-w-[60%] items-center gap-2 overflow-x-auto md:flex">
            {actions}
          </div>
        )}

        <div className="flex flex-shrink-0 items-center gap-0.5 border-l pl-2 sm:pl-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="text-muted-foreground"
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            title={isDark ? 'Light theme' : 'Dark theme'}
          >
            {isDark ? <SunLine className="h-4 w-4" /> : <MoonLine className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={logout}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Sign out"
            title="Sign out"
          >
            <ExitLine className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Page actions on small screens get their own scrollable row. */}
      {actions && (
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto border-t px-4 py-2 sm:px-6 md:hidden">
          {actions}
        </div>
      )}
    </header>
  )
}
