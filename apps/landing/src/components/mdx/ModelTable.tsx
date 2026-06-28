import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Check, X } from 'lucide-react'

interface Model {
  id: string
  name: string
  provider: string
  inputPrice: number // per 1M tokens
  outputPrice: number // per 1M tokens
  contextWindow: number
  streaming: boolean
  functionCalling: boolean
  vision: boolean
}

/**
 * Fallback model lineup. Live prices/context come from GET /api/pricing
 * (the weekly scraper's DB), but we keep this hardcoded set so:
 *   - docs render instantly before the fetch resolves,
 *   - local `vite dev` (where /api/pricing isn't served) still shows a table,
 *   - capability flags (streaming / tools / vision) — which aren't scraped —
 *     have a source. Capabilities are looked up from here by model id; the
 *     prices/context below are only used until the API responds.
 */
const FALLBACK_MODELS: Model[] = [
  // OpenAI — 2026 lineup
  { id: 'gpt-5.5-pro', name: 'GPT-5.5 Pro', provider: 'openai', inputPrice: 30.0, outputPrice: 180.0, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'openai', inputPrice: 5.0, outputPrice: 30.0, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai', inputPrice: 2.5, outputPrice: 15.0, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'openai', inputPrice: 0.75, outputPrice: 4.5, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', provider: 'openai', inputPrice: 0.2, outputPrice: 1.25, contextWindow: 1000000, streaming: true, functionCalling: true, vision: false },
  { id: 'o1', name: 'o1 (reasoning)', provider: 'openai', inputPrice: 15.0, outputPrice: 60.0, contextWindow: 200000, streaming: true, functionCalling: true, vision: true },
  { id: 'o3-mini', name: 'o3-mini (reasoning)', provider: 'openai', inputPrice: 1.1, outputPrice: 4.4, contextWindow: 200000, streaming: true, functionCalling: true, vision: false },
  { id: 'gpt-4o', name: 'GPT-4o (legacy)', provider: 'openai', inputPrice: 2.5, outputPrice: 10.0, contextWindow: 128000, streaming: true, functionCalling: true, vision: true },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (legacy)', provider: 'openai', inputPrice: 0.15, outputPrice: 0.6, contextWindow: 128000, streaming: true, functionCalling: true, vision: true },
  // Anthropic — 2026 lineup
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', provider: 'anthropic', inputPrice: 5.0, outputPrice: 25.0, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', inputPrice: 5.0, outputPrice: 25.0, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', inputPrice: 3.0, outputPrice: 15.0, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'claude-sonnet-4-5-20250514', name: 'Claude Sonnet 4.5', provider: 'anthropic', inputPrice: 3.0, outputPrice: 15.0, contextWindow: 200000, streaming: true, functionCalling: true, vision: true },
  { id: 'claude-opus-4-5-20250514', name: 'Claude Opus 4.5', provider: 'anthropic', inputPrice: 15.0, outputPrice: 75.0, contextWindow: 200000, streaming: true, functionCalling: true, vision: true },
  { id: 'claude-haiku-4-5-20250514', name: 'Claude Haiku 4.5', provider: 'anthropic', inputPrice: 0.8, outputPrice: 4.0, contextWindow: 200000, streaming: true, functionCalling: true, vision: true },
  // Google
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro', provider: 'google', inputPrice: 1.5, outputPrice: 6.0, contextWindow: 2000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash', provider: 'google', inputPrice: 0.15, outputPrice: 0.6, contextWindow: 2000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', inputPrice: 1.25, outputPrice: 10.0, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', inputPrice: 0.1, outputPrice: 0.4, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
]

const providerColors: Record<string, string> = {
  openai: 'bg-green-500/10 text-green-400 border-green-500/30',
  anthropic: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  google: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  mistral: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  together: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  bedrock: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  huggingface: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  ollama: 'bg-gray-500/10 text-gray-300 border-gray-500/30',
}
const DEFAULT_COLOR = 'bg-gray-500/10 text-gray-300 border-gray-500/30'

// Capabilities aren't scraped (they're not on pricing pages), so we keep a
// static map keyed by model id, derived from the fallback lineup. Unknown
// models default to fully-capable — accurate for every current flagship.
const CAPABILITIES = new Map(
  FALLBACK_MODELS.map((m) => [
    m.id,
    { streaming: m.streaming, functionCalling: m.functionCalling, vision: m.vision },
  ]),
)
function capsFor(id: string) {
  return (
    CAPABILITIES.get(id) ?? {
      streaming: true,
      functionCalling: true,
      vision: true,
    }
  )
}

interface PricingApiModel {
  model_id: string
  model_name: string
  input_per_million: number
  output_per_million: number
  context_window: number | null
}
interface PricingApiResponse {
  providers: { name: string; models: PricingApiModel[] }[]
}

/** Map the public pricing API payload into the table's Model shape. */
function fromApi(payload: PricingApiResponse): Model[] {
  const out: Model[] = []
  for (const p of payload.providers) {
    for (const m of p.models) {
      out.push({
        id: m.model_id,
        name: m.model_name,
        provider: p.name,
        inputPrice: m.input_per_million,
        outputPrice: m.output_per_million,
        contextWindow: m.context_window ?? 0,
        ...capsFor(m.model_id),
      })
    }
  }
  return out
}

interface ModelTableProps {
  showPricing?: boolean
  showCapabilities?: boolean
  providers?: string[]
}

export function ModelTable({
  showPricing = true,
  showCapabilities = true,
  providers = ['openai', 'anthropic', 'google'],
}: ModelTableProps) {
  // Seed with the hardcoded lineup so the table renders immediately, then
  // overwrite with live DB prices once /api/pricing responds.
  const [allModels, setAllModels] = useState<Model[]>(FALLBACK_MODELS)
  const [live, setLive] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/pricing', { headers: { accept: 'application/json' } })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)),
      )
      .then((json: PricingApiResponse) => {
        const mapped = fromApi(json)
        if (!cancelled && mapped.length > 0) {
          setAllModels(mapped)
          setLive(true)
        }
      })
      .catch(() => {
        // Keep the fallback lineup; docs still render with last-known prices.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const groupedModels = useMemo(() => {
    const filtered = allModels.filter((m) => providers.includes(m.provider))
    return filtered.reduce(
      (acc, model) => {
        if (!acc[model.provider]) acc[model.provider] = []
        acc[model.provider].push(model)
        return acc
      },
      {} as Record<string, Model[]>,
    )
  }, [allModels, providers])

  const formatPrice = (price: number) =>
    price > 0 && price < 0.01 ? `$${price.toFixed(4)}` : `$${price.toFixed(2)}`
  const formatContext = (tokens: number) => {
    if (!tokens) return '—'
    if (tokens >= 1000000) return `${tokens / 1000000}M`
    return `${tokens / 1000}K`
  }

  const FeatureIcon = ({ enabled }: { enabled: boolean }) =>
    enabled ? (
      <Check className="h-4 w-4 text-green-400" />
    ) : (
      <X className="h-4 w-4 text-gray-600" />
    )

  return (
    <div className="my-6 overflow-x-auto">
      {showPricing && (
        <div className="text-xs text-gray-500 mb-2">
          {live ? (
            <span className="text-green-500">● Live prices</span>
          ) : (
            <span className="text-gray-600">● Reference prices</span>
          )}{' '}
          · per 1M tokens (USD)
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Model</th>
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Provider</th>
            {showPricing && (
              <>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Input/1M</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Output/1M</th>
              </>
            )}
            <th className="text-center py-3 px-4 text-gray-400 font-medium">Context</th>
            {showCapabilities && (
              <>
                <th className="text-center py-3 px-4 text-gray-400 font-medium">Streaming</th>
                <th className="text-center py-3 px-4 text-gray-400 font-medium">Tools</th>
                <th className="text-center py-3 px-4 text-gray-400 font-medium">Vision</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupedModels).map(([_provider, providerModels]) =>
            providerModels.map((model, idx) => (
              <tr
                key={`${model.provider}-${model.id}`}
                className={clsx(
                  'border-b border-gray-800/50 hover:bg-gray-800/30',
                  idx === 0 && 'border-t border-gray-800',
                )}
              >
                <td className="py-3 px-4">
                  <code className="text-aura-400 text-xs">{model.id}</code>
                  <div className="text-gray-400 text-xs mt-0.5">{model.name}</div>
                </td>
                <td className="py-3 px-4">
                  <span
                    className={clsx(
                      'px-2 py-0.5 rounded text-xs border capitalize',
                      providerColors[model.provider] ?? DEFAULT_COLOR,
                    )}
                  >
                    {model.provider}
                  </span>
                </td>
                {showPricing && (
                  <>
                    <td className="py-3 px-4 text-right text-gray-300 font-mono">
                      {formatPrice(model.inputPrice)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-300 font-mono">
                      {formatPrice(model.outputPrice)}
                    </td>
                  </>
                )}
                <td className="py-3 px-4 text-center text-gray-400">
                  {formatContext(model.contextWindow)}
                </td>
                {showCapabilities && (
                  <>
                    <td className="py-3 px-4 text-center">
                      <FeatureIcon enabled={model.streaming} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <FeatureIcon enabled={model.functionCalling} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <FeatureIcon enabled={model.vision} />
                    </td>
                  </>
                )}
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  )
}
