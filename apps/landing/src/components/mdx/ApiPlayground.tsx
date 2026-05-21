import { useState, useCallback } from 'react'
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

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--ink-muted)',
  display: 'block',
  marginBottom: 'var(--space-2)',
}

const sectionStyle: React.CSSProperties = {
  paddingTop: 'var(--space-4)',
  paddingBottom: 'var(--space-4)',
  borderTop: '1px solid var(--rule)',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--code-bg)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.875rem',
  padding: 'var(--space-3)',
  border: '1px solid var(--rule)',
  borderRadius: 0,
  resize: 'vertical',
  outline: 'none',
  minHeight: 160,
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
  const [headers, setHeaders] = useState(
    JSON.stringify({ 'Content-Type': 'application/json', ...defaultHeaders }, null, 2)
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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generateCurlCommand())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ margin: 'var(--space-5) 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-muted)',
          }}
        >
          {method}
        </span>
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--ink)' }}>
          {endpoint}
        </code>
      </div>

      <div style={sectionStyle}>
        <span style={labelStyle}>Headers</span>
        <textarea
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
          rows={4}
          style={{ ...textareaStyle, minHeight: 100 }}
          spellCheck={false}
        />
      </div>

      <div style={sectionStyle}>
        <span style={labelStyle}>Request body</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={textareaStyle}
          spellCheck={false}
        />
      </div>

      <div style={{ ...sectionStyle, borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'baseline', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
        <button onClick={handleRun} disabled={loading} className="btn-outline">
          {loading ? 'running…' : 'Run'} {!loading && <span aria-hidden>→</span>}
        </button>
        <button
          onClick={handleCopy}
          className="link"
          style={{
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8125rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--ink-muted)',
            padding: 0,
          }}
        >
          {copied ? 'copied ✓' : 'copy cURL ↗'}
        </button>
      </div>

      {(response || error) && (
        <div style={{ paddingTop: 'var(--space-4)' }}>
          <span style={labelStyle}>{error ? 'Error' : 'Response'}</span>
          {error ? (
            <pre
              style={{
                margin: 0,
                background: 'var(--code-bg)',
                color: 'var(--ink)',
                padding: 'var(--space-4)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.875rem',
                overflowX: 'auto',
              }}
            >
              {error}
            </pre>
          ) : (
            <SyntaxHighlighter
              language="json"
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                borderRadius: 0,
                fontSize: '0.875rem',
                background: 'var(--code-bg)',
                padding: 'var(--space-4)',
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

/* Hallmark · genre: editorial-minimal · macrostructure: workbench · design-system: design.md · designed-as-app */
