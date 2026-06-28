/** Conversation threading with previous_response_id. */
import { AuraClient, outputText } from 'aura-llm'

const client = new AuraClient({ apiKey: process.env.AURA_API_KEY })

/** Thread a series of prompts, carrying context via previous_response_id. */
async function* chat(prompts: string[], model = 'gpt-5.4-mini') {
  let prevId: string | undefined
  for (const prompt of prompts) {
    const response = await client.responses.create({
      model,
      input: prompt,
      ...(prevId ? { previous_response_id: prevId } : {}),
    })
    prevId = response.id
    yield outputText(response)
  }
}

for await (const reply of chat(['My name is Alice.', 'What is my name?'])) {
  console.log(reply)
}
