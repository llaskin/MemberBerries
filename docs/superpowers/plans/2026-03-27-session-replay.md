# Session Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slide-in replay panel to MemberBerries that streams Claude Code sessions back character-by-character with playback controls, with best-effort support for other agents.

**Architecture:** On-demand JSONL parse (no DB schema changes) — a new `/api/mb/sessions/:id/transcript` endpoint reads and normalizes the raw JSONL file, applies redaction, and returns a `ParsedMessage[]` array. A `usePlayback` hook drives animated streaming state. A `ReplayPanel` slide-in component managed by `uiStore.activeReplayId` renders the terminal-style player.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS v4, Vitest, Express (axonMiddleware), Node.js `fs` (no new deps required)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `desktop/src/lib/transcriptParser.ts` | Create | Parse JSONL into `ParsedMessage[]`, apply redaction, strip noise |
| `desktop/src/lib/transcriptParser.test.ts` | Create | Unit tests for transcript parsing |
| `desktop/src/hooks/usePlayback.ts` | Create | rAF animation loop, timing, playback state machine |
| `desktop/src/hooks/usePlayback.test.ts` | Create | Unit tests for playback hook |
| `desktop/src/components/ReplayPanel/index.tsx` | Create | Container: fetches transcript, manages loading/error, slide-in |
| `desktop/src/components/ReplayPanel/ReplayTranscript.tsx` | Create | Scrolling message area with streaming text |
| `desktop/src/components/ReplayPanel/ToolCallBlock.tsx` | Create | Single tool call renderer |
| `desktop/src/components/ReplayPanel/ReplayControls.tsx` | Create | Scrubber, play/pause, speed buttons, keyboard shortcuts |
| `desktop/src/store/uiStore.ts` | Modify | Add `activeReplayId`, `openReplay`, `closeReplay` |
| `desktop/src/store/uiStore.test.ts` | Modify | Tests for new replay state |
| `desktop/src/server/axonMiddleware.ts` | Modify | Add `GET /api/mb/sessions/:id/transcript` endpoint |
| `desktop/src/views/SessionsView.tsx` | Modify | Replay hover button on card, button in detail panel, render `ReplayPanel` |

---

## Task 1: Extend uiStore with replay state

**Files:**
- Modify: `desktop/src/store/uiStore.ts`
- Modify: `desktop/src/store/uiStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `desktop/src/store/uiStore.test.ts` and add a new `describe('replay')` block after the existing `describe('goBack')` block:

```typescript
describe('replay', () => {
  it('defaults activeReplayId to null', () => {
    useUIStore.setState({ activeReplayId: null })
    expect(useUIStore.getState().activeReplayId).toBeNull()
  })

  it('openReplay sets activeReplayId', () => {
    useUIStore.getState().openReplay('abc-123')
    expect(useUIStore.getState().activeReplayId).toBe('abc-123')
  })

  it('closeReplay clears activeReplayId', () => {
    useUIStore.setState({ activeReplayId: 'abc-123' } as any)
    useUIStore.getState().closeReplay()
    expect(useUIStore.getState().activeReplayId).toBeNull()
  })

  it('setView clears activeReplayId', () => {
    useUIStore.setState({ activeReplayId: 'abc-123' } as any)
    useUIStore.getState().setView('settings')
    expect(useUIStore.getState().activeReplayId).toBeNull()
  })
})
```

Also update the `beforeEach` reset to include `activeReplayId: null`:

```typescript
useUIStore.setState({
  sidebarOpen: true,
  theme: 'light',
  activeView: 'timeline',
  selectedRollup: null,
  activeReplayId: null,
} as any)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd desktop && npx vitest run src/store/uiStore.test.ts --reporter verbose
```

Expected: FAIL — `activeReplayId` does not exist on type, `openReplay`/`closeReplay` are not functions.

- [ ] **Step 3: Add replay state to uiStore.ts**

In `desktop/src/store/uiStore.ts`, update the `UIStore` interface:

```typescript
interface UIStore {
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  activeView: ViewId
  previousView: ViewId | null
  viewSwipeDirection: 'left' | 'right' | 'none'
  selectedRollup: string | null
  resumeSessionId: string | null
  activeReplayId: string | null        // ADD
  toggleSidebar: () => void
  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void
  setView: (view: ViewId) => void
  openRollup: (filename: string) => void
  goBack: () => void
  openTerminal: (sessionId: string) => void
  clearResumeSession: () => void
  openReplay: (sessionId: string) => void  // ADD
  closeReplay: () => void                   // ADD
}
```

Add `activeReplayId: null` to the initial state object (after `resumeSessionId: null`):

```typescript
  resumeSessionId: null,
  activeReplayId: null,
```

Update `setView` to clear `activeReplayId`:

```typescript
  setView: (view) => set(s => {
    if (view === s.activeView) return {}
    return {
      activeView: view,
      previousView: s.activeView,
      viewSwipeDirection: getSwipeDir(s.activeView, view),
      selectedRollup: null,
      activeReplayId: null,   // ADD
    }
  }),
```

Add the two new actions at the end of the `create` body (before the closing `})`):

```typescript
  openReplay: (sessionId) => set({ activeReplayId: sessionId }),
  closeReplay: () => set({ activeReplayId: null }),
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd desktop && npx vitest run src/store/uiStore.test.ts --reporter verbose
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd desktop && git add src/store/uiStore.ts src/store/uiStore.test.ts
git commit -m "feat: add activeReplayId state to uiStore"
```

---

## Task 2: Build transcriptParser.ts

**Files:**
- Create: `desktop/src/lib/transcriptParser.ts`
- Create: `desktop/src/lib/transcriptParser.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `desktop/src/lib/transcriptParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseClaudeTranscript, type ParsedMessage } from './transcriptParser'
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
      // The tool result is linked to the tool_use block in the assistant message
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

  it('skips non-message lines (system, other types)', () => {
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd desktop && npx vitest run src/lib/transcriptParser.test.ts --reporter verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write transcriptParser.ts**

Create `desktop/src/lib/transcriptParser.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd desktop && npx vitest run src/lib/transcriptParser.test.ts --reporter verbose
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd desktop && git add src/lib/transcriptParser.ts src/lib/transcriptParser.test.ts
git commit -m "feat: add transcript parser for session replay"
```

---

## Task 3: Add /api/mb/sessions/:id/transcript endpoint

**Files:**
- Modify: `desktop/src/server/axonMiddleware.ts`

- [ ] **Step 1: Locate the insertion point**

Open `desktop/src/server/axonMiddleware.ts`. Find the line:

```typescript
      const sessionDetailMatch = url.match(/^\/api\/mb\/sessions\/([0-9a-f-]{36})$/)
```

The new endpoint goes immediately **before** this block (around line 2230).

- [ ] **Step 2: Insert the transcript endpoint**

Add the following block immediately before `const sessionDetailMatch = ...`:

```typescript
      // GET /api/mb/sessions/:id/transcript
      const transcriptMatch = url.match(/^\/api\/mb\/sessions\/([0-9a-f-]{36})\/transcript$/)
      if (transcriptMatch) {
        const id = transcriptMatch[1]
        try {
          const { getSessionById } = await import('../lib/sessionDb')
          const session = getSessionById(id)
          if (!session) {
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'Session not found' }))
            return
          }

          if (session.agent !== 'claude') {
            res.end(JSON.stringify({
              messages: [],
              hasTimestamps: false,
              agentType: session.agent,
              unavailable: true,
            }))
            return
          }

          const jsonlPath = join(homedir(), '.claude', 'projects', session.project_id, `${id}.jsonl`)
          const { parseClaudeTranscript } = await import('../lib/transcriptParser')
          const result = parseClaudeTranscript(jsonlPath)

          if (!result) {
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'Session file not found', path: jsonlPath }))
            return
          }

          res.end(JSON.stringify({
            ...result,
            agentType: session.agent,
          }))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err) }))
        }
        return
      }
```

- [ ] **Step 3: Verify the server still starts**

```bash
cd desktop && npm run build:server 2>&1 | tail -5
```

Expected: Build completes with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd desktop && git add src/server/axonMiddleware.ts
git commit -m "feat: add GET /api/mb/sessions/:id/transcript endpoint"
```

---

## Task 4: Build usePlayback hook

**Files:**
- Create: `desktop/src/hooks/usePlayback.ts`
- Create: `desktop/src/hooks/usePlayback.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `desktop/src/hooks/usePlayback.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlayback } from './usePlayback'
import type { ParsedMessage } from '../lib/transcriptParser'

const makeMessages = (n: number, withTimestamps = false): ParsedMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    index: i,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: [{ type: 'text', text: `message ${i}` }],
    timestamp: withTimestamps ? 1000 + i * 2000 : null,
  }))

describe('usePlayback', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('initializes paused at index 0 with empty messages', () => {
    const { result } = renderHook(() => usePlayback([], false))
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.visibleMessages).toEqual([])
  })

  it('play() sets isPlaying to true', () => {
    const { result } = renderHook(() => usePlayback(makeMessages(3), false))
    act(() => { result.current.play() })
    expect(result.current.isPlaying).toBe(true)
  })

  it('pause() sets isPlaying to false', () => {
    const { result } = renderHook(() => usePlayback(makeMessages(3), false))
    act(() => {
      result.current.play()
      result.current.pause()
    })
    expect(result.current.isPlaying).toBe(false)
  })

  it('seek() clamps to valid range', () => {
    const { result } = renderHook(() => usePlayback(makeMessages(5), false))
    act(() => { result.current.seek(3) })
    expect(result.current.currentIndex).toBe(3)
    act(() => { result.current.seek(-1) })
    expect(result.current.currentIndex).toBe(0)
    act(() => { result.current.seek(100) })
    expect(result.current.currentIndex).toBe(4)
  })

  it('visibleMessages returns messages up to currentIndex', () => {
    const msgs = makeMessages(5)
    const { result } = renderHook(() => usePlayback(msgs, false))
    act(() => { result.current.seek(3) })
    expect(result.current.visibleMessages).toHaveLength(3)
    expect(result.current.visibleMessages[0]).toBe(msgs[0])
  })

  it('setSpeed() updates speed', () => {
    const { result } = renderHook(() => usePlayback(makeMessages(3), false))
    act(() => { result.current.setSpeed(2) })
    expect(result.current.speed).toBe(2)
  })

  it('inter-message gap is fixed 3000ms when hasTimestamps is false', () => {
    const { result } = renderHook(() => usePlayback(makeMessages(3, false), false))
    expect(result.current.interMessageGapMs(0, 1)).toBe(3000)
  })

  it('inter-message gap is capped at 5000ms when hasTimestamps is true', () => {
    const msgs = makeMessages(2, true)
    // timestamps 1000 and 10000000 — gap would be huge, should be capped
    msgs[0].timestamp = 1000
    msgs[1].timestamp = 1000 + 3_600_000 // 1 hour gap
    const { result } = renderHook(() => usePlayback(msgs, true))
    expect(result.current.interMessageGapMs(0, 1)).toBe(5000)
  })

  it('inter-message gap uses real timestamps when under 5000ms', () => {
    const msgs = makeMessages(2, true)
    msgs[0].timestamp = 1000
    msgs[1].timestamp = 3000 // 2 second gap
    const { result } = renderHook(() => usePlayback(msgs, true))
    expect(result.current.interMessageGapMs(0, 1)).toBe(2000)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd desktop && npx vitest run src/hooks/usePlayback.test.ts --reporter verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write usePlayback.ts**

Create `desktop/src/hooks/usePlayback.ts`:

```typescript
import { useState, useRef, useEffect, useCallback } from 'react'
import type { ParsedMessage } from '../lib/transcriptParser'

const CHARS_PER_MS = 50 / 1000  // 50 chars per second
const GAP_CAP_MS = 5000
const FIXED_GAP_MS = 3000

export interface PlaybackState {
  currentIndex: number
  streamProgress: number
  isPlaying: boolean
  speed: number
  visibleMessages: ParsedMessage[]
  play: () => void
  pause: () => void
  seek: (index: number) => void
  setSpeed: (n: number) => void
  interMessageGapMs: (fromIndex: number, toIndex: number) => number
}

export function usePlayback(messages: ParsedMessage[], hasTimestamps: boolean): PlaybackState {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [streamProgress, setStreamProgress] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeedState] = useState(1)

  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number | null>(null)
  const gapCountdownRef = useRef<number>(0) // remaining gap ms before advancing to next message

  const interMessageGapMs = useCallback((fromIndex: number, toIndex: number): number => {
    if (!hasTimestamps) return FIXED_GAP_MS
    const a = messages[fromIndex]?.timestamp
    const b = messages[toIndex]?.timestamp
    if (a === null || b === null || a === undefined || b === undefined) return FIXED_GAP_MS
    const gap = Math.abs(b - a)
    return Math.min(gap, GAP_CAP_MS)
  }, [messages, hasTimestamps])

  const currentTextLength = useCallback((index: number): number => {
    const msg = messages[index]
    if (!msg) return 0
    return msg.content
      .filter(b => b.type === 'text' || b.type === 'thinking')
      .reduce((sum, b) => sum + (b.text?.length || b.thinking?.length || 0), 0)
  }, [messages])

  const tick = useCallback((now: number) => {
    const last = lastFrameRef.current
    if (last === null) { lastFrameRef.current = now; rafRef.current = requestAnimationFrame(tick); return }

    const delta = (now - last) * speed
    lastFrameRef.current = now

    setCurrentIndex(ci => {
      if (ci >= messages.length) { setIsPlaying(false); return ci }

      const msg = messages[ci]
      if (!msg) { setIsPlaying(false); return ci }

      // If in gap countdown, drain it
      if (gapCountdownRef.current > 0) {
        gapCountdownRef.current = Math.max(0, gapCountdownRef.current - delta)
        if (gapCountdownRef.current <= 0) {
          // Advance to next message
          const nextIndex = ci + 1
          if (nextIndex >= messages.length) { setIsPlaying(false); return ci }
          setStreamProgress(0)
          gapCountdownRef.current = 0
          return nextIndex
        }
        rafRef.current = requestAnimationFrame(tick)
        return ci
      }

      // Stream current assistant message
      if (msg.role === 'assistant') {
        const totalChars = currentTextLength(ci)
        if (totalChars === 0) {
          // No text to stream — start gap countdown
          gapCountdownRef.current = interMessageGapMs(ci, ci + 1)
          setStreamProgress(1)
        } else {
          setStreamProgress(prev => {
            const charsPerMs = CHARS_PER_MS
            const progressPerMs = charsPerMs / totalChars
            const next = prev + progressPerMs * delta
            if (next >= 1) {
              gapCountdownRef.current = interMessageGapMs(ci, ci + 1)
              return 1
            }
            return next
          })
        }
      } else {
        // User messages appear instantly — start gap countdown immediately
        gapCountdownRef.current = interMessageGapMs(ci, ci + 1)
        setStreamProgress(1)
      }

      rafRef.current = requestAnimationFrame(tick)
      return ci
    })
  }, [messages, speed, interMessageGapMs, currentTextLength])

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      lastFrameRef.current = null
      return
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying, tick])

  const play = useCallback(() => {
    if (currentIndex >= messages.length) return
    setIsPlaying(true)
  }, [currentIndex, messages.length])

  const pause = useCallback(() => setIsPlaying(false), [])

  const seek = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, messages.length - 1))
    setCurrentIndex(clamped)
    setStreamProgress(1)
    gapCountdownRef.current = 0
  }, [messages.length])

  const setSpeed = useCallback((n: number) => setSpeedState(n), [])

  const visibleMessages = messages.slice(0, currentIndex)

  return { currentIndex, streamProgress, isPlaying, speed, visibleMessages, play, pause, seek, setSpeed, interMessageGapMs }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd desktop && npx vitest run src/hooks/usePlayback.test.ts --reporter verbose
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd desktop && git add src/hooks/usePlayback.ts src/hooks/usePlayback.test.ts
git commit -m "feat: add usePlayback hook for session replay animation"
```

---

## Task 5: Build ToolCallBlock component

**Files:**
- Create: `desktop/src/components/ReplayPanel/ToolCallBlock.tsx`

- [ ] **Step 1: Create the component**

Create `desktop/src/components/ReplayPanel/ToolCallBlock.tsx`:

```typescript
import React, { useState } from 'react'
import type { ContentBlock } from '@/lib/transcriptParser'

const TOOL_COLORS: Record<string, string> = {
  Read: '#6B8FAD',
  Glob: '#6B8FAD',
  Grep: '#6B8FAD',
  Write: '#7B9E7B',
  Edit: '#C8956C',
  Bash: '#C4933B',
}

function getToolArg(block: ContentBlock): string {
  if (!block.input) return ''
  const fp = (block.input.file_path || block.input.path || block.input.filePath) as string | undefined
  if (fp) return fp
  if (block.name === 'Bash') return String(block.input.command || '').slice(0, 60)
  return ''
}

export function ToolCallBlock({ block }: { block: ContentBlock }) {
  const [expanded, setExpanded] = useState(false)
  const color = TOOL_COLORS[block.name || ''] || '#9B8E83'
  const arg = getToolArg(block)
  const hasResult = Boolean(block.result)
  const isError = Boolean(block.resultIsError)

  return (
    <div className="my-1 font-mono text-small">
      <div
        className={`flex items-start gap-1 ${hasResult ? 'cursor-pointer' : ''}`}
        onClick={() => hasResult && setExpanded(e => !e)}
      >
        <span style={{ color }} className="shrink-0">⏺</span>
        <span style={{ color }} className="shrink-0">{block.name}</span>
        {arg && (
          <span className="text-ax-text-secondary truncate max-w-[280px]" title={arg}>
            ({arg})
          </span>
        )}
        {hasResult && (
          <span className="text-ax-text-ghost ml-auto shrink-0">
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </div>
      {hasResult && !expanded && (
        <div
          className={`pl-4 text-micro mt-0.5 truncate ${
            isError ? 'text-ax-error' : 'text-ax-text-tertiary'
          }`}
        >
          → {block.result}
        </div>
      )}
      {hasResult && expanded && (
        <div
          className={`pl-4 text-micro mt-1 whitespace-pre-wrap break-words max-h-40 overflow-y-auto ${
            isError ? 'text-ax-error' : 'text-ax-text-tertiary'
          }`}
        >
          {block.result}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd desktop && npx tsc --noEmit 2>&1 | grep ToolCallBlock
```

Expected: No errors mentioning ToolCallBlock.

- [ ] **Step 3: Commit**

```bash
cd desktop && git add src/components/ReplayPanel/ToolCallBlock.tsx
git commit -m "feat: add ToolCallBlock component for replay"
```

---

## Task 6: Build ReplayTranscript component

**Files:**
- Create: `desktop/src/components/ReplayPanel/ReplayTranscript.tsx`

- [ ] **Step 1: Create the component**

Create `desktop/src/components/ReplayPanel/ReplayTranscript.tsx`:

```typescript
import React, { useEffect, useRef } from 'react'
import { useState } from 'react'
import type { ParsedMessage, ContentBlock } from '@/lib/transcriptParser'
import { ToolCallBlock } from './ToolCallBlock'

function renderRedactedText(text: string): React.ReactNode {
  const parts = text.split(/(\[REDACTED_[A-Z_]+\])/g)
  return parts.map((part, i) =>
    part.startsWith('[REDACTED_') ? (
      <span key={i} className="bg-ax-sunken text-ax-text-ghost px-1 py-px rounded font-mono text-micro">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-1">
      <button
        className="font-mono text-micro text-ax-text-ghost flex items-center gap-1 hover:text-ax-text-tertiary transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>thinking...</span>
      </button>
      {open && (
        <div className="pl-4 mt-1 text-small text-ax-text-tertiary italic whitespace-pre-wrap leading-relaxed border-l border-ax-border-subtle">
          {renderRedactedText(text)}
        </div>
      )}
    </div>
  )
}

function AssistantBlocks({
  blocks,
  streamProgress,
  isCurrentMessage,
}: {
  blocks: ContentBlock[]
  streamProgress: number
  isCurrentMessage: boolean
}) {
  // Compute total streamable chars for slicing
  const textBlocks = blocks.filter(b => b.type === 'text')
  const totalChars = textBlocks.reduce((s, b) => s + (b.text?.length || 0), 0)
  let charsRemaining = Math.floor((isCurrentMessage ? streamProgress : 1) * totalChars)

  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'thinking') {
          return <ThinkingBlock key={i} text={block.thinking || ''} />
        }
        if (block.type === 'tool_use') {
          return <ToolCallBlock key={i} block={block} />
        }
        if (block.type === 'text') {
          const visibleChars = isCurrentMessage ? Math.min(charsRemaining, block.text?.length || 0) : (block.text?.length || 0)
          charsRemaining -= visibleChars
          const visibleText = (block.text || '').slice(0, visibleChars)
          return (
            <p key={i} className="text-small text-ax-text-primary leading-relaxed whitespace-pre-wrap">
              {renderRedactedText(visibleText)}
              {isCurrentMessage && visibleChars < (block.text?.length || 0) && (
                <span className="animate-pulse">▋</span>
              )}
            </p>
          )
        }
        return null
      })}
    </>
  )
}

export function ReplayTranscript({
  messages,
  currentIndex,
  streamProgress,
}: {
  messages: ParsedMessage[]
  currentIndex: number
  streamProgress: number
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages.length, currentIndex])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-small text-ax-text-tertiary italic">
        Press ▶ to start replay
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono">
      {messages.map((msg, i) => {
        const isCurrentMsg = i === messages.length - 1 && currentIndex === i + 1

        if (msg.role === 'user') {
          const text = msg.content
            .filter(b => b.type === 'text')
            .map(b => b.text || '')
            .join('\n')
          return (
            <div key={msg.index} className="border-l-2 border-ax-brand pl-3">
              <span className="text-ax-brand text-small">&gt; </span>
              <span className="text-ax-text-primary text-small whitespace-pre-wrap">
                {renderRedactedText(text)}
              </span>
            </div>
          )
        }

        return (
          <div key={msg.index} className="text-ax-text-secondary">
            <AssistantBlocks
              blocks={msg.content}
              streamProgress={isCurrentMsg ? streamProgress : 1}
              isCurrentMessage={isCurrentMsg}
            />
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd desktop && npx tsc --noEmit 2>&1 | grep ReplayTranscript
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd desktop && git add src/components/ReplayPanel/ReplayTranscript.tsx
git commit -m "feat: add ReplayTranscript component"
```

---

## Task 7: Build ReplayControls component

**Files:**
- Create: `desktop/src/components/ReplayPanel/ReplayControls.tsx`

- [ ] **Step 1: Create the component**

Create `desktop/src/components/ReplayPanel/ReplayControls.tsx`:

```typescript
import React, { useEffect } from 'react'

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function ReplayControls({
  currentIndex,
  totalMessages,
  isPlaying,
  speed,
  onPlay,
  onPause,
  onSeek,
  onSetSpeed,
  onSkipBack,
  onSkipForward,
}: {
  currentIndex: number
  totalMessages: number
  isPlaying: boolean
  speed: number
  onPlay: () => void
  onPause: () => void
  onSeek: (index: number) => void
  onSetSpeed: (n: number) => void
  onSkipBack: () => void
  onSkipForward: () => void
}) {
  // Keyboard shortcuts (only active when panel is open — parent gates rendering)
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') { e.preventDefault(); isPlaying ? onPause() : onPlay() }
      if (e.code === 'ArrowLeft') { e.preventDefault(); onSkipBack() }
      if (e.code === 'ArrowRight') { e.preventDefault(); onSkipForward() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isPlaying, onPlay, onPause, onSkipBack, onSkipForward])

  const progress = totalMessages === 0 ? 0 : currentIndex / totalMessages
  // Estimate total time: avg 2s per message at 1x speed
  const totalEstimatedMs = totalMessages * 2000
  const elapsedMs = progress * totalEstimatedMs

  return (
    <div className="border-t border-ax-border-subtle bg-ax-surface px-4 py-2 shrink-0">
      {/* Scrubber */}
      <div
        className="relative h-1 bg-ax-sunken rounded-full mb-2 cursor-pointer group"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const ratio = (e.clientX - rect.left) / rect.width
          onSeek(Math.round(ratio * totalMessages))
        }}
      >
        <div
          className="h-full bg-ax-brand rounded-full transition-all"
          style={{ width: `${progress * 100}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-ax-brand rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${progress * 100}% - 6px)` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3 font-mono text-small">
        <button
          className="text-ax-text-tertiary hover:text-ax-text-primary transition-colors"
          onClick={onSkipBack}
          title="Previous message (←)"
        >
          ⏮
        </button>
        <button
          className="text-ax-success hover:opacity-80 transition-opacity text-base"
          onClick={isPlaying ? onPause : onPlay}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          className="text-ax-text-tertiary hover:text-ax-text-primary transition-colors"
          onClick={onSkipForward}
          title="Next message (→)"
        >
          ⏭
        </button>
        <span className="text-ax-text-tertiary text-micro ml-1">
          {formatTime(elapsedMs)} / {formatTime(totalEstimatedMs)}
        </span>
        <span className="text-ax-text-tertiary text-micro">
          {currentIndex} / {totalMessages}
        </span>
        <div className="flex gap-1 ml-auto">
          {[1, 2, 4].map(s => (
            <button
              key={s}
              className={`text-micro px-1.5 py-0.5 rounded border transition-colors ${
                speed === s
                  ? 'bg-ax-brand text-white border-ax-brand'
                  : 'text-ax-text-tertiary border-ax-border hover:border-ax-border-strong'
              }`}
              onClick={() => onSetSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd desktop && npx tsc --noEmit 2>&1 | grep ReplayControls
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd desktop && git add src/components/ReplayPanel/ReplayControls.tsx
git commit -m "feat: add ReplayControls component with keyboard shortcuts"
```

---

## Task 8: Build ReplayPanel container

**Files:**
- Create: `desktop/src/components/ReplayPanel/index.tsx`

- [ ] **Step 1: Create the container**

Create `desktop/src/components/ReplayPanel/index.tsx`:

```typescript
import React, { useEffect, useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { usePlayback } from '@/hooks/usePlayback'
import { ReplayTranscript } from './ReplayTranscript'
import { ReplayControls } from './ReplayControls'
import type { TranscriptResult } from '@/lib/transcriptParser'
import { AGENTS, type AgentId } from '@/lib/agents/types'

interface TranscriptResponse extends TranscriptResult {
  agentType: string
  unavailable?: boolean
  error?: string
}

export function ReplayPanel() {
  const { activeReplayId, closeReplay } = useUIStore()
  const [data, setData] = useState<TranscriptResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [sessionTitle, setSessionTitle] = useState<string>('')

  useEffect(() => {
    if (!activeReplayId) { setData(null); return }
    setLoading(true)
    setData(null)

    // Fetch session title
    fetch(`/api/mb/sessions/${activeReplayId}`)
      .then(r => r.json())
      .then(d => { if (d?.session?.first_prompt) setSessionTitle(d.session.first_prompt.slice(0, 60)) })
      .catch(() => {})

    fetch(`/api/mb/sessions/${activeReplayId}/transcript`)
      .then(r => r.json())
      .then((d: TranscriptResponse) => { setData(d); setLoading(false) })
      .catch(() => { setData({ messages: [], hasTimestamps: false, agentType: 'unknown', error: 'Failed to load transcript' }); setLoading(false) })
  }, [activeReplayId])

  const playback = usePlayback(data?.messages ?? [], data?.hasTimestamps ?? false)

  const isOpen = Boolean(activeReplayId)

  return (
    <div
      className={`flex flex-col border-l border-ax-border bg-ax-base transition-all duration-300 overflow-hidden shrink-0 ${
        isOpen ? 'w-[520px]' : 'w-0'
      }`}
      style={{ minWidth: isOpen ? 320 : 0 }}
    >
      {isOpen && (
        <>
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-ax-border-subtle shrink-0 bg-ax-elevated">
            <span className="text-ax-success text-micro">●</span>
            <span className="font-mono text-small text-ax-text-primary truncate flex-1" title={sessionTitle}>
              {sessionTitle || 'Session Replay'}
            </span>
            {data?.agentType && AGENTS[data.agentType as AgentId] && (
              <span
                className="font-mono text-micro px-1.5 py-0.5 bg-ax-sunken rounded shrink-0"
                style={{ color: AGENTS[data.agentType as AgentId].color }}
              >
                {AGENTS[data.agentType as AgentId].name}
              </span>
            )}
            {data && !data.unavailable && (
              <span className="font-mono text-micro text-ax-text-tertiary shrink-0">
                {playback.currentIndex} / {data.messages.length}
              </span>
            )}
            <button
              className="text-ax-text-tertiary hover:text-ax-text-primary transition-colors ml-1 shrink-0"
              onClick={closeReplay}
              title="Close replay"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-small text-ax-text-tertiary animate-pulse font-mono">Loading transcript...</div>
            </div>
          )}

          {!loading && data?.error && (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <div className="text-ax-error text-small font-mono mb-2">Session file not found</div>
                <div className="text-ax-text-tertiary text-micro">The JSONL transcript for this session is unavailable.</div>
              </div>
            </div>
          )}

          {!loading && data?.unavailable && (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <div className="text-ax-text-secondary text-small font-mono mb-2">Transcript unavailable</div>
                <div className="text-ax-text-tertiary text-micro">
                  Full replay is only available for Claude Code sessions. Other agents don't store a full message transcript.
                </div>
              </div>
            </div>
          )}

          {!loading && data && !data.error && !data.unavailable && data.messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-small text-ax-text-tertiary italic">Nothing to replay</div>
            </div>
          )}

          {!loading && data && !data.error && !data.unavailable && data.messages.length > 0 && (
            <>
              <ReplayTranscript
                messages={playback.visibleMessages}
                currentIndex={playback.currentIndex}
                streamProgress={playback.streamProgress}
              />
              <ReplayControls
                currentIndex={playback.currentIndex}
                totalMessages={data.messages.length}
                isPlaying={playback.isPlaying}
                speed={playback.speed}
                onPlay={playback.play}
                onPause={playback.pause}
                onSeek={playback.seek}
                onSetSpeed={playback.setSpeed}
                onSkipBack={() => playback.seek(playback.currentIndex - 1)}
                onSkipForward={() => playback.seek(playback.currentIndex + 1)}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd desktop && npx tsc --noEmit 2>&1 | grep -i replay
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd desktop && git add src/components/ReplayPanel/index.tsx
git commit -m "feat: add ReplayPanel container component"
```

---

## Task 9: Wire Replay into SessionsView

**Files:**
- Modify: `desktop/src/views/SessionsView.tsx`

- [ ] **Step 1: Add the Replay import and the panel render**

At the top of `desktop/src/views/SessionsView.tsx`, add the import after the existing imports:

```typescript
import { ReplayPanel } from '@/components/ReplayPanel'
import { Play } from 'lucide-react'
```

- [ ] **Step 2: Update SessionCard to accept and call onReplay**

Find the `SessionCard` component signature (around line 299):

```typescript
function SessionCard({ session, expanded, onToggle, onExpandSession }: {
  session: SessionSummary | SearchResult
  expanded: boolean
  onToggle: () => void
  onExpandSession?: (id: string) => void
}) {
```

Replace it with:

```typescript
function SessionCard({ session, expanded, onToggle, onExpandSession, onReplay }: {
  session: SessionSummary | SearchResult
  expanded: boolean
  onToggle: () => void
  onExpandSession?: (id: string) => void
  onReplay: (id: string) => void
}) {
```

- [ ] **Step 3: Add Replay hover button to the SessionCard title row**

Find this block in `SessionCard` (the title row, around line 322):

```typescript
      {/* Title row */}
      <div className="flex items-start gap-2 mb-2">
        {s.pinned && <Star size={14} className="text-ax-warning mt-1 shrink-0 fill-current" />}
        <h3 className={`font-serif italic text-h4 text-ax-text-primary flex-1 ${expanded ? '' : 'line-clamp-2'}`}>
          {title}
        </h3>
        <ChevronDown
          size={16}
          className={`text-ax-text-tertiary shrink-0 mt-1 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </div>
```

Replace with:

```typescript
      {/* Title row */}
      <div className="flex items-start gap-2 mb-2 group/card">
        {s.pinned && <Star size={14} className="text-ax-warning mt-1 shrink-0 fill-current" />}
        <h3 className={`font-serif italic text-h4 text-ax-text-primary flex-1 ${expanded ? '' : 'line-clamp-2'}`}>
          {title}
        </h3>
        <button
          className="opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0 mt-0.5 flex items-center gap-1 font-mono text-micro text-ax-brand hover:text-ax-brand/80 px-1.5 py-0.5 rounded border border-ax-brand/40 hover:border-ax-brand"
          onClick={(e) => { e.stopPropagation(); onReplay(s.id) }}
          title="Replay session"
        >
          <Play size={9} />
          Replay
        </button>
        <ChevronDown
          size={16}
          className={`text-ax-text-tertiary shrink-0 mt-1 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </div>
```

- [ ] **Step 4: Add Replay button inside SessionDetailPanel**

Find the bottom of `SessionDetailPanel` — the Session ID line (around line 289):

```typescript
      {/* Session ID */}
      <div className="pt-3 border-t border-ax-border-subtle">
        <span className="font-mono text-micro text-ax-text-tertiary select-all">{sessionId}</span>
      </div>
```

Replace with:

```typescript
      {/* Session ID + Replay */}
      <div className="pt-3 border-t border-ax-border-subtle flex items-center justify-between gap-2">
        <span className="font-mono text-micro text-ax-text-tertiary select-all truncate">{sessionId}</span>
        <button
          className="flex items-center gap-1 font-mono text-micro text-ax-brand hover:text-ax-brand/80 px-2 py-1 rounded border border-ax-brand/40 hover:border-ax-brand shrink-0 transition-colors"
          onClick={() => onReplay(sessionId)}
        >
          <Play size={10} />
          Replay
        </button>
      </div>
```

`SessionDetailPanel` needs access to `onReplay`. Update its signature from:

```typescript
function SessionDetailPanel({ sessionId }: { sessionId: string }) {
```

to:

```typescript
function SessionDetailPanel({ sessionId, onReplay }: { sessionId: string; onReplay: (id: string) => void }) {
```

- [ ] **Step 5: Pass onReplay through the expanded detail section**

In `SessionCard`, find the expandable section (around line 404):

```typescript
      {/* Expandable detail panel */}
      {expanded && (
        <div onClick={(e) => e.stopPropagation()}>
          <SessionDetailPanel sessionId={s.id} />
```

Replace with:

```typescript
      {/* Expandable detail panel */}
      {expanded && (
        <div onClick={(e) => e.stopPropagation()}>
          <SessionDetailPanel sessionId={s.id} onReplay={onReplay} />
```

- [ ] **Step 6: Wire onReplay in the main SessionsView render**

Find where `SessionCard` is rendered in the main view. Search for `<SessionCard` — it appears in multiple places (in session list and search results). For each `<SessionCard` occurrence, add `onReplay={openReplay}`.

First, add `openReplay` from the store at the top of the `SessionsView` function body. Find:

```typescript
  const { setView, openTerminal } = useUIStore()
```

Replace with:

```typescript
  const { setView, openTerminal, openReplay } = useUIStore()
```

Then for every `<SessionCard` in the component, add `onReplay={openReplay}`. There are typically 2–3 render locations (session list, search results, by-project view). Add the prop to each.

- [ ] **Step 7: Wrap the sessions view and panel in a flex container**

Find the root return in `SessionsView` — it will be a `<div>` or fragment wrapping the sessions content. The `ReplayPanel` needs to sit alongside this content.

Find the outermost `return (` in `SessionsView` and wrap the existing content + add the panel:

The existing structure is approximately:
```typescript
  return (
    <div className="flex flex-col h-full ...">
      ...sessions content...
    </div>
  )
```

Wrap it so it becomes:
```typescript
  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        ...existing sessions content unchanged...
      </div>
      <ReplayPanel />
    </div>
  )
```

- [ ] **Step 8: Verify the build compiles**

```bash
cd desktop && npx tsc --noEmit 2>&1 | head -30
```

Expected: No TypeScript errors. If there are errors about missing props (e.g., `onReplay` not passed), find the additional `<SessionCard` call sites and add `onReplay={openReplay}` to each.

- [ ] **Step 9: Run all tests**

```bash
cd desktop && npm run test
```

Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
cd desktop && git add src/views/SessionsView.tsx
git commit -m "feat: wire session replay into SessionsView"
```

---

## Task 10: Manual smoke test

- [ ] **Step 1: Start the dev server**

```bash
cd desktop && npm run dev
```

Open http://localhost:1420.

- [ ] **Step 2: Verify replay button appears on hover**

Hover over any session card — confirm the "▶ Replay" button appears in the title row. Confirm it disappears when not hovering.

- [ ] **Step 3: Open the replay panel**

Click the Replay button on a Claude Code session. Verify:
- The panel slides in from the right
- The sessions list is still visible on the left
- A loading state appears briefly
- The panel header shows the session title

- [ ] **Step 4: Verify playback**

Press ▶ (or Space). Confirm:
- Text streams character by character
- Tool calls appear with `⏺ Read(...)` formatting
- The scrubber advances
- Speed buttons (1× / 2× / 4×) change the streaming speed
- ← / → skip messages
- ✕ closes the panel cleanly

- [ ] **Step 5: Test expanded detail panel replay button**

Click a session card to expand it, then click the Replay button inside the detail panel. Confirm it opens the same panel.

- [ ] **Step 6: Test edge cases**

- Click Replay on a Codex/Cursor/Copilot session → confirm "Transcript unavailable" message
- Click Replay on a session, then switch to Analytics view → confirm panel closes

- [ ] **Step 7: Final commit**

```bash
cd desktop && git add -A
git commit -m "feat: session replay — slide-in animated transcript player"
```
