import { parse as parseYaml } from 'yaml'
import type { RollupFrontmatter, EnergyLevel, MomentumLevel } from './types'

export interface ParseResult<T> {
  ok: boolean
  data?: T
  error?: string
}

// ─── Frontmatter Normalization ──────────────────────────────────
// LLM output is inconsistent: snake_case vs camelCase, emoji vs words.
// This normalizer maps everything to the canonical RollupFrontmatter shape.

const SNAKE_TO_CAMEL: Record<string, string> = {
  open_loops: 'openLoops',
  risk_items: 'riskItems',
  // These are already camelCase but listing for completeness:
  openLoops: 'openLoops',
  riskItems: 'riskItems',
}

const ENERGY_NORMALIZE: Record<string, EnergyLevel> = {
  high: 'high', medium: 'medium', low: 'low',
  '🟢': 'high', '🟡': 'medium', '🔴': 'low',
  '🔥': 'high', '⚡': 'high',
}

const MOMENTUM_NORMALIZE: Record<string, MomentumLevel> = {
  accelerating: 'accelerating', steady: 'steady', decelerating: 'decelerating',
  stalled: 'stalled', blocked: 'blocked', frozen: 'frozen',
  cruising: 'steady', stalling: 'decelerating',
}

export function normalizeRollupFrontmatter(raw: Record<string, unknown>): RollupFrontmatter {
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(raw)) {
    const camelKey = SNAKE_TO_CAMEL[key] || key
    out[camelKey] = value
  }

  // Normalize energy
  if (out.energy != null) {
    const e = String(out.energy).toLowerCase().trim()
    out.energy = ENERGY_NORMALIZE[e] || ENERGY_NORMALIZE[String(out.energy)] || undefined
  }

  // Normalize momentum
  if (out.momentum != null) {
    const m = String(out.momentum).toLowerCase().trim()
    out.momentum = MOMENTUM_NORMALIZE[m] || undefined
  }

  // Ensure numeric fields are numbers
  for (const field of ['commits', 'decisions', 'openLoops', 'riskItems']) {
    if (out[field] != null) {
      const n = Number(out[field])
      out[field] = isNaN(n) ? undefined : n
    }
  }

  return out as unknown as RollupFrontmatter
}

export function parseFrontmatter<T = Record<string, unknown>>(content: string): ParseResult<{ frontmatter: T; body: string }> {
  // Try matching frontmatter at the start
  let match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)

  // If not at start, strip preamble — find the first --- that precedes "type:"
  if (!match) {
    const fmStart = content.indexOf('\n---\n')
    if (fmStart >= 0) {
      const stripped = content.slice(fmStart + 1)
      match = stripped.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
    }
  }

  if (!match) {
    return { ok: true, data: { frontmatter: {} as T, body: content } }
  }
  try {
    // Strip code fence markers from frontmatter (```yaml wrapping)
    let yamlText = match[1]
    yamlText = yamlText.replace(/^```(?:yaml)?\n/gm, '').replace(/\n```$/gm, '')
    const frontmatter = parseYaml(yamlText) as T
    return { ok: true, data: { frontmatter, body: match[2] } }
  } catch (e) {
    return { ok: false, error: `YAML parse error: ${e}` }
  }
}

export function extractSummary(body: string, maxLines = 3): string {
  const summaryMatch = body.match(/##?\s*Summary\n([\s\S]*?)(?=\n##|\n---|\n$)/i)
  if (summaryMatch) {
    return summaryMatch[1].trim().split('\n').slice(0, maxLines).join(' ').trim()
  }
  // Fallback: first non-empty paragraph
  const lines = body.split('\n').filter(l => l.trim() && !l.startsWith('#'))
  return lines.slice(0, maxLines).join(' ').trim()
}

export function parseDecisionTraces(body: string): Array<{id: string, title: string, input: string, constraint: string, tradeoff: string, decision: string}> {
  const decisions: Array<{id: string, title: string, input: string, constraint: string, tradeoff: string, decision: string}> = []
  // Match "#### DT-1: Title", "### D1: Title", and "### DT-20260310-1: Title" formats
  const dtRegex = /#{2,4}\s*(DT-\d{8}-\d+|DT-?\d+|D\d+):\s*(.+?)(?:\s*\(.*?\))?\n([\s\S]*?)(?=\n#{2,4}\s|$)/gi
  let match
  while ((match = dtRegex.exec(body)) !== null) {
    const block = match[3]
    decisions.push({
      id: match[1],
      title: match[2].trim(),
      input: extractField(block, 'Input'),
      constraint: extractField(block, 'Constraint'),
      tradeoff: extractField(block, 'Tradeoff'),
      decision: extractField(block, 'Decision'),
    })
  }
  return decisions
}

function extractField(block: string, label: string): string {
  const re = new RegExp(`\\*\\*${label}:?\\*\\*\\s*(.+)`, 'i')
  const m = block.match(re)
  return m ? m[1].trim() : ''
}
