import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Project, DiscoveredRepo } from '@/lib/types'

export interface Backend {
  getProjects(): Promise<Project[]>
  discoverRepos(): Promise<DiscoveredRepo[]>
  initQuick(name: string, path: string): Promise<{ name: string; status: string }>
  getRollups(project: string): Promise<Array<{ filename: string; content: string }>>
  getMornings(project: string): Promise<Array<{ filename: string; content: string }>>
  getState(project: string): Promise<string>
  getConfig(project: string): Promise<string>
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
      if (!res.ok) throw new Error(`Failed to load projects (${res.status})`)
      return res.json()
    },
    async discoverRepos() {
      const res = await fetch('/api/axon/discover-repos')
      if (!res.ok) throw new Error(`Failed to discover repos (${res.status})`)
      return res.json()
    },
    async initQuick(name: string, path: string) {
      const res = await fetch('/api/axon/init-quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: name, projectPath: path }),
      })
      if (!res.ok) throw new Error(`Failed to init project (${res.status})`)
      return res.json()
    },
    async getRollups(project: string) {
      const res = await fetch(`/api/axon/projects/${encodeURIComponent(project)}/rollups`)
      if (!res.ok) throw new Error(`Failed to load rollups (${res.status})`)
      return res.json()
    },
    async getMornings(project: string) {
      const res = await fetch(`/api/axon/projects/${encodeURIComponent(project)}/mornings`)
      if (!res.ok) return []
      return res.json()
    },
    async getState(project: string) {
      const res = await fetch(`/api/axon/projects/${encodeURIComponent(project)}/state`)
      const data = await res.json()
      return data.content || ''
    },
    async getConfig(project: string) {
      const res = await fetch(`/api/axon/projects/${encodeURIComponent(project)}/config`)
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

// Singleton backend
let backend: Backend | null = null

function getBackend(): Promise<Backend> {
  if (!backend) backend = createFetchBackend()
  return Promise.resolve(backend)
}

export function DataProvider({ children }: { children: ReactNode }) {
  // Use fetch backend synchronously for initial render, upgrade to Tauri when available
  const backend = useMemo(() => {
    // Create a proxy that lazily resolves the real backend
    const proxy: Backend = {
      getProjects: () => getBackend().then(b => b.getProjects()),
      discoverRepos: () => getBackend().then(b => b.discoverRepos()),
      initQuick: (n, p) => getBackend().then(b => b.initQuick(n, p)),
      getRollups: (p) => getBackend().then(b => b.getRollups(p)),
      getMornings: (p) => getBackend().then(b => b.getMornings(p)),
      getState: (p) => getBackend().then(b => b.getState(p)),
      getConfig: (p) => getBackend().then(b => b.getConfig(p)),
      getStream: (p) => getBackend().then(b => b.getStream(p)),
    }
    return proxy
  }, [])

  return (
    <BackendContext.Provider value={backend}>
      {children}
    </BackendContext.Provider>
  )
}
