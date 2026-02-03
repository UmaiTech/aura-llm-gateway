import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores'
import {
  Home1Line,
  ChartBarLine,
  Message1Line,
  BugLine,
  AiLine,
  Key2Line,
  ServerLine,
  DocumentsLine,
  Settings1Line,
  Book2Line,
  GithubLine,
  ArrowLeftLine,
  ArrowRightLine,
  Building4Line,
  Group2Line,
  User2Line,
  DirectionsLine,
} from '@mingcute/react'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navigation: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', href: '/', icon: Home1Line },
      { name: 'Insights', href: '/insights', icon: ChartBarLine },
    ],
  },
  {
    label: 'Develop',
    items: [
      { name: 'Playground', href: '/playground', icon: Message1Line },
      { name: 'Dev Logs', href: '/dev-logs', icon: BugLine },
      { name: 'Harness', href: '/harness', icon: AiLine },
    ],
  },
  {
    label: 'Organization',
    items: [
      { name: 'Organizations', href: '/organizations', icon: Building4Line },
      { name: 'Teams', href: '/teams', icon: Group2Line },
      { name: 'End Users', href: '/end-users', icon: User2Line },
    ],
  },
  {
    label: 'Manage',
    items: [
      { name: 'API Keys', href: '/keys', icon: Key2Line },
      { name: 'Providers', href: '/providers', icon: ServerLine },
      { name: 'Routing', href: '/routing', icon: DirectionsLine },
      { name: 'Logs', href: '/logs', icon: DocumentsLine },
      { name: 'Settings', href: '/settings', icon: Settings1Line },
    ],
  },
]

const externalLinks = [
  { name: 'Docs', href: '/docs', icon: Book2Line },
  { name: 'GitHub', href: 'https://github.com', icon: GithubLine, external: true },
]

export function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar } = useSettingsStore()

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r bg-card transition-all duration-300',
        sidebarCollapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          <NavLink to="/" className="flex items-center gap-3">
            <img
              src="/favicon.svg"
              alt="Aura"
              className="h-9 w-9 rounded-lg"
            />
            {!sidebarCollapsed && (
              <div className="flex flex-col">
                <span className="font-semibold text-sm">Aura</span>
                <span className="text-2xs text-muted-foreground">Gateway</span>
              </div>
            )}
          </NavLink>
          <button
            onClick={toggleSidebar}
            className={cn(
              'rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
              sidebarCollapsed && 'absolute right-2'
            )}
          >
            {sidebarCollapsed ? (
              <ArrowRightLine className="h-4 w-4" />
            ) : (
              <ArrowLeftLine className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          {navigation.map((group) => (
            <div key={group.label} className="mb-6">
              {!sidebarCollapsed && (
                <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h3>
              )}
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const isActive = location.pathname === item.href
                  return (
                    <li key={item.name}>
                      <NavLink
                        to={item.href}
                        className={cn(
                          'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          sidebarCollapsed && 'justify-center px-0'
                        )}
                        title={sidebarCollapsed ? item.name : undefined}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                        )}
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        {!sidebarCollapsed && <span>{item.name}</span>}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* External Links */}
        <div className="border-t p-3">
          <ul className="space-y-1">
            {externalLinks.map((item) => (
              <li key={item.name}>
                <a
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                    sidebarCollapsed && 'justify-center px-0'
                  )}
                  title={sidebarCollapsed ? item.name : undefined}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <>
                      <span>{item.name}</span>
                      {item.external && (
                        <span className="ml-auto text-muted-foreground/50">↗</span>
                      )}
                    </>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  )
}
