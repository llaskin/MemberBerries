import type { AgentAdapter, AgentId, AgentInfo } from './types'

const adapters = new Map<AgentId, AgentAdapter>()

export function registerAdapter(adapter: AgentAdapter): void {
  adapters.set(adapter.info.id, adapter)
}

export function getAdapter(id: AgentId): AgentAdapter | undefined {
  return adapters.get(id)
}

export function getInstalledAgents(): AgentInfo[] {
  return Array.from(adapters.values())
    .filter(a => a.isInstalled())
    .map(a => a.info)
}

export function getAllAdapters(): AgentAdapter[] {
  return Array.from(adapters.values())
}
