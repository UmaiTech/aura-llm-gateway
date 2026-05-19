/**
 * Browser-side client for the /api/beta-signup serverless function.
 *
 * The server reads identity from the better-auth session cookie, so
 * we never send email/name/github_login from the client — just the
 * source of the click so we can measure CTA conversion.
 */

export type BetaSignupSource =
  | 'rate_limit_429'
  | 'header_banner'
  | 'sign_in_screen'
  | 'locked_model'

export interface BetaSignup {
  email: string
  name: string | null
  githubLogin: string | null
  source: string
  useCase: string | null
  createdAt: string
}

export interface BetaSignupState {
  signedUp: boolean
  signup: BetaSignup | null
}

export async function getBetaSignupState(): Promise<BetaSignupState> {
  const res = await fetch('/api/beta-signup', { credentials: 'include' })
  if (!res.ok) {
    // Pull whatever the server said in the body so the caller's
    // console.error / toast can show something useful (e.g. "401
    // unauthorized — session expired"). Fall through to a status-only
    // message if the body isn't JSON.
    const detail = await res
      .json()
      .then((b: { error?: string; message?: string }) =>
        b.message ?? b.error ?? '',
      )
      .catch(() => '')
    throw new Error(
      detail
        ? `beta-signup GET ${res.status}: ${detail}`
        : `beta-signup GET failed: ${res.status}`,
    )
  }
  return res.json()
}

export async function joinBeta(source: BetaSignupSource): Promise<BetaSignup> {
  const res = await fetch('/api/beta-signup', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || `beta-signup POST failed: ${res.status}`)
  }
  const data = (await res.json()) as BetaSignupState
  if (!data.signup) throw new Error('beta-signup returned no signup row')
  return data.signup
}
