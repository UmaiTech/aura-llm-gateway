/**
 * Runtime model catalog from the gateway (`GET /v1/models`, see
 * crates/aura-proxy/src/routes/models.rs). The playground's built-in model
 * list stays the fallback; the catalog decides which auto aliases are
 * actually offered, so a gateway with auto routing off never shows them.
 * Pure and dependency-free (catalog.test.ts).
 */
import type { Model } from './types.ts'

export interface RuntimeCatalog {
  /** `auto.enabled`; false when the gateway reports no auto object. */
  autoEnabled: boolean
  /** Accepted auto aliases, in the gateway's order. */
  autoAliases: string[]
  /** Mode used for plain `auto`. */
  defaultMode: string | null
  /** Pinned models are shadow-scored on this gateway. */
  shadowForPinned: boolean
  /** Every servable model id. */
  modelIds: Set<string>
}

/** Parse a `/v1/models` body; null when it isn't the expected shape. */
export function parseCatalog(body: unknown): RuntimeCatalog | null {
  if (!body || typeof body !== 'object') return null
  const b = body as { data?: unknown; auto?: unknown }
  if (!Array.isArray(b.data)) return null
  const modelIds = new Set(
    b.data
      .map((m) => (m && typeof m === 'object' ? (m as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === 'string'),
  )
  const auto = b.auto && typeof b.auto === 'object' ? (b.auto as Record<string, unknown>) : null
  const aliases = Array.isArray(auto?.aliases) ? auto.aliases.filter((a): a is string => typeof a === 'string') : []
  return {
    autoEnabled: auto?.enabled === true,
    autoAliases: auto?.enabled === true ? aliases : [],
    defaultMode: typeof auto?.default_mode === 'string' ? auto.default_mode : null,
    shadowForPinned: auto?.shadow_for_pinned_models === true,
    modelIds,
  }
}

const MODE_COPY: Record<string, { name: string; description: string }> = {
  balanced: {
    name: 'Auto · balanced',
    description: 'Neutral: scores complexity, picks a tier, then an eligible model in it',
  },
  cost: { name: 'Auto · cost', description: 'Shifts the score toward cheaper tiers; hard requests still move up' },
  quality: { name: 'Auto · quality', description: 'Shifts the score toward stronger tiers for borderline requests' },
}

/** Mode an alias selects: `auto` → the gateway default (or balanced). */
export function aliasMode(alias: string, defaultMode: string | null = null): string {
  const suffix = alias.startsWith('auto:') ? alias.slice(5) : ''
  return suffix || defaultMode || 'balanced'
}

function autoModel(alias: string, defaultMode: string | null): Model {
  const mode = aliasMode(alias, defaultMode)
  const copy = MODE_COPY[mode] ?? { name: `Auto · ${mode}`, description: 'Gateway auto routing' }
  return {
    id: alias,
    // Plain `auto` takes the gateway's default mode, which may not be balanced.
    name: alias === 'auto' && mode !== 'balanced' ? `${copy.name} (gateway default)` : copy.name,
    provider: 'aura',
    tier: 'free',
    description: copy.description,
    mode,
  }
}

/**
 * The model list to offer: auto aliases first (from the gateway when it
 * answered, otherwise the built-in ones), then the built-in concrete
 * models. `auto:balanced` is folded into `auto` unless the gateway's
 * default mode differs, to avoid two entries meaning the same thing.
 */
export function resolveModels(builtIn: Model[], catalog: RuntimeCatalog | null): Model[] {
  const concrete = builtIn.filter((m) => m.provider !== 'aura')
  if (!catalog) return builtIn
  if (!catalog.autoEnabled) return concrete
  const aliases = catalog.autoAliases.filter(
    (a) => !(a === 'auto:balanced' && aliasMode('auto', catalog.defaultMode) === 'balanced' && catalog.autoAliases.includes('auto')),
  )
  return [...aliases.map((a) => autoModel(a, catalog.defaultMode)), ...concrete]
}
