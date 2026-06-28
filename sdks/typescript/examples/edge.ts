/**
 * Edge runtime example (Cloudflare Workers / Vercel Edge).
 *
 * The SDK uses only global fetch + Web Streams, so it runs unchanged on the
 * edge. This handler streams the model's output straight to the client.
 */
import { AuraClient } from 'aura-llm'

export default {
  async fetch(request: Request, env: { AURA_API_KEY: string }): Promise<Response> {
    const client = new AuraClient({ apiKey: env.AURA_API_KEY })
    const { prompt } = (await request.json()) as { prompt: string }

    const events = await client.responses.create({
      model: 'gpt-5.4-mini',
      input: prompt,
      stream: true,
    })

    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        for await (const event of events) {
          if (event.type === 'response.output_text.delta') {
            controller.enqueue(encoder.encode(event.delta))
          }
        }
        controller.close()
      },
    })

    return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
  },
}
