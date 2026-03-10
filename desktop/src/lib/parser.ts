import { parse as parseYaml } from 'yaml'

export interface ParseResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export function parseFrontmatter<T = Record<string, unknown>>(content: string): ParseResult<{ frontmatter: T; body: string }> {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    return { ok: true, data: { frontmatter: {} as T, body: content } }
  }
  try {
    const frontmatter = parseYaml(match[1]) as T
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
