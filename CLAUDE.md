# CLAUDE.md

## What is MemberBerries?

MemberBerries is a local-first dashboard for tracking AI coding agent activity across Claude Code, Codex, Cursor, and GitHub Copilot. It shows what you worked on, token usage analytics, and lets you drill into session details.

**Core features:** Agent Sessions (Day/Sessions views) + Analytics (token charts by agent/model).

## Architecture

```
MemberBerries/
├── desktop/          # React + Vite — the web dashboard
└── docs/             # Design specs, plans, data flow diagram

~/.axon/
├── sessions.db       # SQLite — all agent sessions indexed here
```

## Desktop App (desktop/)

- **Stack**: Vite 7 + React 19 + TypeScript + Tailwind CSS 4 + Zustand
- **Run**: `cd desktop && npm run dev` → http://localhost:1420
- **IMPORTANT**: Tailwind v4 uses `@theme` directive in `globals.css`, NOT `tailwind.config.ts`

### Key Components
- `SessionsView.tsx` — Main view with Day/Sessions tabs, agent filter pills
- `AnalyticsView.tsx` — Token usage charts by agent and model
- `Sidebar.tsx` — Navigation: Agent Sessions, Analytics, Settings
- `agents/` — Adapter modules for each AI agent (claude, codex, cursor, copilot)
- `sessionDb.ts` — SQLite database with multi-agent session storage
- `sessionIndexer.ts` — Indexes Claude sessions from JSONL files
- `redact.ts` — Scrubs secrets before display
- `promptTimeline.ts` — Parses ~/.claude/history.jsonl for prompt timelines

### Agent Adapters (`desktop/src/lib/agents/`)
- `claude.ts` — Wraps existing session indexer (reads ~/.claude/)
- `codex.ts` — Reads ~/.codex/state_5.sqlite threads table
- `cursor.ts` — Reads ~/.cursor/ai-tracking/ database
- `copilot.ts` — Reads ~/.copilot/command-history-state.json

## Security

- All data stays local. Express server binds to 127.0.0.1 only.
- No terminal/shell spawning. No remote URLs. No telemetry. No API calls.
- Secrets redacted before display (API keys, tokens, JWTs, connection strings).
- See `docs/data-flow-diagram.md` for full data flow.

## Design Principles

1. **Local-First** — All data on your machine, no cloud, no accounts
2. **Multi-Agent** — Unified view across all AI coding agents
3. **Security-First** — Redaction, no shell access, localhost-only
4. **Tokens Not Dollars** — Show raw token counts, not estimated costs
