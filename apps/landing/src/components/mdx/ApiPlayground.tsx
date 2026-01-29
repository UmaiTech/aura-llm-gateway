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
    <div className="my-6 rounded-lg border border-gray-800 overflow-hidden bg-gray-900/30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/50 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              'px-2 py-0.5 rounded text-xs font-semibold',
              method === 'GET' && 'bg-green-500/20 text-green-400',
              method === 'POST' && 'bg-blue-500/20 text-blue-400',
              method === 'PUT' && 'bg-yellow-500/20 text-yellow-400',
              method === 'DELETE' && 'bg-red-500/20 text-red-400'
            )}
          >
            {method}
          </span>
          <code className="text-sm text-gray-300 font-mono">{endpoint}</code>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className={clsx(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
              copied
                ? 'text-green-400 bg-green-500/10'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
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
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-aura-500 hover:bg-aura-600 text-white'
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
        className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors border-b border-gray-800"
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
        <div className="border-b border-gray-800">
          <textarea
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            className="w-full bg-[#0f172a] text-gray-300 font-mono text-sm p-4 resize-none focus:outline-none"
            rows={4}
            spellCheck={false}
          />
        </div>
      )}

      {/* Request body */}
      <div className="border-b border-gray-800">
        <div className="px-4 py-2 text-xs text-gray-500 bg-gray-900/30">
          Request Body
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full bg-[#0f172a] text-gray-300 font-mono text-sm p-4 resize-none focus:outline-none min-h-[200px]"
          spellCheck={false}
        />
      </div>

      {/* Response */}
      {(response || error) && (
        <div>
          <div
            className={clsx(
              'px-4 py-2 text-xs bg-gray-900/30',
              error ? 'text-red-400' : 'text-gray-500'
            )}
          >
            {error ? 'Error' : 'Response'}
          </div>
          {error ? (
            <div className="p-4 text-red-400 text-sm">{error}</div>
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
