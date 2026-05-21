import { ReactNode } from 'react'

interface ExpandableProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}

export function Expandable({ title, children, defaultOpen = false }: ExpandableProps) {
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="disclosure-body">{children}</div>
    </details>
  )
}

/* Hallmark · genre: editorial-minimal · macrostructure: workbench · design-system: design.md · designed-as-app */
