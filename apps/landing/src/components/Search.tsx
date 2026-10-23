import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'
import { Search as SearchIcon, FileText, ArrowRight } from 'lucide-react'
import { clsx } from 'clsx'

// Search index data - will be populated from docs
interface SearchItem {
  title: string
  path: string
  section: string
  description?: string
  content?: string
}

// Build search index from doc sections
const searchIndex: SearchItem[] = [
  // Getting Started
  { title: 'Introduction', path: '/docs', section: 'Getting Started', description: 'Overview of Aura LLM Gateway' },
  { title: 'Quickstart', path: '/docs/quickstart', section: 'Getting Started', description: 'Get up and running in 5 minutes' },
  { title: 'Configuration', path: '/docs/configuration', section: 'Getting Started', description: 'Environment variables and settings' },
  { title: 'Deployment', path: '/docs/deployment', section: 'Getting Started', description: 'Docker, Kubernetes, and production setup' },
  { title: 'Roadmap', path: '/roadmap', section: 'Project', description: 'Version history, in-progress work, and future plans' },

  // API Reference
  { title: 'API Overview', path: '/docs/api', section: 'API Reference', description: 'API endpoints and authentication' },
  { title: 'Authentication', path: '/docs/api/authentication', section: 'API Reference', description: 'API keys, scopes, and security' },
  { title: 'Create Response', path: '/docs/api/create-response', section: 'API Reference', description: 'POST /v1/responses endpoint' },
  { title: 'Conversations', path: '/docs/api/conversations', section: 'API Reference', description: 'Conversation threading and history' },
  { title: 'Streaming', path: '/docs/api/streaming', section: 'API Reference', description: 'Server-Sent Events and real-time responses' },
  { title: 'Cost Tracking', path: '/docs/api/cost-tracking', section: 'API Reference', description: 'Real-time cost calculation and pricing' },
  { title: 'Rate Limiting', path: '/docs/api/rate-limiting', section: 'API Reference', description: 'Rate limits, headers, and retry strategies' },
  { title: 'Tool Roundtrips', path: '/docs/api/tool-roundtrips', section: 'API Reference', description: 'Replaying prior tool calls across providers' },
  { title: 'Smart Routing', path: '/docs/api/routing', section: 'API Reference', description: 'Routing strategies, health tracking and fallbacks' },
  { title: 'Auto Model Routing', path: '/docs/api/auto-routing', section: 'API Reference', description: 'model: "auto" — tiers, modes, constraints and the routing decision' },
  { title: 'Prompt Compression', path: '/docs/api/compression', section: 'API Reference', description: 'TOON, YAML, AISP and JSON compression' },
  { title: 'Response Validation', path: '/docs/api/validation', section: 'API Reference', description: 'logprobs, best_of_n, self_consistency, confidence_threshold' },
  { title: 'Response Consistency', path: '/docs/api/consistency', section: 'API Reference', description: 'Style profiles and cross-model normalization' },
  { title: 'Response Caching', path: '/docs/api/caching', section: 'API Reference', description: 'TTL-based response caching with Redis' },
  { title: 'Prometheus Metrics', path: '/docs/api/metrics', section: 'API Reference', description: 'Observability via the /metrics endpoint' },
  { title: 'Error Reference', path: '/docs/api/errors', section: 'API Reference', description: 'Error codes and troubleshooting' },
  { title: 'Admin API', path: '/docs/api/admin', section: 'API Reference', description: 'Manage keys, orgs, and credentials' },
  { title: 'Changelog', path: '/docs/api/changelog', section: 'API Reference', description: 'API changes and version history' },

  // Guides
  { title: 'Using Existing SDKs', path: '/docs/guides/existing-sdks', section: 'Guides', description: 'OpenAI SDK, LangChain, LlamaIndex' },
  { title: 'Tool Calling', path: '/docs/guides/tool-calling', section: 'Guides', description: 'Function calling and agentic workflows' },
  { title: 'Testing & Sandbox', path: '/docs/guides/testing', section: 'Guides', description: 'Test your integration safely' },
  { title: 'Migration Guide', path: '/docs/guides/migration', section: 'Guides', description: 'Migrate from OpenAI, Anthropic, LiteLLM' },

  // SDKs
  { title: 'Python SDK', path: '/docs/sdks/python', section: 'SDKs', description: 'aura-llm Python package' },
  { title: 'TypeScript SDK', path: '/docs/sdks/typescript', section: 'SDKs', description: 'aura-llm npm package — universal fetch, AsyncIterable streaming' },

  // Multi-Tenancy
  { title: 'Organizations', path: '/docs/organizations', section: 'Multi-Tenancy', description: 'Organizations, teams, and end-users' },
  { title: 'Provider Credentials', path: '/docs/credentials', section: 'Multi-Tenancy', description: 'Encrypted credential management' },

  // Architecture
  { title: 'Architecture', path: '/docs/architecture', section: 'Architecture', description: 'System design and components' },

  // Providers
  { title: 'OpenAI', path: '/docs/providers/openai', section: 'Providers', description: 'GPT-4o, o1, o3 models' },
  { title: 'Anthropic', path: '/docs/providers/anthropic', section: 'Providers', description: 'Claude Opus, Sonnet, Haiku models' },
  { title: 'Google', path: '/docs/providers/google', section: 'Providers', description: 'Gemini 2.5, 2.0, 1.5 models' },
  { title: 'Mistral', path: '/docs/providers/mistral', section: 'Providers', description: 'Mistral Large, Codestral, Ministral edge models' },
  { title: 'Together AI', path: '/docs/providers/together', section: 'Providers', description: 'Open-weight models on Together AI' },
  { title: 'Ollama', path: '/docs/providers/ollama', section: 'Providers', description: 'Local LLM inference, $0 cost' },
  { title: 'HuggingFace', path: '/docs/providers/huggingface', section: 'Providers', description: 'TGI Inference Endpoints for any HF model' },
  { title: 'AWS Bedrock', path: '/docs/providers/bedrock', section: 'Providers', description: 'Claude on Bedrock with IAM auth' },

  // Concepts
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

  // Initialize Fuse.js
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

  // Search results
  const results = useMemo(() => {
    if (!query.trim()) {
      // Show popular/recent pages when no query
      return searchIndex.slice(0, 8).map(item => ({ item, score: 0 }))
    }
    return fuse.search(query).slice(0, 10)
  }, [query, fuse])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  // Focus the input on open; give focus back to the opener on close.
  useEffect(() => {
    if (!isOpen) return
    const opener = document.activeElement as HTMLElement | null
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
    return () => opener?.focus?.({ preventScroll: true })
  }, [isOpen])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
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
      case 'Tab':
        // The input is the dialog's only tab stop; keep focus inside.
        e.preventDefault()
        break
    }
  }, [results, selectedIndex, navigate, onClose])

  if (!isOpen) return null

  const activeId = results[selectedIndex] ? `search-result-${selectedIndex}` : undefined

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div className="relative flex min-h-screen items-start justify-center px-4 pt-[12vh]">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search documentation"
          className="relative w-full max-w-xl overflow-hidden rounded-panel border border-aura-border bg-aura-surface shadow-2xl"
        >
          <div className="flex items-center border-b border-aura-border px-4">
            <SearchIcon className="h-5 w-5 text-aura-dim" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="search-results"
              aria-activedescendant={activeId}
              aria-label="Search documentation"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search documentation…"
              className="flex-1 bg-transparent px-4 py-4 text-aura-text placeholder:text-aura-dim focus:outline-none"
            />
            <kbd className="hidden items-center rounded bg-aura-surface-2 px-2 py-1 font-mono text-xs text-aura-dim sm:inline-flex">ESC</kbd>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-aura-dim">No results for “{query}”</div>
            ) : (
              <ul id="search-results" role="listbox" aria-label="Results" className="py-2">
                {results.map((result, index) => (
                  <li key={result.item.path} id={`search-result-${index}`} role="option" aria-selected={index === selectedIndex}>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => {
                        navigate(result.item.path)
                        onClose()
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={clsx(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                        index === selectedIndex ? 'bg-aura-accent/10' : 'hover:bg-aura-hover',
                      )}
                    >
                      <FileText
                        className={clsx('mt-0.5 h-5 w-5 flex-shrink-0', index === selectedIndex ? 'text-aura-accent' : 'text-aura-dim')}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className={clsx('font-medium', index === selectedIndex ? 'text-aura-text' : 'text-aura-muted')}>
                          {result.item.title}
                        </div>
                        {result.item.description && <div className="truncate text-sm text-aura-dim">{result.item.description}</div>}
                        <div className="mt-0.5 text-xs text-aura-dim">{result.item.section}</div>
                      </div>
                      {index === selectedIndex && <ArrowRight className="mt-1 h-4 w-4 text-aura-accent" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-aura-border px-4 py-3 text-xs text-aura-dim">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-aura-surface-2 px-1.5 py-0.5">↑</kbd>
              <kbd className="rounded bg-aura-surface-2 px-1.5 py-0.5">↓</kbd>
              <span>to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-aura-surface-2 px-1.5 py-0.5">↵</kbd>
              <span>to open</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Search trigger button
export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search documentation"
      aria-keyshortcuts="Control+K Meta+K"
      className="flex h-9 items-center gap-2 rounded-control border border-aura-border bg-aura-surface px-2.5 text-sm text-aura-muted transition-colors hover:bg-aura-hover hover:text-aura-text sm:w-56 sm:px-3"
    >
      <SearchIcon className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Search docs</span>
      <kbd className="ml-auto hidden items-center rounded bg-aura-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-aura-dim sm:inline-flex">
        ⌘K
      </kbd>
    </button>
  )
}

// Hook to handle global keyboard shortcut
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
