import { Sparkles, Code, Lightbulb, Pencil, Zap } from 'lucide-react'
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
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-aura-400 to-primary-500 flex items-center justify-center mb-6 shadow-lg shadow-primary-500/20">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Welcome to Aura
        </h1>
        <p className="text-muted-foreground text-center max-w-md">
          Your unified gateway to LLM models. Currently using{' '}
          <span className="text-primary-400 font-medium">{model.name}</span>.
        </p>
      </div>

      {/* Suggestion cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.title}
            onClick={() => onSendMessage(suggestion.prompt)}
            className="flex items-start gap-3 p-4 rounded-xl border border-border bg-secondary/30 hover:bg-secondary/60 hover:border-primary-500/30 transition-all text-left group"
          >
            <div className="p-2 rounded-lg bg-primary-500/10 text-primary-400 group-hover:bg-primary-500/20 transition-colors">
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
              className="px-3 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground"
            >
              {cap}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
