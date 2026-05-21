import { ReactNode } from 'react'

type CalloutType = 'info' | 'warning' | 'danger' | 'tip' | 'success'

interface CalloutProps {
  type?: CalloutType
  title?: string
  children: ReactNode
}

const defaultLabels: Record<CalloutType, string> = {
  info: 'Note',
  warning: 'Warning',
  danger: 'Danger',
  tip: 'Tip',
  success: 'Success',
}

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const label = title ?? defaultLabels[type]

  return (
    <aside data-callout={type}>
      <span className="callout-label">{label}</span>
      <div>{children}</div>
    </aside>
  )
}

/* Hallmark · genre: editorial-minimal · macrostructure: workbench · design-system: design.md · designed-as-app */
