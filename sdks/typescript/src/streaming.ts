/**
 * Server-Sent Events parsing for the streaming Responses API.
 *
 * Consumes a `ReadableStream<Uint8Array>` (from `fetch` `response.body`) and
 * yields typed `StreamEvent`s as an AsyncIterable — the idiomatic TS shape for
 * `for await (const event of stream)`. Mirrors the Python SDK's
 * `_parse_sse_stream` / `_parse_sse_event` / `_parse_event_data`.
 */

import { STREAM_EVENT_TYPES, type StreamEvent } from './types.js'

/** Parse one SSE block ("event:" / "data:" lines) into a StreamEvent. */
export function parseSSEChunk(chunk: string): StreamEvent | null {
  let eventType: string | null = null
  const dataLines: string[] = []

  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
    // ':' comment lines and blanks are ignored.
  }

  if (dataLines.length === 0) return null
  const dataStr = dataLines.join('\n')
  if (dataStr === '[DONE]') return null

  let data: unknown
  try {
    data = JSON.parse(dataStr)
  } catch {
    return null
  }

  const type =
    eventType ?? (typeof (data as { type?: unknown })?.type === 'string'
      ? (data as { type: string }).type
      : null)
  if (!type || !STREAM_EVENT_TYPES.has(type)) return null

  // The gateway sends a discriminated payload; trust the `type` discriminant.
  return data as StreamEvent
}

/**
 * Turn a byte stream of SSE into an AsyncIterable of events.
 * Splits on the SSE record separator ("\n\n") and decodes incrementally,
 * giving the caller full back-pressure (we only read as fast as consumed).
 */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent, void, unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const event = parseSSEChunk(chunk)
        if (event) yield event
      }
    }
    // Flush any trailing event without a final separator.
    const tail = (buffer + decoder.decode()).trim()
    if (tail) {
      const event = parseSSEChunk(tail)
      if (event) yield event
    }
  } finally {
    reader.releaseLock()
  }
}
