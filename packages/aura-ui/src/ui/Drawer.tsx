import { useEffect, useId, useRef, type ReactNode } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** Secondary line under the title (ids, timestamps). */
  subtitle?: ReactNode
  children: ReactNode
  /** Sticky footer (notes, actions). */
  footer?: ReactNode
  /** Accessible label for the close button. */
  closeLabel?: string
  className?: string
}

/**
 * Side drawer used for request/decision detail in every app. A modal
 * dialog: focus moves inside on open, Tab cycles within it, Escape or the
 * backdrop closes it, and focus returns to the element that opened it.
 * Full width on phones.
 */
export function Drawer({ open, onClose, title, subtitle, children, footer, closeLabel = 'Close', className = '' }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel)?.focus({ preventScroll: true })

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = previousOverflow
      opener?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  return (
    <div className="aui-drawer-root">
      <div className="aui-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`aui-drawer ${className}`}
      >
        <div className="aui-drawer-head">
          <div className="aui-drawer-titles">
            <h2 id={titleId} className="aui-drawer-title">
              {title}
            </h2>
            {subtitle && <div className="aui-drawer-subtitle">{subtitle}</div>}
          </div>
          <button type="button" className="aui-icon-button" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        </div>
        <div className="aui-drawer-body">{children}</div>
        {footer && <div className="aui-drawer-foot">{footer}</div>}
      </div>
    </div>
  )
}
