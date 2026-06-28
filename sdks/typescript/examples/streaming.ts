/** Streaming via AsyncIterable. Run: AURA_API_KEY=... npx tsx examples/streaming.ts */
import { AuraClient } from 'aura-llm'

const client = new AuraClient({ apiKey: process.env.AURA_API_KEY })

const stream = await client.responses.create({
  model: 'gpt-5.4-mini',
  input: 'Write a haiku about TypeScript.',
  stream: true,
})

for await (const event of stream) {
  if (event.type === 'response.output_text.delta') {
    process.stdout.write(event.delta)
  } else if (event.type === 'response.completed') {
    process.stdout.write('\n')
  }
}
