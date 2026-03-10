# CLAUDE.md

## What is Axon?

Axon is a developer memory system — nightly AI rollups, morning briefings, decision traces. CLI + desktop app. Solves the "Prompt Tax" — the 15+ minutes/day developers lose re-explaining context to AI tools.

**Core loop:** Dendrites (signals) -> Nightly Rollup (AI synthesis) -> Morning Briefing (conversational)

## Architecture

```
axon-jarvis/
├── cli/              # Shell scripts — the engine
├── desktop/          # React + Vite — the face
├── protocol.md       # Injected into Claude as system prompt
├── docs/design/      # Design system spec
└── docs/internal/    # Strategy docs (gitignored)

~/.axon/
├── workspaces/{project}/
│   ├── state.md           # Current context snapshot (Tier 3)
│   ├── stream.md          # Append-only raw log (Tier 1)
│   ├── episodes/          # Rollups + session captures (Tier 2)
│   ├── dendrites/         # Raw input signals
│   ├── mornings/          # Morning briefing conversations
│   └── config.yaml        # Per-project config (status: active|paused|archived)
```

## CLI Commands

| Command | Purpose |
|---------|---------|
| `axon init` | Genesis rollup for a new project |
| `axon collect` | Gather dendrite signals (git-log, file-tree) |
| `axon rollup` | Collect + Claude headless -> episode + state update |
| `axon morning` | Interactive briefing with full context injection |
| `axon morning --all` | Multi-project briefing across active projects |
| `axon projects` | List all projects with status + open loops |
| `axon archive` | Set project to archived (excluded from morning --all) |
| `axon pause` | Pause project (excluded from morning, cron continues) |
| `axon resume` | Reactivate a paused/archived project |
| `axon log` | Quick note to stream |
| `axon status` | Project state at a glance |
| `axon sync` | Push/pull memory to remote |
| `axon cron` | Install/remove nightly rollup schedule (launchd/cron) |

## Desktop App (desktop/)

- **Stack**: Vite 7 + React 19 + TypeScript + Tailwind CSS 4 + Zustand
- **Run**: `cd desktop && npm run dev` → http://localhost:1420
- **Data**: Vite plugin (`vite-plugin-axon.ts`) serves ~/.axon/ as JSON API
- **IMPORTANT**: Tailwind v4 uses `@theme` directive in `globals.css`, NOT `tailwind.config.ts`

### Key Components
- `Shell.tsx` — App layout (sidebar + neural background + content)
- `Sidebar.tsx` — Project switcher + nav, uses `useProjects` hook
- `RollupCard.tsx` — Timeline card with energy dots, tags, metrics
- `NeuralBackground.tsx` — ASCII branching patterns from commit messages
- `TimelineView.tsx` — Main view, reads real rollups via `useRollups` hook

### Design System: Editorial Neural
- Warm cream palette (#FAF7F2), dark sidebar (#2C2420)
- Instrument Serif (italic headlines), Inter body, JetBrains Mono data
- Neural ASCII backgrounds fading from edges
- Card animations, three-dot energy indicators, time-aware greetings

## Key Concepts

- **Dendrites**: Input signals (git-log, file-tree). YAML frontmatter + markdown.
- **Rollups**: AI-synthesized daily summaries with Decision Traces (Input -> Constraint -> Tradeoff -> Decision).
- **State**: Regenerated after each rollup. Under 2000 tokens. The "current context" snapshot.
- **Protocol injection**: `--append-system-prompt` on Claude CLI. No MCP needed.
- **Git versioning**: `~/.axon/` is itself a git repo. Each rollup auto-commits.
- **Project lifecycle**: active/paused/archived status controls morning --all inclusion.

## Design Principles

1. **Protocol over Platform** — Markdown files, portable, readable in 20 years
2. **Human-in-the-Loop** — Dendrites are opt-in, rollups are reviewable
3. **Decouple Memory from Compute** — Memory is local files, compute is rented LLMs
4. **Narrative over Metrics** — Rollups tell stories, not just numbers
5. **Filesystem as API** — Dashboard reads YAML frontmatter from ~/.axon/, no database
