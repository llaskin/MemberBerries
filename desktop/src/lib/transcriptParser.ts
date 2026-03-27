import { readFileSync, existsSync } from 'fs'
import { redactText } from './redact'

export interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result'
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  result?: string
  resultIsError?: boolean
}

export interface ParsedMessage {
  index: number
  role: 'user' | 'assistant'
  content: ContentBlock[]
  timestamp: number | null
  model?: string
}

export interface TranscriptResult {
  messages: ParsedMessage[]
  hasTimestamps: boolean
}

function parseTimestamp(raw: unknown): number | null {
  if (!raw) return null
  const ms = typeof raw === 'number' ? raw : Date.parse(String(raw))
  return isNaN(ms) ? null : ms
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as Array<Record<string, unknown>>)
      .filter(b => b.type === 'text')
      .map(b => String(b.text || ''))
      .join('\n')
  }
  return ''
}

export function parseClaudeTranscript(filePath: string): TranscriptResult | null {
  if (!existsSync(filePath)) return null

  try {
    const lines = readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())

    // Pass 1: collect all tool_results keyed by tool_use_id
    const toolResults = new Map<string, { result: string; isError: boolean }>()
    for (const line of lines) {
      try {
        const msg = JSON.parse(line)
        if (msg.type !== 'user') continue
        const content = msg.message?.content
        if (!Array.isArray(content)) continue
        for (const block of content) {
          if (block.type !== 'tool_result') continue
          const resultText = extractText(block.content)
          toolResults.set(String(block.tool_use_id || ''), {
            result: redactText(resultText).slice(0, 500),
            isError: Boolean(block.is_error),
          })
        }
      } catch { continue }
    }

    // Pass 2: build message list
    const messages: ParsedMessage[] = []
    let hasTimestamps = false
    let index = 0

    for (const line of lines) {
      try {
        const msg = JSON.parse(line)
        if (msg.type !== 'user' && msg.type !== 'assistant') continue

        const rawTs = msg.timestamp || msg.snapshot?.timestamp
        const timestamp = parseTimestamp(rawTs)
        if (timestamp !== null) hasTimestamps = true

        const rawContent = msg.message?.content

        if (msg.type === 'user') {
          if (!Array.isArray(rawContent)) continue
          // Skip user messages that contain only tool_result blocks
          const textBlocks = rawContent.filter(
            (b: Record<string, unknown>) => b.type === 'text' || b.type === 'thinking'
          )
          if (textBlocks.length === 0) continue

          const content: ContentBlock[] = textBlocks.map((b: Record<string, unknown>) => ({
            type: b.type as 'text' | 'thinking',
            text: redactText(String(b.text || b.thinking || '')),
          }))

          messages.push({ index: index++, role: 'user', content, timestamp, model: undefined })

        } else {
          // assistant
          const content: ContentBlock[] = []

          if (Array.isArray(rawContent)) {
            for (const block of rawContent as Array<Record<string, unknown>>) {
              if (block.type === 'text') {
                content.push({ type: 'text', text: redactText(String(block.text || '')) })
              } else if (block.type === 'thinking') {
                content.push({ type: 'thinking', thinking: redactText(String(block.thinking || '')) })
              } else if (block.type === 'tool_use') {
                const toolUseId = String(block.id || '')
                const linked = toolResults.get(toolUseId)
                content.push({
                  type: 'tool_use',
                  id: toolUseId,
                  name: String(block.name || ''),
                  input: block.input as Record<string, unknown> | undefined,
                  result: linked?.result,
                  resultIsError: linked?.isError,
                })
              }
            }
          } else if (typeof rawContent === 'string') {
            content.push({ type: 'text', text: redactText(rawContent) })
          }

          if (content.length === 0) continue

          const model = msg.message?.model as string | undefined
          messages.push({ index: index++, role: 'assistant', content, timestamp, model })
        }
      } catch { continue }
    }

    return { messages, hasTimestamps }
  } catch {
    return null
  }
}
