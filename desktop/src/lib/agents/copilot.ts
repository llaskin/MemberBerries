import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { AgentAdapter, AgentSession } from './types'
import { AGENTS } from './types'

/**
 * Copilot adapter — reads ~/.copilot/command-history-state.json.
 * Extremely limited: flat array of prompt strings, no timestamps,
 * no session IDs, no model info, no token counts.
 * Creates a single synthetic session from the file's mtime.
 */
export const copilotAdapter: AgentAdapter = {
  info: AGENTS.copilot,

  isInstalled(): boolean {
    return existsSync(join(homedir(), '.copilot'))
  },

  discoverSessions(): AgentSession[] {
    const historyPath = join(homedir(), '.copilot', 'command-history-state.json')
    if (!existsSync(historyPath)) return []

    try {
      const raw = JSON.parse(readFileSync(historyPath, 'utf-8'))
      const history: string[] = raw.commandHistory || []
      if (history.length === 0) return []

      const stat = statSync(historyPath)
      const mtime = stat.mtime.toISOString()

      // Estimate tokens from prompt text length (~4 chars per token)
      // These are rough estimates — Copilot doesn't report actual token usage
      const estimatedInputTokens = history.reduce((sum, prompt) => sum + Math.ceil(prompt.length / 4), 0)
      // Assume output is roughly 2x input for code generation
      const estimatedOutputTokens = estimatedInputTokens * 2
      const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens

      return [{
        id: 'copilot:history',
        agent: 'copilot' as const,
        model: 'estimated*',
        firstPrompt: history[0] || null,
        summary: `${history.length} CLI command${history.length !== 1 ? 's' : ''} (tokens estimated*)`,
        heuristicSummary: `${history.length} CLI command${history.length !== 1 ? 's' : ''} (tokens estimated*)`,
        messageCount: history.length,
        toolCallCount: 0,
        estimatedInputTokens,
        estimatedOutputTokens,
        estimatedTotalTokens,
        createdAt: null,
        modifiedAt: mtime,
        projectPath: null,
        projectName: null,
        gitBranch: null,
        heatstripJson: null,
        toolCallsJson: null,
        gitCommandsJson: null,
        bashCommands: 0,
        errors: 0,
      }]
    } catch {
      return []
    }
  },
}
