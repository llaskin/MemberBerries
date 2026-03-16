import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Terminal, Send, Square, Clock, RotateCcw, Shield } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { useAgentSession } from './useAgentSession'
import { AgentTimeline } from './AgentTimeline'
import { FileAutocomplete } from './FileAutocomplete'
import { useFileSearch } from './useFileSearch'
import type { AgentStatus, PermissionMode } from './types'
import { PERMISSION_MODES } from './types'

const STATUS_DOT: Record<AgentStatus, string> = {
  idle: 'bg-ax-text-tertiary', running: 'bg-ax-brand animate-pulse-dot',
  complete: 'bg-ax-success', error: 'bg-ax-error',
}

function extractAtQuery(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos)
  const atIdx = before.lastIndexOf('@')
  if (atIdx === -1) return null
  if (atIdx > 0 && !/\s/.test(before[atIdx - 1])) return null
  const query = before.slice(atIdx + 1)
  if (/\s/.test(query)) return null
  return query
}

interface HeadlessViewProps {
  onFileReferenceHandler?: (handler: (path: string) => void) => void
  onSessionActive?: (active: boolean) => void
}

export function HeadlessView({ onFileReferenceHandler, onSessionActive }: HeadlessViewProps) {
  const activeProject = useProjectStore((s) => s.activeProject)
  const [prompt, setPrompt] = useState('')
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('auto')
  const [acQuery, setAcQuery] = useState<string | null>(null)
  const [acSelected, setAcSelected] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { events, status, elapsed, error, sessionId, send, stop, reset, editFromIndex } = useAgentSession()

  const { results: acResults, loading: acLoading } = useFileSearch(acQuery || '', activeProject)

  const { totalCost, totalTokens } = useMemo(() => {
    let cost = 0
    let tokens = 0
    for (const evt of events) {
      if (evt.kind === 'result') {
        if (evt.cost != null) cost += evt.cost
        if (evt.usage) tokens += evt.usage.input_tokens + evt.usage.output_tokens
      }
    }
    return { totalCost: cost, totalTokens: tokens }
  }, [events])

  const currentMode = PERMISSION_MODES.find(m => m.key === permissionMode) || PERMISSION_MODES[0]
  const isActive = status === 'running'

  // Report session activity to parent
  useEffect(() => {
    onSessionActive?.(isActive)
  }, [isActive, onSessionActive])

  const cyclePermissionMode = useCallback(() => {
    setPermissionMode(prev => {
      const idx = PERMISSION_MODES.findIndex(m => m.key === prev)
      return PERMISSION_MODES[(idx + 1) % PERMISSION_MODES.length].key
    })
  }, [])

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        if (status !== 'running' && (status as string) !== 'awaiting_permission') {
          cyclePermissionMode()
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [status, cyclePermissionMode])

  useEffect(() => {
    if (status === 'complete' || status === 'idle') {
      inputRef.current?.focus()
    }
  }, [status])

  useEffect(() => { setAcSelected(0) }, [acResults])

  const handlePromptChange = useCallback((value: string) => {
    setPrompt(value)
    const textarea = inputRef.current
    if (!textarea) return
    const query = extractAtQuery(value, textarea.selectionStart)
    setAcQuery(query)
  }, [])

  const insertFileRef = useCallback((path: string) => {
    const textarea = inputRef.current
    if (!textarea) return
    const cursorPos = textarea.selectionStart
    const before = prompt.slice(0, cursorPos)
    const after = prompt.slice(cursorPos)
    const atIdx = before.lastIndexOf('@')
    if (atIdx === -1) return
    const newPrompt = before.slice(0, atIdx) + `@${path} ` + after
    setPrompt(newPrompt)
    setAcQuery(null)
    const newPos = atIdx + path.length + 2
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(newPos, newPos)
    })
  }, [prompt])

  // Expose file reference handler for FileTree @ button
  const handleFileReference = useCallback((path: string) => {
    const ref = `@${path} `
    setPrompt(prev => prev + ref)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      const len = (prompt + ref).length
      inputRef.current?.setSelectionRange(len, len)
    })
  }, [prompt])

  // Register file reference handler with parent
  useEffect(() => {
    onFileReferenceHandler?.(handleFileReference)
  }, [onFileReferenceHandler, handleFileReference])

  const handleSubmit = () => {
    if (!prompt.trim() || !activeProject || isActive) return
    send(prompt.trim(), activeProject, permissionMode)
    setPrompt('')
    setAcQuery(null)
  }

  const handleEditMessage = useCallback((eventIndex: number) => {
    const text = editFromIndex(eventIndex)
    if (text != null) {
      setPrompt(text)
      requestAnimationFrame(() => {
        const ta = inputRef.current
        if (ta) {
          ta.focus()
          ta.setSelectionRange(text.length, text.length)
          ta.style.height = 'auto'
          ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
        }
      })
    }
  }, [editFromIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && e.shiftKey) return

    if (acQuery !== null && acResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAcSelected(p => (p + 1) % acResults.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAcSelected(p => (p - 1 + acResults.length) % acResults.length)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (acResults[acSelected]) insertFileRef(acResults[acSelected])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setAcQuery(null)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        if (acResults[acSelected]) insertFileRef(acResults[acSelected])
        return
      }
    }

    if (e.key === 'Enter') {
      if (e.shiftKey || e.metaKey || e.ctrlKey) return
      e.preventDefault()
      handleSubmit()
    }
  }

  const showAutocomplete = acQuery !== null && acQuery.length >= 0 && acResults.length > 0

  return (
    <>
      {/* Compact header bar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-ax-border-subtle bg-ax-base">
        <Terminal size={12} className="text-ax-text-tertiary" />
        {activeProject && (
          <span className="font-mono text-[10px] text-ax-text-secondary truncate max-w-[120px]">
            {activeProject}
          </span>
        )}
        <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
        {(status === 'running' || (status as string) === 'awaiting_permission') && (
          <span className="font-mono text-[10px] text-ax-text-tertiary flex items-center gap-1">
            <Clock size={9} /> {elapsed}s
          </span>
        )}
        {sessionId && (
          <span className="font-mono text-[10px] text-ax-text-ghost">
            session
          </span>
        )}
        {totalCost > 0 && (
          <span className="font-mono text-[10px] text-ax-text-tertiary">
            ${totalCost.toFixed(4)}
          </span>
        )}
        {totalTokens > 0 && (
          <span className="font-mono text-[10px] text-ax-text-ghost">
            {(totalTokens / 1000).toFixed(1)}k
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={cyclePermissionMode}
          disabled={isActive}
          title={`${currentMode.desc} · Shift+Tab to cycle`}
          className={`flex items-center gap-1 font-mono text-[10px] transition-colors
            disabled:opacity-50
            ${permissionMode === 'auto' ? 'text-ax-success' :
              permissionMode === 'plan' ? 'text-ax-info' :
              (permissionMode as string) === 'ask' ? 'text-ax-warning' :
              'text-ax-accent'
            } hover:brightness-125`}
        >
          <Shield size={10} />
          <span>{currentMode.label}</span>
          <span className="text-ax-text-ghost text-[8px]">⇧⇥</span>
        </button>
        {events.length > 0 && !isActive && (
          <button
            onClick={reset}
            className="flex items-center gap-1 font-mono text-[10px] text-ax-text-tertiary
              hover:text-ax-text-secondary transition-colors ml-1"
          >
            <RotateCcw size={9} /> New
          </button>
        )}
      </div>

      {/* Timeline */}
      {events.length > 0 ? (
        <AgentTimeline events={events} status={status} onEditMessage={handleEditMessage} />
      ) : (
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="text-center">
            <Terminal size={20} className="text-ax-text-ghost mx-auto mb-2" />
            <p className="text-micro text-ax-text-tertiary max-w-xs">
              {activeProject
                ? 'Type a prompt below to start. Use @filename to reference files.'
                : 'Select a project in the sidebar first.'}
            </p>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="shrink-0 mx-3 mb-2 bg-ax-error-subtle border border-ax-error/20 rounded px-3 py-1">
          <p className="text-[10px] text-ax-error font-mono">{error}</p>
        </div>
      )}

      {/* Chat input */}
      <div className="shrink-0 relative border-t border-ax-border-subtle px-3 pt-2 pb-1.5">
        {showAutocomplete && activeProject && (
          <FileAutocomplete
            results={acResults}
            loading={acLoading}
            query={acQuery!}
            selected={acSelected}
            onSelect={insertFileRef}
            onHover={setAcSelected}
            onClose={() => setAcQuery(null)}
          />
        )}

        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={() => {
              const textarea = inputRef.current
              if (textarea) {
                setAcQuery(extractAtQuery(prompt, textarea.selectionStart))
              }
            }}
            placeholder={
              !activeProject ? 'Select a project first...'
              : isActive ? 'Waiting for agent...'
              : sessionId ? 'Follow-up message...'
              : 'What should the agent do? Use @ to reference files'
            }
            disabled={!activeProject || isActive}
            rows={1}
            className="flex-1 bg-ax-elevated border border-ax-border rounded-lg px-3 py-2
              text-small text-ax-text-primary placeholder:text-ax-text-tertiary resize-none
              focus:outline-none focus:border-ax-brand
              disabled:opacity-40 transition-colors"
            style={{ minHeight: 36, maxHeight: 120 }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement
              t.style.height = 'auto'
              t.style.height = Math.min(t.scrollHeight, 120) + 'px'
            }}
          />
          {isActive ? (
            <button
              onClick={stop}
              className="shrink-0 p-2 bg-ax-error/10 text-ax-error rounded-lg
                hover:bg-ax-error/20 transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-ax-error"
              aria-label="Stop agent"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!prompt.trim() || !activeProject}
              className="shrink-0 p-2 bg-ax-brand text-white rounded-lg
                hover:bg-ax-brand-hover transition-colors
                disabled:opacity-30 disabled:cursor-not-allowed
                focus:outline-none focus-visible:ring-2 focus-visible:ring-ax-brand"
              aria-label="Send prompt"
            >
              <Send size={16} />
            </button>
          )}
        </div>
        <span className="text-[9px] text-ax-text-tertiary px-1 mt-0.5 block">Enter to send · Shift+Enter for newline · @ to reference files · Shift+Tab to change mode</span>
      </div>
    </>
  )
}
