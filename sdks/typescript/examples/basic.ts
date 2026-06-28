/** Basic one-shot completion. Run: AURA_API_KEY=... npx tsx examples/basic.ts */
import { AuraClient, outputText } from 'aura-llm'

const client = new AuraClient({ apiKey: process.env.AURA_API_KEY })

const response = await client.responses.create({
  model: 'gpt-5.4-mini',
  input: 'What is the capital of France?',
})

console.log(outputText(response))
console.log('cost:', response.usage?.cost_usd)
