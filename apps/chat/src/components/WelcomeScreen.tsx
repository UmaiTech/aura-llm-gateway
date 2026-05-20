import { ReactNode } from 'react'
import { Code, Lightbulb, Pencil, Zap } from 'lucide-react'
import type { Model } from '../lib/types'

interface WelcomeScreenProps {
  model: Model
  onSendMessage: (content: string) => Promise<void>
}

interface Suggestion {
  icon: typeof Code
  label: string
  prompt: string
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: Code,
    label: 'Help me debug',
    prompt:
      "I have a bug in my React component where state isn't updating. Can you help me debug it?",
  },
  {
    icon: Lightbulb,
    label: 'Explain a concept',
    prompt: 'Explain how async/await works in JavaScript with simple examples.',
  },
  {
    icon: Pencil,
    label: 'Write code',
    prompt:
      'Write a Python function that finds all prime numbers up to a given number.',
  },
  {
    icon: Zap,
    label: 'Optimize code',
    prompt:
      'How can I optimize a slow database query that joins multiple tables?',
  },
]

/**
 * Empty-state screen for the chat. Matches the editorial-minimal
 * language of the landing + sign-in: Fraunces display headline with
 * one accent word, hairline rules, mono labels. Stays quieter than
 * the sign-in screen — this is *inside* the app, so the visual
 * energy should recede as soon as a real conversation starts.
 *
 * Uses the same --auth-* tokens defined in src/index.css to avoid
 * disturbing the rest of the chat's Vercel/ChatGPT-style theme.
 */
export function WelcomeScreen({ model, onSendMessage }: WelcomeScreenProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100%',
        padding: '48px 24px',
        fontFamily: 'var(--auth-font-body)',
      }}
    >
      <div style={{ maxWidth: '38rem', width: '100%', textAlign: 'center' }}>
        {/* Mono eyebrow with the active model */}
        <span
          style={{
            fontFamily: 'var(--auth-font-mono)',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--auth-accent)',
            display: 'block',
            marginBottom: 16,
          }}
        >
          Model · {model.name}
        </span>

        {/* Serif headline with single accent word */}
        <h1
          style={{
            fontFamily: 'var(--auth-font-display)',
            fontWeight: 400,
            fontSize: 'clamp(1.875rem, 4vw, 2.75rem)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            marginBottom: 12,
            color: 'var(--auth-ink)',
          }}
        >
          What can I{' '}
          <span style={{ color: 'var(--auth-accent-warm)' }}>help</span> you with?
        </h1>

        <p
          style={{
            fontSize: '0.9375rem',
            lineHeight: 1.6,
            color: 'var(--auth-ink-muted)',
            margin: '0 auto 32px',
            maxWidth: '44ch',
          }}
        >
          Pick a starting point or just type. Conversations stay yours — no
          training, no scraping.
        </p>

        {/* Suggestion grid. Hairline-bordered tiles, no gradients,
            hover shifts to accent border + slight bg tint. Same
            language as the landing's section cards. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            textAlign: 'left',
          }}
        >
          {SUGGESTIONS.map((s) => (
            <SuggestionTile
              key={s.label}
              icon={<s.icon size={16} style={{ color: 'var(--auth-accent)' }} />}
              label={s.label}
              prompt={s.prompt}
              onClick={() => void onSendMessage(s.prompt)}
            />
          ))}
        </div>

        {/* Capabilities row — mono-uppercase tags, no chrome */}
        <div
          style={{
            marginTop: 40,
            paddingTop: 24,
            borderTop: '1px solid var(--auth-rule)',
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 16,
            fontFamily: 'var(--auth-font-mono)',
            fontSize: '0.6875rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--auth-ink-dim)',
          }}
        >
          {['Code', 'Debugging', 'Explanation', 'Translation', 'Analysis'].map(
            (cap) => (
              <span key={cap}>{cap}</span>
            ),
          )}
        </div>
      </div>
    </div>
  )
}

function SuggestionTile({
  icon,
  label,
  prompt,
  onClick,
}: {
  icon: ReactNode
  label: string
  prompt: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 14,
        border: '1px solid var(--auth-rule)',
        background: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        color: 'var(--auth-ink)',
        transition: 'border-color 200ms cubic-bezier(0.25, 0.1, 0.25, 1), background 200ms cubic-bezier(0.25, 0.1, 0.25, 1)',
        borderRadius: 4,
        fontFamily: 'var(--auth-font-body)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--auth-accent)'
        e.currentTarget.style.background = 'oklch(0.74 0.16 230 / 0.05)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--auth-rule)'
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.8125rem',
          fontWeight: 500,
          color: 'var(--auth-ink)',
        }}
      >
        {icon}
        {label}
      </span>
      <span
        style={{
          fontSize: '0.75rem',
          color: 'var(--auth-ink-muted)',
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {prompt}
      </span>
    </button>
  )
}
