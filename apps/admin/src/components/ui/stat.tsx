import * as React from 'react'
import { ArrowDownLine, ArrowUpLine } from '@mingcute/react'
import { cn } from '@/lib/utils'

/**
 * Editorial stat strip: one hairline-ruled grid, serif numbers, mono
 * labels. Replaces the per-page "coloured icon tile + number" cards
 * (audit L4/C5) so every page's headline numbers look the same.
 *
 *   <StatGrid>
 *     <Stat label="Requests (24h)" value="13,000" />
 *     <Stat label="Cost" value="$100" delta={-3.2} deltaGoodWhen="down" />
 *   </StatGrid>
 */
export function StatGrid({
  children,
  className,
  columns,
}: {
  children: React.ReactNode
  className?: string
  /** Desktop column count; defaults to the number of children (max 6). */
  columns?: 2 | 3 | 4 | 5 | 6
}) {
  const count = columns ?? Math.min(React.Children.toArray(children).filter(Boolean).length, 6)
  // Hairlines come from each cell's top/left border, with the inner grid
  // pulled up/left by 1px so the outer edge doesn't double. Unlike a
  // `gap-px bg-border` grid, a short last row leaves card-coloured
  // space instead of a grey block.
  return (
    <div className={cn('overflow-hidden rounded-lg border bg-card', className)}>
      <div
        className={cn(
          '-ml-px -mt-px grid grid-cols-2',
          count === 3 && 'md:grid-cols-3',
          count === 4 && 'lg:grid-cols-4',
          count === 5 && 'md:grid-cols-3 xl:grid-cols-5',
          count === 6 && 'md:grid-cols-3 xl:grid-cols-6'
        )}
      >
        {children}
      </div>
    </div>
  )
}

interface StatProps {
  label: string
  value: React.ReactNode
  /** Small line under the label, e.g. "3950 ok / 50 failed". */
  hint?: React.ReactNode
  /** Percent change vs previous period. */
  delta?: number | null
  /** Whether a falling number is good news (latency, cost). */
  deltaGoodWhen?: 'up' | 'down'
  /** Optional small icon shown beside the label (muted, never a tile). */
  icon?: React.ComponentType<{ className?: string }>
  tone?: 'default' | 'success' | 'warning' | 'destructive'
  className?: string
  valueRef?: React.Ref<HTMLSpanElement>
}

export function Stat({
  label,
  value,
  hint,
  delta,
  deltaGoodWhen = 'up',
  icon: Icon,
  tone = 'default',
  className,
  valueRef,
}: StatProps) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta) && delta !== 0
  const good = hasDelta && (deltaGoodWhen === 'up' ? delta! > 0 : delta! < 0)

  return (
    <div className={cn('flex min-w-0 flex-col border-l border-t p-4 sm:p-5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span
          ref={valueRef}
          className={cn(
            'truncate font-display text-2xl font-medium leading-none tracking-tight sm:text-[1.75rem]',
            tone === 'success' && 'text-success',
            tone === 'warning' && 'text-warning',
            tone === 'destructive' && 'text-destructive'
          )}
        >
          {value}
        </span>
        {hasDelta && (
          <span
            className={cn(
              'inline-flex flex-shrink-0 items-center gap-0.5 font-mono text-xs',
              good ? 'text-success' : 'text-destructive'
            )}
          >
            {delta! > 0 ? <ArrowUpLine className="h-3 w-3" /> : <ArrowDownLine className="h-3 w-3" />}
            {Math.abs(delta!).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="eyebrow mt-3 flex items-center gap-1.5 truncate">
        {Icon && <Icon className="h-3 w-3 flex-shrink-0" />}
        {label}
      </p>
      {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
