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
import {
  AlertTriangle,
  Github,
  Loader2,
  RotateCw,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react'
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

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100 relative overflow-hidden">
      {/* Match the landing page's radial-gradient hero so the sign-in
          feels like a continuation of the marketing site, not a
          starkly different screen. Two large soft blobs (aura +
          primary) sit behind the content; the relative wrapper above
          + overflow-hidden keep them clipped to the viewport. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 pointer-events-none"
      >
        <div className="absolute top-1/4 -left-32 h-96 w-96 rounded-full bg-aura-500/20 blur-3xl" />
        <div className="absolute top-1/2 -right-32 h-96 w-96 rounded-full bg-primary-500/20 blur-3xl" />
      </div>

      {/* Top brand strip — mirrors the landing page header so a user
          arriving from the marketing site recognizes where they are. */}
      <header className="flex items-center justify-between px-6 sm:px-10 py-4">
        <div className="flex items-center gap-2.5">
          <img src="/playground/logo.svg" alt="Aura" className="h-8 w-8" />
          <span className="font-semibold text-lg">Aura</span>
        </div>
        <a
          href="https://aura-llm.dev"
          className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          ← Back to site
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-xl w-full text-center space-y-8">
          {/* Hero */}
          <div className="space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-aura-500/10 border border-aura-500/30 text-xs font-medium text-aura-300">
              <Sparkles className="h-3 w-3" />
              Free, no credit card
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
              Try the{' '}
              <span className="gradient-text">Aura Playground</span>
            </h1>
            <p className="text-gray-400 leading-relaxed text-base sm:text-lg max-w-md mx-auto">
              The Open Responses API live — across OpenAI, Anthropic, Google,
              Mistral, and more. One auth, every model.
            </p>
          </div>

          {/* Primary CTA */}
          <button
            onClick={handleGitHubSignIn}
            className="inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-lg bg-gray-100 text-gray-900 font-semibold hover:bg-white transition-colors shadow-lg shadow-aura-500/10 hover:shadow-aura-500/20"
          >
            <Github className="h-5 w-5" />
            Sign in with GitHub
          </button>

          <p className="text-xs text-gray-500 leading-relaxed">
            We only read your email and public profile. No repos, no writes.
            Your gateway API key is server-side only — never exposed to the browser.
          </p>

          {/* Feature grid — matches the landing page's "Everything you
              need" pattern at a smaller scale. Three quick reasons to
              tap Sign In, not a wall of features. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-8">
            <FeatureCard
              icon={<Zap className="h-4 w-4 text-aura-400" />}
              title="20 free chats / day"
              copy="Cap that bites only if you push it. Reset at 00:00 UTC."
            />
            <FeatureCard
              icon={<Shield className="h-4 w-4 text-aura-400" />}
              title="Your data, server-side"
              copy="Gateway keys never reach the browser. Session-scoped."
            />
            <FeatureCard
              icon={<Sparkles className="h-4 w-4 text-aura-400" />}
              title="Beta: higher limits"
              copy="One click in-app to join the managed beta waitlist."
            />
          </div>
        </div>
      </main>

      {/* Footer mirrors landing page's "self-host" hint */}
      <footer className="px-6 py-6 text-center text-xs text-gray-500 border-t border-gray-900">
        Want to self-host? See the{' '}
        <a
          href="https://github.com/UmaiTech/aura-llm-gateway"
          target="_blank"
          rel="noopener noreferrer"
          className="text-aura-400 hover:text-aura-300 underline"
        >
          source on GitHub
        </a>
        .
      </footer>
    </div>
  )
}

/**
 * One of the three reassurance cards under the sign-in CTA.
 * Compact (icon + ~10 words of copy each) so they read as quick
 * scannable proof points rather than a wall of marketing text.
 */
function FeatureCard({
  icon,
  title,
  copy,
}: {
  icon: ReactNode
  title: string
  copy: string
}) {
  return (
    <div className="p-4 rounded-xl bg-gray-900/40 border border-gray-800 text-left space-y-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium text-gray-200">{title}</span>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{copy}</p>
    </div>
  )
}
