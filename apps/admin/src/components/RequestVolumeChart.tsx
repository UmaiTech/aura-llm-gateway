import { useMemo, useState } from 'react'
import { cn, formatNumber } from '@/lib/utils'
import type { TimelinePoint } from '@/lib/types'

interface RequestVolumeChartProps {
  points: TimelinePoint[]
  /** Hourly buckets get HH:00 labels; daily get MM-DD. */
  granularity: 'hour' | 'day'
  className?: string
}

const CHART_HEIGHT = 168 // px, plot area only

/**
 * Request volume as stacked bars (successful + errored) on a fixed
 * plot height.
 *
 * Replaces the old hand-rolled bars, which:
 *  - gave every bucket a 30px minimum, so an hour with 0 requests
 *    looked like steady traffic and the real bar barely stood out;
 *  - painted a whole bar red if it had a single error;
 *  - set `min-w-[40px]` per bar, so 24+ buckets overflowed the card.
 *
 * Here zero buckets render as a hairline tick on the baseline, bars
 * share the width (`flex-1 min-w-0`), and axis labels thin out so
 * they never collide. Hover/focus a bar to read its exact numbers.
 */
export function RequestVolumeChart({ points, granularity, className }: RequestVolumeChartProps) {
  const [active, setActive] = useState<number | null>(null)

  const { max, total, errors, peakIndex } = useMemo(() => {
    let max = 0
    let total = 0
    let errors = 0
    let peakIndex = -1
    points.forEach((p, i) => {
      total += p.request_count
      errors += p.error_count
      if (p.request_count > max) {
        max = p.request_count
        peakIndex = i
      }
    })
    return { max, total, errors, peakIndex }
  }, [points])

  const label = (ts: string) => {
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ts
    if (granularity === 'hour') return `${d.getHours().toString().padStart(2, '0')}:00`
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
  }

  // Show ~6 axis labels whatever the bucket count.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))
  // Round the scale up to a "nice" number so the gridline label reads well.
  const niceMax = niceCeil(max)
  const focus = active ?? peakIndex
  const focused = focus >= 0 ? points[focus] : null

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Summary line doubles as the hover readout. */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div>
          <span className="font-display text-2xl font-medium tracking-tight">{formatNumber(total)}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">requests</span>
        </div>
        {errors > 0 && (
          <div>
            <span className="font-mono text-sm text-destructive">{formatNumber(errors)}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">errored ({((errors / Math.max(total, 1)) * 100).toFixed(1)}%)</span>
          </div>
        )}
        {focused && total > 0 && (
          <div className="ml-auto text-xs text-muted-foreground">
            <span className="eyebrow mr-2">{active === null ? 'peak' : label(focused.timestamp)}</span>
            <span className="font-mono text-foreground">{formatNumber(focused.request_count)}</span>
            {active === null && <span> at {label(focused.timestamp)}</span>}
            {focused.error_count > 0 && <span className="text-destructive"> · {focused.error_count} err</span>}
          </div>
        )}
      </div>

      <div className="relative" style={{ height: CHART_HEIGHT }}>
        {/* Gridlines: top (scale max) and midpoint. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border/60" />
        <span className="pointer-events-none absolute right-0 top-1 font-mono text-[10px] text-muted-foreground">
          {formatNumber(niceMax)}
        </span>

        <div
          className="absolute inset-0 flex items-end gap-[3px] border-b border-border"
          onMouseLeave={() => setActive(null)}
        >
          {points.map((p, i) => {
            const ok = Math.max(0, p.request_count - p.error_count)
            const okPx = niceMax > 0 ? (ok / niceMax) * CHART_HEIGHT : 0
            const errPx = niceMax > 0 ? (Math.min(p.error_count, p.request_count) / niceMax) * CHART_HEIGHT : 0
            const empty = p.request_count === 0
            const isActive = active === i
            return (
              <button
                key={p.timestamp + i}
                type="button"
                className="group flex h-full min-w-0 flex-1 flex-col justify-end rounded-sm outline-none focus-visible:bg-muted"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${label(p.timestamp)}: ${p.request_count} requests${p.error_count ? `, ${p.error_count} errors` : ''}`}
              >
                {empty ? (
                  <span className="block h-px w-full bg-muted-foreground/30" />
                ) : (
                  <span className="flex w-full flex-col">
                    {/* Every non-empty bucket is at least 2px so it is never invisible. */}
                    <span
                      className={cn(
                        'block w-full rounded-t-[2px] bg-primary transition-opacity',
                        errPx > 0 && 'rounded-t-[2px]',
                        active !== null && !isActive && 'opacity-50'
                      )}
                      style={{ height: Math.max(okPx, errPx > 0 ? 0 : 2) }}
                    />
                    {errPx > 0 && (
                      <span
                        className={cn('block w-full bg-destructive transition-opacity', active !== null && !isActive && 'opacity-50')}
                        style={{ height: Math.max(errPx, 2) }}
                      />
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* X axis */}
      <div className="mt-2 flex gap-[3px]">
        {points.map((p, i) => (
          <span key={p.timestamp + i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap font-mono text-[10px] text-muted-foreground">
            {i % labelEvery === 0 ? label(p.timestamp) : ''}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-primary" /> Successful
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-destructive" /> Errored
        </span>
      </div>
    </div>
  )
}

function niceCeil(n: number): number {
  if (n <= 0) return 0
  if (n <= 5) return 5
  const pow = 10 ** Math.floor(Math.log10(n))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (n <= m * pow) return m * pow
  }
  return 10 * pow
}
