/**
 * Model pricing calculator — fetches rates from LiteLLM's pricing database
 * (a JSON file, NOT the LiteLLM package) and calculates costs per session.
 *
 * Pricing source: https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
 */

const PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface ModelPricing {
  input_cost_per_token?: number
  output_cost_per_token?: number
  cache_creation_input_token_cost?: number
  cache_read_input_token_cost?: number
  input_cost_per_token_above_200k_tokens?: number
  output_cost_per_token_above_200k_tokens?: number
}

// Module-level cache
let pricingCache: Record<string, ModelPricing> | null = null
let cacheTimestamp = 0

const PROVIDER_PREFIXES = [
  'anthropic/',
  'claude-3-5-',
  'claude-3-',
  'claude-',
  'openai/',
]

/**
 * Fetch pricing data from LiteLLM JSON (cached for 24h).
 */
export async function fetchPricing(): Promise<Record<string, ModelPricing>> {
  if (pricingCache && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return pricingCache
  }

  try {
    const res = await fetch(PRICING_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    pricingCache = data
    cacheTimestamp = Date.now()
    return data
  } catch {
    // Return cached data if available, empty object otherwise
    return pricingCache || {}
  }
}

/**
 * Find pricing for a model name, trying various prefix combinations.
 */
export function findModelPricing(
  pricing: Record<string, ModelPricing>,
  modelName: string,
): ModelPricing | null {
  if (!modelName) return null

  // Direct match
  if (pricing[modelName]) return pricing[modelName]

  // Try with prefixes
  for (const prefix of PROVIDER_PREFIXES) {
    const key = `${prefix}${modelName}`
    if (pricing[key]) return pricing[key]
  }

  // Substring match (case-insensitive)
  const lower = modelName.toLowerCase()
  for (const [key, value] of Object.entries(pricing)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) {
      return value
    }
  }

  return null
}

/**
 * Calculate cost for a session given its token counts and model pricing.
 * Uses tiered pricing (200k threshold) when available.
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
  pricing: ModelPricing,
): number {
  const tiered = (
    tokens: number,
    baseRate: number | undefined,
    tieredRate: number | undefined,
    threshold = 200_000,
  ): number => {
    if (!tokens || tokens <= 0 || !baseRate) return 0
    if (tokens > threshold && tieredRate != null) {
      const below = Math.min(tokens, threshold)
      const above = tokens - threshold
      return below * baseRate + above * tieredRate
    }
    return tokens * baseRate
  }

  const inputCost = tiered(
    inputTokens,
    pricing.input_cost_per_token,
    pricing.input_cost_per_token_above_200k_tokens,
  )
  const outputCost = tiered(
    outputTokens,
    pricing.output_cost_per_token,
    pricing.output_cost_per_token_above_200k_tokens,
  )
  const cacheCreationCost = (cacheCreationTokens || 0) * (pricing.cache_creation_input_token_cost || 0)
  const cacheReadCost = (cacheReadTokens || 0) * (pricing.cache_read_input_token_cost || 0)

  return inputCost + outputCost + cacheCreationCost + cacheReadCost
}
