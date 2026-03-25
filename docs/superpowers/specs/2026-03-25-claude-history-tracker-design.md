# Axon Claude History Tracker — Design Spec

**Date:** 2026-03-25
**Approach:** Minimal Fork — Swap Dendrite Only (Approach A)
**Status:** Draft

## Overview

Adapt Axon from a git-based developer memory system to a Claude Code session tracker. Replace the `git-log` dendrite with a `claude-history` dendrite that parses `~/.claude/history.jsonl`, redacts secrets, and feeds session data into Axon's existing rollup/briefing/decision-trace pipeline. Keep the Electron desktop app, adding three switchable views (day, session, project) with session drill-down.

**Core principle:** All data stays local. The only outbound call is the `claude` CLI during rollups, which sends only redacted text.

## Data Source

**Input:** `~/.claude/history.jsonl` (read-only, never modified)

Each line is a JSON object:
```json
{
  "display": "user prompt text",
  "pastedContents": {},
  "timestamp": 1770721677056,
  "project": "/Users/Tessl-Leo",
  "sessionId": "1c555be2-e096-4284-b96e-adbcf263451d"
}
```

**Statistics (as of 2026-03-25):** 1,504 entries, 242 sessions, 37 projects, date range 2026-02-10 to present.

## 1. Data Ingest Pipeline

### New dendrite: `cli/dendrites/claude-history`

A bash script (matching Axon's existing dendrite pattern) that:

1. Reads `~/.claude/history.jsonl` (path configurable in `config.yaml`)
2. Filters entries by time window (since last rollup, or last 24h)
3. Runs redaction via `cli/lib/redact.sh` (see Section 2)
4. Groups entries by `sessionId`, then by date
5. Outputs a dendrite markdown file per day to `~/.axon/workspaces/claude-sessions/dendrites/`

### Dendrite output format

Markdown with YAML frontmatter, matching Axon convention:

```yaml
---
type: claude-history
collected_at: 2026-03-25T14:30:00Z
since: 24 hours ago
session_count: 8
prompt_count: 47
projects:
  - /Users/Tessl-Leo
  - /Users/Tessl-Leo/Development/peptide-tracker
---
# Claude Sessions: 2026-03-25

## Session: 1c555be2 (project: /Users/Tessl-Leo)
- 10:14 — "help me build an attio dashboard to track POVs..."
- 10:27 — "the notion pov dashboard screenshot is in my documents folder"
- 10:29 — "built out an Attio API script to create the custom object..."

## Session: a3f8b2c1 (project: peptide-tracker)
- 14:02 — "add unit tests for the parser module"
```

## 2. Redaction Layer

Runs during ingest, before any data is written to `~/.axon/`. Implemented as a standalone bash function (`redact_text()`) in `cli/lib/redact.sh`, sourced by the dendrite.

### Patterns scrubbed

| Pattern | Example | Replacement |
|---------|---------|-------------|
| API keys | `sk-ant-...`, `sk-proj-...` | `[REDACTED_API_KEY]` |
| GitHub tokens | `ghp_...`, `gho_...`, `github_pat_...` | `[REDACTED_GITHUB_TOKEN]` |
| Slack tokens | `xoxb-...`, `xoxp-...` | `[REDACTED_SLACK_TOKEN]` |
| Bearer/auth headers | `Bearer eyJ...`, `Authorization: ...` | `[REDACTED_AUTH]` |
| AWS keys | `AKIA...` (20 char) | `[REDACTED_AWS_KEY]` |
| Generic secrets | `password=...`, `secret=...`, `token=...` in URLs/env | `[REDACTED_SECRET]` |
| Private keys | `-----BEGIN.*PRIVATE KEY-----` blocks | `[REDACTED_PRIVATE_KEY]` |
| `.env` value patterns | `KEY=value` lines from pasted contents | `[REDACTED_ENV]` |

### Not redacted

Customer names, project paths, URLs without tokens — these are useful context for rollups and not secrets. Users can add custom patterns in `config.yaml` under `redaction.extra_patterns`.

### `pastedContents` handling

The `pastedContents` field is stripped entirely before rollup. Only the `display` text (after redaction) is included in dendrite output and sent to Claude for synthesis.

## 3. Rollup & Morning Briefing Adaptation

### Rollup (`axon-rollup`)

Minimal changes:
- Swap dendrite source: reads `claude-history` dendrite files instead of `git-log`
- Adjusted rollup prompt to understand session-based data:
  - "Summarize what the user worked on across these Claude sessions"
  - "Identify themes, decisions made, and open loops"
  - "Note which projects got the most attention"
- Output unchanged: `~/.axon/workspaces/claude-sessions/episodes/YYYY-MM-DD_rollup.md`
- All processing via local `claude` CLI — only redacted text reaches Anthropic API

### Morning briefing (`axon-morning`)

No changes needed. Already reads latest rollup + `state.md` and feeds to `claude` CLI for interactive conversation.

### Decision traces

Extracted from rollups as today. Claude CLI synthesizes them from session data:

```markdown
### Decision: Switched from Events API to HogQL for PostHog
- Context: Events API person filter with icontains returned ~27% of actual data
- Tradeoff: More complex queries vs accurate results
- Sessions: a3f8b2c1, 7d2e1f09
```

### State file (`state.md`)

Updated after each rollup with:
- Active projects (by recent session frequency)
- Open loops (carried forward from rollup synthesis)
- Key files/topics per project

## 4. Frontend — Three Switchable Views

View toggle replaces Axon's project switcher in the sidebar. All three views share the same underlying data — switching is instant, no re-fetch. Existing Decision Explorer and Morning Briefing views remain as-is.

### Day View (default)

Daily rollup cards in chronological order. Each day shows:
- Date, session count, prompt count, projects touched
- Expandable to show sessions with prompt previews

Matches Axon's existing `TimelineView` pattern.

### Session View

Flat list of session cards. Each card shows:
- Session ID (truncated), project path
- Duration (first to last prompt timestamp), prompt count
- AI-generated one-line summary
- Sortable by time, duration, or prompt count

### Project View

Projects ranked by activity. Each project shows:
- Total prompt count, session count, last active date
- AI-generated topic tags
- Click to drill into that project's sessions

### Session Drill-Down

Accessible from any view by clicking a session card:
- **Expand in place** — click to expand inline (accordion style)
- **Full page mode** — double-click or expand icon for full detail panel with back button

Detail view contains:
- Session header: ID, project, date, duration, prompt count
- AI-generated summary block
- Topic tags
- Prompt timeline: chronological list with timestamps (first 5 shown, expandable)
- Related sessions: linked by shared project path or AI-detected topic overlap
- Redacted tokens shown with muted `[REDACTED_*]` badge style

## 5. Data Flow & Security Model

### Data flow

1. **Read** `~/.claude/history.jsonl` — read-only, never modified
2. **Redact** — in-memory before any writes
3. **Write** dendrite files to `~/.axon/workspaces/claude-sessions/dendrites/`
4. **Rollup** — `claude` CLI reads redacted dendrites, sends to Anthropic API, writes rollup markdown back to `~/.axon/`
5. **Display** — Electron reads `~/.axon/` files, renders in local webview. No network calls.

### What leaves your machine

- Only redacted prompt summaries, during rollup, via `claude` CLI to Anthropic API
- Subject to Anthropic's existing data policies (same as normal Claude Code usage)

### What never leaves your machine

- Raw `history.jsonl` (never copied, only read)
- Project paths, session IDs, timestamps
- `pastedContents` (stripped entirely before rollup)
- SQLite search index
- All `~/.axon/` files

### Electron security

- No remote URLs loaded — all content is local files
- No `nodeIntegration` in renderer (Axon already does this)
- Express server binds to `127.0.0.1` only
- No auto-update phoning home (disabled)

## 6. Configuration

`~/.axon/workspaces/claude-sessions/config.yaml`:

```yaml
history_path: ~/.claude/history.jsonl
redaction:
  enabled: true
  strip_pasted_contents: true
  extra_patterns:
    - 'CUSTOM_SECRET_\w+'
rollup:
  schedule: "0 22 * * *"  # nightly at 10pm
  max_prompts_per_session: 50
  model: default  # uses whatever claude CLI defaults to
```

## 7. Deliverables

- [ ] `cli/dendrites/claude-history` — new dendrite script
- [ ] `cli/lib/redact.sh` — redaction library
- [ ] Rollup prompt adjustments in `axon-rollup`
- [ ] Three switchable views in React (day, session, project)
- [ ] Session drill-down component
- [ ] `config.yaml` template for claude-sessions workspace
- [ ] Data flow diagram (standalone artifact documenting where all processed data goes)
