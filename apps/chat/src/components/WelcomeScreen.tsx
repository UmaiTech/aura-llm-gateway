import type { Model } from '../lib/types'

interface WelcomeScreenProps {
  model: Model
  onSendMessage: (content: string) => Promise<void>
}

const SUGGESTIONS = [
  {
    title: 'Help me debug',
    prompt:
      "I have a bug in my React component where state isn't updating. Can you help me debug it?",
  },
  {
    title: 'Explain a concept',
    prompt:
      'Explain how async/await works in JavaScript with simple examples.',
  },
  {
    title: 'Write code',
    prompt:
      'Write a Python function that finds all prime numbers up to a given number.',
  },
  {
    title: 'Optimize code',
    prompt:
      'How can I optimize a slow database query that joins multiple tables?',
  },
]

const CAPABILITIES = [
  'Code generation',
  'Debugging',
  'Explanation',
  'Translation',
  'Analysis',
]

export function WelcomeScreen({ model, onSendMessage }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col min-h-full px-6 py-16 max-w-2xl mx-auto w-full">
      {/* Hero — left-aligned, no centered logo block */}
      <header className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <img src="/logo.svg" alt="Aura" className="h-10 w-10" />
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Aura Playground
          </span>
        </div>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mb-3">
          What would you like to ask?
        </h1>
        <p className="text-muted-foreground">
          Currently routing through{' '}
          <span className="font-mono text-foreground">{model.name}</span>.
        </p>
      </header>

      {/* Suggestions — numbered list, not cards */}
      <section className="mb-12">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">
          Try a prompt
        </h2>
        <ol className="space-y-px">
          {SUGGESTIONS.map((suggestion, i) => (
            <li key={suggestion.title}>
              <button
                onClick={() => onSendMessage(suggestion.prompt)}
                className="w-full flex gap-4 py-3 text-left border-t border-border/60 hover:bg-muted/30 transition-colors group"
              >
                <span className="font-mono text-xs text-muted-foreground tabular-nums pt-0.5 w-6">
                  0{i + 1}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-foreground mb-0.5">
                    {suggestion.title}
                  </span>
                  <span className="block text-sm text-muted-foreground line-clamp-1 group-hover:line-clamp-none">
                    {suggestion.prompt}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="text-muted-foreground/40 group-hover:text-foreground transition-colors pt-0.5"
                >
                  →
                </span>
              </button>
            </li>
          ))}
          {/* Closing rule */}
          <li className="border-t border-border/60" />
        </ol>
      </section>

      {/* Capabilities — running text, not pill row */}
      <footer className="text-sm text-muted-foreground">
        <h2 className="font-mono text-xs uppercase tracking-wider mb-2 text-muted-foreground/70">
          Capabilities
        </h2>
        <p>{CAPABILITIES.join(' · ')}</p>
      </footer>
    </div>
  )
}
