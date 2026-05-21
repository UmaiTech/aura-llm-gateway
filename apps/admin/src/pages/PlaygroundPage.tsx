import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { ExternalLinkLine, FlashLine, ShieldLine, Refresh1Line } from '@mingcute/react'

/**
 * The admin app used to have a fake chat UI under /playground that
 * generated simulated responses. That was dead weight — the real
 * playground at playground.aura-llm.dev does this for real (GitHub
 * auth, real LLM calls, real cost tracking).
 *
 * This page now links operators out to the real thing rather than
 * pretending. If you want a playground inside the admin in the
 * future, point this at an iframe of the chat app or build a real
 * call against /v1/responses with the admin's bearer key.
 */
export function PlaygroundPage() {
  return (
    <div className="flex flex-col h-full">
      <Header
        title="Playground"
        description="Test the gateway with a real chat interface"
      />

      <div className="flex-1 overflow-auto p-6">
        <Card className="max-w-2xl mx-auto mt-12">
          <CardHeader>
            <CardTitle>Open the playground</CardTitle>
            <CardDescription>
              The Aura playground is hosted at{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                playground.aura-llm.dev
              </code>{' '}
              and runs real LLM requests through the gateway with
              GitHub-authenticated sessions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <FlashLine className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                <div>
                  <div className="font-medium">Real provider routing</div>
                  <div className="text-muted-foreground">
                    OpenAI, Anthropic, Google, and the routing rules
                    you configure under Routing →
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <ShieldLine className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                <div>
                  <div className="font-medium">
                    Sessions tied to the Playground (Demo) org
                  </div>
                  <div className="text-muted-foreground">
                    Every sign-in mints a per-user key under that org,
                    so requests show up in the Organizations and Keys
                    pages here.
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Refresh1Line className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                <div>
                  <div className="font-medium">Streaming + agent mode</div>
                  <div className="text-muted-foreground">
                    SSE responses, tool-calling, and the agentic
                    harness — exercise the full Open Responses API.
                  </div>
                </div>
              </li>
            </ul>

            <div className="flex gap-2 pt-4 border-t">
              <a
                href="https://playground.aura-llm.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button variant="gradient" className="w-full gap-2">
                  Open playground
                  <ExternalLinkLine className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
