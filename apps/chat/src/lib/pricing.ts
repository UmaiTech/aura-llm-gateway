// Model pricing per million tokens (USD)
// Updated as of January 2025

export interface ModelPricing {
  inputPerMillion: number
  outputPerMillion: number
}

// Pricing data per model
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-5.2': { inputPerMillion: 6.00, outputPerMillion: 24.00 },
  'gpt-5': { inputPerMillion: 5.00, outputPerMillion: 20.00 },
  'gpt-5-mini': { inputPerMillion: 0.30, outputPerMillion: 1.20 },
  'gpt-4o': { inputPerMillion: 2.50, outputPerMillion: 10.00 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  'gpt-4-turbo': { inputPerMillion: 10.00, outputPerMillion: 30.00 },
  'gpt-3.5-turbo': { inputPerMillion: 0.50, outputPerMillion: 1.50 },

  // Anthropic
  'claude-opus-4-5-20251101': { inputPerMillion: 15.00, outputPerMillion: 75.00 },
  'claude-sonnet-4-20250514': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
  'claude-3-5-sonnet-20241022': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
  'claude-3-5-haiku-20241022': { inputPerMillion: 0.80, outputPerMillion: 4.00 },

  // Google
  'gemini-3-pro': { inputPerMillion: 1.50, outputPerMillion: 6.00 },
  'gemini-2.0-flash': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.00 },
}

// Calculate cost for a given model and token counts
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) {
    return 0
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion

  return inputCost + outputCost
}
