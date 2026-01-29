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
  { title: 'Roadmap', path: '/docs/roadmap', section: 'Getting Started', description: 'Upcoming features and releases' },

  // API Reference
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

  // Guides
  { title: 'Using Existing SDKs', path: '/docs/guides/existing-sdks', section: 'Guides', description: 'OpenAI SDK, LangChain, LlamaIndex' },
  { title: 'Tool Calling', path: '/docs/guides/tool-calling', section: 'Guides', description: 'Function calling and agentic workflows' },
  { title: 'Testing & Sandbox', path: '/docs/guides/testing', section: 'Guides', description: 'Test your integration safely' },
  { title: 'Migration Guide', path: '/docs/guides/migration', section: 'Guides', description: 'Migrate from OpenAI, Anthropic, LiteLLM' },

  // SDKs
  { title: 'Python SDK', path: '/docs/sdks/python', section: 'SDKs', description: 'aura-llm Python package' },

  // Multi-Tenancy
  { title: 'Organizations', path: '/docs/organizations', section: 'Multi-Tenancy', description: 'Organizations, teams, and end-users' },
  { title: 'Provider Credentials', path: '/docs/credentials', section: 'Multi-Tenancy', description: 'Encrypted credential management' },

  // Architecture
  { title: 'Architecture', path: '/docs/architecture', section: 'Architecture', description: 'System design and components' },

  // Providers
  { title: 'OpenAI', path: '/docs/providers/openai', section: 'Providers', description: 'GPT-4o, o1, o3 models' },
  { title: 'Anthropic', path: '/docs/providers/anthropic', section: 'Providers', description: 'Claude Opus, Sonnet, Haiku models' },
  { title: 'Google', path: '/docs/providers/google', section: 'Providers', description: 'Gemini 2.5, 2.0, 1.5 models' },

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

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
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
    }
  }, [results, selectedIndex, navigate, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative min-h-screen flex items-start justify-center pt-[15vh] px-4">
        <div className="relative w-full max-w-xl bg-gray-900 rounded-xl shadow-2xl border border-gray-800 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center px-4 border-b border-gray-800">
            <SearchIcon className="h-5 w-5 text-gray-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search documentation..."
              className="flex-1 px-4 py-4 bg-transparent text-white placeholder-gray-500 focus:outline-none"
            />
            <kbd className="hidden sm:inline-flex items-center px-2 py-1 text-xs text-gray-500 bg-gray-800 rounded">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                No results found for "{query}"
              </div>
            ) : (
              <ul className="py-2">
                {results.map((result, index) => (
                  <li key={result.item.path}>
                    <button
                      onClick={() => {
                        navigate(result.item.path)
                        onClose()
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={clsx(
                        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
                        index === selectedIndex
                          ? 'bg-aura-500/10'
                          : 'hover:bg-gray-800/50'
                      )}
                    >
                      <FileText className={clsx(
                        'h-5 w-5 mt-0.5 flex-shrink-0',
                        index === selectedIndex ? 'text-aura-400' : 'text-gray-500'
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className={clsx(
                          'font-medium',
                          index === selectedIndex ? 'text-white' : 'text-gray-300'
                        )}>
                          {result.item.title}
                        </div>
                        {result.item.description && (
                          <div className="text-sm text-gray-500 truncate">
                            {result.item.description}
                          </div>
                        )}
                        <div className="text-xs text-gray-600 mt-0.5">
                          {result.item.section}
                        </div>
                      </div>
                      {index === selectedIndex && (
                        <ArrowRight className="h-4 w-4 text-aura-400 mt-1" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">↓</kbd>
                <span>to navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">↵</kbd>
                <span>to select</span>
              </span>
            </div>
            <span>Powered by Fuse.js</span>
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
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg transition-colors"
    >
      <SearchIcon className="h-4 w-4" />
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs text-gray-500 bg-gray-900 rounded ml-2">
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
