/**
 * Mint a gateway API key for a freshly-authenticated playground user.
 *
 * Called from the GitHub OAuth callback handler. Idempotent — if the user
 * already has a key in playground_auth.user_api_key, this is a no-op.
 *
 * Why we generate the key in-process instead of calling the gateway's
 * POST /v1/api-keys: the gateway's admin endpoint requires the caller to
 * be an authenticated *user* (per PR #101), which is exactly what we're
 * trying to bootstrap. Chicken-and-egg. We instead write directly to
 * public.api_keys + playground_auth.user_api_key in a transaction, using
 * the same hashing convention the gateway uses.
 */

import { createHash, randomBytes } from 'node:crypto'
import { fromNodeHeaders } from 'better-auth/node'
import { auth, pool } from './auth.js'

/**
 * Generate a key in the gateway's format:
 *   aura_live_<24-char hex>     ← key_id (first 34 chars, including prefix)
 *   aura_live_<64-char hex>     ← full secret (key_id + 40 more chars)
 *
 * Format matches scripts/create_api_key.sh and the existing bootstrap.
 */
function generateApiKey(): { key: string; keyId: string; keyHash: string } {
  // 32 bytes hex = 64 chars; gateway treats the first 24 as key_id suffix.
  const suffix = randomBytes(32).toString('hex')
  const key = `aura_live_${suffix}`
  const keyId = key.slice(0, 34) // "aura_live_" (10) + 24 char id
  const keyHash = createHash('sha256').update(key).digest('hex')
  return { key, keyId, keyHash }
}

/**
 * Free-tier defaults for the hosted playground.
 *
 * Three caps applied per minted key:
 *   - RATE_LIMIT_RPM: anti-burst, prevents 20+ requests/min from a
 *     loop. Rarely hit in normal chat.
 *   - DAILY_MESSAGE_LIMIT: the constraint that actually shapes
 *     organic usage. ~20 chat turns per UTC day; counter resets at
 *     00:00 UTC. This is the cap users hit and that drives them to
 *     the beta CTA.
 *   - MONTHLY_TOKEN_LIMIT: hard ceiling for power users with long
 *     conversations. Combined with the daily message cap it acts as
 *     a second tripwire — short messages are gated by daily count,
 *     long ones by token usage.
 */
const FREE_TIER_RATE_LIMIT_RPM = 5
const FREE_TIER_DAILY_MESSAGE_LIMIT = 20
const FREE_TIER_MONTHLY_TOKEN_LIMIT = 50_000

// Accept either a Web Request (Headers instance) or a Node-style
// header map. better-auth ships `fromNodeHeaders` to convert the
// latter into a Headers instance; pass-through for the former.
export async function mintPlaygroundApiKey(req: {
  headers: Headers | Record<string, string | string[] | undefined>
}): Promise<void> {
  const headers =
    req.headers instanceof Headers
      ? req.headers
      : fromNodeHeaders(req.headers)
  const session = await auth.api.getSession({ headers })
  if (!session?.user?.id) {
    console.warn('[mint-key] No session on request; skipping mint')
    return
  }

  const userId = session.user.id
  const userEmail = session.user.email
  const userName = session.user.name

  // Check if this user already has a key. If yes, we're done — first sign-in
  // was already handled (or another concurrent request beat us to it).
  const existing = await pool.query(
    'SELECT api_key_id FROM playground_auth.user_api_key WHERE user_id = $1',
    [userId],
  )
  if (existing.rowCount && existing.rowCount > 0) {
    return
  }

  const { key, keyId, keyHash } = generateApiKey()

  // Write to BOTH tables atomically:
  //   public.api_keys                 — the gateway's source of truth
  //   playground_auth.user_api_key    — our link table
  //
  // If either write fails, the transaction rolls back and the next sign-in
  // (or proxy call) will retry the mint.
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `INSERT INTO api_keys (
        key_id, key_hash, name, description, user_id, scopes,
        rate_limit_rpm, monthly_token_limit, daily_message_limit, status
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, 'active')`,
      [
        keyId,
        keyHash,
        `playground:${userName || userEmail || userId}`,
        `Auto-minted for playground user ${userEmail} on first sign-in.`,
        userId,
        JSON.stringify(['responses:create', 'conversations:read', 'usage:read']),
        FREE_TIER_RATE_LIMIT_RPM,
        FREE_TIER_MONTHLY_TOKEN_LIMIT,
        FREE_TIER_DAILY_MESSAGE_LIMIT,
      ],
    )

    // ON CONFLICT DO NOTHING gracefully handles the case where a concurrent
    // invocation (e.g. another /api/proxy call from the same user) already
    // minted the row between our pre-check above and this INSERT. The
    // proxy's re-fetch will then return the winning row.
    const insertResult = await client.query(
      `INSERT INTO playground_auth.user_api_key (user_id, api_key_id, api_key_secret, tier)
       VALUES ($1, $2, $3, 'free')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, keyId, key],
    )

    if (insertResult.rowCount === 0) {
      // Concurrent mint won — roll back the api_keys insert we just did
      // (otherwise we'd leak an orphaned key in public.api_keys).
      await client.query('ROLLBACK')
      console.warn(
        `[mint-key] Lost race for user ${userId}; another mint already inserted the user_api_key row.`,
      )
      return
    }

    await client.query('COMMIT')
    console.log(`[mint-key] Minted key ${keyId} for user ${userId}`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Look up the API key secret for a given user. Used by the proxy on every
 * request. Returns null if the user has no key yet (proxy should mint then
 * retry, or 401 the request).
 */
export async function getUserApiKey(userId: string): Promise<string | null> {
  const result = await pool.query(
    'SELECT api_key_secret FROM playground_auth.user_api_key WHERE user_id = $1',
    [userId],
  )
  if (!result.rowCount) return null
  return result.rows[0].api_key_secret as string
}
