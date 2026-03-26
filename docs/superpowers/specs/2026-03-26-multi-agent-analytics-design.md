# Multi-Agent Analytics & Unified Session Viewer — Design Spec

**Date:** 2026-03-26
**Approach:** Agent Adapter Pattern
**Status:** Draft

## Overview

Expand Axon from a Claude-only session tracker to a unified multi-agent session viewer supporting Claude Code, Codex, Cursor, and GitHub Copilot. Add an Analytics view with token metrics, agent filter pills, per-agent workspaces with individual rollups, and a unified aggregate rollup.

**Key decisions from brainstorming:**
- Tokens only (no cost estimation)
- Analytics replaces Canvas as the third tab: Day | Sessions | Analytics
- Unified "All Agents" view with interleaved sessions + individual agent filter tabs
- Per-agent workspaces with their own rollups, plus a unified aggregate rollup
- Agent Adapter pattern with common interface and single shared DB

## 1. Agent Adapter Interface & Registry

### Common Interface (`desktop/src/lib/agents/types.ts`)

```typescript
interface AgentAdapter {
  id: string             // 'claude' | 'codex' | 'cursor' | 'copilot'
  name: string           // 'Claude Code' | 'Codex' | 'Cursor' | 'GitHub Copilot'
  color: string          // brand color for charts/badges

  isInstalled(): boolean
  discoverSessions(): AgentSession[]
  getSessionDetail(id: string): AgentSessionDetail | null
}

interface AgentSession {
  id: string
  agent: string
  model: string | null
  firstPrompt: string | null
  summary: string | null
  messageCount: number
  toolCallCount: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  createdAt: string | null
  modifiedAt: string | null
  projectPath: string | null
  projectName: string | null
  gitBranch: string | null
}
```

### Agent Registry (`desktop/src/lib/agents/registry.ts`)

- Holds all registered adapters
- `getInstalledAgents()` — returns adapters where `isInstalled()` is true
- `discoverAllSessions()` — calls each adapter, merges results

### Four Adapters (`desktop/src/lib/agents/`)

| Adapter | Data Source | Token Data | Model Data |
|---------|-----------|-----------|-----------|
| `claude.ts` | `~/.claude/` — wraps existing sessionIndexer + jsonlParser | Yes (estimated from content) | Extractable from JSONL |
| `codex.ts` | `~/.codex/state_5.sqlite` threads table + `history.jsonl` | Yes (`tokens_used` column) | Yes (`model_provider` column) |
| `cursor.ts` | `~/.cursor/ai-tracking/ai-code-tracking.db` | No (tracks AI % only) | Yes (`model` column in tables) |
| `copilot.ts` | `~/.copilot/command-history-state.json` | No | No |

Each adapter:
- Checks for the existence of its data directory in `isInstalled()`
- Reads its native format and normalizes to `AgentSession`
- Handles missing/empty data gracefully (returns empty arrays, not errors)

## 2. Database Migration

Migration V2 adds `agent` and `model` columns to the existing `sessions` table:

```sql
ALTER TABLE sessions ADD COLUMN agent TEXT NOT NULL DEFAULT 'claude';
ALTER TABLE sessions ADD COLUMN model TEXT;
CREATE INDEX idx_sessions_agent ON sessions(agent);
CREATE INDEX idx_sessions_agent_modified ON sessions(agent, modified_at);
```

- Existing Claude rows get `agent='claude'` automatically via DEFAULT
- `model` is nullable — populated where the agent provides it
- No changes to `files_touched` or `session_fts` tables

## 3. Analytics View

Replaces the Canvas tab. Tab bar becomes: **Day | Sessions | Analytics**

### Period Toggle
Filter bar at the top: **Today | This Week | This Month | All Time**

All cards and charts below respect the selected period. Queries filter by `created_at` or `modified_at` within the period range.

### Summary Cards (2x2 grid)

| Card | Value | Subtitle |
|------|-------|---------|
| Avg Tokens / Session | `sum(input+output) / count(sessions)` | "input + output combined" |
| Total Tokens | `sum(input+output)` | "X in / Y out across N sessions" |
| Active Sessions | `count(sessions)` | "across N agents" |
| Active Agents | count of agents with sessions in period | lists agent names |

### Tokens by Agent (horizontal bar chart)
- One bar per installed agent, sorted by total tokens descending
- Agent brand colors: Claude `#D97706`, Codex `#10B981`, Cursor `#6366F1`, Copilot `#8B5CF6`
- Agents without token data show "N/A" instead of 0

### Tokens by Model (horizontal bar chart)
- One bar per unique model string across all agents
- Colored by parent agent's brand color
- Sorted by total tokens descending

### Data Source
All queries run against the `sessions` SQLite table, aggregating `estimated_input_tokens + estimated_output_tokens`, grouped by `agent` or `model` column.

## 4. Unified Session View with Agent Filters

### Tab structure

```
[ Day | Sessions | Analytics ]         ← view mode tabs
[ All | Claude | Codex | Cursor | Copilot ]  ← agent filter pills
```

### Behavior

- **"All"** (default) — all agents interleaved chronologically
- **Individual agent tabs** — filters to that agent only
- Only shows tabs for agents where `isInstalled()` returns true
- Agent filter pills appear in Day and Sessions views (not Analytics — Analytics uses period toggle)
- Existing search, pinned/tagged filters, and detail panels work across agents

### Agent Badge on SessionCard

Small colored dot + agent name in the metadata row, next to the project name badge:
- `● Claude Code` (amber)
- `● Codex` (emerald)
- `● Cursor` (indigo)
- `● Copilot` (violet)

## 5. Per-Agent Workspaces & Rollups

### Workspace Structure

```
~/.axon/workspaces/
├── agent-sessions/        # Unified — aggregates all agents
│   ├── config.yaml
│   ├── state.md
│   ├── episodes/
│   └── dendrites/
├── claude-sessions/       # Per-agent (existing, preserved)
│   ├── config.yaml
│   ├── episodes/
│   └── dendrites/
├── codex-sessions/        # Per-agent (new)
├── cursor-sessions/       # Per-agent (new)
└── copilot-sessions/      # Per-agent (new)
```

### Rollup Mechanics

- Each per-agent workspace has its own dendrite generator using `--agent <id>` flag
- The unified `agent-sessions` workspace uses `--agent all` to include everything
- `sessionDendrite.ts` gains a `--agent` flag to filter the sessions DB query
- Cron schedules are per-workspace in config.yaml (staggerable)
- Per-agent rollup prompts reference that agent's sessions only
- Unified rollup prompt summarizes across all agents, noting which agents contributed what

## 6. Rename & Branding

- App header title: "Sessions" → "Agent Sessions"
- Sidebar label: "Sessions" → "Agent Sessions"
- `claude-sessions` workspace preserved as per-agent workspace
- New `agent-sessions` workspace is the unified default
- `ViewId` stays `'agents'` internally
- Existing Claude data, rollups, and config are preserved

## 7. Deliverables

- [ ] `desktop/src/lib/agents/types.ts` — AgentAdapter interface and AgentSession type
- [ ] `desktop/src/lib/agents/registry.ts` — AgentRegistry with discovery
- [ ] `desktop/src/lib/agents/claude.ts` — Claude adapter (wraps existing indexer)
- [ ] `desktop/src/lib/agents/codex.ts` — Codex adapter (reads state_5.sqlite)
- [ ] `desktop/src/lib/agents/cursor.ts` — Cursor adapter (reads ai-tracking DB)
- [ ] `desktop/src/lib/agents/copilot.ts` — Copilot adapter (reads command-history)
- [ ] DB migration V2: `agent` and `model` columns on sessions table
- [ ] Analytics view component (replaces Canvas tab)
- [ ] Agent filter pills in Day/Sessions views
- [ ] Agent badge on SessionCard
- [ ] `--agent` flag on sessionDendrite.ts
- [ ] Per-agent workspace configs (codex-sessions, cursor-sessions, copilot-sessions)
- [ ] Unified agent-sessions workspace config
- [ ] Rename: header title and sidebar label to "Agent Sessions"
- [ ] Update data flow diagram for multi-agent
