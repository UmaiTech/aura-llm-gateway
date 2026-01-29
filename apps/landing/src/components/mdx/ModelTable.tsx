import { clsx } from 'clsx'
import { Check, X } from 'lucide-react'

interface Model {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'google'
  inputPrice: number // per 1M tokens
  outputPrice: number // per 1M tokens
  contextWindow: number
  streaming: boolean
  functionCalling: boolean
  vision: boolean
}

const models: Model[] = [
  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', inputPrice: 2.50, outputPrice: 10.00, contextWindow: 128000, streaming: true, functionCalling: true, vision: true },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', inputPrice: 0.15, outputPrice: 0.60, contextWindow: 128000, streaming: true, functionCalling: true, vision: true },
  { id: 'o1', name: 'o1', provider: 'openai', inputPrice: 15.00, outputPrice: 60.00, contextWindow: 200000, streaming: true, functionCalling: true, vision: true },
  { id: 'o3-mini', name: 'o3-mini', provider: 'openai', inputPrice: 1.10, outputPrice: 4.40, contextWindow: 200000, streaming: true, functionCalling: true, vision: false },
  // Anthropic
  { id: 'claude-sonnet-4-5-20250514', name: 'Claude Sonnet 4.5', provider: 'anthropic', inputPrice: 3.00, outputPrice: 15.00, contextWindow: 200000, streaming: true, functionCalling: true, vision: true },
  { id: 'claude-opus-4-5-20250514', name: 'Claude Opus 4.5', provider: 'anthropic', inputPrice: 15.00, outputPrice: 75.00, contextWindow: 200000, streaming: true, functionCalling: true, vision: true },
  { id: 'claude-haiku-4-5-20250514', name: 'Claude Haiku 4.5', provider: 'anthropic', inputPrice: 0.80, outputPrice: 4.00, contextWindow: 200000, streaming: true, functionCalling: true, vision: true },
  // Google
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', inputPrice: 1.25, outputPrice: 10.00, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', inputPrice: 0.10, outputPrice: 0.40, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
]

const providerColors = {
  openai: 'bg-green-500/10 text-green-400 border-green-500/30',
  anthropic: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  google: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
}

interface ModelTableProps {
  showPricing?: boolean
  showCapabilities?: boolean
  providers?: ('openai' | 'anthropic' | 'google')[]
}

export function ModelTable({
  showPricing = true,
  showCapabilities = true,
  providers = ['openai', 'anthropic', 'google'],
}: ModelTableProps) {
  const filteredModels = models.filter((m) => providers.includes(m.provider))
  const groupedModels = filteredModels.reduce(
    (acc, model) => {
      if (!acc[model.provider]) acc[model.provider] = []
      acc[model.provider].push(model)
      return acc
    },
    {} as Record<string, Model[]>
  )

  const formatPrice = (price: number) => `$${price.toFixed(2)}`
  const formatContext = (tokens: number) => {
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
          {Object.entries(groupedModels).map(([_provider, providerModels]) => (
            providerModels.map((model, idx) => (
              <tr
                key={model.id}
                className={clsx(
                  'border-b border-gray-800/50 hover:bg-gray-800/30',
                  idx === 0 && 'border-t border-gray-800'
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
                      providerColors[model.provider as keyof typeof providerColors]
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
            ))
          ))}
        </tbody>
      </table>
    </div>
  )
}
