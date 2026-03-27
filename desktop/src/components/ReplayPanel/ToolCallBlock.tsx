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
