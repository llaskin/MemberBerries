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
    if (!activeReplayId) { setData(null); setSessionTitle(''); return }
    setLoading(true)
    setData(null)

    fetch(`/api/mb/sessions/${activeReplayId}`)
      .then(r => r.json())
      .then(d => { if (d?.session?.first_prompt) setSessionTitle(d.session.first_prompt.slice(0, 60)) })
      .catch(() => {})

    fetch(`/api/mb/sessions/${activeReplayId}/transcript`)
      .then(r => r.json())
      .then((d: TranscriptResponse) => { setData(d); setLoading(false) })
      .catch(() => {
        setData({ messages: [], hasTimestamps: false, agentType: 'unknown', error: 'Failed to load transcript' })
        setLoading(false)
      })
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
