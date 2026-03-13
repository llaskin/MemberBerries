import { useEffect } from 'react'
import { useUIStore, type ViewId } from '@/store/uiStore'
import { useProjectStore } from '@/store/projectStore'

const CAROUSEL: ViewId[] = ['morning', 'agents', 'timeline']

/**
 * Global keyboard shortcuts:
 * - Cmd+Left/Right: slide between carousel desktops
 * - Cmd+Up/Down: switch projects (vertical)
 * - Cmd+K: toggle command palette
 * - Cmd+1-5: switch views
 */
export function useKeyboardShortcuts(onTogglePalette: () => void) {
  const setView = useUIStore((s) => s.setView)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // Cmd+K: command palette
      if (meta && e.key === 'k') {
        e.preventDefault()
        onTogglePalette()
        return
      }

      // Cmd+Left/Right: slide carousel desktops
      if (meta && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        const active = useUIStore.getState().activeView
        const idx = CAROUSEL.indexOf(active)
        if (idx < 0) return // not on a carousel view
        const next = e.key === 'ArrowLeft' ? idx - 1 : idx + 1
        if (next >= 0 && next < CAROUSEL.length) setView(CAROUSEL[next])
        return
      }

      // Cmd+Up/Down: switch projects (vertical navigation)
      if (meta && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        const { projects, activeProject } = useProjectStore.getState()
        const activeProjects = projects.filter(p => p.status === 'active')
        if (activeProjects.length < 2) return
        const currentIdx = activeProjects.findIndex(p => p.name === activeProject)
        if (currentIdx === -1) return
        const nextIdx = e.key === 'ArrowDown'
          ? (currentIdx + 1) % activeProjects.length
          : (currentIdx - 1 + activeProjects.length) % activeProjects.length
        useProjectStore.getState().setActiveProject(activeProjects[nextIdx].name)
        return
      }

      // Cmd+1-5: switch views
      if (meta && e.key >= '1' && e.key <= '5') {
        e.preventDefault()
        const views: ViewId[] = ['morning', 'agents', 'timeline', 'terminal', 'settings']
        const idx = parseInt(e.key) - 1
        if (views[idx]) setView(views[idx])
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setView, onTogglePalette])
}
