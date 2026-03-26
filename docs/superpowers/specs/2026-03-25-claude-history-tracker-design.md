# Axon Claude History Tracker — Design Spec

**Date:** 2026-03-25
**Approach:** Minimal Fork — Build on Existing Session Infrastructure
**Status:** Revised (v3 — post spec review)

## Overview

Adapt Axon to serve as a daily activity tracker for Claude Code sessions. The desktop app already has a rich session tracking system (SQLite indexer, JSONL parser, SessionsView with search/drill-down). This spec builds on that foundation by:

1. **Adding two new view modes** (Day View, Project View) alongside the existing Session View
2. **Bridging session data into the rollup pipeline** via a new `claude-sessions` dendrite
3. **Adding a redaction layer** for sensitive content before it enters rollups
4. **Producing a data flow diagram** as a deliverable

**Core principle:** All data stays local. The only outbound call is the `claude` CLI during rollups, which sends only redacted text.

## Current State — What Already Exists

### Session Indexer (`desktop/src/lib/sessionIndexer.ts`)
Multi-phase indexer that reads `~/.claude/projects/{folderId}/sessions-index.json` and per-session JSONL files. Extracts: message count, tool call counts, files touched, bash commands, errors, token estimates, cost estimates, heatstrip segments, git commands. Stores everything in SQLite (`~/.axon/sessions.db`).

### Session Database (`desktop/src/lib/sessionDb.ts`)
SQLite via better-sqlite3. Schema includes:
- `sessions` table: id, project_id/path/name, first_prompt, summary, message_count, tool_call_count, files_touched_count, estimated_cost_usd, heatstrip_json, tool_calls_json, git_commands_json, etc.
- `files_touched` table: session_id, file_path, operations, count
- `session_fts` virtual table: FTS5 full-text search over session content

### JSONL Parser (`desktop/src/lib/jsonlParser.ts`)
Extracts from full session JSONL files: tool call histogram, file touches with operation types, git commits, heatstrip visualization data, token/cost estimates, heuristic summaries.

### Sessions View (`desktop/src/views/SessionsView.tsx`)
38KB React component with:
- List view with time-grouped cards (Today / This week / This month / Older)
- FTS search with highlighted snippets
- Filter pills (All / Pinned / Tagged)
- Session detail panel: timestamps, tokens, heatstrip, tool usage histogram, files touched, git commits
- Session metadata: tags, pins, nicknames, archive

### Session Metadata (`desktop/src/lib/sessionMeta.ts`)
User-created metadata stored in `~/.claude/session-manager-meta.json`: tags, pinned, archived, nickname per session.

### API Endpoints (in `axonMiddleware.ts`)
- `GET /api/axon/sessions` — list sessions (optionally by project)
- `GET /api/axon/sessions/:id` — single session detail
- `GET /api/axon/sessions/search?q=` — FTS search
- `PATCH /api/axon/sessions/:id/meta` — update tags/pin/nickname

## Data Sources

### Primary: Per-session JSONL files (already indexed)
`~/.claude/projects/{folderId}/{sessionId}.jsonl` — Full conversation transcripts including user prompts, assistant responses, tool calls, file edits, bash commands, errors. **Already parsed by `jsonlParser.ts` and indexed into SQLite.**

### Secondary: `~/.claude/history.jsonl` (new — for prompt-level timeline)
Each line: `{ display, pastedContents, timestamp, project, sessionId }`. Provides the ordered prompt timeline within sessions — something the existing indexer doesn't surface (it counts messages but doesn't store individual prompt text). **1,504 entries, 242 sessions, 37 projects** as of today.

Both sources are read-only. Neither is modified by Axon.

## 1. New Frontend Views

The existing `SessionsView` becomes the **Session View** (already feature-complete). We add two new grouping modes accessible via a view toggle in the sidebar or a tab bar above the session list.

### Day View (new, default)

Groups sessions by calendar day. Each day card shows:
- Date heading
- Aggregate stats: session count, total prompts, total cost, projects touched
- Expandable list of sessions for that day (reusing existing session card component)
- If a rollup exists for that day, show rollup headline and link to rollup detail

**Data source:** Existing `sessions` SQLite table, grouped by `DATE(created_at)`. No new API endpoint needed — grouping can be done client-side from the existing `GET /api/axon/sessions` response, or a new `GET /api/axon/sessions?groupBy=day` parameter.

### Project View (new)

Groups sessions by `project_name`. Each project card shows:
- Project name and path
- Total sessions, prompts, cost, last active date
- Topic tags (derived from session content — top keywords from FTS index)
- Expandable to show that project's sessions in reverse chronological order

**Data source:** Existing `sessions` table, grouped by `project_name`. New API endpoint: `GET /api/axon/sessions/by-project` returning `{ projectName, projectPath, sessionCount, totalCost, lastActive, sessions[] }`.

### Session Drill-Down Enhancement

The existing session detail panel already shows timestamps, tokens, heatstrip, tool usage, files touched, and git commits. We add:

- **Prompt timeline:** Ordered list of user prompts with timestamps, pulled from `history.jsonl` by matching `sessionId`. Shows first 5, expandable to all. This is the only new data not already in the SQLite index.
- **Related sessions:** Sessions sharing the same `project_name`, shown as clickable chips below the detail panel.
- **Redacted token display:** Any `[REDACTED_*]` tokens in prompt text rendered with a muted badge style.

### View Toggle

The existing `SessionsView` is rendered when `viewId === 'agents'` in `App.tsx`. Rather than creating separate `DayView.tsx` and `ProjectView.tsx` files, add a `mode: 'day' | 'sessions' | 'projects'` state to `SessionsView` with a tab bar at the top. Each mode applies different grouping logic to the same session data and reuses the existing card/detail/heatstrip components.

The sidebar project switcher is **not replaced** — it continues to control the active workspace for rollups, timeline, etc. Instead, the mode toggle lives inside the sessions area as a tab bar above the session list. The existing Decision Explorer and Morning Briefing nav items remain unchanged.

## 2. Prompt Timeline API

New endpoint to serve prompt-level data from `history.jsonl`:

`GET /api/axon/sessions/:id/prompts`

Returns:
```json
[
  { "display": "redacted prompt text...", "timestamp": 1770721677056 },
  { "display": "another prompt...", "timestamp": 1770722411564 }
]
```

**Implementation:** On server startup (or first request), parse `~/.claude/history.jsonl` into an in-memory map keyed by `sessionId`. Apply redaction before caching. Serve from cache. Optionally watch the file for changes and reload.

`pastedContents` is **never served or cached** — stripped at parse time.

## 3. Redaction Layer

Implemented as a TypeScript module (`desktop/src/lib/redact.ts`) for consistency with the existing codebase. Used by both the prompt timeline API and the dendrite generator.

### Patterns scrubbed

| Pattern | Example | Replacement |
|---------|---------|-------------|
| API keys | `sk-ant-...`, `sk-proj-...` | `[REDACTED_API_KEY]` |
| GitHub tokens | `ghp_...`, `gho_...`, `github_pat_...` | `[REDACTED_GITHUB_TOKEN]` |
| Slack tokens | `xoxb-...`, `xoxp-...` | `[REDACTED_SLACK_TOKEN]` |
| Bearer/auth headers | `Bearer eyJ...`, `Authorization: ...` | `[REDACTED_AUTH]` |
| JWTs | `eyJhbGci...` (base64.base64.base64) | `[REDACTED_JWT]` |
| AWS keys | `AKIA...` (20 char) | `[REDACTED_AWS_KEY]` |
| Connection strings | `postgres://user:pass@...`, `mongodb+srv://...` | `[REDACTED_CONNECTION_STRING]` |
| Generic secrets | `password=...`, `secret=...`, `token=...` in URLs/env | `[REDACTED_SECRET]` |
| Private keys | `-----BEGIN.*PRIVATE KEY-----` blocks | `[REDACTED_PRIVATE_KEY]` |
| `.env` value patterns | `KEY=value` lines from pasted contents | `[REDACTED_ENV]` |

### Not redacted

Customer names, project paths, URLs without tokens — useful context for rollups. Users can add custom patterns in `config.yaml` under `redaction.extra_patterns`.

### Performance target

Full redaction of 1,500 entries completes in under 2 seconds. Regex patterns compiled once at module load.

## 4. Session-to-Rollup Bridge (New Dendrite)

A new dendrite type (`claude-sessions`) bridges the existing session data into the rollup pipeline. Implemented as a TypeScript module invoked via `npx tsx` (matching the existing `todo-state` dendrite pattern in `axon-collect`).

### Integration with `axon-collect`

`axon-collect` currently operates per-workspace and supports dendrite types: `git-log`, `file-tree`, `manual-note`, `todo-state`. The `claude-sessions` workspace has no git repo, so git-based dendrites will be skipped (the script already handles "not a git repository" gracefully by checking `git rev-parse`).

Add a new dendrite type check in `axon-collect`:
```bash
# claude-sessions dendrite (TypeScript, invoked like todo-state)
if dendrite_enabled "claude-sessions"; then
  npx tsx "$AXON_ROOT/cli/lib/session-dendrite.ts" dendrite \
    --workspace "$WORKSPACE" \
    --since "$SINCE"
fi
```

This follows the existing `todo-state` pattern which calls `npx tsx todoCli.ts dendrite`.

### What it does

1. Queries the sessions SQLite DB for sessions with `modified_at > $SINCE` (ISO 8601 string comparison — both the cursor file and the column store ISO 8601 strings)
2. For each session, pulls: first_prompt, heuristic_summary, tool_call_count, files_touched_count, estimated_cost_usd, project_name
3. Applies redaction to first_prompt text
4. Optionally enriches with prompt timeline from `history.jsonl` (redacted)
5. Outputs a dendrite markdown file to `~/.axon/workspaces/claude-sessions/dendrites/`

### Dendrite output format

```yaml
---
type: claude-sessions
collected_at: 2026-03-25T22:00:00Z
since: 24 hours ago
session_count: 8
total_prompts: 47
total_cost_usd: 2.34
projects:
  - name: home
    path: /Users/Tessl-Leo
    sessions: 5
  - name: peptide-tracker
    path: /Users/Tessl-Leo/Development/peptide-tracker
    sessions: 3
---
# Claude Sessions: 2026-03-25

## Session: 1c555be2 | home | 45 min | $0.82
**Summary:** Created 3 files, edited 2 files, 5 commands, 1 error
**Tools:** Write(12), Edit(8), Bash(5), Read(15), Grep(3)
**Files:** seed-povs.mjs, attio-config.yaml, README.md

### Prompts (redacted)
- 10:14 — "help me build an attio dashboard to track POVs..."
- 10:27 — "the notion pov dashboard screenshot is in my documents folder"
- 10:29 — "built out an Attio API script to create the custom object..."
- ... (9 more)

## Session: a3f8b2c1 | peptide-tracker | 1h 20min | $1.12
**Summary:** Edited 4 files, 12 commands, 0 errors
**Tools:** Edit(15), Bash(12), Read(20), Grep(8)
**Files:** parser.test.ts, parser.ts, csv-import.ts

### Prompts (redacted)
- 14:02 — "add unit tests for the parser module"
- ... (23 more)
```

### Cursor/offset mechanism

Stores the ISO 8601 timestamp of the last collected session in `~/.axon/workspaces/claude-sessions/.last-collection` (e.g., `2026-03-25T22:00:00.000Z`). On each run, queries only sessions with `modified_at > $SINCE` using string comparison (valid for ISO 8601). Falls back to "24 hours ago" if no cursor file exists. Does not re-read the entire database.

### Handling `max_prompts_per_session`

The `max_prompts_per_session` config value (default: 50) is enforced in the dendrite generator when writing prompt lists. Prompts beyond the limit are truncated with a `... (N more)` indicator. This bounds dendrite file size for sessions with hundreds of prompts.

## 5. Rollup Prompt Adaptation

The existing rollup prompt (`axon-rollup` lines 189–263) is git-oriented. For the `claude-sessions` workspace, we use a modified prompt.

### New frontmatter schema

```yaml
---
type: rollup
date: YYYY-MM-DD
project: claude-sessions
headline: "{one punchy line, max 80 chars}"
tags: [{2-4 from: shipping, research, debugging, architecture, tooling, refactor, customer-work, exploration}]
energy: high|medium|low
momentum: accelerating|steady|decelerating
sessions: {integer}
prompts: {integer}
totalCost: {float, USD}
projectsTouched: {integer}
decisions: {integer}
openLoops: {integer}
riskItems: {integer}
---
```

### Adapted sections

1. **Summary** — 2–3 sentences: what was accomplished across sessions, specific project/topic names, aggregate stats
2. **Momentum** — Accelerating/steady/decelerating based on session frequency, cost trends, project spread. Compare to recent rollups.
3. **Key Decisions** — Decision Traces extracted from prompt content. Format: `DT-YYYYMMDD-N` with Input/Constraint/Tradeoff/Decision. Reference session IDs.
4. **Projects Touched** — Each project with session count, key activities, files modified. Replaces "Files Most Touched."
5. **Unfinished Work** — `[ ]` new, `[>]` carried. Derived from session context (abandoned threads, TODO-like prompts).
6. **Risk Flags** — Sessions with high error counts, repeated debugging, cost spikes. Carried items >3 days flagged with warning.
7. **Continuity** — What threads connect today to yesterday. What carries forward.
8. **Recommended Next Steps** — Ranked by leverage. Specific, actionable.

### Sections removed (git-specific)
- "Files Most Touched" → replaced by "Projects Touched"
- "TODO Velocity" → kept only if TODO list exists
- Verification via Read/Glob/Grep → not applicable (rollup agent does not need to read the codebase; session data is self-contained)

### Allowed tools for rollup agent

None. The existing `axon-rollup` passes `--allowedTools "Read,Glob,Grep"` for git-based workspaces (so the agent can verify claims against the codebase). For the `claude-sessions` workspace, this is overridden via a per-workspace config field:

```yaml
# in config.yaml
rollup:
  allowed_tools: []  # no tool access for session rollups
```

`axon-rollup` checks for this field and conditionally omits the `--allowedTools` flag. This reduces the security surface — the rollup agent cannot read arbitrary files.

## 6. Workspace Model

`claude-sessions` is a **new workspace** alongside any existing git-based project workspaces. It coexists:

```
~/.axon/workspaces/
├── my-git-project/     # existing git-based workspace (unchanged)
├── claude-sessions/    # NEW — aggregates all Claude Code activity
│   ├── config.yaml
│   ├── state.md
│   ├── stream.md
│   ├── episodes/       # daily rollups
│   ├── dendrites/      # session dendrites
│   └── mornings/       # briefing conversations
```

- `axon morning --all` includes `claude-sessions` as an active workspace
- `axon projects` lists it alongside git projects
- Has its own `config.yaml`, `state.md`, rollup schedule

## 7. Data Flow & Security Model

### Data flow

```
~/.claude/projects/*/sessions-index.json  ──┐
~/.claude/projects/*/{sessionId}.jsonl    ──┤ (read-only)
~/.claude/history.jsonl                   ──┘
        │
        ▼
  sessionIndexer.ts (existing)
        │
        ▼
  ~/.axon/sessions.db (SQLite, local only)
        │
        ├──▶ Electron UI (localhost:* only, no remote URLs)
        │      Day View, Session View, Project View
        │      Prompt timeline (redacted, from history.jsonl)
        │
        └──▶ claude-sessions dendrite (TypeScript)
               │  Queries SQLite + history.jsonl
               │  Applies redaction
               │  Writes markdown to ~/.axon/workspaces/claude-sessions/dendrites/
               │
               ▼
         axon-rollup (bash + claude CLI)
               │  Reads redacted dendrites + state.md
               │  Sends redacted text to Anthropic API
               │
               ▼
         ~/.axon/workspaces/claude-sessions/episodes/
               (rollup markdown, stays local)
```

### What leaves your machine

- **Only during rollup:** Redacted session summaries + redacted prompt text, via `claude` CLI to Anthropic API
- Subject to Anthropic's existing data retention policies
- No `pastedContents` ever leaves — stripped at parse time
- No file contents from sessions leave — only summaries and heuristic descriptions
- Rollup agent has **no tool access** — cannot read local files

### What never leaves your machine

- Raw JSONL session files
- `history.jsonl` (never copied, only read)
- Full prompt text (only redacted versions enter the pipeline)
- `pastedContents` (stripped at parse, never written to `~/.axon/`)
- Project paths, session IDs, timestamps
- SQLite database and FTS index
- All `~/.axon/` files
- Session metadata (tags, pins, nicknames)

### Electron security

- No remote URLs loaded — all content is local files
- No `nodeIntegration` in renderer (existing Axon behavior)
- Express server binds to `127.0.0.1` only
- No auto-update phoning home (disabled)

## 8. Configuration

`~/.axon/workspaces/claude-sessions/config.yaml`:

```yaml
history_path: ~/.claude/history.jsonl
claude_projects_path: ~/.claude/projects

redaction:
  enabled: true
  strip_pasted_contents: true
  extra_patterns:
    - 'CUSTOM_SECRET_\w+'

rollup:
  schedule: "0 22 * * *"  # nightly at 10pm
  max_prompts_per_session: 50
  model: default  # uses whatever claude CLI defaults to

dendrite_enabled:
  claude-sessions: true
```

## 9. Edge Cases & Defensive Handling

- **`history.jsonl` format changes:** Parser is defensive about missing fields. If `sessionId`, `display`, or `timestamp` is missing, the entry is skipped with a warning. Verified against Claude CLI as of 2026-03-25.
- **Sessions without `history.jsonl` entries:** The prompt timeline API returns an empty array. UI shows "No prompt timeline available" rather than an error.
- **Null `created_at` in sessions DB:** Day View groups sessions with null `created_at` under an "Unknown date" bucket at the bottom of the list.
- **Sessions DB schema:** No new columns required for the sessions table. The `modified_at` column (nullable TEXT, ISO 8601) is sufficient for cursor-based collection. No V2 migration needed.
- **`history.jsonl` rotation/truncation:** If the file is truncated or rotated by Claude CLI, the in-memory cache is rebuilt on next access. The prompt timeline is best-effort — missing entries are not an error.

## 10. Deliverables

- [ ] `desktop/src/lib/redact.ts` — redaction module (TypeScript)
- [ ] `desktop/src/lib/redact.test.ts` — unit tests for all redaction patterns, edge cases, and "not redacted" cases
- [ ] `desktop/src/lib/promptTimeline.ts` — history.jsonl parser + in-memory cache
- [ ] `desktop/src/lib/promptTimeline.test.ts` — unit tests for parser (missing fields, empty file, large files)
- [ ] `GET /api/axon/sessions/:id/prompts` — prompt timeline endpoint in `axonMiddleware.ts`
- [ ] `GET /api/axon/sessions/by-project` — project grouping endpoint in `axonMiddleware.ts`
- [ ] Day and Project mode tabs in `SessionsView.tsx` (mode toggle, grouping logic)
- [ ] Session drill-down: prompt timeline + related sessions (enhance `SessionsView.tsx`)
- [ ] `cli/lib/session-dendrite.ts` — TypeScript dendrite for claude-sessions workspace
- [ ] Integration into `axon-collect` for the `claude-sessions` dendrite type
- [ ] Adapted rollup prompt for session-based data in `axon-rollup`
- [ ] Per-workspace `rollup.allowed_tools` config support in `axon-rollup`
- [ ] `config.yaml` template for `claude-sessions` workspace
- [ ] **Data flow diagram** — standalone visual artifact documenting where all processed data goes
