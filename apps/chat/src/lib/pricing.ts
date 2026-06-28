// Model pricing per million tokens (USD).
//
// Source of truth is the gateway's pricing DB, exposed at GET /api/pricing
// (populated by the weekly scraper). `loadLivePricing()` fetches it once at
// startup and overlays it on top of the hardcoded FALLBACK_PRICING below.
// The fallback exists so the playground still costs conversations when the
// API is unreachable (local `vite dev`) or before the fetch resolves —
// `calculateCost` stays synchronous for its many call sites.

export interface ModelPricing {
  inputPerMillion: number
  outputPerMillion: number
}

// Hardcoded reference prices — fallback only. Kept current-ish by hand; the
// live values from /api/pricing take precedence once loaded.
export const FALLBACK_PRICING: Record<string, ModelPricing> = {
  // OpenAI — 2026 lineup
  'gpt-5.5-pro': { inputPerMillion: 30.00, outputPerMillion: 180.00 },
  'gpt-5.5': { inputPerMillion: 5.00, outputPerMillion: 30.00 },
  'gpt-5.4': { inputPerMillion: 2.50, outputPerMillion: 15.00 },
  'gpt-5.4-mini': { inputPerMillion: 0.75, outputPerMillion: 4.50 },
  'gpt-5.4-nano': { inputPerMillion: 0.20, outputPerMillion: 1.25 },
  'gpt-5.2': { inputPerMillion: 6.00, outputPerMillion: 24.00 },
  'gpt-5': { inputPerMillion: 5.00, outputPerMillion: 20.00 },
  'gpt-5-mini': { inputPerMillion: 0.30, outputPerMillion: 1.20 },
  'gpt-4o': { inputPerMillion: 2.50, outputPerMillion: 10.00 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  'gpt-4-turbo': { inputPerMillion: 10.00, outputPerMillion: 30.00 },
  'gpt-3.5-turbo': { inputPerMillion: 0.50, outputPerMillion: 1.50 },

  // Anthropic — 2026 lineup
  'claude-opus-4-7': { inputPerMillion: 5.00, outputPerMillion: 25.00 },
  'claude-opus-4-6': { inputPerMillion: 5.00, outputPerMillion: 25.00 },
  'claude-sonnet-4-6': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
  'claude-opus-4-5-20251101': { inputPerMillion: 15.00, outputPerMillion: 75.00 },
  'claude-sonnet-4-20250514': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
  'claude-haiku-4-5-20251001': { inputPerMillion: 0.80, outputPerMillion: 4.00 },
  // Legacy id, kept so older conversations don't show $NaN. Anthropic
  // no longer serves this model; the playground default switched to
  // claude-haiku-4-5-20251001.
  'claude-3-5-haiku-20241022': { inputPerMillion: 0.80, outputPerMillion: 4.00 },

  // Google — ids match Google's models.list (verified 2026-05-22).
  // Approximate $/MTok numbers from the public pricing page; refresh
  // when Google publishes 3.x GA pricing.
  'gemini-3.5-flash': { inputPerMillion: 0.20, outputPerMillion: 0.80 },
  'gemini-3.1-flash-lite': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  'gemini-3-pro-preview': { inputPerMillion: 1.50, outputPerMillion: 6.00 },
  'gemini-3-flash-preview': { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.00 },
  'gemini-2.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  'gemini-2.0-flash': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
}

// Live prices fetched from the gateway pricing DB. Overlaid on the fallback.
const livePricing: Record<string, ModelPricing> = {}

/**
 * Back-compat export. Returns the merged live-over-fallback view at call
 * time, so anything reading the whole table gets the freshest data.
 */
export function getModelPricing(): Record<string, ModelPricing> {
  return { ...FALLBACK_PRICING, ...livePricing }
}

interface PricingApiResponse {
  providers: {
    models: {
      model_id: string
      input_per_million: number
      output_per_million: number
    }[]
  }[]
}

let pricingLoaded: Promise<void> | null = null

/**
 * Fetch live prices from GET /api/pricing and overlay them on the fallback.
 * Idempotent — safe to call from app startup; failures are swallowed so the
 * playground falls back to the hardcoded table. Returns the same promise on
 * repeat calls.
 */
export function loadLivePricing(): Promise<void> {
  if (pricingLoaded) return pricingLoaded
  pricingLoaded = fetch('/api/pricing', { headers: { accept: 'application/json' } })
    .then((res) =>
      res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)),
    )
    .then((json: PricingApiResponse) => {
      for (const provider of json.providers) {
        for (const m of provider.models) {
          livePricing[m.model_id] = {
            inputPerMillion: m.input_per_million,
            outputPerMillion: m.output_per_million,
          }
        }
      }
    })
    .catch(() => {
      // Keep fallback prices; nothing to do.
    })
  return pricingLoaded
}

// Kick off the live-price fetch at module load (browser only). calculateCost
// uses whatever is available now; values sharpen once this resolves.
if (typeof window !== 'undefined') {
  void loadLivePricing()
}

// Calculate cost for a given model and token counts. Prefers live prices,
// then the hardcoded fallback, then 0 for unknown models.
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = livePricing[model] ?? FALLBACK_PRICING[model]
  if (!pricing) {
    return 0
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion

  return inputCost + outputCost
}
