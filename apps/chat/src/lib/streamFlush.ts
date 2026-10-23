/**
 * Throttle per-delta content updates during streaming.
 *
 * A streamed answer arrives as hundreds of small deltas. Writing each one
 * to the store re-renders the whole conversation, re-parses the markdown
 * and (for the persisted store) re-serialises to localStorage. On long
 * code or markdown answers that pinned the main thread and the page
 * looked hung. Coalescing to at most one store write per `intervalMs`
 * keeps the visible stream smooth without the per-token cost.
 *
 * Call `flush()` when the stream ends so the final text is never left
 * waiting on a timer.
 */
export function createThrottledSetter(apply: (content: string) => void, intervalMs = 40) {
  let pending: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let last = 0

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (pending !== null) {
      const content = pending
      pending = null
      last = Date.now()
      apply(content)
    }
  }

  const set = (content: string) => {
    pending = content
    const elapsed = Date.now() - last
    if (elapsed >= intervalMs) {
      flush()
    } else if (!timer) {
      timer = setTimeout(flush, intervalMs - elapsed)
    }
  }

  return { set, flush }
}
