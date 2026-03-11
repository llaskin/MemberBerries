import { useState, useRef, useEffect, useMemo } from 'react'
import { Bug } from 'lucide-react'
import { useDebugStore } from '@/store/debugStore'

export function DebugMenu() {
  if (!import.meta.env.DEV) return null

  const actionsMap = useDebugStore((s) => s.actions)
  const actions = useMemo(() => Array.from(actionsMap.values()), [actionsMap])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <div ref={ref} className="fixed top-4 right-4 z-50">
      <button
        onClick={() => setOpen(!open)}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150
          ${open || actions.some(a => a.active)
            ? 'bg-ax-brand/20 text-ax-brand border border-ax-brand/30'
            : 'bg-ax-elevated/80 text-ax-text-ghost hover:text-ax-text-tertiary border border-ax-border-subtle hover:border-ax-border'
          }
          backdrop-blur-sm shadow-sm`}
        aria-label="Debug menu"
      >
        <Bug size={14} strokeWidth={1.5} />
      </button>

      {open && (
        <div className="absolute top-10 right-0 w-56 bg-ax-elevated border border-ax-border rounded-xl shadow-lg overflow-hidden animate-fade-in">
          <div className="px-3 py-2 border-b border-ax-border-subtle">
            <span className="font-mono text-micro uppercase tracking-widest text-ax-text-ghost">Debug</span>
          </div>
          {actions.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-small text-ax-text-ghost">No debug actions for this view</p>
            </div>
          ) : (
            <div className="py-1">
              {actions.map((action) => (
                <button
                  key={action.id}
                  onClick={action.toggle}
                  className="w-full text-left px-3 py-2 flex items-center justify-between
                    text-small text-ax-text-secondary hover:bg-ax-sunken transition-colors"
                >
                  <span>{action.label}</span>
                  <span className={`w-2 h-2 rounded-full transition-colors ${
                    action.active ? 'bg-ax-brand' : 'bg-ax-border'
                  }`} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
