import { useState, useRef, useEffect } from 'react'
import { Header } from '@/components/layout'
import { Button, Input, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  SendLine,
  StopCircleLine,
  AddLine,
  DeleteLine,
  Settings1Line,
  AiLine,
  User2Line,
} from '@mingcute/react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  model?: string
  tokens?: { input: number; output: number }
  cost?: number
  toolCalls?: Array<{ name: string; input: object; output?: object }>
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  model: string
  systemPrompt: string
  createdAt: Date
}

const MODELS = [
  // OpenAI — 2026
  { id: 'gpt-5.5-pro', name: 'GPT-5.5 Pro', provider: 'OpenAI' },
  { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'OpenAI' },
  { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'OpenAI' },
  { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', provider: 'OpenAI' },
  { id: 'gpt-4o', name: 'GPT-4o (legacy)', provider: 'OpenAI' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (legacy)', provider: 'OpenAI' },
  // Anthropic — 2026
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', provider: 'Anthropic' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'Anthropic' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'Anthropic' },
  { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'Anthropic' },
  { id: 'claude-3-opus', name: 'Claude 3 Opus (legacy)', provider: 'Anthropic' },
  // Google
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro', provider: 'Google' },
  { id: 'gemini-pro', name: 'Gemini Pro (legacy)', provider: 'Google' },
]

export function PlaygroundPage() {
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: '1',
      title: 'New conversation',
      messages: [],
      model: 'gpt-5.4-mini',
      systemPrompt: 'You are a helpful assistant.',
      createdAt: new Date(),
    },
  ])
  const [currentId, setCurrentId] = useState('1')
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [agentMode, setAgentMode] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const currentConversation = conversations.find((c) => c.id === currentId)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentConversation?.messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading || !currentConversation) return

    const userMessage: Message = {
      id: String(Date.now()),
      role: 'user',
      content: input,
      timestamp: new Date(),
    }

    // Add user message
    setConversations((convs) =>
      convs.map((c) =>
        c.id === currentId
          ? {
              ...c,
              messages: [...c.messages, userMessage],
              title: c.messages.length === 0 ? input.slice(0, 30) + '...' : c.title,
            }
          : c
      )
    )
    setInput('')
    setIsLoading(true)

    // Simulate response
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000))

    const assistantMessage: Message = {
      id: String(Date.now() + 1),
      role: 'assistant',
      content: `This is a simulated response from ${currentConversation.model}. In a real implementation, this would connect to the Aura Gateway API at /v1/responses.`,
      timestamp: new Date(),
      model: currentConversation.model,
      tokens: { input: Math.floor(Math.random() * 200) + 50, output: Math.floor(Math.random() * 100) + 20 },
      cost: Math.random() * 0.01,
    }

    setConversations((convs) =>
      convs.map((c) =>
        c.id === currentId ? { ...c, messages: [...c.messages, assistantMessage] } : c
      )
    )
    setIsLoading(false)
  }

  const handleNewConversation = () => {
    const newConv: Conversation = {
      id: String(Date.now()),
      title: 'New conversation',
      messages: [],
      model: 'gpt-5.4-mini',
      systemPrompt: 'You are a helpful assistant.',
      createdAt: new Date(),
    }
    setConversations([newConv, ...conversations])
    setCurrentId(newConv.id)
  }

  const handleDeleteConversation = (id: string) => {
    if (conversations.length === 1) return
    const newConvs = conversations.filter((c) => c.id !== id)
    setConversations(newConvs)
    if (currentId === id) {
      setCurrentId(newConvs[0].id)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Playground"
        description="Test your LLM gateway with an interactive chat interface"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={agentMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAgentMode(!agentMode)}
              className="gap-2"
            >
              <AiLine className="h-4 w-4" />
              Agent Mode
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfig(!showConfig)}
              className="gap-2"
            >
              <Settings1Line className="h-4 w-4" />
              Config
            </Button>
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Conversation Sidebar */}
        <div className="w-64 border-r bg-card/50 flex flex-col">
          <div className="p-3 border-b">
            <Button onClick={handleNewConversation} className="w-full gap-2">
              <AddLine className="h-4 w-4" />
              New Chat
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setCurrentId(conv.id)}
                className={cn(
                  'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors',
                  currentId === conv.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <span className="flex-1 truncate">{conv.title}</span>
                {conversations.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteConversation(conv.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  >
                    <DeleteLine className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {currentConversation?.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <AiLine className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Start a conversation</h2>
                <p className="text-muted-foreground max-w-md">
                  Send a message to test your gateway. Select different models and enable agent mode for tool use.
                </p>
              </div>
            ) : (
              currentConversation?.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-4 max-w-3xl',
                    message.role === 'user' ? 'ml-auto flex-row-reverse' : ''
                  )}
                >
                  <div
                    className={cn(
                      'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                      message.role === 'user' ? 'bg-primary' : 'bg-muted'
                    )}
                  >
                    {message.role === 'user' ? (
                      <User2Line className="h-4 w-4 text-primary-foreground" />
                    ) : (
                      <AiLine className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={cn(
                      'flex-1 rounded-xl px-4 py-3',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.role === 'assistant' && message.tokens && (
                      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                        <span>{message.model}</span>
                        <span>{message.tokens.input + message.tokens.output} tokens</span>
                        <span>${message.cost?.toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex gap-4 max-w-3xl">
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted">
                  <AiLine className="h-4 w-4" />
                </div>
                <div className="bg-muted rounded-xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t bg-card/50 p-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 mb-3">
                <select
                  value={currentConversation?.model}
                  onChange={(e) =>
                    setConversations((convs) =>
                      convs.map((c) =>
                        c.id === currentId ? { ...c, model: e.target.value } : c
                      )
                    )
                  }
                  className="bg-muted border-0 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-ring"
                >
                  {MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                {agentMode && (
                  <Badge variant="secondary" className="gap-1">
                    <AiLine className="h-3 w-3" />
                    Agent Mode
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Send a message..."
                  rows={1}
                  className="flex-1 resize-none bg-muted rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-ring min-h-[48px] max-h-[200px]"
                  style={{
                    height: Math.min(200, Math.max(48, input.split('\n').length * 24 + 24)),
                  }}
                />
                <Button
                  onClick={isLoading ? undefined : handleSend}
                  disabled={!input.trim() && !isLoading}
                  className="self-end"
                >
                  {isLoading ? (
                    <StopCircleLine className="h-5 w-5" />
                  ) : (
                    <SendLine className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Config Panel */}
        {showConfig && (
          <div className="w-80 border-l bg-card/50 p-4 space-y-4 overflow-y-auto">
            <h3 className="font-medium">Configuration</h3>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">System Prompt</label>
              <textarea
                value={currentConversation?.systemPrompt}
                onChange={(e) =>
                  setConversations((convs) =>
                    convs.map((c) =>
                      c.id === currentId ? { ...c, systemPrompt: e.target.value } : c
                    )
                  )
                }
                className="w-full h-32 resize-none bg-muted rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Temperature</label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                defaultValue="0.7"
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Max Tokens</label>
              <Input type="number" defaultValue="4096" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
