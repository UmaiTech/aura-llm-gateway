import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui'
import { useAuthStore } from '@/stores'
import { getCurrentSession, signInWithGithub } from '@/lib/api'
import { Key2Line, EyeLine, EyeCloseLine, GithubLine } from '@mingcute/react'

/**
 * Admin login screen with two paths:
 *
 *   1. "Sign in with GitHub" — the preferred path. Reuses the
 *      playground's better-auth instance via the shared cookie on
 *      `.aura-llm.dev`. After OAuth callback, we re-fetch the
 *      session, validate it, and store the user info.
 *
 *   2. "Use admin key instead" — collapsed fallback. Bearer-token
 *      login for CI, bootstrap, or recovery cases where GitHub auth
 *      is unavailable. Same behaviour as the original login flow.
 *
 * If the user lands here with a valid session cookie already (e.g.
 * they signed in on the playground and clicked through to admin),
 * we auto-detect it and bounce to the dashboard without showing the
 * form at all.
 */
export function LoginPage() {
  const navigate = useNavigate()
  const { loginWithKey, loginWithSession } = useAuthStore()

  // Auto-detect existing session on mount. If present, skip the
  // login UI entirely and proceed to the dashboard.
  const [sessionCheckDone, setSessionCheckDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCurrentSession()
      .then((session) => {
        if (cancelled) return
        if (session) {
          loginWithSession(session.user)
          navigate('/')
        } else {
          setSessionCheckDone(true)
        }
      })
      .catch(() => {
        // Network error checking session — show the form anyway so
        // the admin can fall back to the bearer key.
        if (!cancelled) setSessionCheckDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [loginWithSession, navigate])

  // GitHub button state
  const [githubLoading, setGithubLoading] = useState(false)
  const [githubError, setGithubError] = useState('')

  const handleGithubSignIn = async () => {
    setGithubError('')
    setGithubLoading(true)
    try {
      // Send the user back to the admin app after GitHub callback.
      // better-auth handles the callback at /api/auth/callback/github,
      // sets the cookie, then redirects here. We hit the LoginPage
      // again, the useEffect above detects the new session, and we
      // navigate to the dashboard.
      await signInWithGithub(`${window.location.origin}${window.location.pathname}`)
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'GitHub sign-in failed')
      setGithubLoading(false)
    }
  }

  // Bearer-key fallback state
  const defaultKey = import.meta.env.VITE_ADMIN_KEY || ''
  const [key, setKey] = useState(defaultKey)
  const [showKey, setShowKey] = useState(false)
  const [keyLoading, setKeyLoading] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [showKeyForm, setShowKeyForm] = useState(false)

  const handleKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setKeyError('')
    setKeyLoading(true)

    // Same minimal validation as before — the actual key check
    // happens server-side on the first authenticated request.
    await new Promise((resolve) => setTimeout(resolve, 300))

    if (key.trim().length < 8) {
      setKeyError('Invalid admin key')
      setKeyLoading(false)
      return
    }

    loginWithKey(key)
    navigate('/')
  }

  // Show a tiny spinner while we check for an existing session, to
  // avoid flashing the login form when we're about to redirect.
  if (!sessionCheckDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Checking session…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img
            src={`${import.meta.env.BASE_URL}logo-glow.svg`}
            alt="Aura"
            className="h-24 w-24 mb-4"
          />
          <h1 className="text-2xl font-bold">Aura Gateway</h1>
          <p className="text-muted-foreground mt-1">Admin Dashboard</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Use your GitHub account to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              type="button"
              className="w-full gap-2"
              variant="gradient"
              loading={githubLoading}
              onClick={handleGithubSignIn}
            >
              <GithubLine className="h-4 w-4" />
              Sign in with GitHub
            </Button>

            {githubError && (
              <p className="text-sm text-destructive">{githubError}</p>
            )}

            {!showKeyForm && (
              <button
                type="button"
                onClick={() => setShowKeyForm(true)}
                className="w-full text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              >
                Use admin key instead
              </button>
            )}

            {showKeyForm && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      Or admin key (CI / fallback)
                    </span>
                  </div>
                </div>

                <form onSubmit={handleKeySubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="key" className="text-sm font-medium">
                      Admin Key
                    </label>
                    <div className="relative">
                      <Input
                        id="key"
                        type={showKey ? 'text' : 'password'}
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder="Enter your admin key"
                        icon={<Key2Line className="h-4 w-4" />}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? (
                          <EyeCloseLine className="h-4 w-4" />
                        ) : (
                          <EyeLine className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {keyError && (
                    <p className="text-sm text-destructive">{keyError}</p>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    variant="outline"
                    loading={keyLoading}
                  >
                    Sign in with admin key
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          GitHub sign-in requires owning at least one organization in the
          gateway. Admin key fallback set via{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">
            AURA_ADMIN_KEY
          </code>{' '}
          on the server.
        </p>
      </div>
    </div>
  )
}
