import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { useAuthStore } from '@/stores'
import { Wordmark } from '@aura/ui/brand/Brand.tsx'
import { Key2Line, EyeLine, EyeCloseLine } from '@mingcute/react'

export function LoginPage() {
  // Pre-fill admin key from env var in development for convenience.
  // NEVER auto-fill in production builds, even if VITE_ADMIN_KEY is
  // set in the Vercel env — that value would get bundled into the
  // public JS and made available to anyone who opens devtools. The
  // .env.example file warns against it but this guard is the actual
  // backstop. Operators can still paste their key into the form.
  const defaultKey =
    import.meta.env.MODE === 'production'
      ? ''
      : import.meta.env.VITE_ADMIN_KEY || ''
  const [key, setKey] = useState(defaultKey)
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Simulate API validation - in production, this would verify with the backend
    await new Promise((resolve) => setTimeout(resolve, 500))

    if (key.trim().length < 8) {
      setError('Invalid admin key')
      setLoading(false)
      return
    }

    login(key)
    navigate('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Shared wordmark (packages/aura-ui), left-aligned like the sidebar lockup */}
        <div className="mb-8">
          <Wordmark size={40} className="text-foreground" />
          <p className="eyebrow mt-3 text-[10px]">LLM Gateway · Admin</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter the gateway's admin key to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="key" className="text-sm font-medium">
                  Admin key
                </label>
                <div className="relative">
                  <Input
                    id="key"
                    type={showKey ? 'text' : 'password'}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="AURA_ADMIN_KEY"
                    autoComplete="current-password"
                    icon={<Key2Line className="h-4 w-4" />}
                    className="pr-10 font-mono"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'key-error' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeCloseLine className="h-4 w-4" /> : <EyeLine className="h-4 w-4" />}
                  </button>
                </div>
                {error && (
                  <p id="key-error" className="text-xs text-destructive">
                    {error}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" loading={loading}>
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          The key is set with the <code className="rounded-sm bg-muted px-1 py-px text-xs text-foreground">AURA_ADMIN_KEY</code>{' '}
          environment variable on the gateway and is stored only in this browser.
        </p>
      </div>
    </div>
  )
}
