import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { NeuralBackground } from '@/components/shared/NeuralBackground'
import { useThemeSync } from '@/hooks/useThemeSync'

export function Shell({ children }: { children: ReactNode }) {
  useThemeSync()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-ax-base relative">
        <NeuralBackground />
        <div className="relative max-w-3xl mx-auto px-8 py-10 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
