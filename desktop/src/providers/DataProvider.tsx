import { createContext, useContext, type ReactNode } from 'react'
import type { Project } from '@/lib/types'

export interface Backend {
  getProjects(): Promise<Project[]>
  getState(project: string): Promise<string>
  getStream(project: string): Promise<string>
}

const BackendContext = createContext<Backend | null>(null)

export function useBackend(): Backend {
  const ctx = useContext(BackendContext)
  if (!ctx) throw new Error('useBackend must be used within DataProvider')
  return ctx
}

function createFetchBackend(): Backend {
  return {
    async getProjects() {
      const res = await fetch('/api/axon/projects')
      return res.json()
    },
    async getState(project: string) {
      const res = await fetch(`/api/axon/projects/${encodeURIComponent(project)}/state`)
      const data = await res.json()
      return data.content || ''
    },
    async getStream(project: string) {
      const res = await fetch(`/api/axon/projects/${encodeURIComponent(project)}/stream`)
      const data = await res.json()
      return data.content || ''
    },
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const backend = createFetchBackend()
  return (
    <BackendContext.Provider value={backend}>
      {children}
    </BackendContext.Provider>
  )
}
