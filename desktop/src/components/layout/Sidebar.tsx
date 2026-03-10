import { useProjects } from '@/hooks/useProjects'
import { useUIStore, type ViewId } from '@/store/uiStore'
import { Layers, Clock, Brain, Settings, Search, Sun, Moon } from 'lucide-react'

const navItems: { id: ViewId; label: string; icon: typeof Clock }[] = [
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { id: 'state', label: 'State', icon: Layers },
  { id: 'decisions', label: 'Decisions', icon: Brain },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const { projects, activeProject, setActiveProject } = useProjects()
  const { activeView, setView, theme, toggleTheme } = useUIStore()
  const today = new Date().toISOString().split('T')[0]

  return (
    <aside className="w-64 h-screen bg-ax-sidebar flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-5 py-6">
        <h1
          className="font-serif italic text-h2 text-[var(--ax-text-on-dark)] tracking-tight cursor-pointer"
          onClick={() => setView('timeline')}
        >
          axon
        </h1>
      </div>

      {/* Project Switcher */}
      <div className="px-3 mb-4">
        <div className="text-micro font-mono uppercase tracking-widest text-[var(--ax-text-on-dark-muted)] px-2 mb-2">
          Projects
        </div>
        {projects.map((p) => {
          const isToday = p.lastRollup === today
          return (
            <button
              key={p.name}
              onClick={() => setActiveProject(p.name)}
              className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 flex items-center gap-3 transition-all duration-150
                ${activeProject === p.name
                  ? 'bg-white/10 text-[var(--ax-text-on-dark)] border-l-2 border-l-[var(--ax-brand-primary)]'
                  : 'text-[var(--ax-text-on-dark-muted)] hover:bg-white/5 hover:text-[var(--ax-text-on-dark)] border-l-2 border-l-transparent'
                }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                p.status === 'active' ? 'bg-ax-accent' :
                p.status === 'paused' ? 'bg-ax-warning' : 'bg-ax-text-tertiary'
              } ${isToday ? 'animate-pulse-dot' : ''}`} />
              <span className="font-mono text-small truncate">{p.name}</span>
              {p.openLoopCount > 0 && (
                <span className="ml-auto font-mono text-micro bg-white/10 px-1.5 py-0.5 rounded">
                  {p.openLoopCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Navigation */}
      <nav className="px-3 flex-1">
        <div className="text-micro font-mono uppercase tracking-widest text-[var(--ax-text-on-dark-muted)] px-2 mb-2">
          Views
        </div>
        {navItems.map((item) => {
          const isActive = activeView === item.id || (item.id === 'timeline' && activeView === 'rollup-detail')
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`w-full text-left px-3 py-2 rounded-lg mb-1 flex items-center gap-3
                transition-all duration-150
                ${isActive
                  ? 'bg-white/10 text-[var(--ax-text-on-dark)] border-l-2 border-l-[var(--ax-brand-primary)]'
                  : 'text-[var(--ax-text-on-dark-muted)] hover:bg-white/5 hover:text-[var(--ax-text-on-dark)] border-l-2 border-l-transparent'
                }`}
            >
              <item.icon size={16} strokeWidth={1.5} />
              <span className="text-small">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Footer: Search + Theme Toggle */}
      <div className="px-3 pb-5 space-y-1">
        <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg
          text-[var(--ax-text-on-dark-muted)] hover:bg-white/5 transition-colors text-small">
          <Search size={14} strokeWidth={1.5} />
          <span>Search</span>
          <span className="ml-auto font-mono text-micro opacity-40">&#x2318;K</span>
        </button>
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg
            text-[var(--ax-text-on-dark-muted)] hover:bg-white/5 transition-colors text-small"
        >
          {theme === 'light' ? (
            <Moon size={14} strokeWidth={1.5} />
          ) : (
            <Sun size={14} strokeWidth={1.5} />
          )}
          <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
        </button>
      </div>
    </aside>
  )
}
