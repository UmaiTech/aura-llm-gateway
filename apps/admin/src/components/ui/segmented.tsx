import { cn } from '@/lib/utils'

interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Shorter label used below the `sm` breakpoint. */
  short?: string
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'default'
  className?: string
  'aria-label'?: string
}

/**
 * Pill-group selector used for time ranges and view toggles. Scrolls
 * horizontally rather than wrapping when it doesn't fit (phones).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'default',
  className,
  ...rest
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      className={cn(
        'no-scrollbar inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md border bg-muted/50 p-0.5',
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'focus-ring whitespace-nowrap rounded-[5px] font-medium transition-colors',
              size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs',
              active
                ? 'bg-card text-foreground shadow-[0_0_0_1px_hsl(var(--border))]'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.short ? (
              <>
                <span className="sm:hidden">{opt.short}</span>
                <span className="hidden sm:inline">{opt.label}</span>
              </>
            ) : (
              opt.label
            )}
          </button>
        )
      })}
    </div>
  )
}
