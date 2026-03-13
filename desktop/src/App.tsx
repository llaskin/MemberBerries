import { type ReactNode, useState, useEffect, useRef } from 'react'
import { Coffee, Brain, Clock } from 'lucide-react'
import { DataProvider } from '@/providers/DataProvider'
import { Shell } from '@/components/layout/Shell'
import { TimelineView } from '@/views/TimelineView'
import { RollupDetailView } from '@/views/RollupDetailView'
import { StateView } from '@/views/StateView'
import { SettingsView } from '@/views/SettingsView'
import { DecisionsView } from '@/views/DecisionsView'
import { MorningView } from '@/views/MorningView'
import { OnboardingView } from '@/views/OnboardingView'
import { AgentView } from '@/views/AgentView'
import { SessionsView } from '@/views/SessionsView'
import { useUIStore, type ViewId } from '@/store/uiStore'

/* ── Carousel pane — lazy-mounted, slides horizontally ────────── */

// The three main "desktops" live in a horizontal strip and slide
// between each other. Going Timeline→Morning visually passes
// through Agents. Each pane stays mounted once visited (XTerm
// instances, scroll positions, and WebSocket data survive).

const CAROUSEL: ViewId[] = ['morning', 'agents', 'timeline']

function CarouselPane({
  viewId, active, offsetPercent, children,
}: {
  viewId: string
  active: boolean
  offsetPercent: number
  children: ReactNode
}) {
  const [everActive, setEverActive] = useState(false)
  useEffect(() => {
    if (active && !everActive) setEverActive(true)
  }, [active, everActive])

  if (!everActive) return null

  const fullBleed = viewId === 'agents'

  return (
    <div
      className="absolute inset-0"
      style={{
        transform: `translateX(${offsetPercent}%)`,
        transition: 'transform 300ms ease-out',
      }}
    >
      <div className={fullBleed ? 'h-full' : 'max-w-3xl mx-auto px-8 py-10 overflow-y-auto h-full'}>
        {children}
      </div>
    </div>
  )
}

/* ── Persistent overlay — stays mounted once activated ────────── */

// Used for views that need terminal persistence but aren't part
// of the main carousel (e.g. dedicated Terminal view).

function PersistentView({
  active, fullBleed, swipeDir, children,
}: {
  active: boolean
  fullBleed?: boolean
  swipeDir: 'left' | 'right' | 'none'
  children: ReactNode
}) {
  const [everActive, setEverActive] = useState(false)
  const [animClass, setAnimClass] = useState('')

  useEffect(() => {
    if (active && !everActive) setEverActive(true)
    if (active) {
      setAnimClass(
        swipeDir === 'right' ? 'animate-slide-right'
        : swipeDir === 'left' ? 'animate-slide-left'
        : 'animate-fade-in'
      )
      const t = setTimeout(() => setAnimClass(''), 300)
      return () => clearTimeout(t)
    }
  }, [active, swipeDir])

  if (!everActive) return null

  return (
    <div
      className={`${active ? '' : 'hidden'} ${animClass}`}
      style={{ height: '100%' }}
    >
      <div className={fullBleed ? 'h-full' : 'max-w-3xl mx-auto px-8 py-10 overflow-y-auto h-full'}>
        {children}
      </div>
    </div>
  )
}

/* ── Carousel navigation pills ────────────────────────────────── */

const CAROUSEL_NAV = [
  { id: 'morning' as ViewId, label: 'Morning', Icon: Coffee },
  { id: 'agents' as ViewId, label: 'Agents', Icon: Brain },
  { id: 'timeline' as ViewId, label: 'Timeline', Icon: Clock },
]

function CarouselNav({ activeView }: { activeView: ViewId }) {
  const setView = useUIStore(s => s.setView)

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5
      bg-ax-elevated/80 backdrop-blur-sm border border-ax-border-subtle rounded-full px-1 py-0.5
      shadow-sm"
    >
      {CAROUSEL_NAV.map(({ id, label, Icon }) => {
        const isActive = activeView === id
        return (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all duration-200
              font-mono text-[10px] uppercase tracking-wider
              ${isActive
                ? 'bg-ax-brand/10 text-ax-brand-primary'
                : 'text-ax-text-ghost hover:text-ax-text-secondary hover:bg-ax-sunken/50'
              }`}
            aria-label={label}
          >
            <Icon size={11} strokeWidth={isActive ? 2.5 : 1.5} />
            <span className={isActive ? 'max-w-20 opacity-100' : 'max-w-0 opacity-0 overflow-hidden'}
              style={{ transition: 'max-width 200ms ease-out, opacity 200ms ease-out' }}
            >
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ── View router ─────────────────────────────────────────────── */

function ViewRouter() {
  const activeView = useUIStore(s => s.activeView)
  const swipeDir = useUIStore(s => s.viewSwipeDirection)

  // Carousel index tracking
  const carouselIdx = CAROUSEL.indexOf(activeView)
  const isCarousel = carouselIdx >= 0
  const lastIdxRef = useRef(carouselIdx >= 0 ? carouselIdx : 1)
  if (carouselIdx >= 0) lastIdxRef.current = carouselIdx
  const currentIdx = isCarousel ? carouselIdx : lastIdxRef.current

  // Re-fit terminals after carousel slide completes (300ms transition)
  useEffect(() => {
    if (!isCarousel) return
    const t = setTimeout(() => window.dispatchEvent(new Event('terminal-refit')), 320)
    return () => clearTimeout(t)
  }, [currentIdx, isCarousel])

  return (
    <>
      {/* Desktop carousel — Morning | Agents | Timeline */}
      <div className={`relative h-full overflow-hidden ${!isCarousel ? 'hidden' : ''}`}>
        <CarouselNav activeView={activeView} />
        {CAROUSEL.map((viewId, i) => (
          <CarouselPane
            key={viewId}
            viewId={viewId}
            active={activeView === viewId}
            offsetPercent={(i - currentIdx) * 100}
          >
            {viewId === 'morning' && <MorningView />}
            {viewId === 'agents' && <SessionsView />}
            {viewId === 'timeline' && <TimelineView />}
          </CarouselPane>
        ))}
      </div>

      {/* Terminal — persistent overlay (stays mounted once visited) */}
      <PersistentView active={activeView === 'terminal'} fullBleed swipeDir={swipeDir}>
        <AgentView />
      </PersistentView>

      {/* Non-persistent, non-carousel views — standard mount/unmount */}
      {!isCarousel && activeView !== 'terminal' && (
        <div className={`max-w-3xl mx-auto px-8 py-10 overflow-y-auto h-full ${
          swipeDir === 'right' ? 'animate-slide-right'
          : swipeDir === 'left' ? 'animate-slide-left'
          : 'animate-fade-in'
        }`}>
          {activeView === 'rollup-detail' && <RollupDetailView />}
          {activeView === 'state' && <StateView />}
          {activeView === 'decisions' && <DecisionsView />}
          {activeView === 'settings' && <SettingsView />}
          {activeView === 'onboarding' && <OnboardingView />}
        </div>
      )}
    </>
  )
}

export default function App() {
  return (
    <DataProvider>
      <Shell>
        <ViewRouter />
      </Shell>
    </DataProvider>
  )
}
