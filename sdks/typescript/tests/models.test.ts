import { describe, it, expect } from 'vitest'
import { KnownModels, type KnownModel } from '../src/models.js'

describe('KnownModels', () => {
  it('exposes the Fireworks open-weight catalog', () => {
    expect(KnownModels.FIREWORKS_GLM_5P2).toBe('accounts/fireworks/models/glm-5p2')
    // September 2026 catalog refresh
    expect(KnownModels.GPT_6_ASTRA).toBe('gpt-6-astra')
    expect(KnownModels.GPT_5_6_SOL).toBe('gpt-5.6-sol')
    expect(KnownModels.CLAUDE_FABLE_5_1).toBe('claude-fable-5-1')
    expect(KnownModels.CLAUDE_OPUS_5).toBe('claude-opus-5')
    expect(KnownModels.CLAUDE_SONNET_5).toBe('claude-sonnet-5')
    expect(KnownModels.GEMINI_3_7_FLASH).toBe('gemini-3.7-flash')
    expect(KnownModels.GEMINI_3_8_FLASH).toBe('gemini-3.8-flash')
    expect(KnownModels.FIREWORKS_GPT_OSS_20B).toBe('accounts/fireworks/models/gpt-oss-20b')
  })

  it('namespaces every Fireworks slug under accounts/fireworks/models/', () => {
    const fireworks = Object.entries(KnownModels)
      .filter(([key]) => key.startsWith('FIREWORKS_'))
      .map(([, value]) => value)
    expect(fireworks.length).toBeGreaterThan(0)
    for (const slug of fireworks) {
      expect(slug.startsWith('accounts/fireworks/models/')).toBe(true)
    }
  })

  it('narrows to KnownModel and is assignable to string', () => {
    const model: KnownModel = KnownModels.GPT_4O_MINI
    const asString: string = model
    expect(asString).toBe('gpt-4o-mini')
  })
})
