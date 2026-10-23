/**
 * Recovery for lazy chunks that disappeared in a deploy.
 *
 * Docs pages (.mdx) and diagram renderers load as hashed chunks. A tab opened
 * before a deploy still references the old hashes, which the new deployment
 * no longer serves, so the dynamic import fails. Reloading picks up the new
 * index.html and its chunk names. The guard stops a loop when the chunk is
 * genuinely broken: at most one automatic reload per window.
 */
const KEY = 'aura-stale-chunk-reload'
const WINDOW_MS = 30_000

type Store = Pick<Storage, 'getItem' | 'setItem'>

/** True (and records the attempt) when an automatic reload is allowed now. */
export function claimStaleChunkReload(store: Store, now: number): boolean {
  try {
    const last = Number(store.getItem(KEY))
    if (Number.isFinite(last) && last > 0 && now - last < WINDOW_MS) return false
    store.setItem(KEY, String(now))
    return true
  } catch {
    // Blocked storage: no way to guard against a loop, so don't reload.
    return false
  }
}

/** Reload the page once to recover from a missing chunk. False if already tried. */
export function reloadForStaleChunk(): boolean {
  if (typeof window === 'undefined') return false
  if (!claimStaleChunkReload(window.sessionStorage, Date.now())) return false
  window.location.reload()
  return true
}
