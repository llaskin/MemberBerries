# MemberBerries — Data Flow Diagram

## Overview

MemberBerries is a **100% local** application. It makes **zero network calls**. No API calls, no telemetry, no phoning home. All data is read from local agent directories and stored in a local SQLite database.

## Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           LOCAL MACHINE                                  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │   Agent Data Sources (all read-only — never modified)        │       │
│  │                                                              │       │
│  │  Claude Code                                                 │       │
│  │  ├── ~/.claude/projects/*/sessions-index.json                │       │
│  │  ├── ~/.claude/projects/*/{sessionId}.jsonl  ◄── transcripts │       │
│  │  ├── ~/.claude/history.jsonl  ◄── user prompts only          │       │
│  │  └── ~/.claude/session-manager-meta.json  ◄── tags/pins      │       │
│  │                                                              │       │
│  │  Codex                                                       │       │
│  │  ├── ~/.codex/state_5.sqlite  ◄── threads table              │       │
│  │  ├── ~/.codex/history.jsonl  ◄── prompt history              │       │
│  │  └── ~/.codex/config.toml  ◄── model name                   │       │
│  │                                                              │       │
│  │  Cursor                                                      │       │
│  │  └── ~/.cursor/ai-tracking/ai-code-tracking.db  ◄── code AI │       │
│  │                                                              │       │
│  │  GitHub Copilot                                              │       │
│  │  └── ~/.copilot/command-history-state.json  ◄── CLI history  │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │   Agent Adapters (TypeScript)                                │       │
│  │   desktop/src/lib/agents/                                    │       │
│  │                                                              │       │
│  │   claude.ts ──► Session Indexer (3-phase: scan/analytics/FTS)│       │
│  │   codex.ts ───► Reads SQLite threads + config.toml           │       │
│  │   cursor.ts ──► Reads ai-tracking DB, groups by conversation │       │
│  │   copilot.ts ─► Reads command-history JSON                   │       │
│  │                                                              │       │
│  │   All adapters normalize to AgentSession interface           │       │
│  └──────────────────────┬───────────────────────────────────────┘       │
│                         │                                               │
│                         ▼                                               │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │   Sessions SQLite DB                                         │       │
│  │   ~/.memberberries/sessions.db          NEVER LEAVES MACHINE │       │
│  │                                                              │       │
│  │   Tables:                                                    │       │
│  │   ├── sessions (agent, model, tokens, metadata, analytics)   │       │
│  │   ├── files_touched (per session file operations)            │       │
│  │   └── session_fts (full-text search index)                   │       │
│  └──────────────────────┬───────────────────────────────────────┘       │
│                         │                                               │
│                         ▼                                               │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │   Web Dashboard (localhost:1420 only)                        │       │
│  │                                                              │       │
│  │   Agent Sessions ──► Day View / Sessions View                │       │
│  │     ├── Session cards with agent badges                      │       │
│  │     ├── Agent filter pills (All/Claude/Codex/Cursor/Copilot) │       │
│  │     ├── Expandable detail panels (tools, files, git commits) │       │
│  │     ├── Prompt timeline (from history.jsonl via redact.ts)   │       │
│  │     └── Related sessions                                    │       │
│  │                                                              │       │
│  │   Analytics ──► Token charts                                 │       │
│  │     ├── Tokens by Agent (bar chart)                          │       │
│  │     ├── Tokens by Model (bar chart)                          │       │
│  │     ├── Summary cards (avg tokens, total, sessions, agents)  │       │
│  │     └── Period toggle (Today/Week/Month/All Time)            │       │
│  │                                                              │       │
│  │   ┌─────────────────────────────────────┐                   │       │
│  │   │  REDACTION LAYER (redact.ts)        │                   │       │
│  │   │  Applied to all displayed text:     │                   │       │
│  │   │  ├── API keys (sk-ant-, sk-proj-)   │                   │       │
│  │   │  ├── GitHub/Slack tokens            │                   │       │
│  │   │  ├── JWTs, AWS keys                 │                   │       │
│  │   │  ├── Connection strings             │                   │       │
│  │   │  ├── Private keys, .env secrets     │                   │       │
│  │   │  └── Custom patterns from config    │                   │       │
│  │   └─────────────────────────────────────┘                   │       │
│  │                                                              │       │
│  │   ZERO NETWORK CALLS                                         │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

                    ╔══════════════════════════════════╗
                    ║  NOTHING CROSSES THIS BOUNDARY   ║
                    ║  No API calls. No telemetry.     ║
                    ║  No outbound network traffic.    ║
                    ╚══════════════════════════════════╝
```

## What NEVER Leaves Your Machine

| Data | Storage Location |
|------|-----------------|
| Raw session JSONL files | `~/.claude/projects/*/` |
| Prompt history | `~/.claude/history.jsonl`, `~/.codex/history.jsonl` |
| Full prompt text (unredacted) | Only in memory during redaction |
| `pastedContents` | Stripped at parse time, never persisted |
| Session metadata (tags, pins) | `~/.claude/session-manager-meta.json` |
| Codex threads/tokens | `~/.codex/state_5.sqlite` |
| Cursor AI tracking | `~/.cursor/ai-tracking/` |
| Copilot command history | `~/.copilot/command-history-state.json` |
| SQLite database | `~/.memberberries/sessions.db` |

## Security Model

- Express server binds to `127.0.0.1` only — not accessible from network
- No remote URLs loaded — all content is local files
- No shell spawning or terminal access
- No auto-update mechanism
- No telemetry or analytics collection
- Secrets redacted before display using compiled regex patterns
- All agent data directories are read-only — MemberBerries never writes to them
