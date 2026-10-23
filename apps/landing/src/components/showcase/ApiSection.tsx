import { useState } from 'react'
import { ArrowRight, BookOpen, Server } from 'lucide-react'
import { TabPanel, Tabs, useTabsId } from '@aura/ui/ui/Tabs.tsx'
import { LINKS, playgroundSampleUrl } from '../../lib/links'
import { FEATURED_REQUEST } from './sampleData'

type Lang = 'typescript' | 'python' | 'curl'

const SNIPPETS: Record<Lang, string> = {
  typescript: `import { AuraClient, outputText } from 'aura-llm'

const client = new AuraClient({
  apiKey: process.env.AURA_API_KEY,
  baseUrl: 'http://localhost:8080',
})

const response = await client.responses.create({
  model: 'auto',
  input: 'Explain this payload.',
})

console.log(outputText(response))
console.log(response.model) // the model that answered`,
  python: `from aura import AuraClient

client = AuraClient(
    api_key="your-api-key",
    base_url="http://localhost:8080",
)

response = client.responses.create(
    model="auto",
    input="Explain this payload.",
)

print(response.output_text)
print(response.model)  # the model that answered`,
  curl: `curl http://localhost:8080/v1/responses \\
  -H "Authorization: Bearer $AURA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "input": "Explain this payload."
  }'`,
}

const LANG_LABEL: Record<Lang, string> = { typescript: 'TypeScript', python: 'Python', curl: 'cURL' }

const RESPONSE_EXCERPT = `{
  "model": "gpt-5.4-mini",
  "status": "completed",
  "usage": {
    "input_tokens": 1240,
    "output_tokens": 212,
    "cost_usd": 0.0007
  },
  "metadata": {
    "aura": {
      "provider": "openai",
      "routing": {
        "requested_model": "auto",
        "tier": "medium",
        "selected": "gpt-5.4-mini",
        "reason": "…",
        "shadow": false
      }
    }
  }
}`

export function ApiSection() {
  const [lang, setLang] = useState<Lang>('typescript')
  const ids = useTabsId()
  return (
    <section aria-labelledby="api-heading" className="border-b border-aura-border py-20">
      <div className="grid gap-8 lg:grid-cols-2 lg:items-end lg:gap-12">
        <div>
          <p className="eyebrow">04 / The API</p>
          <h2 id="api-heading" className="mt-4 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.03em] text-aura-text sm:text-[42px]">
            Familiar in.
            <br />
            More visibility out.
          </h2>
        </div>
        <p className="max-w-[480px] leading-relaxed text-aura-muted">
          Send requests with the Open Responses API through the TypeScript or Python SDK, or plain HTTP. Every response
          carries the model that answered, its provider, token usage and cost, and — for auto routing — the decision.
        </p>
      </div>

      <div className="mt-10 grid overflow-hidden rounded-panel border border-aura-border bg-aura-surface lg:grid-cols-2">
        <div className="min-w-0 border-b border-aura-border lg:border-b-0 lg:border-r">
          <Tabs
            ids={ids}
            label="Example language"
            value={lang}
            onChange={setLang}
            className="px-5"
            tabs={(Object.keys(SNIPPETS) as Lang[]).map((l) => ({ id: l, label: LANG_LABEL[l] }))}
          />
          <TabPanel ids={ids} id={lang} className="p-5">
            <pre className="!m-0 overflow-x-auto !bg-transparent !p-0 font-mono text-xs leading-relaxed text-aura-muted">
              {SNIPPETS[lang]}
            </pre>
          </TabPanel>
        </div>
        <div className="min-w-0 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="eyebrow text-[10px]">Response excerpt</span>
            <span className="sample-tag">Illustrative values</span>
          </div>
          <pre className="!m-0 overflow-x-auto !bg-transparent !p-0 font-mono text-xs leading-relaxed text-aura-muted">
            {RESPONSE_EXCERPT}
          </pre>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <a href={LINKS.quickstart} className="inline-flex items-center gap-1.5 text-aura-accent hover:underline">
          <BookOpen className="h-4 w-4" aria-hidden />
          Quickstart
        </a>
        <a href="/docs/api/create-response" className="inline-flex items-center gap-1.5 text-aura-accent hover:underline">
          Responses API reference
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
      <p className="mt-8 text-sm text-aura-dim">
        Also in the gateway:{' '}
        {[
          ['prompt compression', '/docs/api/compression'],
          ['response caching', '/docs/api/caching'],
          ['provider failover and circuit breaking', '/docs/api/routing'],
          ['organizations, teams and scoped keys', '/docs/organizations'],
        ].map(([label, href], i, all) => (
          <span key={href}>
            <a href={href} className="text-aura-muted underline-offset-2 hover:text-aura-text hover:underline">
              {label}
            </a>
            {i < all.length - 1 ? ', ' : '.'}
          </span>
        ))}
      </p>
    </section>
  )
}

export function ClosingCta() {
  const sample = playgroundSampleUrl({ model: FEATURED_REQUEST.requestedModel, prompt: FEATURED_REQUEST.prompt, inspect: 'routing' })
  return (
    <section aria-labelledby="closing-heading" className="flex flex-col gap-10 py-20 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 id="closing-heading" className="font-display text-4xl font-semibold leading-[1.1] tracking-[-0.035em] text-aura-text sm:text-[45px]">
          Make a request.
          <br />
          See the whole picture.
        </h2>
        <p className="mt-4 max-w-[460px] text-aura-muted">
          Explore a response in the playground, then follow it into the admin app — or run the whole stack yourself.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
        <a href={sample} className="btn-primary">
          Try a sample request
          <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
        <a href={LINKS.admin} className="btn-secondary">
          Explore the admin app
        </a>
        <a href={LINKS.selfHost} className="btn-secondary">
          <Server className="h-4 w-4" aria-hidden />
          Self-host Aura
        </a>
      </div>
    </section>
  )
}
