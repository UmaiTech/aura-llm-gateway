import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useSettingsStore } from '@/stores'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const { sidebarCollapsed } = useSettingsStore()

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main
        className={cn(
          'min-h-screen transition-all duration-300',
          sidebarCollapsed ? 'ml-[72px]' : 'ml-[260px]'
        )}
      >
        <Outlet />
      </main>
    </div>
  )
}
