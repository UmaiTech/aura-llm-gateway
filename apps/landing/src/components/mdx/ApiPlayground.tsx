import { useState, useCallback } from 'react'
import { clsx } from 'clsx'
import { Play, Loader2, Copy, Check, ChevronDown } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface ApiPlaygroundProps {
  endpoint: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  defaultBody?: Record<string, unknown>
  defaultHeaders?: Record<string, string>
  baseUrl?: string
}

const defaultRequest = {
  model: 'claude-sonnet-4-5',
  input: [
    {
      type: 'message',
      role: 'user',
      content: 'Hello! What can you help me with today?',
    },
  ],
}

export function ApiPlayground({
  endpoint,
  method = 'POST',
  defaultBody = defaultRequest,
  defaultHeaders = {},
  baseUrl = 'http://localhost:8080',
}: ApiPlaygroundProps) {
  const [body, setBody] = useState(JSON.stringify(defaultBody, null, 2))
  const [response, setResponse] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showHeaders, setShowHeaders] = useState(false)
  const [headers, setHeaders] = useState(
    JSON.stringify(
      {
        'Content-Type': 'application/json',
        ...defaultHeaders,
      },
      null,
      2
    )
  )

  const handleRun = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResponse(null)

    try {
      const parsedBody = JSON.parse(body)
      const parsedHeaders = JSON.parse(headers)

      const res = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: parsedHeaders,
        body: method !== 'GET' ? JSON.stringify(parsedBody) : undefined,
      })

      const data = await res.json()
      setResponse(JSON.stringify(data, null, 2))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [body, headers, baseUrl, endpoint, method])

  const handleCopy = async () => {
    const curlCommand = generateCurlCommand()
    await navigator.clipboard.writeText(curlCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const generateCurlCommand = () => {
    try {
      const parsedBody = JSON.parse(body)
      const parsedHeaders = JSON.parse(headers)

      let curl = `curl -X ${method} "${baseUrl}${endpoint}"`

      Object.entries(parsedHeaders).forEach(([key, value]) => {
        curl += ` \\\n  -H "${key}: ${value}"`
      })

      if (method !== 'GET') {
        curl += ` \\\n  -d '${JSON.stringify(parsedBody)}'`
      }

      return curl
    } catch {
      return ''
    }
  }

  return (
    <div className="my-6 max-w-full rounded-panel border border-aura-border overflow-hidden bg-aura-surface">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-aura-surface-2 border-b border-aura-border">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={clsx(
              'px-2 py-0.5 rounded text-xs font-semibold',
              method === 'GET' && 'bg-aura-green/15 text-aura-green',
              method === 'POST' && 'bg-aura-accent/15 text-aura-accent',
              method === 'PUT' && 'bg-aura-amber/15 text-aura-amber',
              method === 'DELETE' && 'bg-aura-red/15 text-aura-red'
            )}
          >
            {method}
          </span>
          <code className="min-w-0 text-sm text-aura-text font-mono [overflow-wrap:anywhere]">{endpoint}</code>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className={clsx(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
              copied
                ? 'text-aura-green bg-aura-green/10'
                : 'text-aura-muted hover:text-aura-text hover:bg-aura-hover'
            )}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                cURL
              </>
            )}
          </button>
          <button
            onClick={handleRun}
            disabled={loading}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors',
              loading
                ? 'bg-aura-hover text-aura-dim cursor-not-allowed'
                : 'bg-aura-action hover:brightness-110 text-white'
            )}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run
              </>
            )}
          </button>
        </div>
      </div>

      {/* Headers toggle */}
      <button
        onClick={() => setShowHeaders(!showHeaders)}
        className="w-full flex items-center justify-between px-4 py-2 text-sm text-aura-muted hover:text-aura-text hover:bg-aura-hover transition-colors border-b border-aura-border"
      >
        <span>Headers</span>
        <ChevronDown
          className={clsx(
            'h-4 w-4 transition-transform',
            showHeaders && 'rotate-180'
          )}
        />
      </button>

      {/* Headers editor */}
      {showHeaders && (
        <div className="border-b border-aura-border">
          <textarea
            aria-label="Request headers"
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            className="w-full bg-[#0f172a] text-slate-200 font-mono text-sm p-4 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400"
            rows={4}
            spellCheck={false}
          />
        </div>
      )}

      {/* Request body */}
      <div className="border-b border-aura-border">
        <div className="px-4 py-2 text-xs text-aura-dim bg-aura-surface-2">
          Request Body
        </div>
        <textarea
          aria-label="Request body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full bg-[#0f172a] text-slate-200 font-mono text-sm p-4 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400 min-h-[200px]"
          spellCheck={false}
        />
      </div>

      {/* Response */}
      {(response || error) && (
        <div>
          <div
            className={clsx(
              'px-4 py-2 text-xs bg-aura-surface-2',
              error ? 'text-aura-red' : 'text-aura-dim'
            )}
          >
            {error ? 'Error' : 'Response'}
          </div>
          {error ? (
            <div className="p-4 text-aura-red text-sm">{error}</div>
          ) : (
            <SyntaxHighlighter
              language="json"
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                borderRadius: 0,
                fontSize: '0.875rem',
                background: '#0f172a',
                padding: '1rem',
                maxHeight: '400px',
                overflow: 'auto',
              }}
            >
              {response || ''}
            </SyntaxHighlighter>
          )}
        </div>
      )}
    </div>
  )
}
