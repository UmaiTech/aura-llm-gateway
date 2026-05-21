import { Code, Lightbulb, Pencil, Zap } from 'lucide-react'
import type { Model } from '../lib/types'

interface WelcomeScreenProps {
  model: Model
  onSendMessage: (content: string) => Promise<void>
}

const SUGGESTIONS = [
  {
    icon: Code,
    title: "Help me debug",
    prompt: "I have a bug in my React component where state isn't updating. Can you help me debug it?",
  },
  {
    icon: Lightbulb,
    title: "Explain a concept",
    prompt: "Explain how async/await works in JavaScript with simple examples.",
  },
  {
    icon: Pencil,
    title: "Write code",
    prompt: "Write a Python function that finds all prime numbers up to a given number.",
  },
  {
    icon: Zap,
    title: "Optimize code",
    prompt: "How can I optimize a slow database query that joins multiple tables?",
  },
]

export function WelcomeScreen({ model, onSendMessage }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-4 py-12">
      {/* Logo and title */}
      <div className="flex flex-col items-center mb-12">
        <img src="/logo.svg" alt="Aura" className="h-20 w-20 logo-pulse mb-6" />
        <h1 className="font-display text-3xl font-semibold tracking-tight mb-2">
          Welcome to Aura
        </h1>
        <p className="text-muted-foreground text-center max-w-md">
          Your unified gateway to LLM models. <br /> Currently using{' '}
          <span className="font-mono text-foreground">{model.name}</span>.
        </p>
      </div>

      {/* Suggestion cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.title}
            onClick={() => onSendMessage(suggestion.prompt)}
            className="flex items-start gap-3 p-4 rounded-xl border border-border/50 bg-secondary/40 backdrop-blur-sm hover:bg-secondary/70 hover:border-primary-500/40 hover:shadow-premium-lg transition-all text-left group"
          >
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary-500/10 to-aura-400/10 text-primary-400 group-hover:from-primary-500/20 group-hover:to-aura-400/20 transition-all">
              <suggestion.icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-1">
                {suggestion.title}
              </h3>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {suggestion.prompt}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Capabilities */}
      <div className="mt-12 text-center">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">
          Capabilities
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {['Code Generation', 'Debugging', 'Explanation', 'Translation', 'Analysis'].map((cap) => (
            <span
              key={cap}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-secondary/60 backdrop-blur-sm text-secondary-foreground border border-border/30"
            >
              {cap}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
