export type AgentId = 'claude' | 'codex' | 'cursor' | 'copilot'

export interface AgentInfo {
  id: AgentId
  name: string
  color: string
  icon: string
}

export const AGENTS: Record<AgentId, AgentInfo> = {
  claude: { id: 'claude', name: 'Claude Code', color: '#D97706', icon: '/agent-claude.png' },
  codex: { id: 'codex', name: 'Codex', color: '#10B981', icon: '/agent-codex.png' },
  cursor: { id: 'cursor', name: 'Cursor', color: '#6366F1', icon: '/agent-cursor.png' },
  copilot: { id: 'copilot', name: 'GitHub Copilot', color: '#8B5CF6', icon: '/agent-copilot.png' },
}

export interface AgentAdapter {
  info: AgentInfo
  isInstalled(): boolean
  discoverSessions(): AgentSession[]
}

export interface AgentSession {
  id: string
  agent: AgentId
  model: string | null
  firstPrompt: string | null
  summary: string | null
  heuristicSummary: string | null
  messageCount: number
  toolCallCount: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  estimatedTotalTokens: number
  createdAt: string | null
  modifiedAt: string | null
  projectPath: string | null
  projectName: string | null
  gitBranch: string | null
  heatstripJson: string | null
  toolCallsJson: string | null
  gitCommandsJson: string | null
  bashCommands: number
  errors: number
}
