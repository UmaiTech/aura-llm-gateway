import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Thin table primitives so every data table shares header type,
 * row rhythm and the horizontal-scroll wrapper on narrow screens.
 * Plain elements underneath — pass any td/th props through.
 */
export const Table = React.forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }
>(({ className, wrapperClassName, ...props }, ref) => (
  <div className={cn('w-full overflow-x-auto', wrapperClassName)}>
    <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
  </div>
))
Table.displayName = 'Table'

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }
>(({ className, sticky, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn('[&_tr]:border-b', sticky && 'sticky top-0 z-10 bg-card', className)}
    {...props}
  />
))
TableHeader.displayName = 'TableHeader'

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
))
TableBody.displayName = 'TableBody'

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean; selected?: boolean }
>(({ className, interactive, selected, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b border-border/60 transition-colors',
      interactive && 'cursor-pointer hover:bg-muted/50',
      selected && 'bg-brand/[0.06]',
      className
    )}
    {...props}
  />
))
TableRow.displayName = 'TableRow'

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(({ className, numeric, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'eyebrow h-10 whitespace-nowrap px-3 text-left align-middle first:pl-0 last:pr-0',
      numeric && 'text-right',
      className
    )}
    {...props}
  />
))
TableHead.displayName = 'TableHead'

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(({ className, numeric, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'px-3 py-3 align-middle first:pl-0 last:pr-0',
      numeric && 'text-right font-mono text-[13px] tabular-nums',
      className
    )}
    {...props}
  />
))
TableCell.displayName = 'TableCell'
