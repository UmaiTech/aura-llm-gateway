import { cn } from '@/lib/utils'

/**
 * Aura ring+A mark from the design pack's brand kit
 * (public/brand/, see README.md there for provenance and licences).
 * Ink violet on light backgrounds, light violet on dark ones; both are
 * rendered and the theme class picks one, so there's no flash on
 * theme change. Use at 32px or larger per the brand-kit guidance.
 */
export function BrandMark({ className }: { className?: string }) {
  const base = import.meta.env.BASE_URL
  return (
    <span className={cn('inline-block flex-shrink-0', className)}>
      <img src={`${base}brand/aura-mark-ink.svg`} alt="" className="h-full w-full dark:hidden" />
      <img src={`${base}brand/aura-mark-violet.svg`} alt="" className="hidden h-full w-full dark:block" />
    </span>
  )
}
