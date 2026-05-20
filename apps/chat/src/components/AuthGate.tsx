/**
 * AuthGate — gates the chat UI behind a GitHub sign-in.
 *
 * Four states:
 *   - loading: better-auth's useSession is still pending and we're inside
 *     the 10s grace window. Show a spinner (avoids the flash of sign-in
 *     screen for already-authenticated users on page load).
 *   - down: useSession has been pending for >10s, meaning /api/auth/*
 *     is either timing out or wedged. Show an apology screen instead of
 *     spinning forever.
 *   - signed-out: useSession resolved with no session. Show the GitHub
 *     sign-in screen.
 *   - signed-in: render the children (the actual chat app).
 *
 * Used in apps/chat/src/main.tsx as the wrapper around <App />.
 */

import { ReactNode, useEffect, useState } from 'react'
import { AlertTriangle, Github, Loader2, RotateCw } from 'lucide-react'
import { useSession, signIn } from '../lib/auth-client'

interface AuthGateProps {
  children: ReactNode
}

// How long we wait for useSession to resolve before assuming the auth
// backend is wedged. 10s is well above a healthy cold-start (~1-2s) and
// well under the user's patience threshold for a blank spinner.
const AUTH_TIMEOUT_MS = 10_000

export function AuthGate({ children }: AuthGateProps) {
  const { data: session, isPending } = useSession()
  const [authDown, setAuthDown] = useState(false)

  // Trip the "auth is down" flag if useSession stays pending past the
  // timeout. Cleared as soon as it resolves either way.
  useEffect(() => {
    if (!isPending) {
      setAuthDown(false)
      return
    }
    const timer = setTimeout(() => setAuthDown(true), AUTH_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [isPending])

  if (isPending && authDown) {
    return <AuthDownScreen />
  }

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <Loader2 className="h-6 w-6 animate-spin text-aura-400" />
      </div>
    )
  }

  if (!session) {
    return <SignInScreen />
  }

  return <>{children}</>
}

function AuthDownScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-100 px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="h-8 w-8 text-amber-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Sign-in is having a moment
          </h1>
          <p className="text-gray-400 leading-relaxed">
            Our auth service didn&apos;t respond in time. This is usually
            transient — give it a minute and try again.
          </p>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gray-100 text-gray-900 font-medium hover:bg-white transition-colors"
        >
          <RotateCw className="h-4 w-4" />
          Retry
        </button>

        <div className="pt-6 border-t border-gray-800 text-xs text-gray-500">
          Still broken?{' '}
          <a
            href="https://github.com/UmaiTech/aura-llm-gateway/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-aura-400 hover:text-aura-300 underline"
          >
            Open an issue
          </a>{' '}
          and we&apos;ll take a look.
        </div>
      </div>
    </div>
  )
}

function SignInScreen() {
  const handleGitHubSignIn = async () => {
    await signIn.social({
      provider: 'github',
      callbackURL: '/', // Land back at the chat after the OAuth dance
    })
  }

  // Sign-in screen mirrors the landing page's editorial-minimal
  // language: Fraunces display headline with one accent word, mono
  // eyebrow tag, hairline-rule stat strip, and one outlined CTA. The
  // brand logomark (purple chat bubble) sits in the top-left as the
  // anchor — same role it plays on the marketing site.
  //
  // Uses --auth-* CSS variables defined in src/index.css so we don't
  // disturb the rest of the chat app's design system (which inherits
  // the Vercel/ChatGPT-style theme used everywhere else).
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--auth-canvas)',
        color: 'var(--auth-ink)',
        fontFamily: 'var(--auth-font-body)',
      }}
    >
      {/* Top brand strip — mirrors the landing page header so a user
          arriving from the marketing site recognises where they are. */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 32px',
        }}
      >
        <a
          href="/"
          aria-label="Aura Playground — home"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
        >
          <img src="/playground/logo.svg" alt="" style={{ height: 32, width: 32 }} />
          <span
            style={{
              fontFamily: 'var(--auth-font-mono)',
              fontSize: '0.8125rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--auth-ink)',
            }}
          >
            Aura <span style={{ color: 'var(--auth-accent-warm)' }}>Playground</span>
          </span>
        </a>
        <a
          href="https://aura-llm.dev"
          style={{
            fontFamily: 'var(--auth-font-mono)',
            fontSize: '0.8125rem',
            color: 'var(--auth-ink-muted)',
            textDecoration: 'none',
          }}
        >
          ← Back to site
        </a>
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
        }}
      >
        <div style={{ maxWidth: '40rem', width: '100%', textAlign: 'center' }}>
          {/* Mono eyebrow — same role as "v0.5.x — Open Responses API"
              on the landing. Cyan accent here too, restrained. */}
          <span
            style={{
              fontFamily: 'var(--auth-font-mono)',
              fontSize: '0.75rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--auth-accent)',
              display: 'block',
              marginBottom: 20,
            }}
          >
            Free · no credit card · 20 chats / day
          </span>

          {/* Fraunces display headline with a single accent word.
              Stays well below the landing's hero scale (~5rem) so
              the playground reads as a child surface, not a peer. */}
          <h1
            style={{
              fontFamily: 'var(--auth-font-display)',
              fontWeight: 400,
              fontSize: 'clamp(2.25rem, 5vw, 3.5rem)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              marginBottom: 16,
              maxWidth: '20ch',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            One auth,{' '}
            <span style={{ color: 'var(--auth-accent-warm)' }}>every</span> model.
          </h1>

          <p
            style={{
              fontSize: '1.0625rem',
              lineHeight: 1.6,
              color: 'var(--auth-ink-muted)',
              maxWidth: '46ch',
              margin: '0 auto 32px',
            }}
          >
            Try the Open Responses API live — across OpenAI, Anthropic, Google,
            Mistral, and more.
          </p>

          {/* Single outlined CTA matching the landing's btn-outline--warm */}
          <button
            onClick={handleGitHubSignIn}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 24px',
              background: 'transparent',
              color: 'var(--auth-ink)',
              border: '1px solid var(--auth-accent-warm)',
              borderRadius: 6,
              fontFamily: 'var(--auth-font-body)',
              fontSize: '0.9375rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 200ms cubic-bezier(0.25, 0.1, 0.25, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'oklch(0.74 0.18 280 / 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <Github size={18} />
            Sign in with GitHub
          </button>

          <p
            style={{
              fontSize: '0.75rem',
              lineHeight: 1.6,
              color: 'var(--auth-ink-dim)',
              marginTop: 24,
              maxWidth: '40ch',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            We only read your email and public profile. No repos, no writes.
            Your gateway API key is server-side only — never exposed to the
            browser.
          </p>

          {/* Stat strip — mirrors the landing's hero stat row at a
              smaller scale. Three quick proof points instead of three
              feature cards, separated by hairlines. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 32,
              borderTop: '1px solid var(--auth-rule)',
              borderBottom: '1px solid var(--auth-rule)',
              padding: '24px 0',
              marginTop: 48,
              textAlign: 'left',
            }}
          >
            <Stat value="7" label="Providers" />
            <Stat value="20/day" label="Free chats" />
            <Stat value="<10ms" label="Gateway overhead" />
          </div>
        </div>
      </main>

      <footer
        style={{
          padding: '24px 32px',
          fontFamily: 'var(--auth-font-mono)',
          fontSize: '0.75rem',
          color: 'var(--auth-ink-dim)',
          borderTop: '1px solid var(--auth-rule)',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <span>
          Want to self-host? See the{' '}
          <a
            href="https://github.com/UmaiTech/aura-llm-gateway"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--auth-ink-muted)',
              textDecoration: 'underline',
              textUnderlineOffset: '0.2em',
            }}
          >
            source on GitHub
          </a>
          .
        </span>
        {/* Matches the landing's sign-off so the playground feels like
            the same publication. Accent-warm heart for brand continuity. */}
        <span style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Made in Stockholm with{' '}
          <span aria-label="love" style={{ color: 'var(--auth-accent-warm)' }}>
            ❤
          </span>
        </span>
      </footer>
    </div>
  )
}

/**
 * Hairline-rule stat block matching the landing page's hero stats.
 * Tabular numerals so the columns align even at different value widths.
 */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--auth-font-display)',
          fontWeight: 400,
          fontSize: '1.875rem',
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--auth-ink)',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: 'var(--auth-font-mono)',
          fontSize: '0.6875rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--auth-ink-muted)',
          marginTop: 6,
        }}
      >
        {label}
      </div>
    </div>
  )
}
