interface Model {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'google'
  inputPrice: number
  outputPrice: number
  contextWindow: number
  streaming: boolean
  functionCalling: boolean
  vision: boolean
}

const models: Model[] = [
  { id: 'gpt-5.5-pro', name: 'GPT-5.5 Pro', provider: 'openai', inputPrice: 30.00, outputPrice: 180.00, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'openai', inputPrice: 5.00, outputPrice: 30.00, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai', inputPrice: 2.50, outputPrice: 15.00, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'openai', inputPrice: 0.75, outputPrice: 4.50, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', provider: 'openai', inputPrice: 0.20, outputPrice: 1.25, contextWindow: 1000000, streaming: true, functionCalling: true, vision: false },
  { id: 'o1', name: 'o1 (reasoning)', provider: 'openai', inputPrice: 15.00, outputPrice: 60.00, contextWindow: 200000, streaming: true, functionCalling: true, vision: true },
  { id: 'o3-mini', name: 'o3-mini (reasoning)', provider: 'openai', inputPrice: 1.10, outputPrice: 4.40, contextWindow: 200000, streaming: true, functionCalling: true, vision: false },
  { id: 'gpt-4o', name: 'GPT-4o (legacy)', provider: 'openai', inputPrice: 2.50, outputPrice: 10.00, contextWindow: 128000, streaming: true, functionCalling: true, vision: true },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (legacy)', provider: 'openai', inputPrice: 0.15, outputPrice: 0.60, contextWindow: 128000, streaming: true, functionCalling: true, vision: true },
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', provider: 'anthropic', inputPrice: 5.00, outputPrice: 25.00, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', inputPrice: 5.00, outputPrice: 25.00, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', inputPrice: 3.00, outputPrice: 15.00, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'claude-sonnet-4-5-20250514', name: 'Claude Sonnet 4.5', provider: 'anthropic', inputPrice: 3.00, outputPrice: 15.00, contextWindow: 200000, streaming: true, functionCalling: true, vision: true },
  { id: 'claude-opus-4-5-20250514', name: 'Claude Opus 4.5', provider: 'anthropic', inputPrice: 15.00, outputPrice: 75.00, contextWindow: 200000, streaming: true, functionCalling: true, vision: true },
  { id: 'claude-haiku-4-5-20250514', name: 'Claude Haiku 4.5', provider: 'anthropic', inputPrice: 0.80, outputPrice: 4.00, contextWindow: 200000, streaming: true, functionCalling: true, vision: true },
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro', provider: 'google', inputPrice: 1.50, outputPrice: 6.00, contextWindow: 2000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash', provider: 'google', inputPrice: 0.15, outputPrice: 0.60, contextWindow: 2000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', inputPrice: 1.25, outputPrice: 10.00, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', inputPrice: 0.10, outputPrice: 0.40, contextWindow: 1000000, streaming: true, functionCalling: true, vision: true },
]

interface ModelTableProps {
  showPricing?: boolean
  showCapabilities?: boolean
  providers?: ('openai' | 'anthropic' | 'google')[]
}

const cellStyle: React.CSSProperties = {
  padding: 'var(--space-3)',
  borderBottom: '1px solid var(--rule)',
  color: 'var(--ink)',
  verticalAlign: 'top',
}

const headStyle: React.CSSProperties = {
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  fontWeight: 500,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--ink-muted)',
  padding: 'var(--space-2) var(--space-3)',
  borderBottom: '1px solid var(--rule)',
}

const monoCell: React.CSSProperties = {
  ...cellStyle,
  fontFamily: 'var(--font-mono)',
  fontSize: '0.875rem',
  fontVariantNumeric: 'tabular-nums',
}

const dim: React.CSSProperties = { color: 'var(--ink-muted)' }

const Glyph = ({ on }: { on: boolean }) => (
  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)', fontSize: '0.875rem' }} aria-label={on ? 'yes' : 'no'}>
    {on ? '●' : '–'}
  </span>
)

export function ModelTable({
  showPricing = true,
  showCapabilities = true,
  providers = ['openai', 'anthropic', 'google'],
}: ModelTableProps) {
  const filtered = models.filter((m) => providers.includes(m.provider))

  const formatPrice = (price: number) => `$${price.toFixed(2)}`
  const formatContext = (tokens: number) => (tokens >= 1000000 ? `${tokens / 1000000}M` : `${tokens / 1000}K`)

  return (
    <div style={{ margin: 'var(--space-5) 0', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr>
            <th style={headStyle}>Model</th>
            <th style={headStyle}>Provider</th>
            {showPricing && (
              <>
                <th style={{ ...headStyle, textAlign: 'right' }}>Input/1M</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Output/1M</th>
              </>
            )}
            <th style={{ ...headStyle, textAlign: 'right' }}>Context</th>
            {showCapabilities && (
              <>
                <th style={{ ...headStyle, textAlign: 'center' }}>Stream</th>
                <th style={{ ...headStyle, textAlign: 'center' }}>Tools</th>
                <th style={{ ...headStyle, textAlign: 'center' }}>Vision</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {filtered.map((model) => (
            <tr key={model.id}>
              <td style={cellStyle}>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--ink)' }}>{model.id}</code>
                <div style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', marginTop: '2px' }}>{model.name}</div>
              </td>
              <td style={cellStyle}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
                  {model.provider}
                </span>
              </td>
              {showPricing && (
                <>
                  <td style={{ ...monoCell, textAlign: 'right', color: 'var(--ink)' }}>{formatPrice(model.inputPrice)}</td>
                  <td style={{ ...monoCell, textAlign: 'right', color: 'var(--ink)' }}>{formatPrice(model.outputPrice)}</td>
                </>
              )}
              <td style={{ ...monoCell, textAlign: 'right', ...dim }}>{formatContext(model.contextWindow)}</td>
              {showCapabilities && (
                <>
                  <td style={{ ...cellStyle, textAlign: 'center' }}><Glyph on={model.streaming} /></td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}><Glyph on={model.functionCalling} /></td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}><Glyph on={model.vision} /></td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* Hallmark · genre: editorial-minimal · macrostructure: workbench · design-system: design.md · designed-as-app */
