/**
 * AuthGate — gates the chat UI behind a GitHub sign-in.
 *
 * - If the user has no session: render a friendly landing screen with a
 *   "Sign in with GitHub" button.
 * - If the session is loading: render a tiny spinner (avoids the flash of
 *   sign-in screen for already-authenticated users on page load).
 * - If authenticated: render the children (the actual chat app).
 *
 * Used in apps/chat/src/main.tsx as the wrapper around <App />.
 */

import { ReactNode } from 'react'
import { Github, Loader2, MessageSquare } from 'lucide-react'
import { useSession, signIn } from '../lib/auth-client'

interface AuthGateProps {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const { data: session, isPending } = useSession()

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
