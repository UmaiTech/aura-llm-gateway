import { ApiError, API_BASE_URL } from './api'

export interface DescribedError {
  /** One-line headline: what went wrong, in operator terms. */
  title: string
  /** What it likely means and what to do about it. */
  hint: string
  /** Raw technical detail (status + endpoint + server message). */
  detail: string | null
}

/**
 * Turn whatever a page caught into something an operator can act on.
 *
 * Pages historically stored `err.message`, which for a 404 is just
 * "API error: 404". This keeps the raw text available as `detail`
 * but leads with a sentence that says what failed and why.
 *
 * Accepts strings so pages that still keep `error: string` state can
 * use <ErrorState> without being rewritten.
 */
export function describeError(error: unknown, what = 'this data'): DescribedError {
  if (error instanceof ApiError) {
    const where = error.endpoint ? error.endpoint.split('?')[0] : 'this endpoint'
    const detail = [
      error.status ? `HTTP ${error.status}` : 'Network error',
      error.endpoint ?? null,
      error.message && !/^API error: \d+$/.test(error.message) ? error.message : null,
    ]
      .filter(Boolean)
      .join(' · ')

    if (error.status === 0) {
      return {
        title: `Couldn't reach the gateway`,
        hint: `No response from ${API_BASE_URL}. Check that the gateway is running and that this origin is allowed by its CORS settings.`,
        detail,
      }
    }
    if (error.status === 401 || error.status === 403) {
      return {
        title: 'Admin key was rejected',
        hint: 'The gateway refused the admin key stored in this browser. Sign out and sign in again with the current AURA_ADMIN_KEY.',
        detail,
      }
    }
    if (error.status === 404) {
      return {
        title: `Couldn't load ${what}`,
        hint: `The gateway doesn't expose ${where}. It is probably running an older version than this dashboard — upgrade the gateway, or check VITE_API_BASE_URL points at the right host.`,
        detail,
      }
    }
    if (error.status === 503) {
      return {
        title: `Couldn't load ${what}`,
        hint: 'The gateway is up but a backing service is unavailable. Check that the database (DATABASE_URL) and Redis are reachable.',
        detail,
      }
    }
    if (error.status >= 500) {
      return {
        title: `Couldn't load ${what}`,
        hint: 'The gateway hit an internal error. Its logs will have the details; retrying usually helps for transient failures.',
        detail,
      }
    }
    return { title: `Couldn't load ${what}`, hint: 'The gateway rejected the request.', detail }
  }

  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : null
  const status = message?.match(/API error: (\d+)/)?.[1]
  return {
    title: `Couldn't load ${what}`,
    hint:
      status === '404'
        ? 'The gateway doesn\'t expose this endpoint — it may be running an older version than this dashboard.'
        : 'Make sure the gateway is running and reachable from this browser.',
    detail: message,
  }
}
