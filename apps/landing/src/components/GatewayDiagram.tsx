import { useState } from 'react'

/**
 * Aura architecture diagram — editorial-minimal, click-or-hover to inspect.
 *
 * Structure mirrors the blog post's architecture figure:
 *   row 1: three client surfaces (Chat UI · Agents · Applications)
 *   row 2: Aura Gateway frame with Middleware (5) + Core (3)
 *   row 3: seven named providers
 *   sidecar: Storage column (PostgreSQL · Redis · Prometheus)
 *   footer: POST /v1/responses ··· Open Responses API
 *
 * Color hierarchy: --accent-warm purple for the load-bearing pieces
 * (Aura Gateway frame, Core row, section markers); --ink and --rule
 * for everything else. Matches the favicon palette so the diagram
 * reads as part of the same family.
 *
 * No animation. The editorial-minimal voice treats animated flow
 * dots as the slop the redesign is reacting against — the diagram
 * pops through information density, not motion.
 */

type Block =
  | 'chat-ui'
  | 'agents'
  | 'applications'
  | 'auth'
  | 'rate-limiter'
  | 'response-cache'
  | 'compression'
  | 'logger'
  | 'provider-registry'
  | 'cost-calculator'
  | 'response-enrichment'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'ollama'
  | 'bedrock'
  | 'huggingface'
  | 'postgres'
  | 'redis'
  | 'prometheus'

interface BlockInfo {
  id: Block
  label: string
  blurb: string
}

const BLOCKS: Record<Block, BlockInfo> = {
  'chat-ui': {
    id: 'chat-ui',
    label: 'Chat UI',
    blurb:
      'User-facing apps stream conversational responses. The Aura Playground is the reference implementation — Open Responses API over SSE.',
  },
  agents: {
    id: 'agents',
    label: 'Agents',
    blurb:
      'Tool-using workflows. The gateway carries function-call / tool-call lifecycle items through the Open Responses API event stream end-to-end.',
  },
  applications: {
    id: 'applications',
    label: 'Applications',
    blurb:
      'APIs, workers, batch jobs, CLIs — any code that needs an LLM call. One Bearer token, structured cost + latency on every response.',
  },
  auth: {
    id: 'auth',
    label: 'Auth',
    blurb:
      'Bearer tokens with org · team · project · user scopes. Per-key rate limits and monthly token budgets enforced at the edge.',
  },
  'rate-limiter': {
    id: 'rate-limiter',
    label: 'Rate limiter',
    blurb:
      'Redis token-bucket per API key: requests-per-minute, monthly tokens, daily messages. Lua script atomically updates all three.',
  },
  'response-cache': {
    id: 'response-cache',
    label: 'Response cache',
    blurb:
      'SHA-256 keyed cache in Redis with per-route TTL. Skips the provider call entirely for hot prompts — the cheapest token is the one you never spend.',
  },
  compression: {
    id: 'compression',
    label: 'Compression',
    blurb:
      'TOON, AISP, YAML, JSON-minify. Auto-picks the right strategy per payload — 40-60% token savings on uniform arrays.',
  },
  logger: {
    id: 'logger',
    label: 'Logger',
    blurb:
      'Async Postgres pipeline. Every request gets cost_usd, latency_ms, token counts, and provider metadata — without blocking the response.',
  },
  'provider-registry': {
    id: 'provider-registry',
    label: 'Provider Registry',
    blurb:
      'Model strings → provider trait adapters. Smart routing picks the right backend (round-robin, weighted, cost-optimized, region-aware, sticky-session, circuit-broken fallback — eight strategies).',
  },
  'cost-calculator': {
    id: 'cost-calculator',
    label: 'Cost Calculator',
    blurb:
      'Per-model pricing for input · output · cached · reasoning tokens across all seven providers. Every response carries an authoritative cost_usd, not an estimate.',
  },
  'response-enrichment': {
    id: 'response-enrichment',
    label: 'Response Enrichment',
    blurb:
      'Adds latency_ms, agentic{} workflow context, and provider metadata to the response payload before it leaves the gateway.',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    blurb:
      'GPT-5, o-series reasoning models. Open Responses API native — tool calls and streaming pass through unchanged.',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    blurb:
      'Claude 4.5, 3.5 families. The gateway translates Anthropic’s messages format to Open Responses items transparently.',
  },
  google: {
    id: 'google',
    label: 'Google',
    blurb:
      'Gemini 3 and 2.5 Flash / Pro. SSE streaming and multimodal inputs supported through the same Open Responses contract.',
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    blurb:
      'Mistral Large, Codestral, FIM. OpenAI-compatible endpoint with first-class FIM (fill-in-the-middle) completion support.',
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    blurb:
      'Local inference for development, evals, and air-gapped deploys. Same Aura request shape as the hosted providers.',
  },
  bedrock: {
    id: 'bedrock',
    label: 'Bedrock',
    blurb:
      'AWS SigV4-signed calls to Bedrock. Claude, Llama, Mistral, and Titan families behind one IAM-scoped credential.',
  },
  huggingface: {
    id: 'huggingface',
    label: 'HuggingFace',
    blurb:
      'TGI endpoints and the Classic Inference API. Self-hosted open-weights models behind the same Bearer-token gateway as the proprietary ones.',
  },
  postgres: {
    id: 'postgres',
    label: 'PostgreSQL',
    blurb:
      'Source of truth for request logs, organisations, API keys, and end-user records. Provider credentials encrypted at rest with AES-256-GCM.',
  },
  redis: {
    id: 'redis',
    label: 'Redis',
    blurb:
      'Hot path for rate limits and the response cache. Lua scripts keep multi-bucket updates atomic.',
  },
  prometheus: {
    id: 'prometheus',
    label: 'Prometheus',
    blurb:
      'GET /metrics exposes request counters, latency histograms, cache hit-rate, and per-provider error rates in the Prometheus exposition format.',
  },
}

const DEFAULT_BLOCK: Block = 'provider-registry'

export function GatewayDiagram() {
  const [hovered, setHovered] = useState<Block | null>(null)
  const [clicked, setClicked] = useState<Block | null>(null)

  // Active = whatever is hovered, or whatever was last clicked, or
  // the default. Hover takes precedence so the diagram feels alive,
  // but click "pins" a selection that survives moving the cursor away.
  const active = hovered ?? clicked ?? DEFAULT_BLOCK
  const activeInfo = BLOCKS[active]

  return (
    <div
      style={{
        margin: 'var(--space-6) 0',
        display: 'grid',
        gap: 'var(--space-5)',
      }}
    >
      <div
        style={{
          padding: 'var(--space-5)',
          border: '1px solid var(--rule)',
          background: 'var(--canvas)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--accent-warm)',
            marginBottom: 'var(--space-2)',
          }}
        >
          Aura Architecture
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--ink-muted)',
            marginBottom: 'var(--space-5)',
          }}
        >
          Hover or click any box to see what it does.
        </div>

        <svg
          viewBox="0 0 960 620"
          role="img"
          aria-label="Aura gateway architecture diagram"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          {/* ─── ROW 1 · CLIENTS ───────────────────────────────── */}
          <DiagramBlock x={20} y={20} width={200} height={66} id="chat-ui" label="Chat UI" subtitle="user-facing apps" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} />
          <DiagramBlock x={240} y={20} width={200} height={66} id="agents" label="Agents" subtitle="tool-using workflows" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} />
          <DiagramBlock x={460} y={20} width={200} height={66} id="applications" label="Applications" subtitle="APIs, workers, CLIs" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} />

          {/* downlinks into the gateway */}
          <line x1="120" y1="86" x2="120" y2="116" stroke="var(--rule-strong)" strokeWidth="1" />
          <line x1="340" y1="86" x2="340" y2="116" stroke="var(--rule-strong)" strokeWidth="1" />
          <line x1="560" y1="86" x2="560" y2="116" stroke="var(--rule-strong)" strokeWidth="1" />

          {/* ─── GATEWAY FRAME ─────────────────────────────────── */}
          <rect x="20" y="116" width="640" height="338" fill="none" stroke="var(--accent-warm)" strokeWidth="1.5" rx="4" />
          <text x="36" y="138" fontFamily="var(--font-mono)" fontSize="11" letterSpacing="0.08em" fill="var(--accent-warm)">
            AURA GATEWAY
          </text>
          <text x="644" y="138" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="0.04em" fill="var(--ink-muted)" textAnchor="end">
            Axum router · Tokio async
          </text>

          {/* ─── MIDDLEWARE SECTION ────────────────────────────── */}
          <text x="36" y="166" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="0.08em" fill="var(--ink-muted)">
            MIDDLEWARE
          </text>
          <DiagramBlock x={36} y={178} width={120} height={56} id="auth" label="Auth" subtitle="bearer + scopes" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} />
          <DiagramBlock x={164} y={178} width={120} height={56} id="rate-limiter" label="Rate limiter" subtitle="Redis bucket" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} />
          <DiagramBlock x={292} y={178} width={120} height={56} id="response-cache" label="Response cache" subtitle="SHA256 · TTL" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} />
          <DiagramBlock x={420} y={178} width={120} height={56} id="compression" label="Compression" subtitle="TOON · AISP" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} />
          <DiagramBlock x={548} y={178} width={100} height={56} id="logger" label="Logger" subtitle="async → Postgres" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} />

          {/* ─── CORE SECTION ──────────────────────────────────── */}
          <text x="36" y="266" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="0.08em" fill="var(--ink-muted)">
            CORE
          </text>
          <DiagramBlock x={36} y={278} width={196} height={156} id="provider-registry" label="Provider Registry" subtitle="model → provider · trait adapters" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} variant="core" />
          <DiagramBlock x={240} y={278} width={196} height={156} id="cost-calculator" label="Cost Calculator" subtitle="per-model · input/output/cached/reasoning" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} variant="core" />
          <DiagramBlock x={444} y={278} width={204} height={156} id="response-enrichment" label="Response Enrichment" subtitle="cost_usd · latency_ms · agentic{}" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} variant="core" />

          {/* ─── ROW 3 · PROVIDERS ─────────────────────────────── */}
          {/* downlinks from gateway to providers */}
          {[60, 150, 240, 330, 420, 510, 600].map((x) => (
            <line key={x} x1={x} y1="454" x2={x} y2="484" stroke="var(--rule)" strokeWidth="1" />
          ))}
          <DiagramBlock x={20} y={484} width={80} height={56} id="openai" label="OpenAI" subtitle="GPT-5 · o-series" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} compact />
          <DiagramBlock x={110} y={484} width={80} height={56} id="anthropic" label="Anthropic" subtitle="Claude 4.5 · 3.5" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} compact />
          <DiagramBlock x={200} y={484} width={80} height={56} id="google" label="Google" subtitle="Gemini 3 · 2.5" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} compact />
          <DiagramBlock x={290} y={484} width={80} height={56} id="mistral" label="Mistral" subtitle="OAI-compatible" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} compact />
          <DiagramBlock x={380} y={484} width={80} height={56} id="ollama" label="Ollama" subtitle="local models" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} compact />
          <DiagramBlock x={470} y={484} width={80} height={56} id="bedrock" label="Bedrock" subtitle="AWS SigV4" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} compact />
          <DiagramBlock x={560} y={484} width={100} height={56} id="huggingface" label="HuggingFace" subtitle="TGI endpoints" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} compact />

          {/* ─── SIDECAR · STORAGE ─────────────────────────────── */}
          <rect x="680" y="20" width="260" height="434" fill="none" stroke="var(--rule)" strokeWidth="1" rx="4" />
          <text x="696" y="42" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="0.08em" fill="var(--ink-muted)">
            STORAGE (OPT) · METRICS
          </text>
          <DiagramBlock x={696} y={60} width={228} height={70} id="postgres" label="PostgreSQL" subtitle="request logs · orgs · keys · users" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} alignLeft />
          <DiagramBlock x={696} y={146} width={228} height={70} id="redis" label="Redis" subtitle="rate limits · response cache" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} alignLeft />
          <DiagramBlock x={696} y={232} width={228} height={70} id="prometheus" label="Prometheus" subtitle="/metrics endpoint" hovered={hovered} clicked={clicked} onHover={setHovered} onClick={setClicked} alignLeft />

          {/* AES note below the storage stack */}
          <line x1="696" y1="324" x2="924" y2="324" stroke="var(--rule)" strokeWidth="1" />
          <text x="696" y="350" fontFamily="var(--font-mono)" fontSize="11" fill="var(--accent-warm)" fontStyle="italic">
            AES-256-GCM for provider creds
          </text>

          {/* ─── FOOTER ────────────────────────────────────────── */}
          <line x1="20" y1="568" x2="940" y2="568" stroke="var(--rule)" strokeWidth="1" />
          <text x="20" y="596" fontFamily="var(--font-mono)" fontSize="12" fill="var(--ink)">
            <tspan fill="var(--accent-warm)">POST</tspan> /v1/responses
          </text>
          <text x="940" y="596" fontFamily="var(--font-mono)" fontSize="12" fill="var(--ink-muted)" fontStyle="italic" textAnchor="end">
            Open Responses API
          </text>
        </svg>
      </div>

      {/* ─── BLURB PANEL (updates on hover/click) ──────────────── */}
      <div
        style={{
          padding: 'var(--space-4)',
          borderLeft: '2px solid var(--accent-warm)',
          background: 'var(--canvas-elevated)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--accent-warm)',
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
            maxWidth: '70ch',
          }}
        >
          {activeInfo.blurb}
        </p>
      </div>
    </div>
  )
}

interface DiagramBlockProps {
  x: number
  y: number
  width: number
  height: number
  id: Block
  label: string
  subtitle?: string
  variant?: 'default' | 'core'
  compact?: boolean
  alignLeft?: boolean
  hovered: Block | null
  clicked: Block | null
  onHover: (b: Block | null) => void
  onClick: (b: Block) => void
}

function DiagramBlock({
  x,
  y,
  width,
  height,
  id,
  label,
  subtitle,
  variant = 'default',
  compact = false,
  alignLeft = false,
  hovered,
  clicked,
  onHover,
  onClick,
}: DiagramBlockProps) {
  const isActive = hovered === id || clicked === id
  const isCore = variant === 'core'

  // Color logic:
  // - Core blocks get the warm-purple accent treatment always (they're
  //   the load-bearing parts of the gateway).
  // - Everything else uses --ink + --rule-strong by default and lights
  //   up to --accent-warm when active.
  const stroke = isActive
    ? 'var(--accent-warm)'
    : isCore
      ? 'oklch(0.74 0.18 280 / 0.4)'
      : 'var(--rule-strong)'

  const fill = isActive
    ? 'oklch(0.74 0.18 280 / 0.08)'
    : isCore
      ? 'oklch(0.74 0.18 280 / 0.04)'
      : 'var(--canvas)'

  const labelColor = isActive || isCore ? 'var(--accent-warm)' : 'var(--ink)'

  const textX = alignLeft ? x + 16 : x + width / 2
  const textAnchor = alignLeft ? 'start' : 'middle'

  const labelFontSize = compact ? 13 : 15
  const subtitleFontSize = compact ? 10 : 11

  return (
    <g
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
      onClick={() => onClick(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(id)
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${label}${subtitle ? ` — ${subtitle}` : ''}`}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke={stroke}
        strokeWidth={isCore ? 1.5 : 1}
        rx="3"
      />
      <text
        x={textX}
        y={y + (subtitle ? height / 2 - 4 : height / 2 + 4)}
        textAnchor={textAnchor}
        fontFamily="var(--font-display)"
        fontWeight="500"
        fontSize={labelFontSize}
        fill={labelColor}
      >
        {label}
      </text>
      {subtitle && (
        <text
          x={textX}
          y={y + height / 2 + 14}
          textAnchor={textAnchor}
          fontFamily="var(--font-mono)"
          fontSize={subtitleFontSize}
          fill="var(--ink-muted)"
        >
          {subtitle}
        </text>
      )}
    </g>
  )
}

/* Hallmark · genre: editorial-minimal · macrostructure: stat-led · design-system: design.md · designed-as-app */
