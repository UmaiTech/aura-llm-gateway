import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useSettingsStore } from '@/stores'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const { sidebarCollapsed } = useSettingsStore()

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <Sidebar />
      <main
        id="main"
        className={cn(
          'min-h-screen min-w-0 transition-[padding] duration-200 ease-out',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-[248px]'
        )}
      >
        <Outlet />
      </main>
    </div>
  )
}
