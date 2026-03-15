import { useState, useCallback, useEffect, useRef } from 'react'
import { Terminal, Cpu } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { useUIStore } from '@/store/uiStore'
import { FileTree } from './agent/FileTree'
import { HeadlessView } from './agent/HeadlessView'
import { TerminalView } from './agent/TerminalView'
import type { AgentMode } from './agent/types'

export function AgentView() {
  const activeProject = useProjectStore((s) => s.activeProject)
  const resumeSessionId = useUIStore((s) => s.resumeSessionId)
  const clearResumeSession = useUIStore((s) => s.clearResumeSession)

  const [mode, setMode] = useState<AgentMode>('terminal')
  const [sessionActive, setSessionActive] = useState(false)

  // Track the file reference handler from the active mode
  const fileRefHandlerRef = useRef<((path: string) => void) | null>(null)

  // Auto-switch to terminal when resumeSessionId arrives
  useEffect(() => {
    if (resumeSessionId) {
      setMode('terminal')
    }
  }, [resumeSessionId])

  const switchMode = useCallback((m: AgentMode) => {
    if (sessionActive && m !== mode) return
    setMode(m)
  }, [sessionActive, mode])

  const handleFileReference = useCallback((path: string) => {
    fileRefHandlerRef.current?.(path)
  }, [])

  const registerFileRefHandler = useCallback((handler: (path: string) => void) => {
    fileRefHandlerRef.current = handler
  }, [])

  const modeButton = (m: AgentMode, icon: React.ReactNode, label: string) => {
    const isActive = mode === m
    const isDisabled = sessionActive && !isActive
    return (
      <button
        onClick={() => switchMode(m)}
        disabled={isDisabled}
        className={`flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] rounded transition-colors
          ${isActive
            ? 'bg-ax-elevated text-ax-text-primary shadow-sm'
            : 'text-ax-text-tertiary hover:text-ax-text-secondary'
          } disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        {icon}
        {label}
      </button>
    )
  }

  return (
    <div className="flex h-full">
      {/* Sidebar — FileTree */}
      {activeProject && (
        <div className="w-56 shrink-0 border-r border-ax-border bg-ax-elevated overflow-hidden">
          <FileTree project={activeProject} onFileReference={handleFileReference} />
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mode switcher bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-1 border-b border-ax-border-subtle bg-ax-base">
          <div className="flex items-center gap-0.5 bg-ax-sunken rounded-md p-0.5">
            {modeButton('headless', <Cpu size={10} />, 'Headless')}
            {modeButton('terminal', <Terminal size={10} />, 'Terminal')}
          </div>
          {activeProject && (
            <span className="font-mono text-[10px] text-ax-text-secondary truncate max-w-[140px]">
              {activeProject}
            </span>
          )}
        </div>

        {/* Mode content */}
        {mode === 'headless' ? (
          <HeadlessView
            onFileReferenceHandler={registerFileRefHandler}
            onSessionActive={setSessionActive}
          />
        ) : mode === 'terminal' ? (
          activeProject ? (
            <TerminalView
              project={activeProject}
              resumeSessionId={resumeSessionId}
              onClearResume={clearResumeSession}
              onSessionActive={setSessionActive}
              onFileReferenceHandler={registerFileRefHandler}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Terminal size={20} className="text-ax-text-ghost mx-auto mb-2" />
                <p className="text-micro text-ax-text-tertiary max-w-xs">
                  Select a project to start a terminal session.
                </p>
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}
