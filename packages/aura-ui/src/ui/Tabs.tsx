import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface TabItem<T extends string> {
  id: T
  label: ReactNode
}

interface TabsProps<T extends string> {
  /** Id prefix shared with the matching TabPanels (from `useTabsId()`). */
  ids: string
  /** Accessible name of the tab list. */
  label: string
  tabs: ReadonlyArray<TabItem<T>>
  value: T
  onChange: (id: T) => void
  className?: string
  /** `segmented` renders a pill group (e.g. the product switcher). */
  variant?: 'underline' | 'segmented'
}

/** Id prefix for one Tabs + TabPanel set. */
export function useTabsId(): string {
  return useId().replace(/:/g, '')
}

const tabId = (ids: string, id: string) => `${ids}-tab-${id}`
const panelId = (ids: string, id: string) => `${ids}-panel-${id}`

/**
 * WAI-ARIA tabs: roving tabindex, arrow/Home/End keys, automatic
 * activation. Changing tab swaps only the panel; focus stays on the tab
 * and the page does not scroll.
 */
export function Tabs<T extends string>({
  ids,
  label,
  tabs,
  value,
  onChange,
  className = '',
  variant = 'underline',
}: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(tabs[next].id)
    refs.current[next]?.focus({ preventScroll: true })
  }

  return (
    <div role="tablist" aria-label={label} className={`aui-tabs aui-tabs--${variant} ${className}`}>
      {tabs.map((tab, i) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={tabId(ids, tab.id)}
            aria-selected={selected}
            aria-controls={panelId(ids, tab.id)}
            tabIndex={selected ? 0 : -1}
            className="aui-tab"
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

/** Panel for the selected tab; render only the active one. */
export function TabPanel({
  ids,
  id,
  children,
  className = '',
}: {
  ids: string
  id: string
  children: ReactNode
  className?: string
}) {
  return (
    <div role="tabpanel" id={panelId(ids, id)} aria-labelledby={tabId(ids, id)} tabIndex={0} className={`aui-tabpanel ${className}`}>
      {children}
    </div>
  )
}
