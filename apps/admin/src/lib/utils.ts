import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`
  }
  return num.toString()
}

export function formatCurrency(amount: number): string {
  // For very small amounts, show more precision
  if (amount > 0 && amount < 0.01) {
    return `$${amount.toFixed(4)}`
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date()
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = now.getTime() - d.getTime()

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return d.toLocaleDateString()
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return `${str.slice(0, length)}...`
}

export function generateId(prefix: string = 'aura'): string {
  const id = Math.random().toString(36).substring(2, 10)
  return `${prefix}_${id}`
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}

export function getPercentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

export function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'success':
    case 'healthy':
    case 'active':
      return 'success'
    case 'failed':
    case 'error':
    case 'unhealthy':
      return 'destructive'
    case 'in_progress':
    case 'pending':
    case 'degraded':
      return 'warning'
    default:
      return 'muted'
  }
}

/**
 * Format a strategy id from the gateway into a human-readable label.
 *
 * The gateway emits strategy ids as lowercase, no-separator strings
 * (e.g. `tokencleanup`, `selfconsistency`, `referenceanchoring`) — see
 * the serde lowercase pass in `aura-types`. Keeping them that way in
 * the UI makes the dashboard look like a config dump.
 *
 * Strategy:
 *   1. Look up a known-alias map for the common cases the gateway
 *      ships. Wins on both accuracy and consistency — "Best of N",
 *      not "Best Of N".
 *   2. Fall back to inserting spaces at snake_case + lowerCamelCase
 *      boundaries, then title-casing each word. Covers strategies we
 *      add in the future without needing this file edited.
 *
 * Examples:
 *   tokencleanup       -> "Token Cleanup"
 *   selfconsistency    -> "Self-Consistency"
 *   referenceanchoring -> "Reference Anchoring"
 *   best_of_n          -> "Best of N"
 *   highest_confidence -> "Highest Confidence"
 */
const STRATEGY_LABELS: Record<string, string> = {
  // Compression
  tokencleanup: 'Token Cleanup',
  jsonminify: 'JSON Minify',
  toon: 'TOON',
  aisp: 'AISP',
  yaml: 'YAML',
  // Validation
  logprobs: 'Logprobs',
  best_of_n: 'Best of N',
  bestofn: 'Best of N',
  self_consistency: 'Self-Consistency',
  selfconsistency: 'Self-Consistency',
  confidence_threshold: 'Confidence Threshold',
  confidencethreshold: 'Confidence Threshold',
  // Consistency
  constitutional: 'Constitutional',
  style_profile: 'Style Profile',
  styleprofile: 'Style Profile',
  reference_anchoring: 'Reference Anchoring',
  referenceanchoring: 'Reference Anchoring',
  few_shot_priming: 'Few-Shot Priming',
  fewshotpriming: 'Few-Shot Priming',
  model_calibration: 'Model Calibration',
  modelcalibration: 'Model Calibration',
  format_schema: 'Format Schema',
  formatschema: 'Format Schema',
  semantic_normalization: 'Semantic Normalization',
  semanticnormalization: 'Semantic Normalization',
  ensemble_voting: 'Ensemble Voting',
  ensemblevoting: 'Ensemble Voting',
  // Selection criteria (validation.selection)
  highest_confidence: 'Highest Confidence',
  highestconfidence: 'Highest Confidence',
  lowest_perplexity: 'Lowest Perplexity',
  lowestperplexity: 'Lowest Perplexity',
  most_relevant: 'Most Relevant',
  mostrelevant: 'Most Relevant',
}

export function formatStrategy(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  const lookup = STRATEGY_LABELS[trimmed.toLowerCase()]
  if (lookup) return lookup
  // Fallback: insert spaces at snake_case + camelCase boundaries,
  // then title-case each word.
  return trimmed
    .replace(/_+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
