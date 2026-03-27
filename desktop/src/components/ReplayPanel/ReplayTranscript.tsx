import React, { useEffect, useRef, useState } from 'react'
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
          const visibleChars = isCurrentMessage
            ? Math.min(charsRemaining, block.text?.length || 0)
            : (block.text?.length || 0)
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
