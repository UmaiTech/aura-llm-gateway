import * as React from 'react'
import { AlertLine, Refresh1Line } from '@mingcute/react'
import { cn } from '@/lib/utils'
import { describeError } from '@/lib/errors'
import { Button } from './button'

/**
 * Shared error / empty / loading states.
 *
 * Every page used to roll its own: a red "API error: 404" line, a
 * bordered red box, a centred Retry button, or — worse — a silent
 * "No data available" that hid the failure. These three components
 * give each situation one look:
 *
 *   <ErrorState error={err} what="gateway settings" onRetry={load} />
 *   <EmptyState title="No API keys yet" description="…" action={…} />
 *   <LoadingState label="Loading providers" />
 */

interface ErrorStateProps {
  /** Error object, ApiError, or legacy string message. */
  error: unknown
  /** Noun phrase for the thing that failed to load ("API keys"). */
  what?: string
  onRetry?: () => void
  retrying?: boolean
  /** `banner` sits inline above content; `page` centres in the body. */
  variant?: 'banner' | 'page'
  /** Extra actions rendered next to Retry (e.g. a Back link). */
  actions?: React.ReactNode
  className?: string
}

export function ErrorState({
  error,
  what,
  onRetry,
  retrying,
  variant = 'banner',
  actions,
  className,
}: ErrorStateProps) {
  const { title, hint, detail } = describeError(error, what)

  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-destructive/30 bg-destructive/[0.04] text-sm',
        variant === 'page' ? 'mx-auto w-full max-w-xl p-6' : 'p-4',
        className
      )}
    >
      <div className="flex gap-3">
        <AlertLine className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-muted-foreground leading-relaxed">{hint}</p>
          {detail && (
            <p className="font-mono text-xs text-muted-foreground/80 break-words">{detail}</p>
          )}
          {(onRetry || actions) && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {onRetry && (
                <Button size="sm" variant="outline" onClick={onRetry} loading={retrying}>
                  {!retrying && <Refresh1Line className="mr-1.5 h-3.5 w-3.5" />}
                  Try again
                </Button>
              )}
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  /** `compact` for use inside a card body; default fills a section. */
  size?: 'default' | 'compact'
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'default',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'compact' ? 'gap-1.5 py-8' : 'gap-2 py-14',
        className
      )}
    >
      {Icon && (
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      )}
      <p className={cn('font-medium', size === 'compact' ? 'text-sm' : 'text-base')}>{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function LoadingState({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center justify-center py-14 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground', className)}
    >
      {label}…
    </div>
  )
}
