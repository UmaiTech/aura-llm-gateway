import { describe, it, expect } from 'vitest'
import { parseSSEChunk, parseSSE } from '../src/streaming.js'
import type { StreamEvent, TextDeltaEvent } from '../src/types.js'

/** Build a ReadableStream<Uint8Array> from string chunks (any split point). */
function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i++]))
      } else {
        controller.close()
      }
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = []
  for await (const ev of parseSSE(stream)) out.push(ev)
  return out
}

describe('parseSSEChunk', () => {
  it('parses an event+data block', () => {
    const ev = parseSSEChunk(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hi","output_index":0,"content_index":0}',
    ) as TextDeltaEvent
    expect(ev.type).toBe('response.output_text.delta')
    expect(ev.delta).toBe('hi')
  })

  it('falls back to the data.type when no event: line', () => {
    const ev = parseSSEChunk('data: {"type":"response.completed","response":{}}')
    expect(ev?.type).toBe('response.completed')
  })

  it('returns null on [DONE], unknown type, and bad JSON', () => {
    expect(parseSSEChunk('data: [DONE]')).toBeNull()
    expect(parseSSEChunk('data: {"type":"nonsense"}')).toBeNull()
    expect(parseSSEChunk('data: {not json}')).toBeNull()
    expect(parseSSEChunk(': just a comment')).toBeNull()
  })
})

describe('parseSSE (stream)', () => {
  it('yields events split across arbitrary chunk boundaries', async () => {
    const full =
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hello","output_index":0,"content_index":0}\n\n' +
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":" world","output_index":0,"content_index":0}\n\n' +
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"r1"}}\n\n'
    // Split mid-record to exercise the buffer.
    const chunks = [full.slice(0, 30), full.slice(30, 90), full.slice(90)]
    const events = await collect(streamFrom(chunks))
    expect(events.map((e) => e.type)).toEqual([
      'response.output_text.delta',
      'response.output_text.delta',
      'response.completed',
    ])
    expect((events[0] as TextDeltaEvent).delta).toBe('Hello')
  })

  it('flushes a trailing event without a final separator', async () => {
    const events = await collect(
      streamFrom([
        'data: {"type":"response.completed","response":{"id":"r1"}}',
      ]),
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('response.completed')
  })

  it('ignores [DONE] sentinels in-stream', async () => {
    const events = await collect(
      streamFrom([
        'data: {"type":"response.in_progress","response":{}}\n\ndata: [DONE]\n\n',
      ]),
    )
    expect(events).toHaveLength(1)
  })
})
