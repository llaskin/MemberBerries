import { useState, useEffect, useRef, useCallback } from 'react'
import { useProjectStore } from '@/store/projectStore'
import { CheckSquare, Plus, Zap, ChevronDown, X, Archive, Trash2, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react'
import type { TodoItem, TodoPriority, TodoStatus } from '@/lib/todoParser'

// ─── Types ───────────────────────────────────────────────────────

type ViewMode = 'now' | 'backlog' | 'done'

// ─── Helpers ─────────────────────────────────────────────────────

function daysAgo(dateStr: string): number {
  if (!dateStr) return 0
  const then = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  return Math.floor((now.getTime() - then.getTime()) / 86400000)
}

function ageBadge(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return '1d'
  return `${days}d`
}

const PRIORITY_ORDER: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 }

function sortByPriority(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
}

// ─── Data Hook ───────────────────────────────────────────────────

function useTodos(project: string | null) {
  const [items, setItems] = useState<TodoItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTodos = useCallback(async () => {
    if (!project) { setItems([]); setLoading(false); return }
    try {
      const res = await fetch(`/api/axon/projects/${encodeURIComponent(project)}/todos`)
      const data = await res.json()
      setItems(data.items || [])
    } catch {
      setItems([])
    }
    setLoading(false)
  }, [project])

  useEffect(() => { setLoading(true); fetchTodos() }, [fetchTodos])

  const addTodo = useCallback(async (description: string, priority: TodoPriority) => {
    if (!project) return
    await fetch(`/api/axon/projects/${encodeURIComponent(project)}/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, priority }),
    })
    fetchTodos()
  }, [project, fetchTodos])

  const updateTodo = useCallback(async (id: number, action: string, extra?: { reason?: string; priority?: string; notes?: string }) => {
    if (!project) return
    await fetch(`/api/axon/projects/${encodeURIComponent(project)}/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    fetchTodos()
  }, [project, fetchTodos])

  return { items, loading, addTodo, updateTodo, refetch: fetchTodos }
}

// ─── Priority Dot ────────────────────────────────────────────────

function PriorityDot({ priority, size = 8 }: { priority: TodoPriority; size?: number }) {
  const colors: Record<TodoPriority, string> = {
    high: 'var(--ax-brand-primary)',
    medium: 'var(--ax-text-tertiary)',
    low: 'var(--ax-border-subtle)',
  }
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, backgroundColor: colors[priority] }}
      title={priority}
    />
  )
}

// ─── Priority Selector ──────────────────────────────────────────

function PriorityPicker({ value, onChange }: { value: TodoPriority; onChange: (p: TodoPriority) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md
          text-ax-text-secondary hover:bg-ax-sunken transition-colors text-small"
      >
        <PriorityDot priority={value} />
        <span className="capitalize">{value}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 right-0 bg-ax-elevated border border-ax-border rounded-lg shadow-lg overflow-hidden z-50 min-w-[120px]">
          {(['high', 'medium', 'low'] as TodoPriority[]).map(p => (
            <button
              key={p}
              onClick={() => { onChange(p); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-small transition-colors
                ${p === value ? 'bg-ax-brand-subtle text-ax-text-primary' : 'text-ax-text-secondary hover:bg-ax-sunken'}`}
            >
              <PriorityDot priority={p} />
              <span className="capitalize">{p}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Add Bar ─────────────────────────────────────────────────────

function AddBar({ onAdd }: { onAdd: (desc: string, pri: TodoPriority) => void }) {
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<TodoPriority>('medium')
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    onAdd(trimmed, priority)
    setText('')
    inputRef.current?.focus()
  }

  return (
    <div className="flex items-center gap-2 bg-ax-elevated border border-ax-border rounded-xl px-4 py-3 shadow-sm
      focus-within:border-ax-brand-primary/40 focus-within:shadow-md transition-all">
      <Plus size={16} className="text-ax-text-ghost shrink-0" />
      <input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        placeholder="Add a task..."
        className="flex-1 bg-transparent text-ax-text-primary placeholder:text-ax-text-ghost
          text-body outline-none"
      />
      <PriorityPicker value={priority} onChange={setPriority} />
    </div>
  )
}

// ─── Dispatch Stub Popover ───────────────────────────────────────

function DispatchPopover({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 w-72 bg-ax-elevated border border-ax-border
      rounded-xl shadow-xl z-50 p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-ax-brand-subtle flex items-center justify-center">
          <Zap size={14} className="text-ax-brand" />
        </div>
        <span className="font-mono text-small text-ax-text-primary font-medium">Agent Dispatch</span>
      </div>
      <p className="text-small text-ax-text-secondary leading-relaxed mb-3">
        Autonomously research, plan, and implement this task. Create a PR, run tests, and report back.
      </p>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ax-sunken border border-ax-border-subtle">
        <span className="w-2 h-2 rounded-full bg-ax-warning animate-pulse-dot" />
        <span className="font-mono text-micro text-ax-text-tertiary uppercase tracking-wider">Coming soon</span>
      </div>
    </div>
  )
}

// ─── Todo Card ───────────────────────────────────────────────────

function TodoCard({ item, onUpdate }: {
  item: TodoItem
  onUpdate: (id: number, action: string, extra?: { reason?: string; priority?: string; notes?: string }) => void
}) {
  const [showDispatch, setShowDispatch] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesText, setNotesText] = useState(item.notes || '')
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const age = daysAgo(item.created)
  const isStale = age > 3 && item.status === 'active'
  const isCompleted = item.status === 'completed'
  const isInactive = item.status === 'deferred' || item.status === 'dropped'

  useEffect(() => { setNotesText(item.notes || '') }, [item.notes])
  useEffect(() => {
    if (editingNotes && notesRef.current) {
      notesRef.current.focus()
      notesRef.current.style.height = 'auto'
      notesRef.current.style.height = notesRef.current.scrollHeight + 'px'
    }
  }, [editingNotes])

  const saveNotes = () => {
    setEditingNotes(false)
    const trimmed = notesText.trim()
    if (trimmed !== (item.notes || '')) {
      onUpdate(item.id, 'add-notes', { notes: trimmed || undefined })
    }
  }

  return (
    <div
      className={`group relative flex items-start gap-3 px-4 py-3 rounded-xl transition-all duration-200
        ${isStale ? 'bg-ax-elevated border border-[var(--ax-brand-primary)]/20 shadow-[0_0_12px_-4px_var(--ax-brand-primary)]' : 'bg-ax-elevated border border-ax-border'}
        ${isCompleted || isInactive ? 'opacity-70' : ''}
        hover:shadow-md hover:border-ax-border`}
      onMouseLeave={() => setShowDispatch(false)}
    >
      {/* Checkbox */}
      <button
        onClick={() => {
          if (item.status === 'active') onUpdate(item.id, 'complete')
          else if (item.status === 'completed') onUpdate(item.id, 'reactivate')
          else if (item.status === 'deferred') onUpdate(item.id, 'reactivate')
        }}
        className={`mt-0.5 w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-all duration-200
          ${isCompleted
            ? 'bg-ax-accent border-ax-accent text-white scale-95'
            : isInactive
              ? 'border-ax-border-subtle bg-ax-sunken'
              : 'border-ax-border hover:border-ax-brand-primary'
          }`}
      >
        {isCompleted && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-micro text-ax-text-ghost">#{item.id}</span>
          <PriorityDot priority={item.priority} size={6} />
          {isStale && (
            <span className="font-mono text-micro text-ax-brand px-1.5 py-0.5 rounded bg-ax-brand-subtle">stale</span>
          )}
          {item.notes && !expanded && (
            <button onClick={() => setExpanded(true)} className="font-mono text-micro text-ax-text-ghost hover:text-ax-text-secondary">
              +notes
            </button>
          )}
        </div>
        <p
          className={`text-body mt-0.5 cursor-pointer ${isCompleted ? 'line-through text-ax-text-tertiary' : 'text-ax-text-primary'}`}
          onClick={() => setExpanded(e => !e)}
        >
          {item.description}
        </p>

        {/* Notes section */}
        {expanded && (
          <div className="mt-2 ml-0.5">
            {editingNotes ? (
              <textarea
                ref={notesRef}
                value={notesText}
                onChange={e => {
                  setNotesText(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
                onBlur={saveNotes}
                onKeyDown={e => { if (e.key === 'Escape') saveNotes() }}
                placeholder="Add notes..."
                className="w-full bg-ax-sunken border border-ax-border-subtle rounded-lg px-3 py-2
                  text-small text-ax-text-secondary placeholder:text-ax-text-ghost
                  outline-none focus:border-ax-brand-primary/40 resize-none"
                rows={2}
              />
            ) : (
              <button
                onClick={() => setEditingNotes(true)}
                className="w-full text-left px-3 py-2 rounded-lg text-small
                  hover:bg-ax-sunken transition-colors"
              >
                {item.notes ? (
                  <span className="text-ax-text-secondary whitespace-pre-wrap">{item.notes}</span>
                ) : (
                  <span className="text-ax-text-ghost italic">Add notes...</span>
                )}
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 mt-1.5">
          {item.created && (
            <span className="font-mono text-micro text-ax-text-ghost">
              {ageBadge(age)}
            </span>
          )}
          {item.reason && (
            <span className="text-micro text-ax-text-tertiary italic">
              {item.reason}
            </span>
          )}
          {item.completed && (
            <span className="font-mono text-micro text-ax-accent">
              completed {item.completed}
            </span>
          )}
        </div>
      </div>

      {/* Hover actions — absolutely positioned, CSS visibility */}
      {item.status === 'active' && (
        <div className="absolute right-3 top-2.5 flex items-center gap-0.5
          opacity-0 group-hover:opacity-100 transition-opacity duration-150
          bg-ax-elevated/90 backdrop-blur-sm rounded-lg p-0.5 border border-ax-border-subtle shadow-sm">
          <button
            onClick={() => onUpdate(item.id, 'defer')}
            title="Defer to backlog"
            className="p-1.5 rounded-md text-ax-text-ghost hover:text-ax-text-secondary hover:bg-ax-sunken transition-colors"
          >
            <Archive size={13} />
          </button>
          <button
            onClick={() => onUpdate(item.id, 'drop')}
            title="Drop"
            className="p-1.5 rounded-md text-ax-text-ghost hover:text-ax-error hover:bg-ax-sunken transition-colors"
          >
            <Trash2 size={13} />
          </button>
          {item.priority !== 'high' && (
            <button
              onClick={() => onUpdate(item.id, 'reprioritise', { priority: item.priority === 'low' ? 'medium' : 'high' })}
              title="Increase priority"
              className="p-1.5 rounded-md text-ax-text-ghost hover:text-ax-brand hover:bg-ax-sunken transition-colors"
            >
              <ArrowUp size={13} />
            </button>
          )}
          {item.priority !== 'low' && (
            <button
              onClick={() => onUpdate(item.id, 'reprioritise', { priority: item.priority === 'high' ? 'medium' : 'low' })}
              title="Decrease priority"
              className="p-1.5 rounded-md text-ax-text-ghost hover:text-ax-text-secondary hover:bg-ax-sunken transition-colors"
            >
              <ArrowDown size={13} />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowDispatch(o => !o)}
              title="Agent dispatch"
              className="p-1.5 rounded-md text-ax-text-ghost hover:text-ax-warning hover:bg-ax-sunken transition-colors"
            >
              <Zap size={13} />
            </button>
            {showDispatch && <DispatchPopover onClose={() => setShowDispatch(false)} />}
          </div>
        </div>
      )}

      {/* Reactivate for deferred/dropped */}
      {isInactive && (
        <div className="absolute right-3 top-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            onClick={() => onUpdate(item.id, 'reactivate')}
            title="Reactivate"
            className="p-1.5 rounded-lg text-ax-text-ghost hover:text-ax-accent hover:bg-ax-sunken transition-colors
              bg-ax-elevated/90 backdrop-blur-sm border border-ax-border-subtle shadow-sm"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Stats Bar ───────────────────────────────────────────────────

function StatsBar({ items }: { items: TodoItem[] }) {
  const active = items.filter(i => i.status === 'active').length
  const deferred = items.filter(i => i.status === 'deferred').length
  const completed = items.filter(i => i.status === 'completed').length
  const dropped = items.filter(i => i.status === 'dropped').length

  const parts: string[] = []
  if (active > 0) parts.push(`${active} active`)
  if (deferred > 0) parts.push(`${deferred} deferred`)
  if (completed > 0) parts.push(`${completed} done`)
  if (dropped > 0) parts.push(`${dropped} dropped`)

  return (
    <p className="font-mono text-small text-ax-text-tertiary">
      {parts.length > 0 ? parts.join(' \u00b7 ') : 'No tasks yet'}
    </p>
  )
}

// ─── Velocity Stats (Done view) ─────────────────────────────────

function VelocityStats({ items }: { items: TodoItem[] }) {
  const completed = items.filter(i => i.status === 'completed')
  const dropped = items.filter(i => i.status === 'dropped')
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  const weekStr = weekAgo.toISOString().slice(0, 10)

  const completedThisWeek = completed.filter(i => (i.completed || '') >= weekStr).length
  const droppedThisWeek = dropped.filter(i => (i.dropped || '') >= weekStr).length

  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-ax-sunken rounded-xl border border-ax-border-subtle mb-4">
      <div>
        <span className="font-mono text-h3 text-ax-accent">{completedThisWeek}</span>
        <span className="text-micro text-ax-text-tertiary ml-1.5">closed this week</span>
      </div>
      {droppedThisWeek > 0 && (
        <div>
          <span className="font-mono text-h3 text-ax-text-tertiary">{droppedThisWeek}</span>
          <span className="text-micro text-ax-text-tertiary ml-1.5">dropped</span>
        </div>
      )}
      <div className="ml-auto">
        <span className="font-mono text-small text-ax-text-ghost">{completed.length} total</span>
      </div>
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-ax-brand-subtle rounded-2xl flex items-center justify-center mb-6">
        <CheckSquare size={28} className="text-ax-brand" />
      </div>
      <h2 className="font-serif italic text-h3 text-ax-text-primary mb-2">
        No tasks yet
      </h2>
      <p className="text-body text-ax-text-secondary max-w-sm mb-6">
        Add your first task above, or from the terminal:
      </p>
      <code className="font-mono text-small text-ax-text-tertiary bg-ax-sunken px-4 py-2.5 rounded-lg border border-ax-border-subtle">
        axon todo add "My first task" --priority high
      </code>
    </div>
  )
}

// ─── Main View ───────────────────────────────────────────────────

export function TodosView() {
  const activeProject = useProjectStore(s => s.activeProject)
  const [mode, setMode] = useState<ViewMode>('now')
  const { items, loading, addTodo, updateTodo } = useTodos(activeProject)

  // Filtered items per mode
  const nowItems = sortByPriority(items.filter(i => i.status === 'active'))
  const backlogItems = [
    ...items.filter(i => i.status === 'deferred'),
  ]
  const doneItems = [
    ...items.filter(i => i.status === 'completed'),
    ...items.filter(i => i.status === 'dropped'),
  ]

  const modeItems: Record<ViewMode, TodoItem[]> = {
    now: nowItems,
    backlog: backlogItems,
    done: doneItems,
  }

  const currentItems = modeItems[mode]

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16">
        <p className="text-body text-ax-text-secondary">Select a project to view tasks.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Header */}
      <header className="shrink-0 mb-6 text-center">
        <h1 className="font-serif italic text-display text-ax-text-primary tracking-tight">
          Tasks
        </h1>
        <StatsBar items={items} />
      </header>

      {/* Mode tabs */}
      <div className="flex items-center gap-1 mb-5 bg-ax-sunken rounded-xl p-1 self-center">
        {([
          { id: 'now' as ViewMode, label: 'Now', count: nowItems.length },
          { id: 'backlog' as ViewMode, label: 'Backlog', count: backlogItems.length },
          { id: 'done' as ViewMode, label: 'Done', count: doneItems.length },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-small font-mono transition-all duration-200
              ${mode === tab.id
                ? 'bg-ax-elevated text-ax-text-primary shadow-sm border border-ax-border-subtle'
                : 'text-ax-text-tertiary hover:text-ax-text-secondary'
              }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-micro px-1.5 py-0.5 rounded-full ${
                mode === tab.id ? 'bg-ax-brand-subtle text-ax-brand' : 'bg-ax-border-subtle/50 text-ax-text-ghost'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Add bar — only in Now mode */}
      {mode === 'now' && (
        <div className="mb-5">
          <AddBar onAdd={addTodo} />
        </div>
      )}

      {/* Velocity stats — only in Done mode */}
      {mode === 'done' && doneItems.length > 0 && (
        <VelocityStats items={items} />
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex gap-1">
              <span className="thinking-dot w-2 h-2 rounded-full bg-ax-brand" style={{ animationDelay: '0s' }} />
              <span className="thinking-dot w-2 h-2 rounded-full bg-ax-brand" style={{ animationDelay: '0.2s' }} />
              <span className="thinking-dot w-2 h-2 rounded-full bg-ax-brand" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        ) : currentItems.length === 0 ? (
          mode === 'now' && items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="text-center py-12">
              <p className="text-body text-ax-text-ghost">
                {mode === 'now' ? 'All clear. Nice work.' : mode === 'backlog' ? 'Nothing deferred.' : 'Nothing completed yet.'}
              </p>
            </div>
          )
        ) : (
          <div className="space-y-2">
            {currentItems.map(item => (
              <TodoCard key={item.id} item={item} onUpdate={updateTodo} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
