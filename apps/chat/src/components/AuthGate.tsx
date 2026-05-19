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
import { AlertTriangle, Github, Loader2, MessageSquare, RotateCw } from 'lucide-react'
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-100 px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-aura-500/20 to-primary-500/20 border border-aura-500/30">
          <MessageSquare className="h-8 w-8 text-aura-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="gradient-text">Aura Playground</span>
          </h1>
          <p className="text-gray-400 leading-relaxed">
            Try the Open Responses API live — across OpenAI, Anthropic, Google,
            Mistral, and more. Free tier: 5 requests/min, 50K tokens/month.
          </p>
        </div>

        <button
          onClick={handleGitHubSignIn}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gray-100 text-gray-900 font-medium hover:bg-white transition-colors"
        >
          <Github className="h-5 w-5" />
          Sign in with GitHub
        </button>

        <div className="text-xs text-gray-500 leading-relaxed">
          We only read your email and public profile. No repos, no writes.
          Your gateway API key is server-side only — never exposed to the browser.
        </div>

        <div className="pt-6 border-t border-gray-800 text-xs text-gray-500">
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
        </div>
      </div>
    </div>
  )
}
