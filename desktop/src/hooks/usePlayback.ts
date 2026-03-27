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
  const gapCountdownRef = useRef<number>(0)
  const speedRef = useRef(speed)

  useEffect(() => { speedRef.current = speed }, [speed])

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

  // Use refs to avoid stale closures in the rAF loop
  const messagesRef = useRef(messages)
  const interMessageGapMsRef = useRef(interMessageGapMs)
  const currentTextLengthRef = useRef(currentTextLength)
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { interMessageGapMsRef.current = interMessageGapMs }, [interMessageGapMs])
  useEffect(() => { currentTextLengthRef.current = currentTextLength }, [currentTextLength])

  const tick = useCallback((now: number) => {
    const last = lastFrameRef.current
    if (last === null) {
      lastFrameRef.current = now
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    const delta = (now - last) * speedRef.current
    lastFrameRef.current = now

    setCurrentIndex(ci => {
      const msgs = messagesRef.current
      if (ci >= msgs.length) { setIsPlaying(false); return ci }

      const msg = msgs[ci]
      if (!msg) { setIsPlaying(false); return ci }

      // If in gap countdown, drain it
      if (gapCountdownRef.current > 0) {
        gapCountdownRef.current = Math.max(0, gapCountdownRef.current - delta)
        if (gapCountdownRef.current <= 0) {
          const nextIndex = ci + 1
          if (nextIndex >= msgs.length) { setIsPlaying(false); return ci }
          setStreamProgress(0)
          gapCountdownRef.current = 0
          return nextIndex
        }
        rafRef.current = requestAnimationFrame(tick)
        return ci
      }

      if (msg.role === 'assistant') {
        const totalChars = currentTextLengthRef.current(ci)
        if (totalChars === 0) {
          gapCountdownRef.current = interMessageGapMsRef.current(ci, ci + 1)
          setStreamProgress(1)
        } else {
          setStreamProgress(prev => {
            const progressPerMs = CHARS_PER_MS / totalChars
            const next = prev + progressPerMs * delta
            if (next >= 1) {
              gapCountdownRef.current = interMessageGapMsRef.current(ci, ci + 1)
              return 1
            }
            return next
          })
        }
      } else {
        // User messages appear instantly
        gapCountdownRef.current = interMessageGapMsRef.current(ci, ci + 1)
        setStreamProgress(1)
      }

      rafRef.current = requestAnimationFrame(tick)
      return ci
    })
  }, []) // stable — uses refs internally

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
    const clamped = Math.max(0, Math.min(index, messages.length > 0 ? messages.length - 1 : 0))
    setCurrentIndex(clamped)
    setStreamProgress(1)
    gapCountdownRef.current = 0
  }, [messages.length])

  const setSpeed = useCallback((n: number) => setSpeedState(n), [])

  const visibleMessages = messages.slice(0, currentIndex)

  return { currentIndex, streamProgress, isPlaying, speed, visibleMessages, play, pause, seek, setSpeed, interMessageGapMs }
}
