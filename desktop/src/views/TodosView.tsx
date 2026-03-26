import { useState, useEffect, useRef, useCallback } from 'react'
import { useProjectStore } from '@/store/projectStore'
import { CheckSquare, Plus, Zap, ChevronDown, X, Archive, Trash2, ArrowUp, ArrowDown, RotateCcw, Pencil } from 'lucide-react'
import type { TodoItem, TodoPriority } from '@/lib/todoDb'

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

const PRIORITY_ORDER: Record<TodoPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const PRIORITY_BORDER: Record<TodoPriority, string> = {
  critical: 'border-l-[var(--ax-error)]',
  high: 'border-l-[var(--ax-brand-primary)]',
  medium: 'border-l-transparent',
  low: 'border-l-transparent',
}

const PRIORITY_BG: Record<TodoPriority, string> = {
  critical: 'bg-ax-elevated',
  high: 'bg-ax-elevated',
  medium: 'bg-ax-elevated',
  low: 'bg-ax-elevated',
}

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
      const res = await fetch(`/api/mb/projects/${encodeURIComponent(project)}/todos`)
      const data = await res.json()
      setItems(data.items || [])
    } catch {
      setItems([])
    }
    setLoading(false)
  }, [project])

  useEffect(() => { setLoading(true); fetchTodos() }, [fetchTodos])

  const addTodo = useCallback(async (description: string, priority: TodoPriority, tags?: string[]) => {
    if (!project) return
    await fetch(`/api/mb/projects/${encodeURIComponent(project)}/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, priority, tags }),
    })
    fetchTodos()
  }, [project, fetchTodos])

  const updateTodo = useCallback(async (id: number, action: string, extra?: Record<string, unknown>) => {
    if (!project) return
    await fetch(`/api/mb/projects/${encodeURIComponent(project)}/todos/${id}`, {
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
    critical: 'var(--ax-error)',
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
          {(['critical', 'high', 'medium', 'low'] as TodoPriority[]).map(p => (
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

function AddBar({ onAdd }: { onAdd: (desc: string, pri: TodoPriority, tags?: string[]) => void }) {
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<TodoPriority>('medium')
  const [tagsText, setTagsText] = useState('')
  const [showTags, setShowTags] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    const tags = tagsText.trim()
      ? tagsText.split(',').map(t => t.trim()).filter(Boolean)
      : undefined
    onAdd(trimmed, priority, tags)
    setText('')
    setTagsText('')
    inputRef.current?.focus()
  }

  return (
    <div className="space-y-2">
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
        <button
          onClick={() => setShowTags(o => !o)}
          className={`font-mono text-micro px-2 py-1 rounded-md transition-colors
            ${showTags ? 'bg-ax-brand-subtle text-ax-brand' : 'text-ax-text-ghost hover:text-ax-text-secondary'}`}
        >
          tags
        </button>
        <PriorityPicker value={priority} onChange={setPriority} />
      </div>
      {showTags && (
        <input
          value={tagsText}
          onChange={e => setTagsText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="Tags (comma-separated, e.g. cli, desktop)"
          className="w-full bg-ax-sunken border border-ax-border-subtle rounded-lg px-4 py-2
            text-small text-ax-text-secondary placeholder:text-ax-text-ghost outline-none
            focus:border-ax-brand-primary/40"
        />
      )}
    </div>
  )
}

// ─── Edit Modal ─────────────────────────────────────────────────

function EditModal({ item, onSave, onClose }: {
  item: TodoItem
  onSave: (id: number, action: string, extra: Record<string, unknown>) => void
  onClose: () => void
}) {
  const [desc, setDesc] = useState(item.description)
  const [priority, setPriority] = useState<TodoPriority>(item.priority)
  const [tagsText, setTagsText] = useState((item.tags || []).join(', '))
  const [notes, setNotes] = useState(item.notes || '')
  const backdropRef = useRef<HTMLDivElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (notesRef.current) {
      notesRef.current.style.height = 'auto'
      notesRef.current.style.height = notesRef.current.scrollHeight + 'px'
    }
  }, [notes])

  const save = () => {
    const tags = tagsText.trim()
      ? tagsText.split(',').map(t => t.trim()).filter(Boolean)
      : []
    onSave(item.id, 'edit', {
      description: desc.trim(),
      priority,
      tags,
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  return (
    <div
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
    >
      <div className="bg-ax-elevated border border-ax-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <span className="font-mono text-micro text-ax-text-ghost">Edit #{item.id}</span>
          <button onClick={onClose} className="p-1 rounded-md text-ax-text-ghost hover:text-ax-text-secondary hover:bg-ax-sunken transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Description */}
          <div>
            <label className="block font-mono text-micro text-ax-text-tertiary uppercase tracking-wider mb-1.5">Description</label>
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) save() }}
              className="w-full bg-ax-sunken border border-ax-border-subtle rounded-lg px-3 py-2
                text-body text-ax-text-primary outline-none focus:border-ax-brand-primary/40"
              autoFocus
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block font-mono text-micro text-ax-text-tertiary uppercase tracking-wider mb-1.5">Priority</label>
            <div className="flex gap-1.5">
              {(['critical', 'high', 'medium', 'low'] as TodoPriority[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-small transition-all
                    ${p === priority
                      ? 'bg-ax-brand-subtle text-ax-text-primary border border-ax-brand-primary/30'
                      : 'text-ax-text-tertiary hover:bg-ax-sunken border border-transparent'
                    }`}
                >
                  <PriorityDot priority={p} size={6} />
                  <span className="capitalize">{p}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block font-mono text-micro text-ax-text-tertiary uppercase tracking-wider mb-1.5">Tags</label>
            <input
              value={tagsText}
              onChange={e => setTagsText(e.target.value)}
              placeholder="cli, desktop, data-pipeline"
              className="w-full bg-ax-sunken border border-ax-border-subtle rounded-lg px-3 py-2
                text-small text-ax-text-secondary placeholder:text-ax-text-ghost outline-none
                focus:border-ax-brand-primary/40"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block font-mono text-micro text-ax-text-tertiary uppercase tracking-wider mb-1.5">Notes</label>
            <textarea
              ref={notesRef}
              value={notes}
              onChange={e => {
                setNotes(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
              placeholder="Additional detail..."
              className="w-full bg-ax-sunken border border-ax-border-subtle rounded-lg px-3 py-2
                text-small text-ax-text-secondary placeholder:text-ax-text-ghost outline-none
                focus:border-ax-brand-primary/40 resize-none"
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-small text-ax-text-secondary hover:bg-ax-sunken transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="px-4 py-2 rounded-lg text-small font-medium bg-ax-brand text-white hover:bg-ax-brand/90 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
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
  onUpdate: (id: number, action: string, extra?: Record<string, unknown>) => void
}) {
  const [showDispatch, setShowDispatch] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const age = daysAgo(item.created)
  const isStale = age > 3 && item.status === 'active'
  const isCompleted = item.status === 'completed'
  const isInactive = item.status === 'deferred' || item.status === 'dropped'

  const borderColor = PRIORITY_BORDER[item.priority]
  const bgColor = isStale
    ? 'bg-ax-elevated'
    : (isCompleted || isInactive) ? 'bg-ax-elevated' : PRIORITY_BG[item.priority]

  return (
    <>
      <div
        className={`group relative flex items-start gap-3 px-4 py-3 rounded-xl border-l-[3px] transition-all duration-200
          ${borderColor}
          ${bgColor}
          ${isStale ? 'border border-[var(--ax-brand-primary)]/20 shadow-[0_0_12px_-4px_var(--ax-brand-primary)]' : 'border-r border-t border-b border-ax-border'}
          ${isCompleted || isInactive ? 'opacity-60' : ''}
          hover:shadow-md`}
        onMouseLeave={() => setShowDispatch(false)}
      >
        {/* Checkbox */}
        <button
          role="checkbox"
          aria-checked={isCompleted}
          aria-label={`Mark "${item.description.slice(0, 40)}" as ${isCompleted ? 'incomplete' : 'complete'}`}
          onClick={() => {
            if (item.status === 'active') onUpdate(item.id, 'complete')
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-micro text-ax-text-ghost">#{item.id}</span>
            <PriorityDot priority={item.priority} size={6} />
            {isStale && (
              <span className="font-mono text-micro text-ax-brand px-1.5 py-0.5 rounded bg-ax-brand-subtle">stale</span>
            )}
            {item.tags && item.tags.map(tag => (
              <span key={tag} className="font-mono text-micro bg-ax-brand-subtle text-ax-brand px-1.5 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
          <p
            className={`text-body font-medium mt-0.5 ${isCompleted ? 'line-through text-ax-text-tertiary' : 'text-ax-text-primary'}`}
          >
            {item.description}
          </p>

          {/* Notes preview — collapsed: 2-line fade, click to expand */}
          {item.notes && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="relative mt-1 w-full text-left cursor-pointer"
            >
              {expanded ? (
                <div className="text-small text-ax-text-secondary whitespace-pre-wrap leading-relaxed">
                  {item.notes}
                </div>
              ) : (
                <>
                  <div className="text-small text-ax-text-tertiary whitespace-pre-wrap leading-relaxed overflow-hidden"
                    style={{ maxHeight: '2.8em' }}>
                    {item.notes}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-5 pointer-events-none"
                    style={{ background: `linear-gradient(to top, var(--ax-elevated, #fff), transparent)` }} />
                </>
              )}
            </button>
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

        {/* Hover actions */}
        {item.status === 'active' && (
          <div className="absolute right-3 top-2.5 flex items-center gap-0.5
            opacity-0 group-hover:opacity-100 touch-visible transition-opacity duration-150
            bg-ax-elevated/90 backdrop-blur-sm rounded-lg p-0.5 border border-ax-border-subtle shadow-sm">
            <button
              onClick={() => setEditing(true)}
              title="Edit"
              className="p-1.5 rounded-md text-ax-text-ghost hover:text-ax-text-primary hover:bg-ax-sunken transition-colors"
            >
              <Pencil size={13} />
            </button>
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
            {item.priority !== 'critical' && (
              <button
                onClick={() => {
                  const up: Record<string, string> = { low: 'medium', medium: 'high', high: 'critical' }
                  onUpdate(item.id, 'reprioritise', { priority: up[item.priority] })
                }}
                title="Increase priority"
                className="p-1.5 rounded-md text-ax-text-ghost hover:text-ax-brand hover:bg-ax-sunken transition-colors"
              >
                <ArrowUp size={13} />
              </button>
            )}
            {item.priority !== 'low' && (
              <button
                onClick={() => {
                  const down: Record<string, string> = { critical: 'high', high: 'medium', medium: 'low' }
                  onUpdate(item.id, 'reprioritise', { priority: down[item.priority] })
                }}
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

        {/* Reactivate for completed/deferred/dropped */}
        {(isCompleted || isInactive) && (
          <div className="absolute right-3 top-2.5 opacity-0 group-hover:opacity-100 touch-visible transition-opacity duration-150">
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

      {/* Edit modal */}
      {editing && <EditModal item={item} onSave={onUpdate} onClose={() => setEditing(false)} />}
    </>
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
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [activePriority, setActivePriority] = useState<TodoPriority | null>(null)
  const { items, loading, addTodo, updateTodo } = useTodos(activeProject)

  // Collect all unique tags across all items
  const allTags = [...new Set(items.flatMap(i => i.tags || []))].sort()

  // Apply filters
  let filtered = items
  if (activeTag) filtered = filtered.filter(i => i.tags?.includes(activeTag))
  if (activePriority) filtered = filtered.filter(i => i.priority === activePriority)

  // Filtered items per mode
  const nowItems = sortByPriority(filtered.filter(i => i.status === 'active'))
  const backlogItems = filtered.filter(i => i.status === 'deferred')
  const doneItems = [
    ...filtered.filter(i => i.status === 'completed'),
    ...filtered.filter(i => i.status === 'dropped'),
  ]

  const modeItems: Record<ViewMode, TodoItem[]> = {
    now: nowItems,
    backlog: backlogItems,
    done: doneItems,
  }

  const currentItems = modeItems[mode]

  // Priority counts (for filter pills)
  const priCounts: Record<TodoPriority, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const i of items.filter(i => i.status === 'active')) priCounts[i.priority]++

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

      {/* Filter bar — priority + tags */}
      <div className="flex items-center gap-3 mb-4 flex-wrap justify-center">
        {/* Priority filters */}
        <div className="flex items-center gap-1">
          {(['critical', 'high', 'medium', 'low'] as TodoPriority[]).map(p => {
            if (priCounts[p] === 0 && activePriority !== p) return null
            return (
              <button
                key={p}
                onClick={() => setActivePriority(ap => ap === p ? null : p)}
                className={`flex items-center gap-1 font-mono text-micro px-2 py-0.5 rounded-full transition-colors
                  ${activePriority === p
                    ? 'bg-ax-text-primary text-white'
                    : 'text-ax-text-tertiary hover:text-ax-text-secondary hover:bg-ax-sunken'
                  }`}
              >
                <PriorityDot priority={p} size={5} />
                <span className="capitalize">{p}</span>
                <span className="opacity-50">{priCounts[p]}</span>
              </button>
            )
          })}
        </div>

        {/* Divider */}
        {allTags.length > 0 && (
          <div className="w-px h-4 bg-ax-border-subtle" />
        )}

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {(activeTag || activePriority) && (
              <button
                onClick={() => { setActiveTag(null); setActivePriority(null) }}
                className="font-mono text-micro px-2 py-0.5 rounded-full
                  bg-ax-sunken text-ax-text-ghost hover:text-ax-text-secondary transition-colors"
              >
                <X size={10} className="inline mr-0.5" />clear
              </button>
            )}
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTag(t => t === tag ? null : tag)}
                className={`font-mono text-micro px-2 py-0.5 rounded-full transition-colors
                  ${activeTag === tag
                    ? 'bg-ax-brand text-white'
                    : 'bg-ax-brand-subtle text-ax-brand hover:bg-ax-brand/20'
                  }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
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
