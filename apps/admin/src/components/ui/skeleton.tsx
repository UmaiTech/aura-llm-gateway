import { cn } from '@/lib/utils'

/** A muted placeholder block. Size it with utilities: `h-4 w-24`. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('shimmer h-4', className)} />
}

/** Placeholder for a <StatGrid> row while numbers load. */
export function SkeletonStats({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border',
        count >= 4 ? 'lg:grid-cols-4' : count === 3 ? 'lg:grid-cols-3' : '',
        count >= 5 && 'xl:grid-cols-5',
        className
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 bg-card p-5">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

/** Placeholder rows for a table or list card. */
export function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('divide-y divide-border/60', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 py-3.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 flex-1 max-w-[12rem]" />
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  )
}

/** Generic page-body skeleton: stats strip + a list card. */
export function SkeletonPage({ stats = 4, rows = 6 }: { stats?: number; rows?: number }) {
  return (
    <div className="space-y-6">
      {stats > 0 && <SkeletonStats count={stats} />}
      <div className="rounded-lg border bg-card p-5">
        <Skeleton className="mb-4 h-4 w-40" />
        <SkeletonRows rows={rows} />
      </div>
    </div>
  )
}
