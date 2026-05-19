/**
 * Vercel serverless: managed-service beta signup.
 *
 *   GET  /api/beta-signup  → { signedUp: boolean, signup?: { ... } }
 *   POST /api/beta-signup  → { signedUp: true, signup: { ... } }
 *                            body: { source: string, use_case?: string }
 *
 * Authentication: requires a better-auth session cookie. We use the
 * session to pull email / name / github_login server-side — the client
 * never has to send those, and can't lie about them. One row per user
 * (PK is user_id), so a second POST is a no-op that returns the
 * existing signup.
 *
 * `source` lets us measure which CTA converts best ("rate_limit_429"
 * vs. "header_banner"). Capped at 64 chars so a malicious client can't
 * fill the column with junk.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { fromNodeHeaders } from 'better-auth/node'
import { auth, pool } from '../_lib/auth'

const ALLOWED_SOURCES = new Set([
  'rate_limit_429',
  'header_banner',
  'sign_in_screen',
  'locked_model',
])

const MAX_USE_CASE_LEN = 500

interface BetaSignupRow {
  user_id: string
  email: string
  name: string | null
  github_login: string | null
  source: string
  use_case: string | null
  created_at: Date
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })
    if (!session?.user?.id) {
      return jsonResponse(res, 401, {
        error: 'unauthorized',
        message: 'Sign in first.',
      })
    }

    if (req.method === 'GET') {
      const existing = await fetchSignup(session.user.id)
      return jsonResponse(res, 200, {
        signedUp: existing !== null,
        signup: existing,
      })
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      const source = typeof body.source === 'string' ? body.source : ''
      const useCase =
        typeof body.use_case === 'string'
          ? body.use_case.slice(0, MAX_USE_CASE_LEN)
          : null

      if (!ALLOWED_SOURCES.has(source)) {
        return jsonResponse(res, 400, {
          error: 'invalid_source',
          message: `source must be one of: ${[...ALLOWED_SOURCES].join(', ')}`,
        })
      }

      const githubLogin = readGithubLoginFromSession(session)

      // Idempotent insert: ON CONFLICT DO NOTHING means a re-click just
      // returns the existing row. We always read it back so the client
      // gets a stable signup object regardless of whether this call did
      // the actual insert or not.
      await pool.query(
        `INSERT INTO playground_auth.beta_signup
          (user_id, email, name, github_login, source, use_case)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO NOTHING`,
        [
          session.user.id,
          session.user.email,
          session.user.name ?? null,
          githubLogin,
          source,
          useCase,
        ],
      )

      const signup = await fetchSignup(session.user.id)
      return jsonResponse(res, 200, {
        signedUp: true,
        signup,
      })
    }

    return jsonResponse(res, 405, {
      error: 'method_not_allowed',
      message: `Use GET or POST, not ${req.method}.`,
    })
  } catch (err) {
    console.error('[beta-signup] handler crashed:', err)
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse(res, 500, {
      error: 'beta_signup_error',
      message: message.slice(0, 200),
    })
  }
}

async function fetchSignup(userId: string) {
  const result = await pool.query<BetaSignupRow>(
    `SELECT user_id, email, name, github_login, source, use_case, created_at
       FROM playground_auth.beta_signup
      WHERE user_id = $1`,
    [userId],
  )
  if (!result.rowCount) return null
  const row = result.rows[0]
  return {
    email: row.email,
    name: row.name,
    githubLogin: row.github_login,
    source: row.source,
    useCase: row.use_case,
    createdAt: row.created_at.toISOString(),
  }
}

// better-auth attaches the GitHub `login` to the user object via the
// social-provider profile mapping. The exact path depends on the
// better-auth version; we probe a couple of locations defensively
// rather than typing them strictly.
function readGithubLoginFromSession(session: {
  user: Record<string, unknown>
}): string | null {
  const u = session.user
  const direct = u.github_login ?? u.githubLogin ?? u.login
  if (typeof direct === 'string') return direct
  return null
}

async function readJsonBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        const parsed = JSON.parse(raw)
        resolve(typeof parsed === 'object' && parsed !== null ? parsed : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}
