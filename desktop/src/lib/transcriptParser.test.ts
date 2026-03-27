import { describe, it, expect } from 'vitest'
import { parseClaudeTranscript } from './transcriptParser'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

function writeTempJsonl(lines: object[]): string {
  const path = join(tmpdir(), `mb-test-${Date.now()}.jsonl`)
  writeFileSync(path, lines.map(l => JSON.stringify(l)).join('\n'), 'utf-8')
  return path
}

describe('parseClaudeTranscript', () => {
  it('returns null for a non-existent file', () => {
    expect(parseClaudeTranscript('/nonexistent/path/file.jsonl')).toBeNull()
  })

  it('parses user and assistant messages', () => {
    const path = writeTempJsonl([
      { type: 'user', timestamp: '2026-03-27T10:00:00.000Z', message: { content: [{ type: 'text', text: 'fix the auth bug' }] } },
      { type: 'assistant', timestamp: '2026-03-27T10:00:05.000Z', message: { content: [{ type: 'text', text: 'I will fix it.' }], model: 'claude-sonnet-4-6' } },
    ])
    try {
      const result = parseClaudeTranscript(path)!
      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].role).toBe('user')
      expect(result.messages[0].content[0].text).toBe('fix the auth bug')
      expect(result.messages[1].role).toBe('assistant')
      expect(result.messages[1].model).toBe('claude-sonnet-4-6')
      expect(result.hasTimestamps).toBe(true)
    } finally { unlinkSync(path) }
  })

  it('extracts tool_use blocks from assistant messages', () => {
    const path = writeTempJsonl([
      { type: 'assistant', message: { content: [
        { type: 'text', text: 'Reading file...' },
        { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: 'src/auth.ts' } }
      ] } },
    ])
    try {
      const result = parseClaudeTranscript(path)!
      const toolBlock = result.messages[0].content.find(b => b.type === 'tool_use')
      expect(toolBlock?.name).toBe('Read')
      expect(toolBlock?.input).toEqual({ file_path: 'src/auth.ts' })
    } finally { unlinkSync(path) }
  })

  it('links tool_result blocks to their tool_use id', () => {
    const path = writeTempJsonl([
      { type: 'assistant', message: { content: [
        { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: 'auth.ts' } }
      ] } },
      { type: 'user', message: { content: [
        { type: 'tool_result', tool_use_id: 'tu-1', content: '142 lines', is_error: false }
      ] } },
    ])
    try {
      const result = parseClaudeTranscript(path)!
      // tool_result-only user messages are skipped (no user text)
      expect(result.messages).toHaveLength(1)
      // The tool result is linked to the tool_use block
      const toolBlock = result.messages[0].content.find(b => b.type === 'tool_use')
      expect(toolBlock?.result).toBe('142 lines')
      expect(toolBlock?.resultIsError).toBe(false)
    } finally { unlinkSync(path) }
  })

  it('redacts API keys from text content', () => {
    const path = writeTempJsonl([
      { type: 'user', message: { content: [{ type: 'text', text: 'my key is sk-ant-api03-abc123xyz' }] } },
    ])
    try {
      const result = parseClaudeTranscript(path)!
      expect(result.messages[0].content[0].text).toContain('[REDACTED_API_KEY]')
      expect(result.messages[0].content[0].text).not.toContain('sk-ant-api03-abc123xyz')
    } finally { unlinkSync(path) }
  })

  it('skips user messages that contain only tool_result blocks', () => {
    const path = writeTempJsonl([
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'output' }] } },
    ])
    try {
      const result = parseClaudeTranscript(path)!
      expect(result.messages).toHaveLength(0)
    } finally { unlinkSync(path) }
  })

  it('hasTimestamps is false when no timestamps present', () => {
    const path = writeTempJsonl([
      { type: 'user', message: { content: [{ type: 'text', text: 'hello' }] } },
    ])
    try {
      const result = parseClaudeTranscript(path)!
      expect(result.hasTimestamps).toBe(false)
    } finally { unlinkSync(path) }
  })

  it('skips non-message lines (system and other types)', () => {
    const path = writeTempJsonl([
      { type: 'system', message: 'system prompt' },
      { type: 'user', message: { content: [{ type: 'text', text: 'hello' }] } },
    ])
    try {
      const result = parseClaudeTranscript(path)!
      expect(result.messages).toHaveLength(1)
    } finally { unlinkSync(path) }
  })
})
