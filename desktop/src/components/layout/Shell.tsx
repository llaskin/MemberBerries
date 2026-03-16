import { type ReactNode, useState, useCallback, useEffect, useRef } from 'react'
import { Sidebar } from './Sidebar'
import { NeuralBackground } from '@/components/shared/NeuralBackground'
import { CommandPalette } from '@/components/shared/CommandPalette'
import { useThemeSync } from '@/hooks/useThemeSync'
import { useDataRefresh } from '@/hooks/useDataRefresh'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useProjectStore } from '@/store/projectStore'
import { DebugMenu } from '@/components/shared/DebugMenu'

export function Shell({ children }: { children: ReactNode }) {
  useThemeSync()
  useDataRefresh()

  const [paletteOpen, setPaletteOpen] = useState(false)
  const togglePalette = useCallback(() => setPaletteOpen(o => !o), [])
  useKeyboardShortcuts(togglePalette)

  const activeProject = useProjectStore(s => s.activeProject)
  const swipeDirection = useProjectStore(s => s.swipeDirection)
  const [animClass, setAnimClass] = useState('')
  const prevProjectRef = useRef(activeProject)

  useEffect(() => {
    if (activeProject !== prevProjectRef.current && swipeDirection) {
      // Enter animation: slide in from the direction we're going
      setAnimClass(
        swipeDirection === 'down' ? 'animate-slide-up-in' :
        swipeDirection === 'up' ? 'animate-slide-down-in' : ''
      )
      const t = setTimeout(() => setAnimClass(''), 450)
      prevProjectRef.current = activeProject
      return () => clearTimeout(t)
    }
    prevProjectRef.current = activeProject
  }, [activeProject, swipeDirection])

  return (
    <div className="flex h-screen overflow-hidden">
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <Sidebar onOpenPalette={togglePalette} />
      <main className="flex-1 bg-ax-base relative h-full overflow-hidden" role="main" aria-label="Main content" id="main-content">
        {/* Drag region for Electron title bar — spans main content top.
            pointer-events:none lets clicks pass through in browser; Electron's
            -webkit-app-region:drag still captures window drags regardless. */}
        <div className="absolute top-0 left-0 right-0 h-8 z-50 pointer-events-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
        <NeuralBackground />
        <DebugMenu />
        <div className={`relative h-full ${animClass}`} key={activeProject || 'none'}>
          {children}
        </div>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
