import { useState, useRef, useCallback, useEffect } from 'react'
import type { AgentEvent, AgentStatus, PermissionMode } from './types'
import { PERMISSION_MODES } from './types'

export function useAgentSession() {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)
  const priorContextRef = useRef<string | null>(null)

  // Elapsed timer
  useEffect(() => {
    if (status === 'running') {
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [status])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setStatus(prev => prev === 'running' ? 'complete' : prev)
  }, [])

  // Cleanup on unmount
  useEffect(() => () => { abortRef.current?.abort() }, [])

  const send = useCallback(async (prompt: string, project: string, permissionMode: PermissionMode = 'auto') => {
    // Inject user message into timeline (show original prompt, not context-injected)
    setEvents(prev => [...prev, {
      kind: 'user_message',
      id: `user-${Date.now()}`,
      timestamp: Date.now(),
      text: prompt,
    }])
    setError(null)
    setElapsed(0)
    setStatus('running')

    // If editing from a prior point, inject conversation context into the prompt
    let fullPrompt = prompt
    if (priorContextRef.current) {
      fullPrompt = `<context>\nPrevious conversation in this session:\n${priorContextRef.current}\n</context>\n\n${prompt}`
      priorContextRef.current = null
    }

    // Resolve allowed tools from permission mode
    const modeConfig = PERMISSION_MODES.find(m => m.key === permissionMode)
    const allowedTools = modeConfig?.tools || PERMISSION_MODES[0].tools

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/mb/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          project,
          allowedTools,
          continueSession: sessionId != null,
        }),
        signal: controller.signal,
      })

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let sseBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        sseBuffer += decoder.decode(value, { stream: true })
        const lines = sseBuffer.split('\n')
        sseBuffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6)) as AgentEvent
            setEvents(prev => [...prev, { ...evt, timestamp: Date.now() }])

            if (evt.kind === 'result') {
              setStatus('complete')
              if (evt.sessionId) setSessionId(evt.sessionId)
            } else if (evt.kind === 'error') {
              setError(evt.text || 'Unknown error')
              setStatus('error')
            }
          } catch { /* incomplete JSON, skip */ }
        }
      }

      setStatus(prev => prev === 'running' ? 'complete' : prev)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message)
      setStatus('error')
    }
  }, [sessionId])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setEvents([])
    setStatus('idle')
    setError(null)
    setElapsed(0)
    setSessionId(null)
  }, [])

  // Edit and resend from a specific user message
  const editFromIndex = useCallback((eventIndex: number): string | null => {
    if (status === 'running') return null

    const targetEvent = events[eventIndex]
    if (!targetEvent || targetEvent.kind !== 'user_message') return null

    const messageText = targetEvent.text || ''

    // Build conversation summary from events before the edit point
    // so Claude gets context of what was discussed
    const contextParts: string[] = []
    for (const evt of events.slice(0, eventIndex)) {
      if (evt.kind === 'session_divider') continue
      if (evt.kind === 'user_message') {
        contextParts.push(`User: ${evt.text}`)
      } else if (evt.kind === 'text') {
        const text = evt.text || ''
        contextParts.push(`Assistant: ${text.length > 500 ? text.slice(0, 500) + '…' : text}`)
      } else if (evt.kind === 'tool_use') {
        const summary = evt.toolName === 'Bash'
          ? `${evt.toolName}(${(evt.toolInput?.command as string)?.slice(0, 60) || ''})`
          : evt.toolName === 'Read' || evt.toolName === 'Edit' || evt.toolName === 'Write'
            ? `${evt.toolName}(${evt.toolInput?.file_path || ''})`
            : `${evt.toolName}()`
        contextParts.push(`Assistant used tool: ${summary}`)
      }
    }
    priorContextRef.current = contextParts.length > 0 ? contextParts.join('\n') : null

    // Truncate to before the message, inject session divider
    setEvents(prev => [
      ...prev.slice(0, eventIndex),
      {
        kind: 'session_divider' as const,
        id: `divider-${Date.now()}`,
        timestamp: Date.now(),
      },
    ])

    setSessionId(null)
    setStatus('idle')
    setError(null)

    return messageText
  }, [events, status])

  return { events, status, elapsed, error, sessionId, send, stop, reset, editFromIndex }
}
