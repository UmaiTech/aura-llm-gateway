import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { BrandMark } from '@aura/ui/brand/Brand.tsx'
import { useSettingsStore } from '@/stores'
import {
  Home1Line,
  ChartBarLine,
  Message1Line,
  BugLine,
  AiLine,
  Key2Line,
  ServerLine,
  Settings1Line,
  Book2Line,
  GithubLine,
  ArrowLeftLine,
  ArrowRightLine,
  CloseLine,
  Building4Line,
  Group2Line,
  User2Line,
  DirectionsLine,
  Sparkles2Line,
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
      { name: 'Features', href: '/features', icon: Sparkles2Line },
      { name: 'Settings', href: '/settings', icon: Settings1Line },
    ],
  },
]

const externalLinks = [
  {
    name: 'Docs',
    href: 'https://aura-llm.dev/docs',
    icon: Book2Line,
    external: true,
  },
  {
    name: 'GitHub',
    href: 'https://github.com/UmaiTech/aura-llm-gateway',
    icon: GithubLine,
    external: true,
  },
]

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * App navigation. On `lg+` it's a fixed rail (collapsible to icons);
 * below `lg` it becomes an off-canvas drawer opened from the header's
 * menu button, with a scrim that closes it.
 */
export function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useSettingsStore()

  // Close the drawer whenever the route changes (tap a link → navigate).
  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname, setMobileNavOpen])

  // Escape closes the drawer.
  useEffect(() => {
    if (!mobileNavOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileNavOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileNavOpen, setMobileNavOpen])

  // Collapsed icon rail only applies on desktop; the drawer is always full width.
  const collapsed = sidebarCollapsed && !mobileNavOpen

  return (
    <>
      <div
        aria-hidden
        onClick={() => setMobileNavOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden',
          mobileNavOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />
      <aside
        id="app-sidebar"
        aria-label="Primary"
        className={cn(
          'fixed left-0 top-0 z-50 flex h-[100dvh] w-[248px] flex-col border-r bg-card transition-[transform,width] duration-200 ease-out',
          mobileNavOpen ? 'translate-x-0 shadow-panel lg:shadow-none' : '-translate-x-full',
          'lg:translate-x-0',
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-[248px]'
        )}
      >
        {/* Wordmark */}
        <div className={cn('flex h-14 flex-shrink-0 items-center border-b px-4', collapsed ? 'justify-center px-0' : 'justify-between')}>
          <NavLink to="/" className="flex items-center gap-2.5 focus-ring rounded-md">
            <BrandMark size={32} title={collapsed ? 'Aura' : undefined} />
            {!collapsed && (
              <span className="flex items-baseline gap-1.5">
                <span className="font-display text-[17px] font-medium tracking-tight">Aura</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">admin</span>
              </span>
            )}
          </NavLink>
          {!collapsed && (
            <button
              onClick={() => (mobileNavOpen ? setMobileNavOpen(false) : toggleSidebar())}
              className="focus-ring rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={mobileNavOpen ? 'Close navigation' : 'Collapse sidebar'}
            >
              {mobileNavOpen ? <CloseLine className="h-4 w-4" /> : <ArrowLeftLine className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className={cn('flex-1 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
          {navigation.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden />
              ) : (
                <h3 className="eyebrow mb-1.5 px-2.5 text-[10px]">{group.label}</h3>
              )}
              <ul className="space-y-px">
                {group.items.map((item) => {
                  const isActive = isActivePath(location.pathname, item.href)
                  return (
                    <li key={item.name}>
                      <NavLink
                        to={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'focus-ring relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                          isActive
                            ? 'bg-accent text-foreground font-medium'
                            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                          collapsed && 'justify-center px-0 py-2'
                        )}
                        title={collapsed ? item.name : undefined}
                      >
                        {isActive && (
                          <span aria-hidden className="absolute -left-3 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-brand" />
                        )}
                        <item.icon className={cn('h-4 w-4 flex-shrink-0', isActive && 'text-brand')} />
                        {!collapsed && <span className="truncate">{item.name}</span>}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* External links + collapse toggle */}
        <div className={cn('flex-shrink-0 border-t py-3', collapsed ? 'px-2' : 'px-3')}>
          <ul className="space-y-px">
            {externalLinks.map((item) => (
              <li key={item.name}>
                <a
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  className={cn(
                    'focus-ring flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground',
                    collapsed && 'justify-center px-0 py-2'
                  )}
                  title={collapsed ? item.name : undefined}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span>{item.name}</span>
                      {item.external && (
                        <span className="ml-auto font-mono text-[11px] text-muted-foreground/60" aria-hidden>↗</span>
                      )}
                    </>
                  )}
                </a>
              </li>
            ))}
            {collapsed && (
              <li>
                <button
                  onClick={toggleSidebar}
                  className="focus-ring flex w-full items-center justify-center rounded-md py-2 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                >
                  <ArrowRightLine className="h-4 w-4" />
                </button>
              </li>
            )}
          </ul>
        </div>
      </aside>
    </>
  )
}
