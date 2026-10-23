/**
 * Providers the gateway ships, one entry per `Provider` implementation in
 * crates/aura-core/src/provider/ (matched on `fn name()`; providers.test.ts
 * fails when they drift). Landing copy derives counts and lists from here
 * rather than hard-coding them.
 */
export interface SupportedProvider {
  /** `Provider::name()` in the gateway. */
  id: string
  label: string
  /** Docs page under /docs/providers, when one exists. */
  docs?: string
}

export const SUPPORTED_PROVIDERS: SupportedProvider[] = [
  { id: 'openai', label: 'OpenAI', docs: '/docs/providers/openai' },
  { id: 'anthropic', label: 'Anthropic', docs: '/docs/providers/anthropic' },
  { id: 'google', label: 'Google', docs: '/docs/providers/google' },
  { id: 'mistral', label: 'Mistral', docs: '/docs/providers/mistral' },
  { id: 'bedrock', label: 'AWS Bedrock', docs: '/docs/providers/bedrock' },
  { id: 'together', label: 'Together AI', docs: '/docs/providers/together' },
  { id: 'fireworks', label: 'Fireworks AI' },
  { id: 'huggingface', label: 'Hugging Face', docs: '/docs/providers/huggingface' },
  { id: 'ollama', label: 'Ollama', docs: '/docs/providers/ollama' },
]
