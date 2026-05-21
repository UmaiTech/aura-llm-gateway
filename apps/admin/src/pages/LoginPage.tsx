import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { useAuthStore } from '@/stores'
import { Key2Line, EyeLine, EyeCloseLine } from '@mingcute/react'

export function LoginPage() {
  // Pre-fill admin key from env var in development for convenience
  const defaultKey = import.meta.env.VITE_ADMIN_KEY || ''
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
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
              Enter your admin key to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                variant="gradient"
                loading={loading}
              >
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Set the <code className="text-xs bg-muted px-1 py-0.5 rounded">AURA_ADMIN_KEY</code> environment variable to configure your admin key.
        </p>
      </div>
    </div>
  )
}
