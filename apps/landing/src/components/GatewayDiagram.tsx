import { useState } from 'react'

/**
 * Editorial-minimal architecture diagram.
 *
 * Replaces the static feature blocks the old landing used (icon +
 * 3-line description card grids) with a labeled flow diagram: client
 * → gateway sub-blocks → provider. Hovering any sub-block highlights
 * it and reveals a one-paragraph blurb below the SVG.
 *
 * Decisions:
 *
 * - Pure SVG, no animations. Animated dots flowing through pipes feel
 *   appropriate on marketing pages with louder visual languages; in
 *   the editorial-minimal voice they'd read as the slop the redesign
 *   was meant to remove. The hairlines + small dots do the "this is
 *   a flow" job statically.
 *
 * - Hover highlight in --accent (cyan). Matches the section-marker
 *   restraint elsewhere on the page.
 *
 * - Mobile fallback: SVG scales via viewBox; the blurb below
 *   reflows. No separate mobile layout needed at this size.
 *
 * - Labels in mono, lowercase. Matches the §-marker eyebrow style.
 *
 * Subjects to one-line tweet copy in the blurb panel, not feature-
 * card-grid prose.
 */

type Block =
  | 'client'
  | 'auth'
  | 'routing'
  | 'compression'
  | 'provider'

interface BlockInfo {
  id: Block
  label: string
  blurb: string
}

const BLOCKS: BlockInfo[] = [
  {
    id: 'client',
    label: 'your app',
    blurb:
      'Send Open Responses API requests to Aura the same way you would to OpenAI — same shape, same SSE streaming, your choice of model.',
  },
  {
    id: 'auth',
    label: 'auth · cost',
    blurb:
      'Per-key auth, per-request USD costing across seven providers, structured request logs to Postgres. Every response carries the real numbers.',
  },
  {
    id: 'routing',
    label: 'routing',
    blurb:
      'Eight strategies — round-robin, weighted, region-aware, cost-optimized, sticky-session. Circuit breaker fails over to a healthy provider on the same call.',
  },
  {
    id: 'compression',
    label: 'compression',
    blurb:
      'TOON, AISP, YAML, and JSON compression strategies cut token usage 40–60% on uniform arrays. The compressor auto-picks per payload.',
  },
  {
    id: 'provider',
    label: 'providers',
    blurb:
      'OpenAI, Anthropic, Google, Mistral, Ollama, HuggingFace, AWS Bedrock — switched with a string, not a rewrite.',
  },
]

export function GatewayDiagram() {
  const [hovered, setHovered] = useState<Block | null>(null)

  const active = hovered ?? 'client'
  const activeInfo = BLOCKS.find((b) => b.id === active)!

  return (
    <div
      style={{
        margin: 'var(--space-6) 0',
        display: 'grid',
        gap: 'var(--space-5)',
      }}
    >
      <svg
        viewBox="0 0 720 280"
        role="img"
        aria-label="Aura gateway architecture: client → gateway (auth, routing, compression) → providers"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {/* Hairline base — sits behind blocks, suggests data flow */}
        <line
          x1="40"
          y1="140"
          x2="680"
          y2="140"
          stroke="var(--rule)"
          strokeWidth="1"
        />

        {/* Client */}
        <DiagramBlock
          x={40}
          y={100}
          width={120}
          height={80}
          id="client"
          label="your app"
          subtitle="POST /v1/responses"
          hovered={hovered}
          onHover={setHovered}
        />

        {/* Gateway container — three sub-blocks */}
        <rect
          x="200"
          y="40"
          width="320"
          height="200"
          fill="none"
          stroke="var(--rule)"
          strokeWidth="1"
        />
        <text
          x="216"
          y="58"
          fontFamily="var(--font-mono)"
          fontSize="10"
          letterSpacing="0.08em"
          fill="var(--accent)"
        >
          AURA GATEWAY
        </text>

        <DiagramBlock
          x={216}
          y={80}
          width={288}
          height={42}
          id="auth"
          label="auth · cost"
          hovered={hovered}
          onHover={setHovered}
        />
        <DiagramBlock
          x={216}
          y={132}
          width={288}
          height={42}
          id="routing"
          label="routing"
          hovered={hovered}
          onHover={setHovered}
        />
        <DiagramBlock
          x={216}
          y={184}
          width={288}
          height={42}
          id="compression"
          label="compression"
          hovered={hovered}
          onHover={setHovered}
        />

        {/* Providers */}
        <DiagramBlock
          x={560}
          y={100}
          width={120}
          height={80}
          id="provider"
          label="providers"
          subtitle="7 ✕"
          hovered={hovered}
          onHover={setHovered}
        />

        {/* Tiny direction dots, no animation */}
        {[170, 540].map((x) => (
          <circle key={x} cx={x} cy="140" r="2" fill="var(--accent)" />
        ))}
      </svg>

      {/* Blurb panel — updates on hover. Defaults to the 'client'
          block on first render so visitors see something even before
          they interact. */}
      <div
        style={{
          padding: 'var(--space-4)',
          borderLeft: '2px solid var(--accent)',
          background: 'var(--canvas-elevated)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            marginBottom: 'var(--space-2)',
          }}
        >
          {activeInfo.label}
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '0.9375rem',
            lineHeight: 1.6,
            color: 'var(--ink-muted)',
            maxWidth: '60ch',
          }}
        >
          {activeInfo.blurb}
        </p>
      </div>
    </div>
  )
}

function DiagramBlock({
  x,
  y,
  width,
  height,
  id,
  label,
  subtitle,
  hovered,
  onHover,
}: {
  x: number
  y: number
  width: number
  height: number
  id: Block
  label: string
  subtitle?: string
  hovered: Block | null
  onHover: (b: Block | null) => void
}) {
  const isActive = hovered === id
  return (
    <g
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
      tabIndex={0}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={isActive ? 'oklch(0.74 0.16 230 / 0.08)' : 'var(--canvas)'}
        stroke={isActive ? 'var(--accent)' : 'var(--rule-strong)'}
        strokeWidth="1"
      />
      <text
        x={x + width / 2}
        y={y + height / 2 + (subtitle ? -4 : 4)}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="13"
        fill={isActive ? 'var(--accent)' : 'var(--ink)'}
      >
        {label}
      </text>
      {subtitle && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 14}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="10"
          fill="var(--ink-muted)"
        >
          {subtitle}
        </text>
      )}
    </g>
  )
}

/* Hallmark · genre: editorial-minimal · macrostructure: stat-led · design-system: design.md · designed-as-app */
