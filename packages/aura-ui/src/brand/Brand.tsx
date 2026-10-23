import {
  A_PATH,
  A_TILE_TRANSFORM,
  A_TRANSFORM,
  LETTERING,
  LETTERING_TRANSFORM,
  MARK_RING,
  MARK_VIEWBOX,
  WORDMARK_VIEWBOX,
} from './geometry.ts'

interface BrandProps {
  /** Rendered height in px. The mark is square; the wordmark is 250:72. */
  size?: number
  className?: string
  /**
   * Accessible name. Omit when the mark sits next to visible "Aura" text
   * or inside a link that already has a label: it is then aria-hidden.
   */
  title?: string
}

function a11y(title: string | undefined) {
  return title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const, focusable: 'false' as const }
}

/**
 * The ring + A mark. Uses the theme accent, so it follows light/dark
 * without variants. Keep it at 32px or larger; below that use
 * `variant="tile"`, the favicon form (no ring, larger A on a solid tile).
 */
export function BrandMark({ size = 32, className, title, variant = 'ring' }: BrandProps & { variant?: 'ring' | 'tile' }) {
  if (variant === 'tile') {
    return (
      <svg width={size} height={size} viewBox={MARK_VIEWBOX} className={className} {...a11y(title)}>
        <rect width="64" height="64" rx="14" fill="var(--aura-action, #6d28d9)" />
        <path fill="#fff" fillRule="evenodd" transform={A_TILE_TRANSFORM} d={A_PATH} />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox={MARK_VIEWBOX} className={className} {...a11y(title)}>
      <circle
        cx={MARK_RING.cx}
        cy={MARK_RING.cy}
        r={MARK_RING.r}
        fill="none"
        stroke="var(--aura-accent, #a78bfa)"
        strokeWidth={MARK_RING.strokeWidth}
      />
      <path fill="var(--aura-accent, #a78bfa)" fillRule="evenodd" transform={A_TRANSFORM} d={A_PATH} />
    </svg>
  )
}

/**
 * Mark + "Aura" lettering. The lettering takes `currentColor`, so set the
 * text colour on the parent. Recommended minimum width 120px (height ≈ 35).
 */
export function Wordmark({ size = 36, className, title = 'Aura' }: BrandProps) {
  return (
    <svg height={size} width={(size * 250) / 72} viewBox={WORDMARK_VIEWBOX} className={className} {...a11y(title)}>
      <circle
        cx={MARK_RING.cx}
        cy={MARK_RING.cy}
        r={MARK_RING.r}
        fill="none"
        stroke="var(--aura-accent, #a78bfa)"
        strokeWidth={MARK_RING.strokeWidth}
      />
      <path fill="var(--aura-accent, #a78bfa)" fillRule="evenodd" transform={A_TRANSFORM} d={A_PATH} />
      <g fill="currentColor" transform={LETTERING_TRANSFORM}>
        {LETTERING.map((glyph) => (
          <path key={glyph.transform} d={glyph.d} transform={glyph.transform} />
        ))}
      </g>
    </svg>
  )
}
