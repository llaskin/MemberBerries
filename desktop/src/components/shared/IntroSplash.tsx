import { useState, useCallback } from 'react'

const STORAGE_KEY = 'mb-intro-seen'
const FADE_DURATION_MS = 800

export function IntroSplash() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY))
  const [fading, setFading] = useState(false)

  const dismiss = useCallback(() => {
    setFading(true)
    localStorage.setItem(STORAGE_KEY, '1')
    setTimeout(() => setVisible(false), FADE_DURATION_MS)
  }, [])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#1a1025]"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_DURATION_MS}ms ease-in-out`,
      }}
    >
      <img
        src="/memberberries-icon.png"
        alt="MemberBerries"
        className="w-32 h-32 mb-6 animate-fade-in-up"
      />
      <h1 className="font-serif italic text-4xl text-white mb-2 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
        MemberBerries
      </h1>
      <p className="text-white/50 font-mono text-small mb-10 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
        Remember your sessions
      </p>
      <button
        onClick={dismiss}
        className="px-8 py-3 rounded-lg font-mono text-body
          bg-purple-600 text-white hover:bg-purple-500 transition-colors
          shadow-lg animate-fade-in-up"
        style={{ animationDelay: '600ms' }}
      >
        Get Started
      </button>
    </div>
  )
}
