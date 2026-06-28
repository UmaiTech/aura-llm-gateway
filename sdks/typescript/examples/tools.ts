/** Tool calling. Run: AURA_API_KEY=... npx tsx examples/tools.ts */
import { AuraClient, functionTool, toolCalls } from 'aura-llm'

const client = new AuraClient({ apiKey: process.env.AURA_API_KEY })

const response = await client.responses.create({
  model: 'gpt-5.4-mini',
  input: "What's the weather in San Francisco?",
  tools: [
    functionTool('get_weather', 'Get the current weather for a city', {
      type: 'object',
      properties: { city: { type: 'string', description: 'City name' } },
      required: ['city'],
    }),
  ],
})

for (const call of toolCalls(response)) {
  console.log(`→ ${call.name}(${call.arguments})`)
}
