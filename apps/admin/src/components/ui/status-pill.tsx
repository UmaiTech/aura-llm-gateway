import { cn } from '@/lib/utils'

export type StatusTone = 'success' | 'warning' | 'destructive' | 'info' | 'neutral' | 'accent'

/**
 * Known status strings → tone. Anything unknown renders neutral, so
 * new backend statuses degrade gracefully instead of turning green.
 */
const TONE_BY_STATUS: Record<string, StatusTone> = {
  completed: 'success',
  success: 'success',
  healthy: 'success',
  active: 'success',
  connected: 'success',
  enabled: 'success',
  approved: 'success',
  in_progress: 'info',
  running: 'info',
  pending: 'info',
  shadow: 'info',
  degraded: 'warning',
  incomplete: 'warning',
  over_limit: 'warning',
  warning: 'warning',
  failed: 'destructive',
  error: 'destructive',
  revoked: 'destructive',
  blocked: 'destructive',
  rejected: 'destructive',
  disconnected: 'destructive',
  inactive: 'neutral',
  disabled: 'neutral',
  no_data: 'neutral',
  expired: 'neutral',
}

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral'
  return TONE_BY_STATUS[status.toLowerCase()] ?? 'neutral'
}

const toneClass: Record<StatusTone, string> = {
  success: 'text-success border-success/25 bg-success/[0.07]',
  warning: 'text-warning border-warning/30 bg-warning/[0.08]',
  destructive: 'text-destructive border-destructive/25 bg-destructive/[0.07]',
  info: 'text-info border-info/25 bg-info/[0.07]',
  accent: 'text-brand border-brand/25 bg-brand/[0.07]',
  neutral: 'text-muted-foreground border-border bg-muted/60',
}

const dotClass: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
  accent: 'bg-brand',
  neutral: 'bg-muted-foreground/50',
}

interface StatusPillProps {
  /** Raw status string; also used as the label unless `label` is set. */
  status?: string | null
  label?: React.ReactNode
  tone?: StatusTone
  /** Show the leading dot (default true). */
  dot?: boolean
  className?: string
  title?: string
}

/** Small mono status label with a coloured dot: `● completed`. */
export function StatusPill({ status, label, tone, dot = true, className, title }: StatusPillProps) {
  const t = tone ?? statusTone(status)
  const text = label ?? (status ? status.replace(/_/g, ' ') : '—')
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-4',
        toneClass[t],
        className
      )}
    >
      {dot && <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', dotClass[t])} />}
      {text}
    </span>
  )
}

/** Bare status dot, for dense lists. */
export function StatusDot({ status, tone, className }: { status?: string | null; tone?: StatusTone; className?: string }) {
  const t = tone ?? statusTone(status)
  return <span aria-hidden className={cn('inline-block h-2 w-2 flex-shrink-0 rounded-full', dotClass[t], className)} />
}
