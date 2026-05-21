import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'

interface SearchItem {
  title: string
  path: string
  section: string
  description?: string
  content?: string
}

const searchIndex: SearchItem[] = [
  { title: 'Introduction', path: '/docs', section: 'Getting Started', description: 'Overview of Aura LLM Gateway' },
  { title: 'Quickstart', path: '/docs/quickstart', section: 'Getting Started', description: 'Get up and running in 5 minutes' },
  { title: 'Configuration', path: '/docs/configuration', section: 'Getting Started', description: 'Environment variables and settings' },
  { title: 'Deployment', path: '/docs/deployment', section: 'Getting Started', description: 'Docker, Kubernetes, and production setup' },
  { title: 'Roadmap', path: '/roadmap', section: 'Project', description: 'Version history, in-progress work, and future plans' },

  { title: 'API Overview', path: '/docs/api', section: 'API Reference', description: 'API endpoints and authentication' },
  { title: 'Authentication', path: '/docs/api/authentication', section: 'API Reference', description: 'API keys, scopes, and security' },
  { title: 'Create Response', path: '/docs/api/create-response', section: 'API Reference', description: 'POST /v1/responses endpoint' },
  { title: 'Conversations', path: '/docs/api/conversations', section: 'API Reference', description: 'Conversation threading and history' },
  { title: 'Streaming', path: '/docs/api/streaming', section: 'API Reference', description: 'Server-Sent Events and real-time responses' },
  { title: 'Cost Tracking', path: '/docs/api/cost-tracking', section: 'API Reference', description: 'Real-time cost calculation and pricing' },
  { title: 'Rate Limiting', path: '/docs/api/rate-limiting', section: 'API Reference', description: 'Rate limits, headers, and retry strategies' },
  { title: 'Error Reference', path: '/docs/api/errors', section: 'API Reference', description: 'Error codes and troubleshooting' },
  { title: 'Admin API', path: '/docs/api/admin', section: 'API Reference', description: 'Manage keys, orgs, and credentials' },
  { title: 'Changelog', path: '/docs/api/changelog', section: 'API Reference', description: 'API changes and version history' },

  { title: 'Using Existing SDKs', path: '/docs/guides/existing-sdks', section: 'Guides', description: 'OpenAI SDK, LangChain, LlamaIndex' },
  { title: 'Tool Calling', path: '/docs/guides/tool-calling', section: 'Guides', description: 'Function calling and agentic workflows' },
  { title: 'Testing & Sandbox', path: '/docs/guides/testing', section: 'Guides', description: 'Test your integration safely' },
  { title: 'Migration Guide', path: '/docs/guides/migration', section: 'Guides', description: 'Migrate from OpenAI, Anthropic, LiteLLM' },

  { title: 'Python SDK', path: '/docs/sdks/python', section: 'SDKs', description: 'aura-llm Python package' },

  { title: 'Organizations', path: '/docs/organizations', section: 'Multi-Tenancy', description: 'Organizations, teams, and end-users' },
  { title: 'Provider Credentials', path: '/docs/credentials', section: 'Multi-Tenancy', description: 'Encrypted credential management' },

  { title: 'Architecture', path: '/docs/architecture', section: 'Architecture', description: 'System design and components' },

  { title: 'OpenAI', path: '/docs/providers/openai', section: 'Providers', description: 'GPT-4o, o1, o3 models' },
  { title: 'Anthropic', path: '/docs/providers/anthropic', section: 'Providers', description: 'Claude Opus, Sonnet, Haiku models' },
  { title: 'Google', path: '/docs/providers/google', section: 'Providers', description: 'Gemini 2.5, 2.0, 1.5 models' },
  { title: 'Mistral', path: '/docs/providers/mistral', section: 'Providers', description: 'Mistral Large, Codestral, Ministral edge models' },
  { title: 'Ollama', path: '/docs/providers/ollama', section: 'Providers', description: 'Local LLM inference, $0 cost' },
  { title: 'HuggingFace', path: '/docs/providers/huggingface', section: 'Providers', description: 'TGI Inference Endpoints for any HF model' },
  { title: 'AWS Bedrock', path: '/docs/providers/bedrock', section: 'Providers', description: 'Claude on Bedrock with IAM auth' },

  { title: 'Open Responses API', path: '/docs/concepts/open-responses', section: 'Concepts', description: 'API specification for agentic workflows' },
]

interface SearchProps {
  isOpen: boolean
  onClose: () => void
}

export function SearchModal({ isOpen, onClose }: SearchProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const fuse = useMemo(() => {
    return new Fuse(searchIndex, {
      keys: [
        { name: 'title', weight: 2 },
        { name: 'description', weight: 1.5 },
        { name: 'section', weight: 1 },
        { name: 'content', weight: 0.5 },
      ],
      threshold: 0.3,
      includeScore: true,
      includeMatches: true,
    })
  }, [])

  const results = useMemo(() => {
    if (!query.trim()) {
      return searchIndex.slice(0, 8).map((item) => ({ item, score: 0 }))
    }
    return fuse.search(query).slice(0, 10)
  }, [query, fuse])

  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (results[selectedIndex]) {
            navigate(results[selectedIndex].item.path)
            onClose()
          }
          break
        case 'Escape':
          onClose()
          break
      }
    },
    [results, selectedIndex, navigate, onClose]
  )

  if (!isOpen) return null

  return (
    <>
      <div className="search-backdrop" onClick={onClose} aria-hidden />
      <div className="search-panel" role="dialog" aria-modal="true" aria-label="Documentation search">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search documentation…"
          className="search-input"
        />

        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {results.length === 0 ? (
            <div style={{ padding: 'var(--space-5)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--ink-muted)', letterSpacing: '0.04em' }}>
              no results for "{query}"
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {results.map((result, index) => {
                const selected = index === selectedIndex
                return (
                  <li key={result.item.path}>
                    <button
                      onClick={() => {
                        navigate(result.item.path)
                        onClose()
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      data-selected={selected ? 'true' : 'false'}
                      className="search-result"
                      style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--space-3)', alignItems: 'baseline' }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 500,
                            fontSize: '0.9375rem',
                            color: selected ? 'var(--ink)' : 'var(--ink-muted)',
                            marginBottom: '2px',
                            letterSpacing: '-0.005em',
                          }}
                        >
                          {result.item.title}
                        </div>
                        {result.item.description && (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.4 }}>
                            {result.item.description}
                          </div>
                        )}
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.6875rem',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'var(--ink-dim)',
                            marginTop: '4px',
                          }}
                        >
                          {result.item.section}
                        </div>
                      </div>
                      <span
                        className="search-result-arrow"
                        aria-hidden
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '1rem',
                          color: selected ? 'var(--accent)' : 'transparent',
                        }}
                      >
                        →
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div
          style={{
            borderTop: '1px solid var(--rule)',
            padding: 'var(--space-3) var(--space-4)',
            display: 'flex',
            gap: 'var(--space-4)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6875rem',
            letterSpacing: '0.06em',
            color: 'var(--ink-dim)',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <span style={{ marginLeft: '4px' }}>navigate</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
            <kbd>↵</kbd>
            <span style={{ marginLeft: '4px' }}>select</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
            <kbd>esc</kbd>
            <span style={{ marginLeft: '4px' }}>close</span>
          </span>
        </div>
      </div>
    </>
  )
}

export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
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
      Search <kbd style={{ marginLeft: '4px' }}>⌘K</kbd>
    </button>
  )
}

export function useSearchShortcut(callback: () => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        callback()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [callback])
}

/* Hallmark · genre: editorial-minimal · macrostructure: workbench · design-system: design.md · designed-as-app */
