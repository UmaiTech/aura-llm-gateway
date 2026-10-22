import * as React from 'react'
import { cn } from '@/lib/utils'

type CalloutTone = 'note' | 'warning' | 'danger' | 'success'

const toneClass: Record<CalloutTone, string> = {
  note: 'border-l-border',
  success: 'border-l-success',
  warning: 'border-l-warning',
  danger: 'border-l-destructive',
}

const labelClass: Record<CalloutTone, string> = {
  note: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
}

/**
 * Left-ruled note with a mono label, no fill and no icon — the same
 * callout shape as the landing docs (design.md §6 "Callout").
 */
export function Callout({
  tone = 'note',
  label,
  children,
  className,
}: {
  tone?: CalloutTone
  label?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <aside
      className={cn(
        'rounded-r-md border border-l-2 bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground',
        toneClass[tone],
        className
      )}
    >
      <span className={cn('eyebrow mb-1 block', labelClass[tone])}>{label ?? tone}</span>
      <div className="[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:text-[0.85em] [&_code]:text-foreground">
        {children}
      </div>
    </aside>
  )
}
