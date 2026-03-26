# Multi-Agent Analytics & Unified Session Viewer — Design Spec

**Date:** 2026-03-26
**Approach:** Agent Adapter Pattern
**Status:** Revised (v2 — post spec review)

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
  id: string                          // prefixed: 'codex:uuid', 'cursor:hash' to avoid PK collisions
  agent: string                       // adapter id
  model: string | null
  firstPrompt: string | null
  summary: string | null
  messageCount: number
  toolCallCount: number
  estimatedInputTokens: number        // 0 if unavailable
  estimatedOutputTokens: number       // 0 if unavailable
  estimatedTotalTokens: number        // for agents with only a total (e.g., Codex)
  createdAt: string | null            // ISO 8601 (adapters must convert from native format)
  modifiedAt: string | null           // ISO 8601
  projectPath: string | null
  projectName: string | null
  gitBranch: string | null
  // Fields populated by post-processing (not all adapters provide these):
  heatstripJson: string | null
  toolCallsJson: string | null
  gitCommandsJson: string | null
  heuristicSummary: string | null
  bashCommands: number
  errors: number
}

interface AgentSessionDetail extends AgentSession {
  filesTouched: { file_path: string; operations: string; count: number }[]
}
```

**Token handling:** Agents provide what they have:
- Claude: splits into `estimatedInputTokens` / `estimatedOutputTokens`, `estimatedTotalTokens = input + output`
- Codex: `tokens_used` is a single integer → stored in `estimatedTotalTokens`, input/output both 0
- Cursor/Copilot: all token fields are 0 (no token data available)

Analytics queries use `estimatedTotalTokens` for cross-agent comparisons. The breakdown `input/output` is shown only where available (Claude).

### Agent Registry (`desktop/src/lib/agents/registry.ts`)

- Holds all registered adapters
- `getInstalledAgents()` — returns adapters where `isInstalled()` is true
- `discoverAllSessions()` — calls each adapter, merges results

### Four Adapters (`desktop/src/lib/agents/`)

| Adapter | Data Source | Token Data | Model Data | Session Concept |
|---------|-----------|-----------|-----------|----------------|
| `claude.ts` | `~/.claude/` — wraps existing sessionIndexer + jsonlParser | Yes (input/output estimated from content) | Extractable from JSONL | Real sessions with full transcripts |
| `codex.ts` | `~/.codex/state_5.sqlite` threads table + `history.jsonl` | Yes (`tokens_used` total only) | Yes (`model_provider` column) | Threads with `first_user_message`, `cwd`, `git_branch`, `title` |
| `cursor.ts` | `~/.cursor/ai-tracking/ai-code-tracking.db` | No (tracks AI % only) | Limited (`model` column contains `"default"` currently) | Grouped by `conversationId` from `ai_code_hashes` table; falls back to daily activity summaries if `conversation_summaries` is empty |
| `copilot.ts` | `~/.copilot/command-history-state.json` | No | No | Synthetic: one session per file-modification-date of the JSON file; extremely limited data (prompt text only, no timestamps) |

**Adapter-specific notes:**

**Codex adapter:**
- `created_at`/`updated_at` in threads table are Unix epoch integers — adapter converts to ISO 8601 strings
- Additional useful columns: `first_user_message` → `firstPrompt`, `cwd` → `projectPath`, `git_branch`, `git_sha`, `git_origin_url`, `title` → `summary`, `agent_nickname`, `agent_role`
- `~/.codex/history.jsonl` provides per-prompt timeline (same structure as Claude's history.jsonl: `session_id`, `ts`, `text`)

**Cursor adapter:**
- `conversation_summaries` table may be empty (0 rows on this machine despite 153 code hash entries) — adapter checks both tables
- When `conversation_summaries` is populated: uses `title`, `tldr`, `overview`, `summaryBullets`, `mode`, `model`
- When empty: groups `ai_code_hashes` by `conversationId` into synthetic sessions, with `createdAt` from earliest hash timestamp
- Model column currently contains only `"default"` — shown as-is

**Copilot adapter:**
- `command-history-state.json` is a flat `{"commandHistory": ["prompt1", ...]}` — no timestamps, no session IDs, no model info
- Adapter creates a single synthetic session using the file's mtime as `modifiedAt`
- `messageCount` = length of commandHistory array
- All token fields = 0, model = null
- Extremely limited — included for completeness but provides minimal analytics value

Each adapter:
- Checks for the existence of its data directory in `isInstalled()`
- Reads its native format and normalizes to `AgentSession`
- Handles missing/empty data gracefully (returns empty arrays, not errors)
- Prefixes session IDs with agent name to avoid PK collisions: `claude:{uuid}`, `codex:{uuid}`, `cursor:{conversationId}`, `copilot:history`

## 2. Database Migration

Migration V2 adds `agent`, `model`, and `estimated_total_tokens` columns to the existing `sessions` table:

```sql
ALTER TABLE sessions ADD COLUMN agent TEXT NOT NULL DEFAULT 'claude';
ALTER TABLE sessions ADD COLUMN model TEXT;
ALTER TABLE sessions ADD COLUMN estimated_total_tokens INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_sessions_agent ON sessions(agent);
CREATE INDEX idx_sessions_agent_modified ON sessions(agent, modified_at);
CREATE INDEX idx_sessions_created ON sessions(created_at);
```

- Existing Claude rows get `agent='claude'` automatically via DEFAULT
- `estimated_total_tokens` backfilled as `estimated_input_tokens + estimated_output_tokens` for existing rows
- `model` is nullable — populated where the agent provides it
- New `idx_sessions_created` index supports period toggle queries on `created_at`
- No changes to `files_touched` or `session_fts` tables

**INSERT statement updates:** The existing `INSERT OR REPLACE` in `sessionIndexer.ts` must be updated to include `agent='claude'` explicitly. Consider changing to `INSERT ... ON CONFLICT(id) DO UPDATE` to preserve columns not in the insert statement (prevents overwriting `agent`/`model` during re-indexing).

## 3. Analytics View

Replaces the Canvas view entirely. Canvas-related files are removed: `CanvasView.tsx`, `useCanvasState.ts`, `ZoneTree.tsx`, `zoneReducers.ts`, and related imports in `SessionsView.tsx`. The `SessionsMode` type (`'canvas' | 'list'`) is removed — the view is always list-based.

Tab bar becomes: **Day | Sessions | Analytics**

### Period Toggle
Filter bar at the top: **Today | This Week | This Month | All Time**

All cards and charts below respect the selected period. Queries filter by `created_at` within the period range using `idx_sessions_created` index.

### Summary Cards (2x2 grid)

| Card | Value | Subtitle |
|------|-------|---------|
| Avg Tokens / Session | `sum(estimated_total_tokens) / count(sessions)` | "input + output combined" |
| Total Tokens | `sum(estimated_total_tokens)` | "X in / Y out across N sessions" (where available) |
| Active Sessions | `count(sessions)` | "across N agents" |
| Active Agents | count of distinct `agent` values with sessions in period | lists agent names |

### Tokens by Agent (horizontal bar chart)
- One bar per installed agent, sorted by total tokens descending
- Agent brand colors: Claude `#D97706`, Codex `#10B981`, Cursor `#6366F1`, Copilot `#8B5CF6`
- Agents without token data show "N/A" instead of 0

### Tokens by Model (horizontal bar chart)
- One bar per unique model string across all agents
- Colored by parent agent's brand color
- Sorted by total tokens descending

### Data Source
All queries run against the `sessions` SQLite table, aggregating `estimated_total_tokens`, grouped by `agent` or `model` column.

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
- `● Claude Code` (amber `#D97706`)
- `● Codex` (emerald `#10B981`)
- `● Cursor` (indigo `#6366F1`)
- `● Copilot` (violet `#8B5CF6`)

### Degraded display for limited agents

SessionCards for agents with limited data (Cursor, Copilot) show what's available:
- No heatstrip if `heatstripJson` is null
- No tool usage histogram if `toolCallsJson` is null
- No token/cost badges if all token fields are 0
- Summary shows whatever the adapter provides (e.g., Cursor's `tldr` or Copilot's prompt text)

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
- The dendrite script checks for the `agent` column before filtering — if the column doesn't exist (pre-migration), it falls back to unfiltered results
- Cron schedules are per-workspace in config.yaml (staggerable)
- Per-agent rollup prompts reference that agent's sessions only
- Unified rollup prompt summarizes across all agents, noting which agents contributed what

### Non-Claude adapter data freshness

The existing Claude `sessionIndexer.ts` uses file watching for incremental updates. Non-Claude adapters use polling:
- On each `discoverSessions()` call (triggered by API request or dendrite collection), the adapter re-reads its native data source
- No persistent file watchers for non-Claude agents (their data changes less frequently)
- The API endpoints already re-index on request (existing behavior with `forceIndex` check)

## 6. Rename & Branding

- App header title: "Sessions" → "Agent Sessions"
- Sidebar label: "Sessions" → "Agent Sessions"
- `claude-sessions` workspace preserved as per-agent workspace
- New `agent-sessions` workspace is the unified default
- `ViewId` stays `'agents'` internally
- Existing Claude data, rollups, and config are preserved

## 7. Deliverables

- [ ] `desktop/src/lib/agents/types.ts` — AgentAdapter interface, AgentSession, AgentSessionDetail types
- [ ] `desktop/src/lib/agents/registry.ts` — AgentRegistry with discovery
- [ ] `desktop/src/lib/agents/claude.ts` — Claude adapter (wraps existing indexer)
- [ ] `desktop/src/lib/agents/codex.ts` — Codex adapter (reads state_5.sqlite threads + history.jsonl)
- [ ] `desktop/src/lib/agents/cursor.ts` — Cursor adapter (reads ai-tracking DB, groups by conversationId)
- [ ] `desktop/src/lib/agents/copilot.ts` — Copilot adapter (reads command-history, synthetic session)
- [ ] DB migration V2: `agent`, `model`, `estimated_total_tokens` columns + indexes
- [ ] Update `sessionIndexer.ts` INSERT to include `agent='claude'` explicitly, use ON CONFLICT
- [ ] Remove Canvas view files: CanvasView.tsx, useCanvasState.ts, ZoneTree.tsx, zoneReducers.ts
- [ ] Analytics view component with period toggle, summary cards, token charts
- [ ] Agent filter pills in Day/Sessions views
- [ ] Agent badge on SessionCard
- [ ] `--agent` flag on sessionDendrite.ts with migration-aware fallback
- [ ] Per-agent workspace configs (codex-sessions, cursor-sessions, copilot-sessions)
- [ ] Unified agent-sessions workspace config
- [ ] Rename: header title and sidebar label to "Agent Sessions"
- [ ] Update data flow diagram for multi-agent
