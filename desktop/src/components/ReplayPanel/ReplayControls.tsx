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
