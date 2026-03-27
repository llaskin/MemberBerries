import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlayback } from './usePlayback'
import type { ParsedMessage } from '../lib/transcriptParser'

const makeMessages = (n: number, withTimestamps = false): ParsedMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    index: i,
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: [{ type: 'text' as const, text: `message ${i}` }],
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

  it('inter-message gap is capped at 5000ms for very large gaps', () => {
    const msgs = makeMessages(2, true)
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
